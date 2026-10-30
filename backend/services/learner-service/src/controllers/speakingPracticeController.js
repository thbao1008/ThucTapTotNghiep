// backend/src/controllers/speakingPracticeController.js
import * as speakingPracticeService from "../services/speakingPracticeService.js";
import pool from "../config/db.js";
import path from "path";
import fs from "fs";
import {
  deriveSpeakingPracticeSummaryScore,
  getSpeakingPracticeAnalysisStatus
} from "../utils/speakingPracticeAnalysis.js";
import { removeFile } from "../utils/audioUpload.js";
import {practiceRetention} from '../utils/practiceRetentionRuntime.js';
import {ensureStoryRetentionSchema,retireExpiredPracticeLogins} from '../../../shared/practiceRetention.js';
import { countSpeakingWords, getSpeakingDifficulty, parseSpeakingLevel } from '../utils/speakingPrompt.js';

/**
 * Tạo session mới cho luyện nói
 */
export async function createPracticeSession(req, res) {
  const actualLearnerId = req.learnerId;
  try {
    const selectedLevel = parseSpeakingLevel(req.body?.level);

    if (!actualLearnerId) {
      return res.status(400).json({ 
        message: "Invalid learner identity"
      });
    }

    await ensureStoryRetentionSchema(pool);
    await retireExpiredPracticeLogins(pool,(id,learnerId)=>practiceRetention.end(id,learnerId),{userId:req.user.id});
    const session = await speakingPracticeService.createPracticeSession(
      actualLearnerId,
      selectedLevel,
      {authSessionId:req.session?.id,userId:req.user.id}
    );

    res.json({
      session_id: session.id,
      level: session.level,
      difficulty: getSpeakingDifficulty(session.level).name,
      status: session.status
    });
  } catch (err) {
    if (err.code === 'INVALID_SPEAKING_LEVEL') return res.status(400).json({ message: err.message, code: err.code });
    if (err.code === "SPEAKING_SESSION_INCOMPLETE") {
      return res.status(400).json({ message: err.message, incomplete_session: err.incomplete_session });
    }
    console.error("❌ createPracticeSession error:", err);
    // Nếu là lỗi về session đang dở dang, trả về 400 với thông tin session
    if (err.message && err.message.includes("chưa hoàn thành")) {
      // Lấy thông tin session đang dở dang
      const incompleteSession = await pool.query(
        `SELECT id, created_at, 
         (SELECT COUNT(*) FROM speaking_practice_rounds WHERE session_id = speaking_practice_sessions.id) as rounds_count
         FROM speaking_practice_sessions 
         WHERE learner_id = $1 
           AND mode = 'practice'
           AND status = 'active'
           AND completed_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [actualLearnerId]
      );
      
      if (incompleteSession.rows.length > 0) {
        return res.status(400).json({ 
          message: err.message,
          incomplete_session: {
            session_id: incompleteSession.rows[0].id,
            rounds_count: parseInt(incompleteSession.rows[0].rounds_count || 0),
            created_at: incompleteSession.rows[0].created_at
          }
        });
      }
    }
    res.status(500).json({ message: err.message || "Server error" });
  }
}

/**
 * Lấy session đang dở dang của học viên
 */
export async function getIncompleteSession(req, res) {
  try {
    const actualLearnerId = req.learnerId;
    if (!actualLearnerId) {
      return res.status(403).json({ message: "Learner identity is required" });
    }

    const result = await pool.query(
      `SELECT id, created_at, level, status,
       (SELECT COUNT(*) FROM speaking_practice_rounds WHERE session_id = speaking_practice_sessions.id) as rounds_count
       FROM speaking_practice_sessions 
       WHERE learner_id = $1 
         AND mode = 'practice'
         AND status = 'active'
         AND completed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [actualLearnerId]
    );

    if (result.rows.length === 0) {
      return res.json({ incomplete_session: null });
    }

    const session = result.rows[0];
    res.json({
      incomplete_session: {
        session_id: session.id,
        rounds_count: parseInt(session.rounds_count || 0),
        created_at: session.created_at,
        level: session.level
      }
    });
  } catch (err) {
    console.error("❌ getIncompleteSession error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
}

/**
 * Lấy prompt cho vòng nói (AI-generated)
 */
export async function getPrompt(req, res) {
  try {
    const { sessionId } = req.params;
    const { round } = req.query;
    const roundNumber = round === undefined ? 1 : Number(round);
    if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > 10) {
      return res.status(400).json({ message: 'Round number must be between 1 and 10.' });
    }
    // The persisted selection is authoritative, regardless of query parameters.
    const sessionRes = await pool.query(
      `SELECT learner_id, level, status, mode FROM speaking_practice_sessions WHERE id = $1 AND learner_id = $2`,
      [sessionId, req.learnerId]
    );
    const session = sessionRes.rows[0];
    if (!session || session.mode !== 'practice') return res.status(404).json({ message: 'Practice session not found.' });
    if (session.status !== 'active') return res.status(409).json({ message: 'This practice session has ended.', code: 'PRACTICE_SESSION_ENDED' });
    const sessionLevel = parseSpeakingLevel(session.level);
    const learnerId = session.learner_id;

    // Lấy prompt từ AI (async) với sessionId để track topics đã dùng
    const prompt = await speakingPracticeService.getPromptForRound(
      sessionLevel,
      roundNumber,
      learnerId,
      sessionId // QUAN TRỌNG: Truyền sessionId để track used prompts
    );
    
    // Tính time limit dựa trên prompt
    const timeLimit = speakingPracticeService.getTimeLimit(sessionLevel, prompt);

    res.json({
      prompt,
      time_limit: timeLimit,
      level: sessionLevel,
      difficulty: getSpeakingDifficulty(sessionLevel).name,
      word_count: countSpeakingWords(prompt),
      round: roundNumber
    });
  } catch (err) {
    console.error("❌ getPrompt error:", err);
    res.status(err.status || 500).json({ message: err.status === 502 ? 'A suitable sentence could not be generated. Please try again.' : 'Server error', ...(err.code ? { code: err.code } : {}) });
  }
}

/**
 * Lưu vòng nói (trả về ngay, xử lý ở background)
 */
export async function saveRound(req, res) {
  let keepUploadedFile = false;
  try {
    const { sessionId } = req.params;
    const { round_number, time_taken } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "No audio file provided" });
    }

    const audioUrl = `/uploads/${req.file.filename}`;

    // Lấy prompt từ request body nếu có (từ frontend)
    const promptText = req.body.prompt || null;
    
    // Lấy Web Speech data từ frontend
    const webSpeechTranscript = req.body.web_speech_transcript || null;
    let webSpeechHighlights = null;
    try {
      if (req.body.web_speech_highlights) {
        webSpeechHighlights = JSON.parse(req.body.web_speech_highlights);
      }
    } catch (parseErr) {
      console.warn("❌ Invalid web_speech_highlights JSON:", parseErr.message);
    }
    
    // Lưu ngay, xử lý ở background
    const round = await speakingPracticeService.saveRound(
      sessionId,
      parseInt(round_number),
      audioUrl,
      parseInt(time_taken),
      promptText, // Truyền prompt từ frontend nếu có
      webSpeechTranscript, // Truyền Web Speech transcript
      webSpeechHighlights // Truyền Web Speech highlights
    );

    keepUploadedFile = !round.idempotent_replay;
    if (round.idempotent_replay && req.file?.path) {
      await removeFile(req.file.path);
    }

    // Trả về ngay, không đợi analysis
    res.json({
      round_id: round.id,
      status: getSpeakingPracticeAnalysisStatus(round.analysis),
      replayed: Boolean(round.idempotent_replay),
      message: round.idempotent_replay
        ? "Vòng này đã được gửi trước đó."
        : "Audio đã được lưu. Đang xử lý phân tích..."
    });
  } catch (err) {
    console.error("❌ saveRound error:", err);
    if (!keepUploadedFile && req.file?.path) {
      try {
        await removeFile(req.file.path);
      } catch (cleanupError) {
        console.error("❌ Could not remove failed round upload:", cleanupError);
      }
    }
    res.status(500).json({ message: err.message || "Server error" });
  }
}

/**
 * Lấy analysis của một round
 */
export async function getRoundAnalysis(req, res) {
  try {
    const { sessionId, roundId } = req.params;

    const pool = (await import("../config/db.js")).default;
    const result = await pool.query(
      `SELECT * FROM speaking_practice_rounds 
       WHERE id = $1 AND session_id = $2`,
      [roundId, sessionId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "Round not found" });
    }

    const round = result.rows[0];
    const analysis = round.analysis
      ? typeof round.analysis === "string"
        ? JSON.parse(round.analysis)
        : round.analysis
      : null;

    res.json({
      round_id: round.id,
      status: getSpeakingPracticeAnalysisStatus(round.analysis),
      score: round.score,
      analysis: analysis,
      assessment_type: analysis?.assessment_type || "transcript_match",
      assessment_scope: analysis?.assessment_scope || "content_match_only",
      pronunciation_assessed: analysis?.pronunciation_assessed === true,
      feedback: analysis?.feedback || "",
      errors: analysis?.errors || [],
      corrected_text: analysis?.corrected_text || "",
      time_taken: round.time_taken
    });
  } catch (err) {
    console.error("❌ getRoundAnalysis error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
}

/**
 * Kiểm tra translation của học viên
 */
export async function checkTranslation(req, res) {
  try {
    const { sessionId, roundId } = req.params;
    const { translation } = req.body;

    if (!translation) {
      return res.status(400).json({ message: "Translation is required" });
    }

    // Lấy prompt từ round
    const pool = (await import("../config/db.js")).default;
    const roundRes = await pool.query(
      `SELECT prompt FROM speaking_practice_rounds WHERE id = $1 AND session_id = $2`,
      [roundId, sessionId]
    );

    if (!roundRes.rows[0]) {
      return res.status(404).json({ message: "Round not found" });
    }

    const prompt = roundRes.rows[0].prompt;

    // Dùng AI để kiểm tra translation (tương đối, không cần chính xác 100%)
    const checkPrompt = `You are an English-Vietnamese translation checker. Check if the Vietnamese translation is CORRECT or RELATIVELY CORRECT (meaning matches approximately) for the English text.

English text: "${prompt}"
Vietnamese translation: "${translation}"

IMPORTANT: 
- Be LENIENT - accept translations that capture the main meaning even if not word-for-word
- Accept if the translation conveys the same general idea or message
- Only mark as incorrect if the translation is completely wrong or unrelated
- Respond ONLY with valid JSON, no markdown code blocks, no explanations.

{
  "correct": <true if translation is correct or relatively correct (meaning matches approximately), false only if completely wrong>,
  "feedback": "<brief feedback in Vietnamese if incorrect, or 'Chính xác! Bạn đã hiểu đúng nghĩa.' if correct>"
}`;

    const { callGroq } = await import("../utils/aiServiceClient.js");
    const response = await callGroq(
      [{ role: "user", content: checkPrompt }],
      { task_type: "translation_check", temperature: 0.5, max_tokens: 200 }
    );
    const content = response.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return res.status(502).json({ message: "AI returned an invalid translation-check response" });
    }
    const result = JSON.parse(content);
    if (typeof result?.correct !== "boolean" || typeof result?.feedback !== "string" || !result.feedback.trim()) {
      return res.status(502).json({ message: "AI returned an incomplete translation-check response" });
    }

    // Lưu translation vào round
    await pool.query(
      `UPDATE speaking_practice_rounds 
       SET translation = $1
       WHERE id = $2`,
      [translation, roundId]
    );

    res.json(result);
  } catch (err) {
    console.error("❌ checkTranslation error:", err);
    res.status(err.status || 502).json({
      message: err.message || "Translation check failed",
      code: err.code
    });
  }
}

/**
 * Phân tích tất cả các vòng và tạo tổng kết
 */
export async function analyzeAndSummary(req, res) {
  try {
    const { sessionId } = req.params;

    const summary = await speakingPracticeService.analyzeAllRoundsAndSummary(sessionId);

    res.json(summary);
  } catch (err) {
    console.error("❌ analyzeAndSummary error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
}

/**
 * Lấy tổng kết sau 10 vòng
 */
/**
 * Lưu word meanings cho một round
 */
/**
 * Lưu session vào lịch sử làm bài
 */
export async function saveToHistory(req, res) {
  try {
    const { sessionId } = req.params;

    // Lấy thông tin session
    const session = await pool.query(
      `SELECT learner_id, level, status, created_at, completed_at, total_score, average_score, summary
       FROM speaking_practice_sessions 
       WHERE id = $1`,
      [sessionId]
    );

    if (!session.rows[0]) {
      return res.status(404).json({ message: "Session not found" });
    }

    const sessionData = session.rows[0];
    if (sessionData.status !== "completed" || !sessionData.completed_at) {
      return res.status(409).json({ message: "Practice session is not complete" });
    }

    // Lấy rounds
    const rounds = await pool.query(
      `SELECT * FROM speaking_practice_rounds 
       WHERE session_id = $1 
       ORDER BY round_number`,
      [sessionId]
    );
    let verifiedScore;
    try {
      verifiedScore = deriveSpeakingPracticeSummaryScore(rounds.rows);
    } catch (err) {
      if (err.code === "SPEAKING_ASSESSMENT_INCOMPLETE") {
        return res.status(409).json({ message: "Practice session contains incomplete assessment rounds" });
      }
      throw err;
    }

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

    const summaryData = typeof sessionData.summary === 'string' 
      ? JSON.parse(sessionData.summary) 
      : sessionData.summary || {};

    const duration = sessionData.completed_at && sessionData.created_at
      ? Math.round((new Date(sessionData.completed_at) - new Date(sessionData.created_at)) / 60000)
      : null;

    // Lưu vào practice_history - chỉ lưu điểm cao nhất mỗi ngày
    // Kiểm tra xem cùng ngày đã có record chưa (dựa trên learner_id và DATE(practice_date))
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    
    const existingToday = await pool.query(
      `SELECT id, average_score FROM practice_history 
       WHERE learner_id = $1 
         AND practice_type = 'speaking_practice'
         AND practice_date >= $2 
         AND practice_date <= $3
       ORDER BY average_score DESC
       LIMIT 1`,
      [sessionData.learner_id, today, todayEnd]
    );
    
    const newScore = verifiedScore.average_score;
    let result;
    
    if (existingToday.rows.length > 0) {
      const existingRawScore = existingToday.rows[0].average_score;
      const existingScore = existingRawScore === null || existingRawScore === undefined
        ? null
        : Number(existingRawScore);
      // Nếu điểm mới cao hơn, update record cũ
      if (existingScore === null || !Number.isFinite(existingScore) || newScore > existingScore) {
        result = await pool.query(
          `UPDATE practice_history 
           SET total_score = $1,
               average_score = $2,
               duration_minutes = $3,
               session_id = $4
           WHERE id = $5
           RETURNING *`,
          [
            verifiedScore.total_score,
            newScore,
            duration,
            sessionId,
            existingToday.rows[0].id
          ]
        );
      } else {
        // Điểm mới không cao hơn, không update (giữ nguyên điểm cao nhất)
        result = existingToday;
      }
    } else {
      // Chưa có record trong ngày hôm nay, insert mới
      result = await pool.query(
        `INSERT INTO practice_history 
         (learner_id, session_id, practice_type, level, total_score, average_score, duration_minutes, practice_date)
         VALUES ($1, $2, 'speaking_practice', $3, $4, $5, $6, NOW())
         RETURNING *`,
        [
          sessionData.learner_id,
          sessionId,
          sessionData.level,
          verifiedScore.total_score,
          newScore,
          duration
        ]
      );
    }
    
    // Đảm bảo session_id được lưu (nếu update record cũ)
    if (result.rows.length > 0 && !result.rows[0].session_id) {
      await pool.query(
        `UPDATE practice_history SET session_id = $1 WHERE id = $2`,
        [sessionId, result.rows[0].id]
      );
    }

    res.json({ 
      success: true, 
      message: "Session saved to history",
      history_id: result.rows[0].id
    });
  } catch (err) {
    console.error("❌ saveToHistory error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
}

export async function getSummary(req, res) {
  try {
    const { sessionId } = req.params;
    
    // Lấy session và rounds
    const session = await pool.query(
      `SELECT * FROM speaking_practice_sessions WHERE id = $1`,
      [sessionId]
    );
    
    if (!session.rows[0]) {
      return res.status(404).json({ message: "Session not found" });
    }
    
    const rounds = await pool.query(
      `SELECT * FROM speaking_practice_rounds 
       WHERE session_id = $1 
       ORDER BY round_number`,
      [sessionId]
    );
    
    // Parse missing_words từ analysis cho mỗi round
    const roundsWithMissingWords = rounds.rows.map(round => {
      let missingWords = [];
      let analysis = null;
      if (round.analysis) {
        try {
          analysis = typeof round.analysis === 'string'
            ? JSON.parse(round.analysis) 
            : round.analysis;
          missingWords = analysis.missing_words || [];
        } catch (e) {
          console.warn("Failed to parse analysis for round:", round.id);
        }
      }
      return {
        ...round,
        analysis_status: getSpeakingPracticeAnalysisStatus(round.analysis),
        assessment_type: analysis?.assessment_type || "transcript_match",
        assessment_scope: analysis?.assessment_scope || "content_match_only",
        pronunciation_assessed: analysis?.pronunciation_assessed === true,
        missing_words: missingWords
      };
    });

    const sessionData = {
      ...session.rows[0],
      summary: typeof session.rows[0].summary === 'string' 
        ? JSON.parse(session.rows[0].summary || '{}') 
        : session.rows[0].summary || {}
    };
    const roundStatuses = roundsWithMissingWords.map(round => round.analysis_status);
    const summaryStatus = sessionData.status === "completed"
      ? "completed"
      : roundStatuses.includes("failed")
        ? "failed"
        : "processing";
    const summaryData = {
      ...sessionData.summary,
      status: summaryStatus,
      message: summaryStatus === "failed"
        ? "Một số vòng chưa thể phân tích. Hãy thử lại."
        : summaryStatus === "processing"
          ? "Một số vòng vẫn đang được phân tích."
          : undefined
    };
    
    res.json({
      status: summaryStatus,
      session: sessionData,
      summary: summaryData,
      rounds: roundsWithMissingWords
    });
  } catch (err) {
    console.error("❌ getSummary error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
}

/**
 * Lấy hoạt động gần nhất của học viên hiện tại
 */
export async function getRecentActivities(req, res) {
  try {
    const { limit } = req.query;
    const actualLearnerId = req.learnerId;
    if (!actualLearnerId) {
      return res.status(403).json({ message: "Learner identity is required" });
    }

    const speakingPracticeDashboardService = await import("../services/speakingPracticeDashboardService.js");
    const activities = await speakingPracticeDashboardService.getRecentActivities(
      actualLearnerId,
      parseInt(limit) || 10
    );
    res.json({ activities });
  } catch (err) {
    console.error("❌ getRecentActivities error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
}

/**
 * Lấy điểm thi đua hiện tại của học viên
 */
export async function getCurrentCompetitionScore(req, res) {
  try {
    const actualLearnerId = req.learnerId;
    if (!actualLearnerId) {
      return res.status(403).json({ message: "Learner identity is required" });
    }

    const speakingPracticeDashboardService = await import("../services/speakingPracticeDashboardService.js");
    const score = await speakingPracticeDashboardService.getCurrentCompetitionScore(actualLearnerId);
    res.json({ score });
  } catch (err) {
    console.error("❌ getCurrentCompetitionScore error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
}

/**
 * Lấy lịch sử luyện tập theo tuần của học viên
 */
export async function getWeeklyHistory(req, res) {
  try {
    const { offset, limit } = req.query;
    const actualLearnerId = req.learnerId;
    if (!actualLearnerId) {
      return res.status(403).json({ message: "Learner identity is required" });
    }

    const speakingPracticeDashboardService = await import("../services/speakingPracticeDashboardService.js");
    const history = await speakingPracticeDashboardService.getWeeklyHistory(
      actualLearnerId,
      parseInt(offset) || 0,
      parseInt(limit) || 1
    );
    res.json({ history });
  } catch (err) {
    console.error("❌ getWeeklyHistory error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
}

/**
 * Lấy top rating học viên (reset theo tuần)
 */
export async function getTopRatings(req, res) {
  try {
    const { limit } = req.query;
    const speakingPracticeDashboardService = await import("../services/speakingPracticeDashboardService.js");
    const ratings = await speakingPracticeDashboardService.getTopRatings(parseInt(limit) || 10);
    res.json({ ratings, assessment_status: "not_assessed", assessment_reason: "score_provenance_unavailable" });
  } catch (err) {
    console.error("❌ getTopRatings error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
}

/**
 * Lấy danh sách rounds cho một session
 */
export async function getRoundsForSession(req, res) {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ message: "Session ID is required" });
    }

    // Query để lấy tất cả rounds của session
    const roundsQuery = `
      SELECT 
        r.id as round_id,
        r.round_number,
        r.prompt,
        r.audio_url as audio_path,
        r.transcript as transcription,
        r.score,
        r.created_at,
        r.analysis as analysis_data
      FROM speaking_practice_rounds r
      WHERE r.session_id = $1
      ORDER BY r.round_number ASC
    `;

    const roundsResult = await pool.query(roundsQuery, [sessionId]);

    // Format response
    const rounds = roundsResult.rows.map(round => {
      // Parse analysis data to extract feedback and missing_words
      let feedback = "";
      let missing_words = [];
      let analysis = null;
      if (round.analysis_data) {
        try {
          analysis = typeof round.analysis_data === "string"
            ? JSON.parse(round.analysis_data) 
            : round.analysis_data;
          feedback = analysis?.feedback || "";
          missing_words = analysis?.missing_words || [];
        } catch (err) {
          console.warn("⚠️ Error parsing analysis data for round:", round.round_id, err);
        }
      }

      return {
        round_id: round.round_id,
        round_number: round.round_number,
        prompt: round.prompt,
        audio_path: round.audio_path,
        transcription: round.transcription,
        score: round.score,
        analysis_status: getSpeakingPracticeAnalysisStatus(round.analysis_data),
        assessment_contract: analysis?.assessment_contract ?? null,
        assessment_type: analysis?.assessment_type || "transcript_match",
        assessment_scope: analysis?.assessment_scope || "content_match_only",
        pronunciation_assessed: analysis?.pronunciation_assessed === true,
        feedback: feedback,
        created_at: round.created_at,
        analysis_data: round.analysis_data,
        missing_words: missing_words
      };
    });

    res.json({ rounds });
  } catch (err) {
    console.error("❌ getRoundsForSession error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
}
export async function endPracticeSession(req,res) {
  try {res.json(await practiceRetention.end(req.params.sessionId,req.learnerId));}
  catch(error){res.status(error.status||500).json({message:error.message,code:error.code});}
}
