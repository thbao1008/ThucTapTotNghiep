// Learner Service - Speaking Practice Service
import pool from "../config/db.js";
import { runWhisperX } from "../utils/whisperxRunner.js";
// TODO: Replace with API calls to AI Service
// import * as learnerAiService from "./learnerAiService.js";
// import * as aiService from "./aiService.js";
import * as aiServiceClient from "../utils/aiServiceClient.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  getSpeakingPracticeAnalysisStatus,
  hasValidSpeakingPracticeResult,
  getSpeakingPracticeSummaryStatus,
  parseSpeakingPracticeSummary,
  evaluateTranscriptMatch,
  normalizeSpeakingPracticeAssessment
} from "../utils/speakingPracticeAnalysis.js";
import { buildSpeakingPromptMessages, calculateSpeakingTimeLimit, countSpeakingWords, getSpeakingDifficulty, parseSpeakingLevel, validateSpeakingPrompt } from "../utils/speakingPrompt.js";
import { persistSpeakingRound } from "../utils/persistSpeakingRound.js";
import {practiceRetention} from '../utils/practiceRetentionRuntime.js';
import {withoutPracticeMedia} from '../utils/practiceSessionEnd.js';
import {registerPronunciationLifetime} from '../../../shared/practiceRetention.js';

/**
 * Tìm project root (đi lên từ learner-service/src/services đến root)
 */
function getProjectRoot() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // __dirname = backend/services/learner-service/src/services
  // Go up 4 levels: services -> src -> learner-service -> services -> backend
  // .. -> src
  // .. -> learner-service
  // .. -> services
  // .. -> backend ✅
  const backendDir = path.resolve(__dirname, "..", "..", "..", "..");
  
  console.log("🔍 getProjectRoot() called from speakingPracticeService.js:", {
    __dirname: __dirname,
    backendDir: backendDir,
    aiModelsDir: path.join(backendDir, "ai_models"),
    aiModelsExists: fs.existsSync(path.join(backendDir, "ai_models"))
  });
  
  return backendDir;
}

// QUAN TRỌNG: Không còn hardcoded prompts
// Nội dung luyện tập được tạo trực tiếp qua Groq.

/**
 * Tạo session mới cho luyện nói
 * Kiểm tra xem có session đang dở dang không, nếu có thì bắt buộc phải hoàn thành trước
 */
export async function createPracticeSession(learnerId, level, {authSessionId=null,userId=null}={}) {
  level = parseSpeakingLevel(level);
  
  // Kiểm tra xem có session đang dở dang không (status = 'active' và chưa completed)
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), $2)", ["aesp-practice-session", learnerId]);
    const existingSession = await client.query(
      `SELECT id, created_at,
         (SELECT COUNT(*) FROM speaking_practice_rounds WHERE session_id = speaking_practice_sessions.id) as rounds_count
       FROM speaking_practice_sessions
       WHERE learner_id = $1
         AND mode = 'practice'
         AND status = 'active'
         AND completed_at IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT 1 FOR UPDATE`,
      [learnerId]
    );

    if (existingSession.rows.length > 0) {
      const session = existingSession.rows[0];
      const roundsCount = parseInt(session.rounds_count || 0);

      throw Object.assign(new Error(`Bạn đang có một bài luyện tập chưa hoàn thành (${roundsCount}/10 vòng). Vui lòng hoàn tất bài và tổng kết trước khi bắt đầu bài mới.`), {
        code: "SPEAKING_SESSION_INCOMPLETE",
        incomplete_session: { session_id: session.id, rounds_count: roundsCount, created_at: session.created_at }
      });
    }

    const result = await client.query(
      `INSERT INTO speaking_practice_sessions (learner_id, level, mode, status)
       VALUES ($1, $2, 'practice', 'active')
       RETURNING *`,
      [learnerId, level]
    );
    if(authSessionId!==null)await registerPronunciationLifetime(client,{sessionId:result.rows[0].id,authSessionId,userId,learnerId});
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Tạo session mới cho Tell me your story
 */
export async function createStorySession(learnerId) {
  const result = await pool.query(
    `INSERT INTO speaking_practice_sessions (learner_id, level, mode, status)
     VALUES ($1, 1, 'story', 'active')
     RETURNING *`,
    [learnerId]
  );
  return result.rows[0];
}

// Danh sách topics phong phú từ nhiều nguồn
const TOPIC_THEMES = {
  1: [
    "Self-introduction", "Family", "Daily routine", "Food", "Colors", "Numbers", 
    "Weather", "Pets", "School", "Friends", "Hobbies", "Sports", "Shopping",
    "Transportation", "Home", "Clothing", "Body parts", "Time", "Days of week"
  ],
  2: [
    "Travel", "Work", "Education", "Music", "Movies", "Books", "Technology",
    "Health", "Culture", "Future plans", "Dreams", "Art", "Photography",
    "Cooking", "Fitness", "Relationships", "Career", "Language learning",
    "Entertainment", "Social media", "Environment", "Holidays", "Festivals"
  ],
  3: [
    "Artificial Intelligence", "Climate change", "Globalization", "Philosophy",
    "Psychology", "Economics", "Politics", "Science", "Research", "Innovation",
    "Sustainability", "Ethics", "Society", "History", "Literature", "Mathematics",
    "Physics", "Chemistry", "Biology", "Astronomy", "Cybersecurity", "Data science",
    "Machine learning", "AI ethics", "Public health", "Mental health", "Nutrition"
  ]
};

/**
 * Lấy topics và prompts đã dùng trong session để tránh lặp lại
 */
async function getUsedTopicsInSession(sessionId, level) {
  try {
    if (!sessionId) return { topics: [], prompts: [] };
    
    const usedRounds = await pool.query(
      `SELECT spr.prompt, agp.topic 
       FROM speaking_practice_rounds spr
       LEFT JOIN ai_generated_prompts agp ON spr.prompt = agp.prompt_text
       WHERE spr.session_id = $1
       ORDER BY spr.round_number DESC
       LIMIT 10`,
      [sessionId]
    );
    
    const topics = usedRounds.rows.map(r => r.topic).filter(Boolean);
    const prompts = usedRounds.rows.map(r => r.prompt).filter(Boolean);
    
    return { topics, prompts };
  } catch (err) {
    console.error("Error getting used topics:", err);
    return { topics: [], prompts: [] };
  }
}

/**
 * Groq tạo câu luyện tập dựa trên mức độ và lịch sử phiên
 * Giữ nguyên độ khó do học viên chọn cho toàn bộ phiên
 */
async function generateAIPrompt(level, roundNumber, learnerId = null, sessionId = null) {
  try {
    const { name: difficulty } = getSpeakingDifficulty(level);
    
    // Lấy topics và prompts đã dùng trong session để tránh lặp lại
    const { topics: usedTopics, prompts: usedPrompts } = await getUsedTopicsInSession(sessionId, level);
    
    const response = await aiServiceClient.callGroq(
      buildSpeakingPromptMessages({ level, difficulty, usedTopics, usedPrompts }),
      { task_type: 'speaking_prompt', temperature: 0.9, max_tokens: 768, response_format: { type: 'json_object' } }
    );

    // Nếu response fail, fallback
    if (!response || !response.choices || !response.choices[0]) {
      throw Object.assign(new Error("AI returned an invalid speaking prompt response"), {
        status: 502,
        code: "AI_RESPONSE_INVALID"
      });
    }

    const content = response.choices?.[0]?.message?.content || "{}";
    let result;
    try {
      result = JSON.parse(content);
    } catch {
      throw Object.assign(new Error("AI returned malformed speaking prompt JSON"), {
        status: 502,
        code: "AI_RESPONSE_INVALID"
      });
    }

    // Sử dụng suggested_prompt hoặc tạo prompt từ topic
    let finalPrompt = result?.suggested_prompt || result?.prompt;
    if (typeof finalPrompt !== "string" || !finalPrompt.trim()) {
      throw Object.assign(new Error("AI response did not include a speaking prompt"), {
        status: 502,
        code: "AI_RESPONSE_INVALID"
      });
    }
    finalPrompt = validateSpeakingPrompt(finalPrompt, level);

    // Lưu prompt đã generate vào database
    const wordCount = countSpeakingWords(finalPrompt);
    // Tính difficulty_score dựa trên độ khó thực tế
    const difficultyScore = difficulty === 'hard' ? 0.9 : difficulty === 'medium' ? 0.6 : 0.3;

    await pool.query(
      `INSERT INTO ai_generated_prompts 
       (level, prompt_text, topic, word_count, difficulty_score, usage_count)
       VALUES ($1, $2, $3, $4, $5, 1)
       ON CONFLICT (prompt_text) DO UPDATE 
       SET usage_count = ai_generated_prompts.usage_count + 1, 
           last_used_at = NOW(),
           updated_at = NOW()`,
      [
        level,
        finalPrompt,
        result.topic || "general",
        wordCount,
        difficultyScore
      ]
    );

    return finalPrompt;
  } catch (err) {
    console.error("❌ Error generating AI prompt:", err);
    throw err;
  }
}

/**
 * Tạo câu luyện tập trực tiếp bằng Groq
 */
async function generateAIPromptFallback(level, usedTopics = [], usedPrompts = [], difficulty = 'easy') {
  // Đơn giản hóa: chỉ tạo prompt ngắn gọn với AI
  const availableTopics = TOPIC_THEMES[level] || TOPIC_THEMES[1];
  const unusedTopics = availableTopics.filter(t => !usedTopics.includes(t));
  const selectedTopics = unusedTopics.length > 0 
    ? unusedTopics.sort(() => Math.random() - 0.5).slice(0, 3)
    : availableTopics.sort(() => Math.random() - 0.5).slice(0, 3);
  
  // Xác định độ dài dựa trên difficulty thay vì level
  const lengthDesc = difficulty === 'hard' ? '30-50' : difficulty === 'medium' ? '15-30' : '5-15';
  
  const simplePrompt = `Generate a NEW speaking practice sentence for ${difficulty} difficulty English learners.
- Length: ${lengthDesc} words
- Topic: ${selectedTopics.join(' or ')}
- Avoid: ${usedPrompts.slice(0, 3).join(', ') || 'none'}
- Natural, conversational English

Return JSON: {"prompt": "sentence", "topic": "topic name", "word_count": number}`;

  try {
    const response = await aiServiceClient.callGroq(
      [{ role: "user", content: simplePrompt }],
      { task_type: "speaking_prompt", temperature: 0.95, max_tokens: 200 }
    );

    const content = response.choices?.[0]?.message?.content || "{}";
    let result;
    try {
      result = JSON.parse(content);
    } catch (e) {
      result = {
        prompt: content.trim().replace(/^["']|["']$/g, ""),
        topic: selectedTopics[0] || "general",
        word_count: content.split(/\s+/).length
      };
    }

    // Nếu có prompt hợp lệ, trả về
    if (result.prompt && result.prompt.length > 10) {
      return result.prompt;
    }
  } catch (err) {
    console.warn("⚠️ Fallback AI call failed, using topic-based prompts:", err.message);
  }

  // Nếu vẫn fail, tạo prompt ngẫu nhiên từ topics thay vì dùng prompt cố định
  const randomTopic = selectedTopics[Math.floor(Math.random() * selectedTopics.length)] || selectedTopics[0] || "general";
  
  // Tạo prompt đa dạng dựa trên topic và difficulty
  const topicBasedPrompts = {
    easy: [
      `Hello, my name is ${randomTopic === 'Self-introduction' ? 'Anna' : 'John'}. I am from Vietnam.`,
      `I like ${randomTopic.toLowerCase()}. It is fun.`,
      `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}. I feel happy.`,
      `My favorite ${randomTopic.toLowerCase()} is ${randomTopic === 'Colors' ? 'blue' : randomTopic === 'Food' ? 'pizza' : 'good'}.`,
      `I have a ${randomTopic === 'Pets' ? 'dog' : randomTopic === 'Family' ? 'sister' : 'friend'}.`
    ],
    medium: [
      `I enjoy ${randomTopic.toLowerCase()} because it helps me learn new things and meet interesting people.`,
      `Last weekend, I went to a ${randomTopic.toLowerCase()} event and had a wonderful time with my friends.`,
      `In my opinion, ${randomTopic.toLowerCase()} is very important for personal development and growth.`,
      `I have been interested in ${randomTopic.toLowerCase()} since I was young, and it has become my passion.`,
      `When I think about ${randomTopic.toLowerCase()}, I feel excited and motivated to explore more.`
    ],
    hard: [
      `The advancement of ${randomTopic.toLowerCase()} has significantly transformed how we learn and interact with information in the modern world.`,
      `In today's globalized society, understanding ${randomTopic.toLowerCase()} is crucial for effective communication and cultural exchange.`,
      `Research in ${randomTopic.toLowerCase()} has revealed fascinating insights into human behavior and cognitive processes.`,
      `The intersection of ${randomTopic.toLowerCase()} and technology has created unprecedented opportunities for innovation and discovery.`,
      `Critical analysis of ${randomTopic.toLowerCase()} requires a deep understanding of historical context and contemporary perspectives.`
    ]
  };
  
  const prompts = topicBasedPrompts[difficulty] || topicBasedPrompts.easy;
  const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
  
  return randomPrompt;
}

/**
 * Lấy prompt cho vòng nói (ưu tiên AI-generated, đa dạng hóa)
 * QUAN TRỌNG: Luôn tạo prompt MỚI, không reuse prompts đã dùng trong session
 */
export async function getPromptForRound(level, roundNumber, learnerId = null, sessionId = null) {
  level = parseSpeakingLevel(level);
  try {
    console.log(`🎯 getPromptForRound called: level=${level}, round=${roundNumber}, sessionId=${sessionId}`);
    
    // Lấy topics và prompts đã dùng trong session
    const { topics: usedTopics, prompts: usedPrompts } = await getUsedTopicsInSession(sessionId, level);
    console.log(`📋 Used in session: ${usedPrompts.length} prompts, ${usedTopics.length} topics`);
    
    // QUAN TRỌNG: Luôn generate prompt MỚI thay vì lấy từ database
    // Điều này đảm bảo mỗi round có prompt khác nhau
    console.log(`🔄 Generating NEW prompt for round ${roundNumber}...`);
    const newPrompt = await generateAIPrompt(level, roundNumber, learnerId, sessionId);
    
    // Kiểm tra xem prompt mới có trùng với prompts đã dùng không
    if (usedPrompts.includes(newPrompt)) {
      console.warn(`⚠️ Generated prompt matches used prompt, generating again...`);
      // Generate lại nếu trùng
      const retryPrompt = await generateAIPrompt(level, roundNumber, learnerId, sessionId);
      return retryPrompt;
    }
    
    console.log(`✅ Generated new prompt: "${newPrompt.substring(0, 50)}..."`);
    return newPrompt;
    
    /* OLD LOGIC - Commented out để luôn generate mới
    // Thử lấy từ AI-generated prompts với ưu tiên topics chưa dùng và prompts chưa dùng
    let aiPrompt;
    if (usedPrompts.length > 0) {
      // Nếu có prompts đã dùng, loại bỏ chúng
      aiPrompt = await pool.query(
        `SELECT prompt_text, topic FROM ai_generated_prompts 
         WHERE level = $1 
         AND prompt_text NOT IN (${usedPrompts.map((_, i) => `$${i + 2}`).join(", ")})
         ${usedTopics.length > 0 
           ? `AND (topic NOT IN (${usedTopics.map((_, i) => `$${usedPrompts.length + i + 2}`).join(", ")}) OR topic IS NULL)`
           : ""}
         ORDER BY 
           ${usedTopics.length > 0 
             ? `CASE WHEN topic NOT IN (${usedTopics.map((_, i) => `$${usedPrompts.length + i + 2}`).join(", ")}) THEN 0 ELSE 1 END, `
             : ""}
           usage_count ASC, 
           RANDOM()
         LIMIT 1`,
        [level, ...usedPrompts, ...usedTopics]
      );
    } else if (usedTopics.length > 0) {
      // Chỉ có topics đã dùng
      aiPrompt = await pool.query(
        `SELECT prompt_text, topic FROM ai_generated_prompts 
         WHERE level = $1 
         AND (topic NOT IN (${usedTopics.map((_, i) => `$${i + 2}`).join(", ")}) OR topic IS NULL)
         ORDER BY 
           CASE WHEN topic NOT IN (${usedTopics.map((_, i) => `$${i + 2}`).join(", ")}) THEN 0 ELSE 1 END,
           usage_count ASC, 
           RANDOM()
         LIMIT 1`,
        [level, ...usedTopics]
      );
    } else {
      // Chưa có gì được dùng
      aiPrompt = await pool.query(
        `SELECT prompt_text, topic FROM ai_generated_prompts 
         WHERE level = $1 
         ORDER BY usage_count ASC, RANDOM()
         LIMIT 1`,
        [level]
      );
    }

    // Nếu không tìm thấy prompt với topic mới, tìm bất kỳ
    let selectedPrompt = aiPrompt.rows[0];
    if (!selectedPrompt) {
      const anyPrompt = await pool.query(
        `SELECT prompt_text, topic FROM ai_generated_prompts 
         WHERE level = $1 
         ORDER BY usage_count ASC, RANDOM() 
         LIMIT 1`,
        [level]
      );
      selectedPrompt = anyPrompt.rows[0];
    }

    if (selectedPrompt) {
      // Update usage
      await pool.query(
        `UPDATE ai_generated_prompts 
         SET usage_count = usage_count + 1, last_used_at = NOW()
         WHERE prompt_text = $1`,
        [selectedPrompt.prompt_text]
      );
      return selectedPrompt.prompt_text;
    }

    // Nếu chưa có, generate mới với đa dạng hóa
    return await generateAIPrompt(level, roundNumber, learnerId, sessionId);
    */
  } catch (err) {
    console.error("❌ Error getting prompt:", err);
    throw err;
  }
}

/**
 * Lấy time limit cho level và prompt
 */
export function getTimeLimit(level, prompt = "") {
  return calculateSpeakingTimeLimit(prompt, level);
}

/**
 * Lưu vòng nói (lưu ngay, xử lý ở background)
 */
export async function saveRound(sessionId, roundNumber, audioUrl, timeTaken, promptText = null, webSpeechTranscript = null, webSpeechHighlights = null) {
  const sessionRound = Number(roundNumber);
  if (!Number.isInteger(sessionRound) || sessionRound < 1 || sessionRound > 10) {
    throw new Error("Round number must be between 1 and 10");
  }

  const session = await pool.query(
    `SELECT level, learner_id FROM speaking_practice_sessions WHERE id = $1`,
    [sessionId]
  );

  if (!session.rows[0]) {
    throw new Error("Session not found");
  }

  const level = session.rows[0].level;
  const learnerId = session.rows[0].learner_id;
  
  // QUAN TRỌNG: Nếu promptText được truyền từ frontend, dùng nó. Nếu không, fetch mới
  let prompt = promptText;
  if (!prompt) {
    // Fetch prompt mới với sessionId để track used prompts
    prompt = await getPromptForRound(level, roundNumber, learnerId, sessionId);
  }

  const round = await persistSpeakingRound({
    pool,
    sessionId,
    roundNumber: sessionRound,
    prompt,
    audioUrl,
    timeTaken
  });

  const roundId = round.id;
  const roundStatus = getSpeakingPracticeAnalysisStatus(round.analysis);
  if (round.idempotent_replay && roundStatus !== "failed") {
    return round;
  }

  // QUAN TRỌNG: Phân tích ngay sau mỗi vòng (không đợi đến cuối)
  // Xử lý ngay trong background để kết quả sẵn sàng khi đến summary
  try {
    const { enqueue } = await import("../utils/queue.js");
    // Enqueue với priority cao để xử lý nhanh
    console.log("📤 Enqueueing speaking round with Web Speech data:", {
      roundId,
      webSpeechTranscript: !!webSpeechTranscript,
      webSpeechHighlights: webSpeechHighlights ? webSpeechHighlights.length : 0
    });
    await enqueue("processSpeakingRound", {
      roundId,
      sessionId,
      audioUrl: round.audio_url || audioUrl,
      prompt: round.prompt || prompt,
      level,
      time_taken: timeTaken,
      webSpeechTranscript,
      webSpeechHighlights
    }, {
      priority: 1, // Priority cao để xử lý ngay
      attempts: 2 // Retry nếu fail
    });
  } catch (err) {
    console.error("❌ Error enqueueing processing job:", err);
    // Nếu không có queue, xử lý ngay (fallback) - không đợi
    processRoundInBackground(
      roundId,
      round.audio_url || audioUrl,
      round.prompt || prompt,
      level,
      sessionId
    ).catch(err => {
      console.error("❌ Background processing error:", err);
    });
  }

  return round;
}

/**
 * Xử lý round ở background (transcription + transcript-to-prompt comparison)
 * QUAN TRỌNG: Phân tích ngay sau mỗi vòng để kết quả sẵn sàng khi đến summary
 */
async function processRoundInBackground(roundId, audioUrl, prompt, level, sessionId = null) {
  const localPath = audioUrl.startsWith("/uploads/")
    ? path.join(getProjectRoot(), audioUrl)
    : audioUrl;

  let transcript = null;
  let transcriptionError = null;
  if (fs.existsSync(localPath)) {
    try {
      const { json: transcriptJson } = await runWhisperX(localPath, {
        model: "base"
        // computeType không cần chỉ định - tự động dùng GPU với float16
      });
      transcript = transcriptJson;
    } catch (err) {
      console.error("❌ Transcription error:", err);
      const errMsg = err.message || String(err);
      
      // Kiểm tra nếu là lỗi torchvision compatibility
      if (errMsg.includes("torchvision") || errMsg.includes("nms") || errMsg.includes("extension")) {
        transcriptionError = 'Speech dependencies are incompatible. Check the matching PyTorch, Torchaudio and Torchvision versions in docs/GETTING_STARTED.md.';
        console.error('Speech dependencies are incompatible. See docs/GETTING_STARTED.md.');
      } else {
        transcriptionError = errMsg;
      }
      // Không return ngay - tiếp tục để cập nhật database với lỗi
    }
  } else {
    transcriptionError = "Audio file not found";
  }

  // Analyze với AI
  let analysis = null;
  let score = 0;
  let feedback = "";
  let errors = [];
  let correctedText = "";
  let analysisStatus = "completed";

  // Nếu có lỗi transcription, cập nhật database với thông báo lỗi
  if (transcriptionError) {
    analysisStatus = "failed";
    feedback = "Không thể phiên âm bài nói. Vui lòng thử lại.";
    score = null;
    analysis = {
      status: "failed",
      score: null,
      feedback: feedback,
      missing_words: [],
      errors: [{ type: "transcription_error" }],
      corrected_text: prompt
    };
  } else if (transcript) {
    const transcriptText =
      transcript.text ||
      (transcript.segments || [])
        .map((s) => s.text || "")
        .join(" ");
    
    // Kiểm tra nếu transcriptText rỗng
    if (!transcriptText || !transcriptText.trim()) {
      console.warn(`⚠️ Empty transcript text for round ${roundId}`);
      analysisStatus = "failed";
      score = null;
      feedback = "Speech recognition returned no transcript to compare.";
      analysis = {
        status: "failed",
        score: null,
        feedback,
        missing_words: [],
        errors: [{ type: "empty_transcript" }],
        corrected_text: prompt
      };
    } else {

    try {
      console.log(`📊 Analyzing: transcript="${transcriptText.substring(0, 50)}...", prompt="${prompt.substring(0, 50)}..."`);
      analysis = evaluateSpeakingTranscript(transcriptText, prompt);
      analysis = normalizeSpeakingPracticeAssessment(analysis);
      score = analysis.score;
      analysisStatus = analysis.status;
      feedback = analysis.feedback || "";
      errors = analysis.errors || [];
      correctedText = analysis.corrected_text || "";
      
      console.log(`✅ Analysis result for round ${roundId}: score=${score}, missing_words=${analysis?.missing_words?.length || 0}`);
      
    } catch (err) {
      console.error("❌ Transcript evaluation error:", err);
      console.error("❌ Error stack:", err.stack);
      analysisStatus = "failed";
      feedback = "Không thể phân tích. Vui lòng thử lại.";
      score = null;
      analysis = {
        status: "failed",
        score: null,
        feedback: feedback,
        missing_words: [],
        errors: [{ type: "analysis_error" }],
        corrected_text: prompt
      };
    }
    }
  } else {
    analysisStatus = "failed";
    score = null;
    feedback = "Speech recognition returned no transcript to compare.";
    analysis = {
      status: "failed",
      score: null,
      feedback,
      missing_words: [],
      errors: [{ type: "empty_transcript" }],
      corrected_text: prompt
    };
  }

  // Build word_analysis từ transcript (nếu có)
  let wordAnalysis = [];
  if (transcript && transcript.words && Array.isArray(transcript.words)) {
    wordAnalysis = transcript.words.map((w, idx) => ({
      word: w.text ?? w.word ?? "",
      start: typeof w.start === "number" ? w.start : null,
      end: typeof w.end === "number" ? w.end : null,
      confidence: typeof w.score === "number" ? w.score : w.confidence ?? null,
      wordIndex: idx
    }));
  }
  
  // Cập nhật database với kết quả (bao gồm missing_words)
  // Lưu ý: word_analysis không có trong schema, chỉ lưu trong analysis
  try {
    await pool.query(
      `UPDATE speaking_practice_rounds 
       SET transcript = $1, score = $2, analysis = $3, updated_at = NOW()
       WHERE id = $4
         AND analysis->>'status' IN ('processing', 'failed')`,
      [
        transcript ? JSON.stringify(transcript) : null,
        score,
        JSON.stringify({
          status: analysisStatus,
          assessment_type: "transcript_match",
          assessment_scope: "content_match_only",
          pronunciation_assessed: false,
          feedback,
          errors,
          corrected_text: correctedText || prompt,
          score,
          missing_words: analysis?.missing_words || [],
          word_analysis: wordAnalysis.length > 0 ? wordAnalysis : [],
          transcription_error: transcriptionError || null
        }),
        roundId
      ]
    );
    console.log(`✅ Updated round ${roundId} with score ${score}`);
  } catch (dbErr) {
    console.error(`❌ Database update error for round ${roundId}:`, dbErr);
    throw dbErr;
  }
}

function evaluateSpeakingTranscript(transcript, expectedText) {
  return evaluateTranscriptMatch(transcript, expectedText);
}

/**
 * Fallback cho pronunciation analysis
 */
async function legacyPronunciationFeedbackFromTranscript(transcript, expectedText, level) {
  // Kiểm tra nếu không nói gì
  if (!transcript || !transcript.trim()) {
    return {
      score: 0,
      feedback: "Bạn chưa nói gì. Hãy thử lại và nói to, rõ ràng.",
      errors: [],
      corrected_text: expectedText,
      missing_words: expectedText.toLowerCase().split(/\s+/).filter(w => w.length > 0),
      strengths: [],
      improvements: ["Hãy nói to và rõ ràng hơn"]
    };
  }
  
  // Tính missing_words và matchedWords với logic nhất quán
  const transcriptWords = transcript.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const expectedWords = expectedText.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  
  const matchedWords = expectedWords.filter(ew => {
    const cleanExpected = ew.replace(/[.,!?;:]/g, "").trim();
    if (!cleanExpected) return false;
    
    return transcriptWords.some(tw => {
      const cleanTranscript = tw.replace(/[.,!?;:]/g, "").trim();
      if (!cleanTranscript) return false;
      
      // Exact match
      if (cleanTranscript === cleanExpected) return true;
      
      // Partial match: transcript chứa expected
      if (cleanTranscript.length >= cleanExpected.length && cleanTranscript.includes(cleanExpected)) return true;
      
      // Partial match: expected chứa transcript (>= 3 ký tự)
      if (cleanExpected.length >= cleanTranscript.length && cleanExpected.includes(cleanTranscript) && cleanTranscript.length >= 3) return true;
      
      return false;
    });
  });
  
  // Nếu không match từ nào, score = 0
  if (matchedWords.length === 0) {
    return {
      score: 0,
      feedback: "Bạn chưa nói đúng từ nào. Hãy nghe lại và nói theo prompt.",
      errors: [],
      corrected_text: expectedText,
      missing_words: expectedWords,
      strengths: [],
      improvements: ["Hãy nghe kỹ prompt và nói theo đúng nội dung"]
    };
  }
  
  const prompt = `You are an expert English speaking evaluator. Analyze the following speaking practice:

Expected text: "${expectedText}"
Spoken transcript: "${transcript}"

Provide DETAILED analysis with:
1. Score (0-10): Overall performance
2. Feedback (2-4 sentences): Specific, encouraging, actionable feedback with examples
3. Strengths (2-3 points): Specific examples of what worked well (e.g., "You pronounced 'X' clearly")
4. Improvements (2-3 points): Specific, achievable goals with actionable steps (e.g., "Work on 'th' sound in 'think' - place tongue between teeth")

Return JSON ONLY:
{
  "score": <0-10>,
  "feedback": "<detailed feedback with specific examples>",
  "strengths": ["<specific strength1>", "<strength2>"],
  "improvements": ["<specific improvement1 with steps>", "<improvement2>"]
}`;

  try {
    const response = await aiServiceClient.callGroq(
      [{ role: "user", content: prompt }],
      { 
        task_type: "transcript_feedback",
        temperature: 0.7, // Tăng temperature để có phản hồi đa dạng hơn
        max_tokens: 500 // Tăng tokens để có phản hồi chi tiết hơn
      }
    );

    const content = response.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    
    // Tính missing_words (các từ KHÔNG được nói đúng) - dùng cùng logic với matchedWords
    const missingWords = expectedWords.filter(ew => {
      const cleanExpected = ew.replace(/[.,!?;:]/g, "").trim();
      if (!cleanExpected) return false;
      
      return !transcriptWords.some(tw => {
        const cleanTranscript = tw.replace(/[.,!?;:]/g, "").trim();
        if (!cleanTranscript) return false;
        
        // Exact match
        if (cleanTranscript === cleanExpected) return true;
        
        // Partial match: transcript chứa expected
        if (cleanTranscript.length >= cleanExpected.length && cleanTranscript.includes(cleanExpected)) return true;
        
        // Partial match: expected chứa transcript (>= 3 ký tự)
        if (cleanExpected.length >= cleanTranscript.length && cleanExpected.includes(cleanTranscript) && cleanTranscript.length >= 3) return true;
        
        return false;
      });
    });
    
    // Tính điểm dựa trên số từ đúng / tổng số từ (thang 100)
    const accuracyRatio = matchedWords.length / expectedWords.length;
    const baseScore = accuracyRatio * 100; // Điểm cơ bản dựa trên số từ đúng
    
    console.log(`📊 Fallback score calculation: matched=${matchedWords.length}, total=${expectedWords.length}, ratio=${accuracyRatio.toFixed(2)}, baseScore=${baseScore.toFixed(1)}`);
    
    // Nếu AI trả về score (thang 10), convert sang 100 và điều chỉnh
    const aiScore = parsed.score ? (parsed.score * 10) : null;
    
    // Điểm cuối cùng: ưu tiên baseScore (dựa trên số từ đúng), nhưng có thể điều chỉnh nhẹ bởi AI
    const finalScore = aiScore ? Math.min(Math.max(aiScore, baseScore * 0.7), baseScore) : baseScore;
    
    console.log(`📊 Fallback final score: aiScore=${aiScore}, finalScore=${finalScore.toFixed(1)}, missing_words=${missingWords.length}`);
    
    return {
      score: Math.round(finalScore), // Làm tròn điểm (thang 100)
      feedback: parsed.feedback || "Good effort!",
      errors: [],
      corrected_text: expectedText,
      missing_words: missingWords, // Các từ sai để highlight
      strengths: parsed.strengths || [],
      improvements: parsed.improvements || []
    };
  } catch (err) {
    // Fallback: tính điểm dựa trên tỷ lệ từ đúng (thang 100)
    const accuracyRatio = matchedWords.length / expectedWords.length;
    const fallbackScore = accuracyRatio * 100; // Thang 100, không phải 10
    
    // Tính missing_words với logic nhất quán
    const missingWords = expectedWords.filter(ew => {
      const cleanExpected = ew.replace(/[.,!?;:]/g, "").trim();
      if (!cleanExpected) return false;
      
      return !transcriptWords.some(tw => {
        const cleanTranscript = tw.replace(/[.,!?;:]/g, "").trim();
        if (!cleanTranscript) return false;
        
        // Exact match
        if (cleanTranscript === cleanExpected) return true;
        
        // Partial match: transcript chứa expected
        if (cleanTranscript.length >= cleanExpected.length && cleanTranscript.includes(cleanExpected)) return true;
        
        // Partial match: expected chứa transcript (>= 3 ký tự)
        if (cleanExpected.length >= cleanTranscript.length && cleanExpected.includes(cleanTranscript) && cleanTranscript.length >= 3) return true;
        
        return false;
      });
    });
    
    console.log(`📊 Final fallback: score=${fallbackScore.toFixed(1)}, missing_words=${missingWords.length}`);
    
    return {
      score: Math.round(fallbackScore), // Thang 100 - làm tròn điểm
      feedback: `Bạn đã nói đúng ${matchedWords.length}/${expectedWords.length} từ (${Math.round(accuracyRatio * 100)}%). ${missingWords.length > 0 ? `Cần cải thiện các từ: ${missingWords.slice(0, 5).join(", ")}` : "Tuyệt vời!"}`,
      errors: [],
      corrected_text: expectedText,
      missing_words: missingWords, // Các từ sai để highlight
      strengths: matchedWords.length > 0 ? [`Đã nói đúng ${matchedWords.length}/${expectedWords.length} từ`] : [],
      improvements: missingWords.length > 0 ? [`Cần cải thiện các từ: ${missingWords.slice(0, 5).join(", ")}`] : ["Tuyệt vời! Bạn đã nói đúng tất cả các từ."]
    };
  }
}

async function analyzePronunciationFallback(transcript, expectedText) {
  const match = evaluateTranscriptMatch(transcript, expectedText);
  return {
    ...match,
    pronunciation_score: null,
    pronunciation_assessed: false,
    assessment_type: "transcript_match"
  };
}

/**
 * Phân tích tất cả các vòng và tạo tổng kết
 */
export async function analyzeAllRoundsAndSummary(sessionId) {
  // Lấy tất cả các rounds chưa được phân tích
  const rounds = await pool.query(
    `SELECT * FROM speaking_practice_rounds 
     WHERE session_id = $1 
     ORDER BY round_number`,
    [sessionId]
  );

  if (rounds.rows.length === 0) {
    throw new Error("No rounds found");
  }

  const completedRoundNumbers = rounds.rows
    .map(round => Number(round.round_number))
    .sort((a, b) => a - b);
  if (
    completedRoundNumbers.length !== 10 ||
    completedRoundNumbers.some((roundNumber, index) => roundNumber !== index + 1)
  ) {
    return {
      status: "failed",
      message: "All 10 practice rounds are required before creating a summary.",
      rounds: rounds.rows.map(round => ({
        ...round,
        analysis_status: getSpeakingPracticeAnalysisStatus(round.analysis)
      }))
    };
  }

  // Lấy level từ session
  const session = await pool.query(
    `SELECT level FROM speaking_practice_sessions WHERE id = $1`,
    [sessionId]
  );
  const level = session.rows[0]?.level || 1;

  for (const round of rounds.rows) {
    if (getSpeakingPracticeAnalysisStatus(round.analysis) !== "processing") {
      continue;
    }

    const localPath = round.audio_url
      ? round.audio_url.startsWith("/uploads/")
        ? path.join(getProjectRoot(), round.audio_url)
        : round.audio_url
      : null;

    if (!localPath || !fs.existsSync(localPath)) {
      await pool.query(
        `UPDATE speaking_practice_rounds
         SET score = NULL, analysis = $1
         WHERE id = $2`,
        [
          JSON.stringify({
            status: "failed",
            score: null,
            feedback: "Không tìm thấy tệp ghi âm để phân tích.",
            errors: [{ type: "audio_not_found" }],
            missing_words: []
          }),
          round.id
        ]
      );
    }
  }

  // Phân tích từng round chưa được phân tích (xử lý song song để nhanh hơn)
  const roundsToProcess = rounds.rows.filter(r => {
    const status = getSpeakingPracticeAnalysisStatus(r.analysis);
    if (status === "completed" || status === "processing") return false;
    if (!r.audio_url) return false;
    const localPath = r.audio_url.startsWith("/uploads/")
      ? path.join(getProjectRoot(), r.audio_url)
      : r.audio_url;
    return fs.existsSync(localPath);
  });

  // Xử lý song song tối đa 3 rounds cùng lúc để tăng tốc
  const processRound = async (round) => {
    const claim = await pool.query(
      `UPDATE speaking_practice_rounds
       SET analysis = jsonb_set(COALESCE(analysis, '{}'::jsonb), '{status}', '"processing"'::jsonb, true),
           score = NULL,
           updated_at = NOW()
       WHERE id = $1 AND analysis->>'status' = 'failed'
       RETURNING id`,
      [round.id]
    );
    if (claim.rows.length === 0) {
      return;
    }

    const audioUrl = round.audio_url;
    const localPath = audioUrl.startsWith("/uploads/")
      ? path.join(getProjectRoot(), audioUrl)
      : audioUrl;

    // Transcribe
    let transcript = null;
    try {
      const { json: transcriptJson } = await runWhisperX(localPath, {
        model: "base"
        // computeType không cần chỉ định - tự động dùng GPU với float16
      });
      transcript = transcriptJson;
    } catch (err) {
      console.error(`❌ Transcription error for round ${round.round_number}:`, err);
      await pool.query(
        `UPDATE speaking_practice_rounds
         SET score = NULL, analysis = $1, updated_at = NOW()
         WHERE id = $2 AND (analysis IS NULL OR analysis->>'status' = 'processing')`,
        [
          JSON.stringify({
            status: "failed",
            score: null,
            feedback: "Không thể phiên âm bài nói. Vui lòng thử lại.",
            errors: [{ type: "transcription_error" }],
            missing_words: []
          }),
          round.id
        ]
      );
      return;
    }

    // Analyze với AI
    let analysis = null;
    let score = 0;
    let feedback = "";
    let errors = [];
    let correctedText = "";
    let analysisStatus = "completed";

    if (transcript) {
      const transcriptText =
        transcript.text ||
        (transcript.segments || [])
          .map((s) => s.text || "")
          .join(" ");

      try {
        // Lấy learner_id từ session
        const sessionInfo = await pool.query(
          `SELECT learner_id FROM speaking_practice_sessions WHERE id = $1`,
          [sessionId]
        );
        const learnerId = sessionInfo.rows[0]?.learner_id;
        
        // Đối chiếu transcript với câu mẫu
        analysis = evaluateSpeakingTranscript(transcriptText, round.prompt);
        analysis = normalizeSpeakingPracticeAssessment(analysis);
        score = analysis.score;
        analysisStatus = analysis.status;
        feedback = analysis.feedback || "";
        errors = analysis.errors || [];
        correctedText = analysis.corrected_text || "";
      } catch (err) {
        console.error(`❌ Transcript evaluation error for round ${round.round_number}:`, err);
        analysisStatus = "failed";
        score = null;
        feedback = "Không thể hoàn tất phân tích. Vui lòng thử lại.";
        errors = [{ type: "analysis_error" }];
      }
    } else {
      analysisStatus = "failed";
      score = null;
      feedback = "Speech recognition returned no transcript to compare.";
      errors = [{ type: "empty_transcript" }];
    }

    // Build word_analysis từ transcript (nếu có)
    let wordAnalysis = [];
    if (transcript && transcript.words && Array.isArray(transcript.words)) {
      wordAnalysis = transcript.words.map((w, idx) => ({
        word: w.text ?? w.word ?? "",
        start: typeof w.start === "number" ? w.start : null,
        end: typeof w.end === "number" ? w.end : null,
        confidence: typeof w.score === "number" ? w.score : w.confidence ?? null,
        wordIndex: idx
      }));
    }
    
    // Cập nhật database với kết quả (bao gồm missing_words)
    // Lưu ý: word_analysis không có trong schema, chỉ lưu trong analysis
    await pool.query(
      `UPDATE speaking_practice_rounds 
       SET transcript = $1, score = $2, analysis = $3, updated_at = NOW()
       WHERE id = $4
         AND analysis->>'status' = 'processing'`,
      [
        JSON.stringify(transcript),
        score,
        JSON.stringify({
          status: analysisStatus,
          assessment_type: analysis?.assessment_type || "transcript_match",
          assessment_scope: analysis?.assessment_scope || "content_match_only",
          assessment_contract: analysis?.assessment_contract ?? null,
          pronunciation_assessed: false,
          feedback,
          errors,
          corrected_text: correctedText,
          score,
          missing_words: analysis?.missing_words || [],
          word_analysis: wordAnalysis.length > 0 ? wordAnalysis : []
        }),
        round.id
      ]
    );
  };

  // Xử lý song song với batch size = 3
  const batchSize = 3;
  for (let i = 0; i < roundsToProcess.length; i += batchSize) {
    const batch = roundsToProcess.slice(i, i + batchSize);
    await Promise.all(batch.map(round => processRound(round)));
  }

  // Sau khi phân tích xong, tạo summary
  return await generateSummary(sessionId);
}

/**
 * Tạo tổng kết sau 10 vòng
 */
export async function generateSummary(sessionId) {
  const rounds = await pool.query(
    `SELECT * FROM speaking_practice_rounds 
     WHERE session_id = $1 
     ORDER BY round_number`,
    [sessionId]
  );

  if (rounds.rows.length === 0) {
    throw new Error("No rounds found");
  }

  const sessionResult = await pool.query(
    `SELECT status, total_score, average_score, summary
     FROM speaking_practice_sessions
     WHERE id = $1`,
    [sessionId]
  );
  if (!sessionResult.rows[0]) {
    throw new Error("Practice session not found");
  }
  if(sessionResult.rows[0].status==='ended')throw Object.assign(new Error('Practice session has ended'),{status:409,code:'PRACTICE_SESSION_ENDED'});
  if (sessionResult.rows[0].status === "completed") {
    const savedSummary = sessionResult.rows[0].summary;
    return {
      ...(typeof savedSummary === "string" ? JSON.parse(savedSummary) : savedSummary || {}),
      status: "completed",
      total_score: sessionResult.rows[0].total_score,
      average_score: sessionResult.rows[0].average_score,
      rounds: rounds.rows.map(round => ({
        ...withoutPracticeMedia(round),
        analysis_status: getSpeakingPracticeAnalysisStatus(round.analysis)
      }))
    };
  }

  const roundNumbers = rounds.rows.map(round => Number(round.round_number)).sort((a, b) => a - b);
  if (
    roundNumbers.length !== 10 ||
    roundNumbers.some((roundNumber, index) => roundNumber !== index + 1)
  ) {
    return {
      status: "failed",
      message: "All 10 practice rounds are required before creating a summary.",
      rounds: rounds.rows.map(round => ({
        ...round,
        analysis_status: getSpeakingPracticeAnalysisStatus(round.analysis)
      }))
    };
  }

  const roundsWithMissingWords = rounds.rows.map(round => {
    let missingWords = [];
    if (round.analysis) {
      try {
        const analysis = typeof round.analysis === "string"
          ? JSON.parse(round.analysis)
          : round.analysis;
        missingWords = analysis.missing_words || [];
      } catch {
        missingWords = [];
      }
    }

    return {
      ...round,
      analysis_status: getSpeakingPracticeAnalysisStatus(round.analysis),
      missing_words: missingWords
    };
  });

  for (const round of roundsWithMissingWords) {
    if (
      round.analysis_status === "completed" &&
      !hasValidSpeakingPracticeResult(round)
    ) {
      const analysis = typeof round.analysis === "string"
        ? JSON.parse(round.analysis)
        : round.analysis || {};
      await pool.query(
        `UPDATE speaking_practice_rounds
         SET score = NULL,
             analysis = $1,
             updated_at = NOW()
         WHERE id = $2 AND analysis->>'status' = 'completed'`,
        [
          JSON.stringify({
            ...analysis,
            status: "failed",
            score: null,
            feedback: "The saved assessment score is invalid. Please retry analysis.",
            errors: [{ type: "invalid_assessment_score" }]
          }),
          round.id
        ]
      );
      round.analysis_status = "failed";
      round.score = null;
    }
  }

  const summaryStatus = getSpeakingPracticeSummaryStatus(roundsWithMissingWords);
  if (summaryStatus === "processing") {
    return {
      status: "processing",
      message: "Một số vòng vẫn đang được phân tích.",
      rounds: roundsWithMissingWords
    };
  }
  if (summaryStatus === "failed") {
    return {
      status: "failed",
      message: "Một số vòng chưa thể phân tích. Hãy thử lại.",
      rounds: roundsWithMissingWords
    };
  }

  // Tính điểm tổng kết: cộng tất cả điểm 10 câu, chia cho 10, làm tròn
  const totalScore = rounds.rows.reduce((sum, r) => sum + (parseFloat(r.score) || 0), 0);
  const averageScore = Math.round(totalScore / 10); // Luôn chia cho 10 (10 câu), làm tròn

  // Tạo tổng kết với AI (tối ưu cho tốc độ)
  const summaryPrompt = `These scores are transcript-to-prompt content-match percentages, not pronunciation or phoneme scores.
Summary: ${rounds.rows.length} rounds, average content match ${averageScore.toFixed(1)}/100.
Scores: ${rounds.rows.map((r, i) => `R${i+1}:${r.score}`).join(" ")}.

Return JSON only:
{"overall_feedback": "brief", "common_mistakes": ["m1"], "strengths": ["s1"], "improvements": ["i1"], "encouragement": "brief"}`;

  let summaryData;

  try {
    const response = await aiServiceClient.callGroq(
      [{ role: "user", content: summaryPrompt }],
      { 
        task_type: "speaking_summary",
        temperature: 0.5, // Giảm temperature
        max_tokens: 400 // Giảm max_tokens
      }
    );

    const content = response.choices?.[0]?.message?.content || "{}";
    summaryData = parseSpeakingPracticeSummary(content);
  } catch (err) {
    console.error("❌ Summary generation error:", err);
    return {
      status: "failed",
      message: "Không thể tạo tổng kết AI. Hãy thử lại.",
      rounds: roundsWithMissingWords
    };
  }

  // Update session
  const completedSession=await pool.query(
    `UPDATE speaking_practice_sessions 
     SET status = 'completed',
         total_score = $1,
         average_score = $2,
         summary = $3,
         completed_at = NOW()
     WHERE id = $4 AND status = 'active'`,
    [totalScore, Math.round(averageScore), JSON.stringify({...summaryData,media_cleanup_pending:true}), sessionId]
  );
  if(!completedSession.rowCount)throw Object.assign(new Error('Practice session changed before summary was saved'),{status:409,code:'PRACTICE_SESSION_ENDED'});

  // Lưu vào practice_history để tracking tiến độ
  const sessionInfo = await pool.query(
    `SELECT learner_id, level, created_at, completed_at 
     FROM speaking_practice_sessions 
     WHERE id = $1`,
    [sessionId]
  );
  
  if (sessionInfo.rows[0]) {
    const session = sessionInfo.rows[0];
    const duration = session.completed_at && session.created_at
      ? Math.round((new Date(session.completed_at) - new Date(session.created_at)) / 60000)
      : null;
    
    // Lấy strengths và improvements từ quick evaluations
    const evaluations = await pool.query(
      `SELECT strengths, improvements FROM quick_evaluations 
       WHERE session_id = $1`,
      [sessionId]
    );
    
    const allStrengths = [];
    const allImprovements = [];
    evaluations.rows.forEach(e => {
      if (e.strengths) {
        try {
          const s = typeof e.strengths === 'string' ? JSON.parse(e.strengths) : e.strengths;
          if (Array.isArray(s)) allStrengths.push(...s);
        } catch {}
      }
      if (e.improvements) {
        try {
          const i = typeof e.improvements === 'string' ? JSON.parse(e.improvements) : e.improvements;
          if (Array.isArray(i)) allImprovements.push(...i);
        } catch {}
      }
    });
    
    // Lưu practice history - chỉ lưu điểm
    // Kiểm tra xem đã có record chưa
    const existing = await pool.query(
      `SELECT id FROM practice_history WHERE session_id = $1`,
      [sessionId]
    );
    
    if (existing.rows.length > 0) {
      // Update existing record
      await pool.query(
        `UPDATE practice_history 
         SET total_score = $1,
             average_score = $2,
             duration_minutes = $3
         WHERE session_id = $4`,
        [totalScore, Math.round(averageScore), duration, sessionId]
      );
    } else {
      // Insert new record
      await pool.query(
        `INSERT INTO practice_history 
         (learner_id, session_id, practice_type, level, total_score, average_score, duration_minutes)
         VALUES ($1, $2, 'speaking_practice', $3, $4, $5, $6)`,
        [
          session.learner_id,
          sessionId,
          session.level,
          totalScore,
          Math.round(averageScore),
          duration
        ]
      );
    }
  }

  await practiceRetention.cleanup(sessionId).catch(error=>console.warn('Practice cleanup will retry',error.code||error.name));
  return {
    status: "completed",
    total_score: totalScore,
    average_score: Math.round(averageScore), // Làm tròn điểm trung bình
    ...summaryData,
    rounds: roundsWithMissingWords.map(withoutPracticeMedia)
  };
}

export { evaluateSpeakingTranscript, analyzePronunciationFallback };
