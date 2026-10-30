/**
 * FPT.AI TTS Service
 * Tích hợp FPT.AI Text-to-Speech API
 * Documentation: https://docs.fpt.ai/docs/en/speech/api/text-to-speech.html
 */

import https from 'https';
import { setTimeout as delay } from 'node:timers/promises';
import {fptSpeechFailure} from '../utils/fptSpeechPolicy.js';

const FPT_AI_API_URL = 'https://api.fpt.ai/hmi/tts/v5';

/**
 * Giọng miền Bắc Việt Nam (chỉ sử dụng giọng miền Bắc):
 * - banmai: female northern (miền Bắc) - giọng nữ
 */
const VIETNAMESE_NORTH_VOICES = {
  'female': 'banmai'     // Giọng nữ miền Bắc
};

/**
 * Tạo giọng nói từ text sử dụng FPT.AI TTS
 * @param {string} text - Text cần convert (3-5000 characters)
 * @param {string} voice - Tên giọng (banmai, lannhi, etc.)
 * @param {number} speed - Tốc độ (-3 đến +3, default 0)
 * @param {string} format - Format output (mp3 hoặc wav, default mp3)
 * @returns {Promise<{audioUrl: string, requestId: string}>}
 */
// Flag để chỉ log warning 1 lần
let hasLoggedWarning = false;

export async function generateSpeech(text, voice = 'banmai', speed = 0, format = 'mp3', { signal } = {}) {
  const apiKey = process.env.FPT_AI_API_KEY;
  
  if (!apiKey) {
    // Chỉ log warning 1 lần để tránh spam log
    if (!hasLoggedWarning) {
      console.warn('⚠️ FPT_AI_API_KEY is not configured in environment variables. Falling back to browser TTS.');
      hasLoggedWarning = true;
    }
    return null;
  }

  if (typeof text !== 'string' || text.trim().length < 3) {
    throw new Error('Text must be at least 3 characters');
  }

  if (text.length > 5000) {
    throw new Error('Text must not exceed 5000 characters');
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    let timeout;
    const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); };
    const fail = error => { cleanup(); reject(error); };
    const abort = () => req.destroy(signal.reason || new Error('FPT request aborted'));
    const url = new URL(FPT_AI_API_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'api_key': apiKey,
        'voice': voice,
        'speed': speed.toString(),
        'format': format,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(text, 'utf8')
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
        if (Buffer.byteLength(data) > 65536) req.destroy(Object.assign(new Error('FPT response too large'), { code: 'FPT_RESPONSE_INVALID' }));
      });

      res.on('error', fail);

      res.on('end', () => {
        cleanup();
        try {
          if (res.statusCode && res.statusCode !== 200) {
            const after=Number(res.headers?.['retry-after']);
            throw Object.assign(new Error('FPT request rejected'), { code: 'FPT_HTTP_ERROR', status: res.statusCode,
              ...(Number.isFinite(after)&&after>0?{retryAfterSeconds:Math.min(3600,Math.ceil(after))}:{}) });
          }
          const response = JSON.parse(data);
          
          if (response.error !== 0) {
            reject(Object.assign(new Error('FPT.AI rejected speech request'), { code: 'FPT_API_REJECTED', providerCode: response.error }));
            return;
          }

          // Response chứa async link - cần đợi một chút để file được tạo
          resolve({
            audioUrl: response.async,
            requestId: response.request_id,
            message: response.message
          });
        } catch (err) {
          reject(Object.assign(new Error('Invalid FPT response'), { code: err.code || 'FPT_RESPONSE_INVALID', status: err.status,
            retryAfterSeconds:err.retryAfterSeconds }));
        }
      });
    });

    req.on('error', fail);
    signal?.addEventListener('abort', abort, { once: true });
    timeout = setTimeout(() => req.destroy(Object.assign(new Error('FPT request timed out'), { code: 'FPT_TIMEOUT' })), 15000);

    req.write(text, 'utf8');
    req.end();
  });
}

/**
 * Đợi audio file sẵn sàng (poll async link)
 * @param {string} audioUrl - Async link từ FPT.AI
 * @param {number} maxWaitTime - Thời gian tối đa đợi (ms, default 120000 = 2 phút)
 * @param {number} pollInterval - Khoảng thời gian giữa các lần check (ms, default 2000)
 * @returns {Promise<Buffer>} - Audio data
 */
export async function waitForAudio(audioUrl, maxWaitTime = 45000, pollInterval = 2000, { signal, fetchImpl = fetch } = {}) {
  const url = new URL(audioUrl);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw Object.assign(new Error('Invalid FPT audio URL'), { code: 'FPT_AUDIO_URL_INVALID' });
  }
  const deadline = AbortSignal.timeout(maxWaitTime);
  const boundedSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  // Poll only the async download, never submit synthesis again.
  while (true) {
    boundedSignal.throwIfAborted();
    const response = await fetchImpl(url, { signal: boundedSignal, redirect: 'error' });
    if (response.status === 404) { await response.body?.cancel(); await delay(pollInterval, undefined, { signal: boundedSignal }); continue; }
    if (!response.ok) {
      await response.body?.cancel();
      throw Object.assign(new Error('Unable to download FPT audio'), { code: 'FPT_AUDIO_HTTP_ERROR', status: response.status });
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > 5 * 1024 * 1024) {
        throw Object.assign(new Error('FPT audio too large'), { code: 'FPT_AUDIO_INVALID' });
      }
      chunks.push(chunk);
    }
    const audio = Buffer.concat(chunks);
    if (audio.length < 4 || !(audio.subarray(0, 3).toString() === 'ID3' || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0))) {
      throw Object.assign(new Error('FPT did not return MP3 audio'), { code: 'FPT_AUDIO_INVALID' });
    }
    return audio;
  }
}

/**
 * Tạo giọng Việt Nam miền Bắc
 * @param {string} text - Text cần convert
 * @param {string} voiceType - 'male' hoặc 'female'
 * @param {number} speed - Tốc độ (-3 đến +3)
 * @returns {Promise<Buffer>} - Audio data
 */
export async function generateVietnameseNorthVoice(text, voiceType = 'female', speed = -1, options = {}) {
  if (voiceType !== 'female') {
    throw Object.assign(new Error('Only the female Vietnamese voice is enabled'), { code: 'FPT_VOICE_UNSUPPORTED' });
  }
  const voice = VIETNAMESE_NORTH_VOICES.female;
  
  // Gọi API để lấy async link
  const result = await generateSpeech(text, voice, speed, 'mp3', options);
  
  // Nếu API key không có hoặc lỗi, return null để fallback
  if (!result || !result.audioUrl) {
    return null;
  }
  
  // Đợi audio file sẵn sàng và download
  const audioData = await waitForAudio(result.audioUrl, 45000, 2000, options);
  
  return audioData;
}

/**
 * Tạo giọng nói và trả về base64 để frontend có thể phát ngay
 * Chỉ sử dụng giọng miền Bắc cho cả nam và nữ
 * @param {string} text - Text cần convert
 * @param {string} voiceType - 'male' hoặc 'female'
 * @param {string} voiceOrigin - 'native' hoặc 'asian'
 * @param {string} region - Không sử dụng, luôn dùng miền Bắc
 * @returns {Promise<{audioBase64: string, mimeType: string}>}
 */
export async function generateSpeechForFrontend(text, voiceType, voiceOrigin, region = 'north', options = {}) {
  // Dùng FPT.AI cho giọng Việt Nam miền Bắc (cả nam và nữ)
  if (voiceOrigin === 'asian') {
    try {
      // Luôn dùng giọng miền Bắc
      // Tốc độ tự nhiên hơn: +1 (nhanh hơn một chút) để không giống đánh vần
      const speed = 1;
      const audioData = await generateVietnameseNorthVoice(text, voiceType, speed, options);
      
      // Nếu không có audio data (API key missing hoặc lỗi), return null để fallback
      if (!audioData) {
        // Không log warning ở đây vì đã log ở generateSpeech
        return fptSpeechFailure({code:'FPT_NOT_CONFIGURED'});
      }
      
      const audioBase64 = audioData.toString('base64');
      return {
        audioBase64,
        mimeType: 'audio/mpeg' // MP3
      };
    } catch (err) {
      console.error('FPT.AI TTS unavailable:', err.code || err.name);
      // Fallback về SpeechSynthesis nếu FPT.AI fail
      return fptSpeechFailure(err);
    }
  }
  
  // Các giọng khác (bản địa) dùng SpeechSynthesis ở frontend
  return null;
}

