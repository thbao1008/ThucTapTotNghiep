import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import { selectWhisperPython } from './whisperPython.js';
import {speechEnvironment} from '../../../shared/speechEnvironment.js';

export function createStoryWhisperWorker({ startProcess, timeoutMs = 120000, maxPending = 3 } = {}) {
  let child = null;
  let active = null;
  let sequence = 0;
  const queue = [];
  const failure = code => Object.assign(new Error('Không thể nhận dạng giọng nói lúc này.'), { code, status: 503 });
  function stop(code = 'STORY_TRANSCRIPTION_CANCELLED') {
    const previous = child; child = null;
    const jobs = [...(active ? [active] : []), ...queue.splice(0)]; active = null;
    for (const job of jobs) { clearTimeout(job.timer); job.reject(failure(code)); }
    previous?.kill();
  }
  function start() {
    if (child) return;
    const current = startProcess(); child = current;
    let buffer = '';
    const decoder = new StringDecoder('utf8');
    current.stdout.on('data', chunk => {
      if (child !== current) return;
      buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk);
      if (buffer.length > 16 * 1024 * 1024) return stop('STORY_TRANSCRIPTION_PROTOCOL');
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let result;
        try { result = JSON.parse(line); } catch { stop('STORY_TRANSCRIPTION_PROTOCOL'); return; }
        if (!result || typeof result !== 'object' || Array.isArray(result)) {
          stop('STORY_TRANSCRIPTION_PROTOCOL'); return;
        }
        if (result.ready === true) continue;
        if (!active || result.id !== active.id) { stop('STORY_TRANSCRIPTION_PROTOCOL'); return; }
        const job = active; active = null; clearTimeout(job.timer);
        if (result.ok && typeof result.json?.text === 'string' && Array.isArray(result.json.segments)) {
          job.resolve({ json: result.json, text: result.json.text, outputPath: job.outputPath });
        } else job.reject(failure('STORY_TRANSCRIPTION_FAILED'));
        pump();
      }
    });
    current.stderr.on('data', () => {}); // Drain diagnostics without retaining learner content.
    current.stdin.on('error', () => { if (child === current) stop('STORY_TRANSCRIPTION_UNAVAILABLE'); });
    current.on('error', () => { if (child === current) stop('STORY_TRANSCRIPTION_UNAVAILABLE'); });
    current.on('close', () => { if (child === current) stop('STORY_TRANSCRIPTION_UNAVAILABLE'); });
  }
  function pump() {
    if (active || !queue.length) return;
    try { start(); } catch { stop('STORY_TRANSCRIPTION_UNAVAILABLE'); return; }
    active = queue.shift();
    try {
      child.stdin.write(JSON.stringify({ id: active.id, audioPath: active.audioPath, outputPath: active.outputPath }) + '\n');
    } catch { stop('STORY_TRANSCRIPTION_UNAVAILABLE'); }
  }
  return { start, close: () => stop(),
    run(audioPath, outputPath) {
      if (queue.length + Number(Boolean(active)) >= maxPending) return Promise.reject(failure('STORY_TRANSCRIPTION_BUSY'));
      return new Promise((resolve, reject) => {
        const job = { id: ++sequence, audioPath, outputPath, resolve, reject };
        job.timer = setTimeout(() => stop('STORY_TRANSCRIPTION_TIMEOUT'), timeoutMs);
        queue.push(job); pump();
      });
    }
  };
}

const backendDir = fileURLToPath(new URL('../../../../', import.meta.url));
const worker = createStoryWhisperWorker({ startProcess: () => {
  const runtime = selectWhisperPython({ backendDir });
  const env = speechEnvironment(backendDir,{env:{ ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1',
    HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' }});
  return spawn(runtime.executable, [...runtime.flags, '-u', path.join(backendDir, 'ai_models', 'story_whisper_worker.py')],
    { cwd: backendDir, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
} });
export function runStoryWhisper(audioPath, { outputPath = null } = {}) {
  if (!fs.existsSync(audioPath)) throw Object.assign(new Error('Không tìm thấy bản ghi âm.'), { status: 422 });
  return worker.run(audioPath, outputPath);
}
export const warmStoryWhisper = () => worker.start();
export const closeStoryWhisper = () => worker.close();
process.once('exit', closeStoryWhisper);
