// backend/src/controllers/scenarioController.js
import * as scenarioService from "../services/scenarioService.js";
import pool from "../config/db.js";
import { discardRejectedUpload } from "../utils/conversationTurn.js";

// Called only after ownScenarioSession; restoring never generates AI content or writes.
export async function getScenarioSession(req, res) {
  try {
    const result = await pool.query(`
      SELECT ss.id AS session_id, ss.status, ss.score, ss.hints_used, ss.final_score, ss.scoring_details,
             row_to_json(sc) AS scenario,
             COALESCE((SELECT json_agg(c ORDER BY c.turn_number, c.id)
               FROM (SELECT id, speaker, text_content AS text, audio_url,
                            created_at AS timestamp, turn_number
                     FROM scenario_conversations WHERE session_id = ss.id) c), '[]') AS conversations
      FROM scenario_sessions ss
      JOIN speaking_scenarios sc ON sc.id = ss.scenario_id
      WHERE ss.id = $1 AND ss.learner_id = $2
    `, [req.params.sessionId, req.learnerId]);
    if (!result.rows[0]) return res.status(404).json({ message: "Session not found" });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ message: "Unable to restore scenario session" });
  }
}

/**
 * Lấy danh sách scenarios
 */
export async function getScenarios(req, res) {
  try {
    const scenarios = await scenarioService.getAllScenarios();
    res.json({ scenarios });
  } catch (err) {
    console.error("❌ getScenarios error:", err);
    res.status(500).json({ message: "Server error" });
  }
}

/**
 * Lấy scenario session đang dở dang của học viên
 */
export async function getIncompleteScenarioSession(req, res) {
  try {
    const pool = (await import("../config/db.js")).default;
    const actualLearnerId = req.learnerId;
    if (!actualLearnerId) {
      return res.status(403).json({ message: "Learner identity is required" });
    }

    const result = await pool.query(
      `SELECT id, created_at, status, scenario_id
       FROM scenario_sessions 
       WHERE learner_id = $1 
         AND status = 'in_progress'
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
        scenario_id: session.scenario_id,
        created_at: session.created_at
      }
    });
  } catch (err) {
    console.error("❌ getIncompleteScenarioSession error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
}

/**
 * Tạo scenario session
 */
export async function createScenarioSession(req, res) {
  try {
    const { scenario_id } = req.body;
    const learner_id = req.learnerId;
    if (!learner_id) {
      return res.status(400).json({ message: "learner_id is required" });
    }

    const session = await scenarioService.createSession(learner_id, scenario_id);
    res.json({ session_id: session.id });
  } catch (err) {
    if (err.code === "SCENARIO_SESSION_INCOMPLETE") {
      return res.status(400).json({ message: err.message, incomplete_session: err.incomplete_session });
    }
    console.error("❌ createScenarioSession error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
}

/**
 * Bắt đầu conversation
 */
export async function startConversation(req, res) {
  try {
    const { sessionId } = req.params;
    const message = await scenarioService.getInitialMessage(sessionId);
    res.json({ message });
  } catch (err) {
    console.error("❌ startConversation error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
}

/**
 * Gửi message trong conversation
 */
export async function sendMessage(req, res) {
  try {
    const { sessionId } = req.params;
    const text = req.body.text;
    const audioFile = req.file;

    const result = await scenarioService.processMessage(sessionId, text, audioFile, req.body.expected_revision);
    res.json(result);
  } catch (err) {
    console.error("❌ sendMessage error:", err);
    if (err.discardUploadSafe) await discardRejectedUpload(req.file);
    res.status(err.status || 500).json({ message: err.message || "Server error", code: err.code });
  }
}

/**
 * Lấy gợi ý cho learner (trừ 15 điểm mỗi lần dùng)
 */
export async function getHint(req, res) {
  try {
    const { sessionId } = req.params;
    const hint = await scenarioService.getHint(sessionId);
    res.json(hint);
  } catch (err) {
    console.error("❌ getHint error:", err);
    res.status(err.status || 500).json({ message: err.message || "Server error", code: err.code });
  }
}

/**
 * Chấm điểm cuối cùng cho scenario
 */
export async function evaluateFinalScore(req, res) {
  try {
    const { sessionId } = req.params;
    const score = await scenarioService.evaluateFinalScore(sessionId);
    res.json(score);
  } catch (err) {
    console.error("❌ evaluateFinalScore error:", err);
    res.status(err.status || 500).json({ message: err.message || "Server error", code: err.code });
  }
}
