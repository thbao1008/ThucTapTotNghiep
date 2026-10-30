import { withConversationTurn } from "../utils/conversationTurn.js";
import { STORY_OUTPUT_TOKENS, storyConversationMessages } from '../utils/storyConversation.js';
// Learner Service - Story Service
import pool from "../config/db.js";
import { withSessionCreationLock } from "../utils/sessionCreationLock.js";
import { runStoryWhisper } from '../utils/storyWhisperWorker.js';
import {registerStoryLifetime,assertStoryLifetime} from '../../../shared/practiceRetention.js';
// TODO: Replace with API calls to AI Service
// import * as aiService from "./aiService.js";
// import * as learnerAiService from "./learnerAiService.js";
import * as aiServiceClient from "../utils/aiServiceClient.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

/**
 * Tìm project root (đi lên từ learner-service/src/services đến root)
 */
function getProjectRoot() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // __dirname = backend/services/learner-service/src/services
  // Đi lên 4 cấp: services -> src -> learner-service -> services -> backend
  // .. -> src
  // .. -> learner-service
  // .. -> services
  // .. -> backend ✅
  const backendDir = path.resolve(__dirname, "..", "..", "..", "..");
  
  // Debug: Log để đảm bảo path đúng
  console.log("🔍 getProjectRoot() called from storyService.js:", {
    __dirname: __dirname,
    backendDir: backendDir,
    uploadsDir: path.join(backendDir, "uploads"),
    uploadsExists: fs.existsSync(path.join(backendDir, "uploads"))
  });
  
  return backendDir;
}

/**
 * Tạo session mới cho story mode
 */
export async function createStorySession(actualLearnerId, { replaceSessionId = null, authSessionId = null, userId = null } = {}) {
  if (!actualLearnerId) {
    throw new Error("Invalid learner_id or user_id");
  }

  return withSessionCreationLock(pool, "story", actualLearnerId, async client => {
    if (replaceSessionId !== null) {
      const owned = await client.query("SELECT id FROM story_sessions WHERE id = $1 AND learner_id = $2", [replaceSessionId, actualLearnerId]);
      if (!owned.rows[0]) throw Object.assign(new Error("Story session not found"), { status: 404 });
    }
    const current = await client.query(`
      SELECT * FROM story_sessions WHERE learner_id = $1 AND status = 'active'
        AND ($2::int IS NULL OR EXISTS(SELECT 1 FROM story_session_lifetimes t
          WHERE t.story_session_id=story_sessions.id AND t.auth_session_id=$2 AND t.cleaned_at IS NULL AND t.ended_at IS NULL))
      ORDER BY created_at DESC, id DESC LIMIT 1
    `, [actualLearnerId,authSessionId]);
    // A concurrent request already replaced the same base session: return its winner.
    if (current.rows[0] && (replaceSessionId === null || String(current.rows[0].id) !== String(replaceSessionId))) {
      const snapshot = await client.query(
        'SELECT COALESCE(MAX(id), 0) AS revision FROM story_conversations WHERE session_id = $1',
        [current.rows[0].id]
      );
      return { ...current.rows[0], revision: Number(snapshot.rows[0].revision), resumed: true };
    }

    // Keep greeting and session creation atomic; no empty session if either INSERT fails.
    const userRes = await client.query(
      `SELECT u.name, u.email, u.dob, u.role
       FROM users u
       JOIN learners l ON u.id = l.user_id
       WHERE l.id = $1`,
      [actualLearnerId]
    );
    const userInfo = userRes.rows[0] || {};

    const initialMessage = await generateInitialStoryMessage(userInfo);

    // Tạo session mới
    const result = await client.query(
      `INSERT INTO story_sessions (learner_id, status, created_at)
       VALUES ($1, 'active', NOW())
       RETURNING *`,
      [actualLearnerId]
    );

    const session = result.rows[0];
    if(authSessionId!==null)await registerStoryLifetime(client,{storySessionId:session.id,authSessionId,userId,learnerId:actualLearnerId});

    // Lưu initial message vào conversation
    const greeting = await client.query(
      `INSERT INTO story_conversations
       (session_id, message_type, text_content, ai_response)
       VALUES ($1, 'ai', $2, $2) RETURNING id`,
      [session.id, initialMessage]
    );

    return {
      id: session.id,
      learner_id: session.learner_id,
      status: session.status,
      created_at: session.created_at,
      initial_message: initialMessage,
      revision: greeting.rows[0].id,
      resumed: false
    };
  });
}

/**
 * Tạo initial message cho story session
 * @param {Object} userInfo - Thông tin người dùng {name, email, dob, role}
 */
async function generateInitialStoryMessage(userInfo = {}) {
  const userName = userInfo.name || "bạn";
  const userRole = userInfo.role === 'learner' ? "học viên" : userInfo.role;
  const userDob = userInfo.dob ? new Date(userInfo.dob).toLocaleDateString('vi-VN') : "không rõ";
  
  // Tạo câu chào thông minh dựa trên thông tin user (CHỈ TIẾNG ANH)
  const messages = [
    {
      role: "system",
      content: `You are a warm, empathetic friend starting a conversation with a user. 

USER INFORMATION:
- Name: ${userName}
- Role: ${userRole}
- Date of Birth: ${userDob}

IMPORTANT INSTRUCTIONS:
1. ALWAYS greet the user by their name if you have it (${userInfo.name ? `use "${userName}"` : "no name available"})
2. Be warm, genuine, and emotionally present
3. Use natural, everyday language with real emotion
4. Keep it short (1-2 sentences), warm, and inviting
5. If the user's name is available, use it naturally in your greeting
6. CRITICAL: You MUST speak ONLY in English. Do NOT use Vietnamese or any other language. This is an English speaking practice session.
7. Invite them to share their story by speaking into the microphone in English

Generate a personalized greeting in English that makes the user feel welcomed and valued.`
    },
    {
      role: "user",
      content: "Start the conversation with a warm greeting"
    }
  ];

  try {
    const response = await aiServiceClient.callGroq(messages, {
      task_type: "story_greeting",
      temperature: 0.9,
      max_tokens: STORY_OUTPUT_TOKENS
    });

    const aiGreeting = response.choices?.[0]?.message?.content?.trim();
    if (!aiGreeting || aiGreeting.length <= 10) {
      throw Object.assign(new Error("AI returned an invalid story greeting"), {
        status: 502,
        code: "AI_RESPONSE_INVALID"
      });
    }
    return aiGreeting;
  } catch (err) {
    console.error("❌ Error generating initial story message:", err.message);
    throw err;
  }
}

/**
 * Xử lý message trong story mode
 */
export async function processStoryMessage(sessionId, text, audioUrl, expectedRevision, {authSessionId=null}={}) {
  return withConversationTurn(pool, "story", sessionId, expectedRevision, async client => {
    await assertStoryLifetime(client,sessionId,authSessionId);
    // Validate sessionId là integer
    if (!sessionId || typeof sessionId !== 'number' || isNaN(sessionId)) {
      throw new Error("Invalid sessionId: must be a valid integer");
    }

    let transcript = null;
    let transcriptText = "";

    // Nếu có audio, transcribe
    if (audioUrl) {
      const backendDir = getProjectRoot();
      const localPath = audioUrl.startsWith("/uploads/")
        ? path.join(backendDir, audioUrl)
        : audioUrl;

      console.log("🎤 Starting transcription:", {
        audioUrl: audioUrl,
        backendDir: backendDir,
        localPath: localPath,
        fileExists: fs.existsSync(localPath),
        fileSize: fs.existsSync(localPath) ? fs.statSync(localPath).size : 0,
        audioUrlStartsWithUploads: audioUrl.startsWith("/uploads/")
      });

      if (fs.existsSync(localPath)) {
        try {
          console.log("🔄 Running WhisperX transcription...");
          const { json: transcriptJson } = await runStoryWhisper(localPath);
          transcript = transcriptJson;
          transcriptText =
            transcript.text ||
            (transcript.segments || [])
              .map((s) => s.text || "")
              .join(" ");

          console.log("✅ Transcription completed:", {
            hasTranscript: !!transcript,
            transcriptLength: transcriptText?.length || 0,
            segmentsCount: transcript?.segments?.length || 0
          });
        } catch (err) {
          console.error("Story transcription failed:", err.code || 'STORY_TRANSCRIPTION_FAILED');
          throw err;
        }
      } else {
        console.error("❌ Audio file not found at path:", localPath);
      }
    } else {
      console.log("⚠️ No audioUrl provided, skipping transcription");
    }

    const userMessage = text || transcriptText;
    if (!userMessage.trim()) throw Object.assign(new Error("No usable speech or text"), { status: 422 });

    // Lấy conversation history
    const history = await client.query(
      `SELECT * FROM story_conversations
       WHERE session_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 10`,
      [sessionId]
    );

    // Lấy thông tin user từ session để AI có context
    const sessionInfo = await client.query(
      `SELECT ss.learner_id, l.user_id, u.name, u.email, u.dob, u.role
       FROM story_sessions ss
       LEFT JOIN learners l ON ss.learner_id = l.id
       LEFT JOIN users u ON l.user_id = u.id
       WHERE ss.id = $1`,
      [sessionId]
    );

    const userInfo = sessionInfo.rows[0] || null;

    // Tạo AI response với tone đồng cảm, truyền cảm, có thông tin user
    const aiResponse = await generateStoryResponse(userMessage, history.rows.reverse(), userInfo);
    // A logout/expiry during ASR or the AI call must not save a late reply.
    await assertStoryLifetime(client,sessionId,authSessionId);

    // Lưu user message - đảm bảo tất cả giá trị null là thực sự null, không phải string "null"
    console.log("💾 Saving user message to database:", {
      sessionId,
      hasText: !!text,
      hasAudioUrl: !!audioUrl,
      audioUrl: audioUrl,
      hasTranscript: !!transcript
    });

    const insertResult = await client.query(
      `INSERT INTO story_conversations
       (session_id, message_type, text_content, audio_url, transcript, ai_response)
       VALUES ($1, 'user', $2, $3, $4, $5)
       RETURNING id, audio_url, transcript`,
      [
        sessionId, // Integer
        userMessage,
        audioUrl && audioUrl !== "null" ? audioUrl : null,
        transcript ? JSON.stringify(transcript) : null,
        null // User message không có ai_response
      ]
    );

    const savedMessage = insertResult.rows[0];

    // PostgreSQL JSONB có thể trả về object hoặc string, cần xử lý cả 2 trường hợp
    let transcriptObj = null;
    if (savedMessage.transcript) {
      if (typeof savedMessage.transcript === 'string') {
        try {
          transcriptObj = JSON.parse(savedMessage.transcript);
        } catch (e) {
          console.warn("⚠️ Failed to parse transcript string:", e);
          transcriptObj = null;
        }
      } else if (typeof savedMessage.transcript === 'object') {
        transcriptObj = savedMessage.transcript; // Đã là object rồi
      }
    }

    console.log("✅ User message saved to database:", {
      messageId: savedMessage.id,
      audioUrl: savedMessage.audio_url,
      hasTranscript: !!savedMessage.transcript,
      transcriptType: typeof savedMessage.transcript,
      transcriptLength: transcriptObj?.text?.length || 0
    });

    // Lưu AI response như một message riêng
    if (aiResponse) {
      await client.query(
        `INSERT INTO story_conversations
         (session_id, message_type, text_content, ai_response)
         VALUES ($1, 'ai', $2, $2)`,
        [sessionId, aiResponse]
      );
    }

    return {
      response: aiResponse,
      transcript: transcriptText,
      transcriptJson: transcript ? transcript : null // Trả về full transcript JSON với words
    };
  });
}

/**
 * Generate a story response through the authenticated AI Service.
 */
async function generateStoryResponse(userMessage, history, userInfo = null) {
  return generateStoryResponseWithAI(userMessage, history, userInfo);
}

/**
 * Generate a text response; transcription and speech generation are separate services.
 */
async function generateStoryResponseWithAI(userMessage, history, userInfo = null) {
  
  // Tạo user context string nếu có thông tin user
  let userContext = '';
  if (userInfo) {
    const userDetails = [];
    if (userInfo.name) userDetails.push(`Name: ${userInfo.name}`);
    if (userInfo.dob) {
      const age = new Date().getFullYear() - new Date(userInfo.dob).getFullYear();
      userDetails.push(`Age: approximately ${age} years old`);
    }
    if (userInfo.role) userDetails.push(`Role: ${userInfo.role}`);
    if (userDetails.length > 0) {
      userContext = `\n\nUSER CONTEXT (use this to personalize your responses naturally):\n${userDetails.join('\n')}\nUse this information to make the conversation more personal and relevant, but don't mention it directly unless it's natural.`;
    }
  }
  
  // Tạo prompt ngắn gọn nhưng đầy đủ để phản hồi nhanh
  const systemPrompt = `You're a real friend—warm, genuine, and emotionally present. Speak like a HUMAN, not a robot. Use natural, everyday language with real emotion.${userContext}

CRITICAL LANGUAGE RULE:
- You MUST speak ONLY in English. This is an English speaking practice session.
- Do NOT use Vietnamese, Chinese, or any other language. Only English.
- Even if the user speaks Vietnamese, you respond in English to help them practice.

CORE PRINCIPLES:
- Talk like you're texting a close friend—casual, real, heartfelt
- Feel WITH them, not just about them
- Use natural human expressions: "Oh no...", "That's rough", "I get it", "Aw, that's amazing!"
- Vary your language—don't repeat the same phrases
- Be spontaneous—let your words flow naturally
- Keep it SHORT (1-3 sentences max) for quick, natural responses
- ALWAYS respond in English only

NATURAL HUMAN LANGUAGE EXAMPLES:
- Instead of "I understand your feelings" → "I totally get that" or "That makes so much sense"
- Instead of "That must be difficult" → "That's really tough" or "Oh man, that's hard"
- Instead of "I'm here for you" → "I'm right here with you" or "You're not alone in this"
- Use contractions: "I'm", "you're", "that's", "it's" (more natural)
- Use casual connectors: "like", "you know", "I mean" (sparingly, naturally)
- Express real reactions: "Wow!", "Oh no!", "That's awesome!", "Seriously?"

EMOTIONAL VARIETY (Don't be repetitive):
- Sadness: "Oh no... that's really hard", "I'm so sorry you're going through this", "That sounds really painful"
- Anxiety: "I know that feeling", "That's totally understandable", "It's okay to feel nervous"
- Joy: "That's amazing!", "I'm so happy for you!", "That's incredible!"
- Confusion: "That's a lot to process", "I can see why that's confusing", "That makes sense"

RESPONSE STYLE:
- 1-3 sentences MAX (for speed and naturalness)
- Start with emotional acknowledgment
- Ask ONE simple, open question if needed
- Use natural pauses: "..." when thinking
- Be genuine—don't overthink it

Respond in 1-2 sentences. Be natural, warm, HUMAN.`;

  try {
    const response = await aiServiceClient.callGroq(
      storyConversationMessages(systemPrompt, history, userMessage),
      {
        task_type: "story_response",
        temperature: 0.95, // Higher for natural variation
        max_tokens: STORY_OUTPUT_TOKENS,
        stream: false // Không stream để đợi response nhanh hơn
      }
    );

    let aiResponse = response.choices?.[0]?.message?.content;
    if (typeof aiResponse !== "string" || !aiResponse.trim()) {
      throw Object.assign(new Error("AI returned an empty story response"), {
        status: 502,
        code: "AI_RESPONSE_INVALID"
      });
    }
    
    // Clean up response - remove any markdown or extra formatting
    aiResponse = aiResponse.trim();
    
    return aiResponse;
  } catch (err) {
    // Log error with helpful context
    if (err.code === "API_KEY_MISSING" || err.code === "API_KEY_INVALID") {
      console.error("❌ Groq API key issue. Please set GROQ_API_KEY in .env file:", err.message);
    } else {
      console.error("❌ Error generating story response:", err.message);
    }
    throw err;
  }
}
