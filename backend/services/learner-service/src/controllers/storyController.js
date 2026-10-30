// backend/src/controllers/storyController.js
import * as storyService from "../services/storyService.js";
import * as fptTtsService from "../services/fptTtsService.js";
import pool from "../config/db.js";
import { discardRejectedUpload } from "../utils/conversationTurn.js";
import {ensureStoryRetentionSchema,assertStoryLifetime,cleanupExpiredStorySessions} from '../../../shared/practiceRetention.js';
import {createFptSpeechGate,fptSpeechFailure} from '../utils/fptSpeechPolicy.js';

const requestFptSpeech=createFptSpeechGate({synthesize:fptTtsService.generateSpeechForFrontend});

export async function getActiveStorySession(req, res) {
  try {
    const result = await pool.query(`
      SELECT id AS session_id FROM story_sessions
      WHERE learner_id = $1 AND status = 'active' AND EXISTS(SELECT 1 FROM story_session_lifetimes t
        WHERE t.story_session_id=story_sessions.id AND t.auth_session_id=$2 AND t.cleaned_at IS NULL AND t.ended_at IS NULL)
      ORDER BY created_at DESC, id DESC LIMIT 1
    `, [req.learnerId,req.session?.id]);
    res.json({ active_session: result.rows[0] || null });
  } catch {
    res.status(500).json({ message: "Unable to find active story session" });
  }
}

/**
 * Tạo session mới cho story mode
 */
export async function createStorySession(req, res) {
  try {
    const replacement = req.body.replace_session_id;
    if (replacement !== undefined && (!/^[1-9]\d*$/.test(String(replacement)) || !Number.isSafeInteger(Number(replacement)) || Number(replacement) > 2147483647)) {
      return res.status(400).json({ message: "Invalid replace_session_id" });
    }
    await ensureStoryRetentionSchema(pool);
    const session = await storyService.createStorySession(req.learnerId, {
      authSessionId:req.session?.id,userId:req.user.id,
      ...(replacement===undefined?{}:{replaceSessionId:Number(replacement)})
    });

    res.json({
      session_id: session.id,
      initial_message: session.initial_message,
      revision: session.revision,
      resumed: session.resumed
    });
  } catch (err) {
    console.error("❌ createStorySession error:", err);
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
}

/**
 * Xử lý message trong story mode
 */
export async function processStoryMessage(req, res) {
  try {
    const { session_id, text } = req.body;
    let audioUrl = null;

    // Debug: Log thông tin về file upload
    console.log("📤 processStoryMessage - File info:", {
      hasFile: !!req.file,
      fileName: req.file?.filename,
      fileSize: req.file?.size,
      filePath: req.file?.path,
      fileMimetype: req.file?.mimetype,
      hasText: !!text,
      sessionId: session_id
    });

    if (req.file) {
      audioUrl = `/uploads/${req.file.filename}`;
      console.log("✅ Audio file uploaded:", audioUrl, "Size:", req.file.size, "bytes");
    } else {
      console.warn("⚠️ No audio file in request. Request body:", Object.keys(req.body));
    }

    if (!text && !audioUrl) {
      console.error("❌ No text or audio provided");
      return res.status(400).json({ message: "No text or audio provided" });
    }

    // Validate và parse session_id
    let parsedSessionId = null;
    if (session_id && session_id !== "null" && session_id !== null) {
      parsedSessionId = parseInt(session_id, 10);
      if (isNaN(parsedSessionId)) {
        return res.status(400).json({ message: "Invalid session_id" });
      }
    }

    if (!parsedSessionId) {
      return res.status(400).json({ message: "session_id is required" });
    }

    const result = await storyService.processStoryMessage(
      parsedSessionId,
      text || null,
      audioUrl,
      req.body.expected_revision,
      {authSessionId:req.session?.id}
    );

    // Trả về cả response, transcript text và transcript JSON nếu có
    res.json({ 
      response: result.response || result,
      revision: result.revision,
      transcript: result.transcript || text || null,
      transcriptJson: result.transcriptJson || null // Full transcript với words và timings
    });
  } catch (err) {
    console.error("❌ processStoryMessage error:", err);
    if (err.discardUploadSafe) await discardRejectedUpload(req.file);
    res.status(err.status || 500).json({ message: err.message || "Server error", code: err.code });
  } finally {
    await cleanupExpiredStorySessions(pool,{userId:req.user?.id}).catch(()=>{});
  }
}

/**
 * Lấy conversation history của session
 */
export async function getStoryHistory(req, res) {
  try {
    const { session_id } = req.params;
    
    if (!session_id) {
      return res.status(400).json({ message: "session_id is required" });
    }
    
    const parsedSessionId = parseInt(session_id, 10);
    if (isNaN(parsedSessionId)) {
      return res.status(400).json({ message: "Invalid session_id" });
    }
    
    await assertStoryLifetime(pool,parsedSessionId,req.session?.id);
    const result = await pool.query(
      `SELECT 
        id,
        message_type,
        text_content,
        audio_url,
        transcript,
        ai_response,
        created_at
       FROM story_conversations 
       WHERE session_id = $1 
       ORDER BY created_at ASC, id ASC`,
      [parsedSessionId]
    );
    
    res.json({
      success: true,
      conversations: result.rows.map(row => {
        // Xử lý transcript - có thể đã là object hoặc JSON string
        let transcriptJson = null;
        if (row.transcript) {
          try {
            if (typeof row.transcript === 'string') {
              transcriptJson = JSON.parse(row.transcript);
            } else if (typeof row.transcript === 'object') {
              transcriptJson = row.transcript;
            }
          } catch (e) {
            console.warn("Could not parse transcript:", e);
            transcriptJson = null;
          }
        }
        
        return {
          id: row.id,
          type: row.message_type,
          text: row.text_content || row.ai_response,
          audioUrl: row.audio_url,
          transcriptJson: transcriptJson,
          timestamp: row.created_at
        };
      })
    });
  } catch (err) {
    console.error("❌ getStoryHistory error:", err);
    res.status(err.status||500).json({ message: err.message || "Server error",code:err.code });
  }
}

/**
 * Generate speech audio with FPT.AI when available; other voices use browser TTS.
 */
export async function generateTTS(req, res) {
  const { text, voiceType = 'female', voiceOrigin = 'native' } = req.body || {};
  if (typeof text !== 'string' || text.trim().length < 3 || text.length > 5000) {
    return res.status(400).json({ success: false, message: 'Text must contain 3-5000 characters' });
  }
  if (!['female', 'male'].includes(voiceType) || !['native', 'asian'].includes(voiceOrigin)
    || (voiceOrigin === 'asian' && voiceType !== 'female')) {
    return res.status(400).json({ success: false, message: 'Invalid voice selection' });
  }
  if (voiceOrigin === 'native') {
    return res.json({ success: false, fallback: true, provider: 'browser' });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  const disconnected = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', disconnected);
  try {
    const result = await requestFptSpeech(text, voiceType, voiceOrigin, 'north', {
      signal: controller.signal
    });
    if (res.destroyed) return;
    if(result?.success===false)return res.json({...result,provider:'browser'});
    return res.json(result ? {
      success: true, provider: 'fpt', voice: 'banmai',
      audioBase64: result.audioBase64, mimeType: result.mimeType
    } : { success: false, fallback: true, provider: 'browser',
      message: 'FPT.AI TTS unavailable, using browser TTS' });
  } catch(error) {
    if (!res.destroyed) return res.json({...fptSpeechFailure(error),provider:'browser'});
  } finally {
    clearTimeout(timeout);
    res.removeListener('close', disconnected);
  }
}
