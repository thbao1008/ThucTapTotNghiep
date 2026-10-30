import { listPurchaseLedger } from "../../../shared/purchaseLedger.js";
import {challengeLevelSql} from '../../../shared/challengeLevels.js';
// Learner Service - Core business logic for learners
import pool from "../config/db.js";
import {
  createAssessmentContract,
  normalizeMentorReviewScores
} from "../utils/assessmentContract.js";
import { analyzeLearnerTranscript } from "../utils/aiServiceClient.js";
import { createSubmissionAnalysisService } from "./submissionAnalysisService.js";
import {
  persistTranscriptAssessment,
  serializeLearnerSubmissionListRow,
  serializeLearnerTranscriptAssessment
} from "../utils/transcriptAssessmentPersistence.js";

async function getPurchasesByLearner(learnerId) {
  return (await listPurchaseLedger(pool,{learnerId})).map(row=>({...row,id:row.purchase_id,remaining_days:row.days_left}));
}

/* -------------------- Learners -------------------- */

export async function getAllLearners({ page, limit, q } = {}) {
  const result = await pool.query(`
    SELECT l.id AS learner_id,
           u.id AS user_id,
           u.name, u.email, u.phone, u.dob,
           l.mentor_id,
           (SELECT p.id 
              FROM purchases p 
             WHERE p.learner_id = l.id 
          ORDER BY p.created_at DESC 
             LIMIT 1) AS latest_purchase_id
    FROM learners l
    JOIN users u ON l.user_id = u.id
    ORDER BY l.id DESC
  `);
  return result.rows;
}

export async function getLearnerById(id) {
  const result = await pool.query(`
    SELECT l.id AS learner_id, l.mentor_id, u.id, u.name, u.email, u.phone, u.dob, u.role, u.status, u.created_at, u.avatar_url
    FROM learners l
    JOIN users u ON l.user_id = u.id
    WHERE l.id = $1
  `, [id]);
  return result.rows[0] || null;
}

export async function getLearnerPurchases(id) {
  return await getPurchasesByLearner(id);
}

export async function createLearner() {
  throw Object.assign(new Error("Vui lòng tạo tài khoản học viên tại /api/admin/users."),{status:410});
}

export async function updateLearner(id, { name, email, phone, dob }) {
  const userIdRes = await pool.query("SELECT user_id FROM learners WHERE id=$1", [id]);
  if (!userIdRes.rows[0]) return null;
  const userId = userIdRes.rows[0].user_id;

  await pool.query(`
    UPDATE users SET
      name = COALESCE($1, name),
      email = COALESCE($2, email),
      phone = COALESCE($3, phone),
      dob = COALESCE($4, dob),
      updated_at = NOW()
    WHERE id=$5
  `, [name, email, phone, dob, userId]);

  return true;
}

export async function reassignMentorService(id) {
  const learnerRes = await pool.query("SELECT id FROM learners WHERE id=$1", [id]);
  if (!learnerRes.rows[0]) return null;

  await pool.query("UPDATE learners SET mentor_id=NULL, updated_at=NOW() WHERE id=$1", [id]);
  const updatedRes = await pool.query("SELECT mentor_id FROM learners WHERE id=$1", [id]);
  return updatedRes.rows[0].mentor_id;
}









export async function deleteLearner(id) {
  await pool.query("DELETE FROM learners WHERE id=$1", [id]);
  return true;
}

export async function getLatestPurchaseService(id) {
  const purchases=await listPurchaseLedger(pool,{learnerId:id});
  return purchases.find(row=>row.is_active) || purchases[0] || null;
}

export async function updateLearnerNoteService(learnerId, note) {
  const result = await pool.query(
    "UPDATE learners SET note=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
    [note, learnerId]
  );
  return result.rows[0] || null;
}

export async function createReportService({ mentor_id, learner_id, content }) {
  const result = await pool.query(
    `INSERT INTO reports (mentor_id, learner_id, content, status, created_at, updated_at)
     VALUES ($1,$2,$3,'pending',NOW(),NOW())
     RETURNING *`,
    [mentor_id, learner_id, content]
  );
  return result.rows[0];
}

export async function getMentorByLearnerIdService(id) {
  const result = await pool.query("SELECT mentor_id FROM learners WHERE id=$1", [id]);
  return result.rows[0]?.mentor_id || null;
}

/**
 * Get mentor info for learner feedback (including current rating)
 */
export async function getMentorInfoForFeedback(learnerId) {
  const result = await pool.query(
    `SELECT m.id AS mentor_id, m.rating, u.id AS mentor_user_id, u.name AS mentor_name
     FROM learners l
     JOIN mentors m ON l.mentor_id = m.id
     JOIN users u ON m.user_id = u.id
     WHERE l.id = $1`,
    [learnerId]
  );
  return result.rows[0] || null;
}

/**
 * Check if learner can feedback mentor (28 days since last feedback)
 */
export async function canFeedbackMentor(learnerId, mentorId) {
  const result = await pool.query(
    `SELECT MAX(created_at) AS last_feedback_date
     FROM feedbacks
     WHERE learner_id = $1 AND mentor_id = $2 AND submission_id IS NULL`,
    [learnerId, mentorId]
  );
  
  const lastDate = result.rows[0]?.last_feedback_date;
  if (!lastDate) return { canFeedback: true, daysRemaining: 0 };
  
  const daysSince = Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
  const canFeedback = daysSince >= 28;
  const daysRemaining = canFeedback ? 0 : 28 - daysSince;
  
  return { canFeedback, daysRemaining, lastFeedbackDate: lastDate };
}

/**
 * Get learner feedbacks for mentor (not related to submissions)
 */
export async function getLearnerFeedbacksForMentor(learnerId, mentorId) {
  // Join rating từ bảng mentors (rating hiện tại của mentor)
  const result = await pool.query(
    `SELECT f.id, f.content, f.created_at, f.updated_at,
            m.rating AS mentor_rating
     FROM feedbacks f
     LEFT JOIN mentors m ON m.id = f.mentor_id
     WHERE f.learner_id = $1 AND f.mentor_id = $2 AND f.submission_id IS NULL
     ORDER BY f.created_at DESC`,
    [learnerId, mentorId]
  );
  // Map để giữ tương thích với frontend (frontend đang expect rating)
  return result.rows.map(row => ({
    ...row,
    rating: row.mentor_rating // Sử dụng mentor_rating làm rating cho mỗi feedback
  }));
}

/**
 * Create learner feedback for mentor (update mentor rating)
 * rating: 0-10 scale
 */
export async function createLearnerFeedbackForMentor(learnerId, mentorId, { content, rating }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    // Check 28 days constraint
    const canFeedback = await canFeedbackMentor(learnerId, mentorId);
    if (!canFeedback.canFeedback) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: 400,
        message: `Bạn chỉ có thể đánh giá mentor mỗi 28 ngày. Còn ${canFeedback.daysRemaining} ngày nữa.`
      };
    }
    
    // Insert feedback (submission_id = NULL để phân biệt với submission feedbacks)
    const feedbackRes = await client.query(
      `INSERT INTO feedbacks (submission_id, learner_id, mentor_id, content, created_at)
       VALUES (NULL, $1, $2, $3, NOW())
       RETURNING id, created_at`,
      [learnerId, mentorId, content || null]
    );
    
    // Calculate new average rating for mentor từ bảng mentors hiện tại
    if (rating !== null && rating !== undefined) {
      // Lấy rating hiện tại của mentor
      const currentMentor = await client.query(
        `SELECT rating FROM mentors WHERE id = $1`,
        [mentorId]
      );
      const currentRating = currentMentor.rows[0]?.rating || null;
      
      // Đếm số feedbacks đã có (không tính submission feedbacks)
      const countRes = await client.query(
        `SELECT COUNT(*) AS count
         FROM feedbacks
         WHERE mentor_id = $1 AND submission_id IS NULL`,
        [mentorId]
      );
      const feedbackCount = parseInt(countRes.rows[0]?.count || 0);
      
      // Tính trung bình: (currentRating * (count-1) + newRating) / count
      let newRating;
      if (currentRating === null || feedbackCount === 1) {
        // Nếu chưa có rating hoặc đây là feedback đầu tiên
        newRating = rating;
      } else {
        // Tính trung bình từ rating cũ và rating mới
        const totalRating = (parseFloat(currentRating) * (feedbackCount - 1)) + parseFloat(rating);
        newRating = (totalRating / feedbackCount).toFixed(2);
      }
      
      console.log(`[learnerService] Updating mentor ${mentorId} rating to ${newRating} (from ${feedbackCount} feedbacks, new rating: ${rating})`);
      
      // Update mentor rating
      await client.query(
        `UPDATE mentors SET rating = $1::numeric, updated_at = NOW() WHERE id = $2`,
        [newRating, mentorId]
      );
    }
    
    await client.query("COMMIT");
    
    return {
      ok: true,
      feedback: feedbackRes.rows[0],
      newRating: rating !== null && rating !== undefined ? (await pool.query(
        `SELECT rating FROM mentors WHERE id = $1`,
        [mentorId]
      )).rows[0]?.rating : null
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getLearnerByUserIdService(userId) {
  const result = await pool.query(
    "SELECT id, user_id, mentor_id FROM learners WHERE user_id = $1",
    [userId]
  );
  return result.rows[0] || null;
}

export async function downloadLearnerResourceService(learnerId, resourceId) {
  try {
    const result = await pool.query(
      `SELECT file_url 
       FROM mentor_resources 
       WHERE id = $1 
         AND mentor_id = (SELECT mentor_id FROM learners WHERE id = $2)`,
      [resourceId, learnerId]
    );

    return result.rows[0]?.file_url || null;
  } catch (err) {
    console.error("Error downloadLearnerResourceService: - learnerService.js:153", err);
    throw err;
  }
}

/* -------------------- Challenges / Learner view -------------------- */

export async function getChallenges({ query, level, mentorId, page = 1, limit = 20 }) {
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  const params = [];
  const where = [];

  if (query) {
    params.push(query);
    where.push(`c.title ILIKE '%' || $${params.length} || '%'`);
  }
  if (level) {
    params.push(level);
    where.push(`${challengeLevelSql('c.level')} = $${params.length}`);
  }
  if (mentorId) {
    params.push(parseInt(mentorId));
    where.push(`c.mentor_id = $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(parseInt(limit), offset);

  const sql = `
    SELECT c.id, c.title, c.description, c.type, ${challengeLevelSql('c.level')} AS level, c.created_at,
           c.mentor_id,
           u.name AS mentor_name
    FROM challenges c
    LEFT JOIN mentors m ON m.id = c.mentor_id
    LEFT JOIN users u ON u.id = m.user_id
    ${whereSql}
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const r = await pool.query(sql, params);
  return r.rows;
}

export async function getChallengeById(id, db = pool) {
  const sql = `
    SELECT c.id, c.title, c.description, ${challengeLevelSql('c.level')} AS level, c.type, c.created_at,
           c.mentor_id,
           u.name AS mentor_name
    FROM challenges c
    LEFT JOIN mentors m ON m.id = c.mentor_id
    LEFT JOIN users u ON u.id = m.user_id
    WHERE c.id = $1
  `;
  const r = await db.query(sql, [id]);
  return r.rows[0] || null;
}

export async function getLearnerChallenges(
  learnerId,
  { page = 1, limit = 20 } = {},
  mentorId = null
) {
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  const params = [learnerId, parseInt(limit), offset];

  let sql = `
    SELECT c.id, c.title, c.description, ${challengeLevelSql('c.level')} AS level, c.type, c.created_at,
           c.mentor_id,
           lc.id AS learner_challenge_id, lc.status, lc.attempts, lc.score,
           lc.is_bookmarked, lc.last_attempt_at
    FROM challenges c
    LEFT JOIN learner_challenges lc
      ON c.id = lc.challenge_id AND lc.learner_id = $1
  `;

  if (mentorId) {
    params.push(parseInt(mentorId));
    sql += ` WHERE c.mentor_id = $${params.length}`;
  }

  sql += ` ORDER BY c.created_at DESC LIMIT $2 OFFSET $3`;

  const r = await pool.query(sql, params);
  return r.rows;
}

/* -------------------- Submissions & learner_challenges -------------------- */

export async function getNextAttemptNumber(learnerId, challengeId, db = pool) {
  const r = await db.query(
    `SELECT COALESCE(MAX(attempt_number),0) + 1 AS next 
     FROM submissions 
     WHERE learner_id=$1 AND challenge_id=$2`,
    [learnerId, challengeId]
  );
  return r.rows[0].next;
}

export async function createSubmission({
  learnerId,
  challengeId,
  assignmentId = null,
  attemptNumber = 1,
  audioUrl,
  transcript = null
}, db = pool) {
  const r = await db.query(
    `INSERT INTO submissions 
       (learner_id, challenge_id, assignment_id, attempt_number, audio_url, transcript, status, submitted_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,'pending',NOW(),NOW()) 
     RETURNING *`,
    [learnerId, challengeId, assignmentId, attemptNumber, audioUrl, transcript]
  );
  
  const submission = r.rows[0];
  return submission;
}



export async function getSubmissionById(id, db = pool) {
  const r = await db.query(
    `SELECT s.*,
            c.title AS challenge_title,
            ar.overall_score, ar.pronunciation_score, ar.fluency_score, ar.grammar_issues, ar.pronunciation_issues, ar.suggestions, ar.raw_ai_response, ar.word_analysis,
            ar.topic, ar.topic_confidence, ar.topic_alignment,
            ar.created_at AS ai_report_at,
            -- lấy learner_challenges (chỉ status, attempts)
            lc.id AS learner_challenge_id, lc.status AS lc_status, lc.attempts AS lc_attempts,
            -- lấy feedback từ feedbacks theo submission_id (mỗi submission có feedback riêng)
            f.id AS feedback_id, 
            f.content AS feedback_content, 
            f.audio_url AS feedback_audio_url,
            f.final_score AS feedback_final_score,
            f.pronunciation_score AS feedback_pronunciation_score,
            f.fluency_score AS feedback_fluency_score,
            f.created_at AS feedback_created_at,
            f.updated_at AS feedback_updated_at
     FROM submissions s
     LEFT JOIN challenges c ON c.id = s.challenge_id
     LEFT JOIN ai_reports ar ON ar.submission_id = s.id
     LEFT JOIN learners l ON s.learner_id = l.id
     LEFT JOIN learner_challenges lc ON lc.learner_id = s.learner_id AND lc.challenge_id = s.challenge_id
     LEFT JOIN feedbacks f ON f.submission_id = s.id
     WHERE s.id = $1`,
    [id]
  );
  if (!r.rows[0]) return null;

  const row = r.rows[0];

  let rawAiResponse = row.raw_ai_response || {};
    if (typeof rawAiResponse === "string") {
  try {
    rawAiResponse = JSON.parse(rawAiResponse);
  } catch {
    rawAiResponse = {};
  }
    }
    if (!rawAiResponse || typeof rawAiResponse !== "object" || Array.isArray(rawAiResponse)) {
  rawAiResponse = {};
    }
    const serializedAssessment = serializeLearnerTranscriptAssessment(
      row,
      rawAiResponse,
      "ai_assessment_contract"
    );

    return {
    ...serializedAssessment,
    pronunciation_score: null,
    fluency_score: null,
    // Mentor review từ feedbacks (theo submission_id)
    mentor_review: row.feedback_id ? {
      id: row.feedback_id,
      final_score: row.feedback_final_score,
      pronunciation_score: row.feedback_pronunciation_score,
      fluency_score: row.feedback_fluency_score,
      feedback: row.feedback_content,
      audio_url: row.feedback_audio_url,
      assessment_contract: null,
      created_at: row.feedback_created_at,
      updated_at: row.feedback_updated_at
    } : null,
    learner_challenge: row.learner_challenge_id ? {
      id: row.learner_challenge_id,
      status: row.lc_status,
      attempts: row.lc_attempts
    } : null
  };
}

export async function updateSubmissionTranscript(id, transcript, db = pool) {
  const r = await db.query(
    "UPDATE submissions SET transcript=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
    [transcript, id]
  );
  return r.rows[0] || null;
}

export async function updateSubmissionStatus(id, status, db = pool) {
  await db.query("UPDATE submissions SET status=$1, updated_at=NOW() WHERE id=$2", [status, id]);
  return true;
}

export async function claimSubmissionForAnalysis(id, db = pool, recoverStale = false) {
  // Stale processing is claimable only by the session-locked worker adapter.
  const result = await db.query(`UPDATE submissions SET status='processing', updated_at=NOW()
    WHERE id=$1 AND (status IN ('pending','pending_transcription','failed')
      OR ($2::boolean AND status='processing' AND updated_at < NOW() - INTERVAL '15 minutes'))
    RETURNING id`, [id, recoverStale]);
  return result.rowCount === 1;
}

export async function updateSubmissionAnalysis(submissionId, analysisObj, db = pool) {
  return persistTranscriptAssessment(db, submissionId, analysisObj, error => {
    console.warn("Canonical transcript assessment was not persisted:", error.code || "UNKNOWN_ERROR");
  });
}

export async function getAnalysisBySubmissionId(submissionId) {
  const client = await pool.connect();
  try {
    const sql = `
      SELECT
        submission_id,
        overall_score,
        pronunciation_score,
        fluency_score,
        grammar_issues,
        pronunciation_issues,
        suggestions,
        raw_ai_response,
        word_analysis,
        topic,
        topic_confidence,
        topic_alignment,
        created_at,
        updated_at
      FROM ai_reports
      WHERE submission_id = $1
    `;
    const res = await client.query(sql, [submissionId]);
    if (!res.rows[0]) return null;

    const row = res.rows[0];

    // Parse raw_ai_response JSON để lấy topic_detection_raw
    let rawResp = {};
    try {
      rawResp = typeof row.raw_ai_response === "string"
        ? JSON.parse(row.raw_ai_response)
        : row.raw_ai_response || {};
    } catch {
      rawResp = {};
    }
    const serializedAssessment = serializeLearnerTranscriptAssessment(
      row,
      rawResp,
      "assessment_contract"
    );

    return {
      ...serializedAssessment,
      topic_detection_raw: serializedAssessment.raw_ai_response.topic_detection_raw ?? null
    };
  } finally {
    client.release();
  }
}

const submissionAnalysisService = createSubmissionAnalysisService({
  getSubmission: getSubmissionById,
  analyzeTranscript: analyzeLearnerTranscript,
  persistAnalysis: updateSubmissionAnalysis
});

export const analyzeSubmissionWithAI =
  submissionAnalysisService.analyzeSubmissionWithAI;

export async function upsertLearnerChallenge({
  learnerId, challengeId, assignmentId = null, status = "in_progress", attempts = 0, is_bookmarked = null
}, db = pool) {
  const r = await db.query(
    `INSERT INTO learner_challenges (learner_id, challenge_id, assignment_id, status, attempts, is_bookmarked, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6::boolean,FALSE),NOW(),NOW())
     ON CONFLICT (learner_id, challenge_id)
     DO UPDATE SET
       status = EXCLUDED.status,
       attempts = learner_challenges.attempts + GREATEST(EXCLUDED.attempts,0),
       is_bookmarked = CASE WHEN $6::boolean IS NULL THEN learner_challenges.is_bookmarked ELSE EXCLUDED.is_bookmarked END,
       updated_at = NOW()
     RETURNING *;`,
    [learnerId, challengeId, assignmentId, status, attempts, is_bookmarked]
  );
  return r.rows[0];
}

export async function listSubmissionsForLearner(learnerId, { limit = 100, offset = 0 } = {}) {
  const r = await pool.query(
    `SELECT s.*,
            ar.overall_score, ar.raw_ai_response AS ai_raw_response,
            ar.created_at AS ai_report_at
     FROM submissions s
     LEFT JOIN ai_reports ar ON ar.submission_id = s.id
     WHERE s.learner_id = $1
     ORDER BY s.submitted_at DESC NULLS LAST, s.id DESC
     LIMIT $2 OFFSET $3`,
    [learnerId, limit, offset]
  );
  return r.rows.map(row => {
    let rawResponse = row.ai_raw_response || {};
    if (typeof rawResponse === "string") {
      try {
        rawResponse = JSON.parse(rawResponse);
      } catch {
        rawResponse = {};
      }
    }
    return serializeLearnerSubmissionListRow(row, rawResponse);
  });
}

export async function reviewSubmissionByMentor(submissionId, review, dependencies = {}) {
  const {
    mentorId,
    finalScore: rawFinalScore = null,
    feedback = null,
    pronunciation_score: rawPronunciationScore = null,
    fluency_score: rawFluencyScore = null,
    audio_url = null
  } = review;
  const normalizedScores = normalizeMentorReviewScores({
    final_score: rawFinalScore,
    pronunciation_score: rawPronunciationScore,
    fluency_score: rawFluencyScore
  });
  const finalScore = normalizedScores.final_score;
  const pronunciation_score = normalizedScores.pronunciation_score;
  const fluency_score = normalizedScores.fluency_score;
  const { database = pool } = dependencies;
  const client = await database.connect();
  try {
    await client.query("BEGIN");

    // verify submission + learner + challenge
    const check = await client.query(
      `SELECT s.id AS submission_id, s.learner_id, s.challenge_id, l.mentor_id
       FROM submissions s
       JOIN learners l ON s.learner_id = l.id
       WHERE s.id = $1
       LIMIT 1`,
      [submissionId]
    );
    if (check.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, status: 404, message: "Submission not found" };
    }
    const { learner_id, challenge_id, mentor_id } = check.rows[0];
    if (Number(mentor_id) !== Number(mentorId)) {
      await client.query("ROLLBACK");
      return { ok: false, status: 403, message: "Forbidden: learner not assigned to this mentor" };
    }

    // Store the review and its scores together so its human provenance is retained.
    let feedbackId = null;
    if (
      feedback ||
      audio_url ||
      finalScore != null ||
      pronunciation_score != null ||
      fluency_score != null
    ) {
      const fRes = await client.query(
        `INSERT INTO feedbacks
           (submission_id, learner_id, mentor_id, content, audio_url, final_score, pronunciation_score, fluency_score, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING id`,
        [
          submissionId,
          learner_id,
          mentorId,
          feedback || null,
          audio_url || null,
          finalScore ?? null,
          pronunciation_score ?? null,
          fluency_score ?? null
        ]
      );
      feedbackId = fRes.rows[0]?.id || null;
    }

    // upsert learner_challenges: lưu điểm + feedback_id + status
    const lcRes = await client.query(
      `INSERT INTO learner_challenges
         (learner_id, challenge_id, final_score, pronunciation_score, fluency_score, feedback_id, status, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'completed',NOW())
       ON CONFLICT (learner_id, challenge_id)
       DO UPDATE SET
         final_score = COALESCE(EXCLUDED.final_score, learner_challenges.final_score),
         pronunciation_score = COALESCE(EXCLUDED.pronunciation_score, learner_challenges.pronunciation_score),
         fluency_score = COALESCE(EXCLUDED.fluency_score, learner_challenges.fluency_score),
         feedback_id = COALESCE(EXCLUDED.feedback_id, learner_challenges.feedback_id),
         status = 'completed',
         updated_at = NOW()
       RETURNING *`,
      [
        learner_id,
        challenge_id,
        finalScore ?? null,
        pronunciation_score ?? null,
        fluency_score ?? null,
        feedbackId
      ]
    );

    // cập nhật trạng thái submission
    await client.query(
      `UPDATE submissions SET status = 'reviewed', updated_at = NOW() WHERE id = $1`,
      [submissionId]
    );

    await client.query("COMMIT");
    
    return {
      ok: true,
      learner_challenge: lcRes.rows[0],
      feedback_id: feedbackId,
      assessment_contract: createAssessmentContract({
        type: "mentor_review",
        source: "mentor",
        method: "human_review",
        scale: "0-100",
        status: "completed",
        metrics: {
          final_score: finalScore,
          pronunciation: pronunciation_score,
          fluency: fluency_score
        }
      })
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateSubmissionSegments(submissionId, segments, db = pool) {
  return db.query(
    "UPDATE submissions SET segments = $1, updated_at = NOW() WHERE id = $2",
    [JSON.stringify(segments), submissionId]
  );
}

/* -------------------- Bookmarks -------------------- */

export async function getBookmarkedChallenges(learnerId) {
  const sql = `
    SELECT c.id, c.title, c.description, ${challengeLevelSql('c.level')} AS level, c.type, c.created_at,
           c.mentor_id,
           u.name AS mentor_name,
           lc.is_bookmarked, lc.updated_at AS bookmarked_at
    FROM learner_challenges lc
    JOIN challenges c ON c.id = lc.challenge_id
    LEFT JOIN mentors m ON m.id = c.mentor_id
    LEFT JOIN users u ON u.id = m.user_id
    WHERE lc.learner_id = $1 AND lc.is_bookmarked = true
    ORDER BY lc.updated_at DESC
  `;
  const r = await pool.query(sql, [learnerId]);
  return r.rows;
}

export async function toggleBookmark(learnerId, challengeId) {
  // Check if bookmark exists
  const check = await pool.query(
    `SELECT is_bookmarked FROM learner_challenges 
     WHERE learner_id = $1 AND challenge_id = $2`,
    [learnerId, challengeId]
  );

  if (check.rows.length === 0) {
    // Create new record with bookmark
    const r = await pool.query(
      `INSERT INTO learner_challenges (learner_id, challenge_id, is_bookmarked, created_at, updated_at)
       VALUES ($1, $2, true, NOW(), NOW())
       RETURNING *`,
      [learnerId, challengeId]
    );
    return r.rows[0];
  } else {
    // Toggle bookmark
    const newValue = !check.rows[0].is_bookmarked;
    const r = await pool.query(
      `UPDATE learner_challenges 
       SET is_bookmarked = $1, updated_at = NOW()
       WHERE learner_id = $2 AND challenge_id = $3
       RETURNING *`,
      [newValue, learnerId, challengeId]
    );
    return r.rows[0];
  }
}
