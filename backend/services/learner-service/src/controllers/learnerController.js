// Learner Service - Controller
import * as learnerService from "../services/learnerService.js";
// TODO: Replace with API calls to AI Service
// import * as aiService from "../services/aiService.js";
import * as progressAnalyticsService from "../services/progressAnalyticsService.js";
import { enqueue } from "../utils/queue.js";
import { runWhisperX } from "../utils/whisperxRunner.js";
// TODO: Replace with API calls to Report Service (if created) or Mentor Service
// import * as reportController from "./reportController.js";
import pool from "../config/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Tìm project root (đi lên từ learner-service/src/controllers đến root)
 */
function getProjectRoot() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // __dirname = backend/services/learner-service/src/controllers
  // Đi lên 4 cấp: controllers -> src -> learner-service -> services -> backend
  return path.resolve(__dirname, "..", "..", "..", "..");
}

/* ========== Controller functions ========== */

// GET /api/learners
export async function getAll(req, res) {
  try {
    const params = {
      page: req.query.page,
      limit: req.query.limit,
      q: req.query.q
    };
    const learners = await learnerService.getAllLearners(params);
    return res.json({ learners });
  } catch (err) {
    console.error("Error learnerController.getAll: - learnerController.js:22", err);
    return res.status(500).json({ message: "Server error" });
  }
}

// GET /api/learners/:id
export async function getById(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid learner id" });

    const learner = await learnerService.getLearnerById(id);
    if (!learner) return res.status(404).json({ message: "Learner not found" });

    return res.json({ learner });
  } catch (err) {
    console.error("Error learnerController.getById: - learnerController.js:38", err);
    return res.status(500).json({ message: "Server error" });
  }
}

// POST /api/learners
export async function create(req, res) {
  try {
    const payload = req.body || {};
    const created = await learnerService.createLearner(payload);
    return res.status(201).json({ learner: created });
  } catch (err) {
    console.error("Error learnerController.create: - learnerController.js:50", err);
    return res.status(500).json({ message: "Server error" });
  }
}

// PUT /api/learners/:id
export async function update(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid learner id" });

    const ok = await learnerService.updateLearner(id, req.body || {});
    if (!ok) return res.status(404).json({ message: "Learner not found" });

    return res.json({ message: "Updated" });
  } catch (err) {
    console.error("Error learnerController.update: - learnerController.js:66", err);
    return res.status(500).json({ message: "Server error" });
  }
}

// DELETE /api/learners/:id
export async function remove(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid learner id" });

    await learnerService.deleteLearner(id);
    return res.json({ message: "Deleted" });
  } catch (err) {
    console.error("Error learnerController.remove: - learnerController.js:80", err);
    return res.status(500).json({ message: "Server error" });
  }
}

/* ========== Purchases ========== */

export async function getPurchases(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid learner id" });

    const purchases = await learnerService.getLearnerPurchases(id);
    return res.json({ purchases });
  } catch (err) {
    console.error("Error learnerController.getPurchases: - learnerController.js:95", err);
    return res.status(500).json({ message: "Server error" });
  }
}

export async function getLatestPurchase(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid learner id" });

    const purchase = await learnerService.getLatestPurchaseService(id);
    return res.json({ success: true, purchase });
  } catch (err) {
    console.error("Error learnerController.getLatestPurchase: - learnerController.js:108", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

/* ========== Mentor / Lookup ========== */

export async function getMentorByLearnerId(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid learner id" });

    const mentorId = await learnerService.getMentorByLearnerIdService(id);
    if (!mentorId) return res.status(404).json({ message: "Learner chưa được gán mentor" });

    return res.json({ mentor_id: mentorId });
  } catch (err) {
    console.error("Error learnerController.getMentorByLearnerId: - learnerController.js:125", err);
    return res.status(500).json({ message: "Server error" });
  }
}

export async function getLearnerByUserId(req, res) {
  try {
    const userId = req.params.userId;
    if (!userId) return res.status(400).json({ message: "Missing userId" });

    const learner = await learnerService.getLearnerByUserIdService(userId);
    if (!learner) return res.status(404).json({ message: "Learner not found" });

    return res.json({ learner });
  } catch (err) {
    console.error("Error learnerController.getLearnerByUserId: - learnerController.js:140", err);
    return res.status(500).json({ message: "Server error" });
  }
}

/* ========== Notes / Reports / Reassign ========== */

export async function updateLearnerNote(req, res) {
  try {
    const learnerId = parseInt(req.params.learnerId, 10);
    if (Number.isNaN(learnerId)) return res.status(400).json({ message: "Invalid learner id" });

    const note = req.body?.note ?? "";
    const learner = await learnerService.updateLearnerNoteService(learnerId, note);
    return res.json({ success: true, learner });
  } catch (err) {
    console.error("Error learnerController.updateLearnerNote: - learnerController.js:156", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

export async function createReport(req, res) {
  try {
    const payload = req.body || {};
    const report = await learnerService.createReportService(payload);
    return res.status(201).json({ success: true, report });
  } catch (err) {
    console.error("Error learnerController.createReport: - learnerController.js:167", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

/**
 * Get mentor feedback status (can feedback? days remaining?)
 */
export async function getMentorFeedbackStatus(req, res) {
  try {
    const learnerId = parseInt(req.params.learnerId);
    if (!learnerId) return res.status(400).json({ error: "Invalid learnerId" });
    
    const mentorInfo = await learnerService.getMentorInfoForFeedback(learnerId);
    if (!mentorInfo) {
      return res.status(404).json({ error: "Learner chưa được gán mentor" });
    }
    
    const canFeedback = await learnerService.canFeedbackMentor(learnerId, mentorInfo.mentor_id);
    
    return res.json({
      mentor: {
        id: mentorInfo.mentor_id,
        name: mentorInfo.mentor_name,
        rating: mentorInfo.rating
      },
      canFeedback: canFeedback.canFeedback,
      daysRemaining: canFeedback.daysRemaining,
      lastFeedbackDate: canFeedback.lastFeedbackDate
    });
  } catch (err) {
    console.error("Error getMentorFeedbackStatus: - learnerController.js", err);
    return res.status(500).json({ error: "Server error" });
  }
}

/**
 * Get learner feedbacks for mentor
 */
export async function getLearnerFeedbacksForMentor(req, res) {
  try {
    const learnerId = parseInt(req.params.learnerId);
    if (!learnerId) return res.status(400).json({ error: "Invalid learnerId" });
    
    const mentorInfo = await learnerService.getMentorInfoForFeedback(learnerId);
    if (!mentorInfo) {
      return res.status(404).json({ error: "Learner chưa được gán mentor" });
    }
    
    const feedbacks = await learnerService.getLearnerFeedbacksForMentor(learnerId, mentorInfo.mentor_id);
    
    return res.json({ feedbacks });
  } catch (err) {
    console.error("Error getLearnerFeedbacksForMentor: - learnerController.js", err);
    return res.status(500).json({ error: "Server error" });
  }
}

/**
 * Create learner feedback for mentor
 */
export async function createLearnerFeedbackForMentor(req, res) {
  try {
    const learnerId = parseInt(req.params.learnerId);
    const { content, rating } = req.body;
    
    if (!learnerId) return res.status(400).json({ error: "Invalid learnerId" });
    if (rating !== null && rating !== undefined && (rating < 0 || rating > 10)) {
      return res.status(400).json({ error: "Rating phải từ 0-10" });
    }
    
    const mentorInfo = await learnerService.getMentorInfoForFeedback(learnerId);
    if (!mentorInfo) {
      return res.status(404).json({ error: "Learner chưa được gán mentor" });
    }
    
    const result = await learnerService.createLearnerFeedbackForMentor(learnerId, mentorInfo.mentor_id, { content, rating });
    
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.message });
    }
    
    return res.json({
      success: true,
      feedback: result.feedback,
      newRating: result.newRating
    });
  } catch (err) {
    console.error("Error createLearnerFeedbackForMentor: - learnerController.js", err);
    return res.status(500).json({ error: "Server error" });
  }
}

/**
 * Report mentor with image/video
 */
export async function reportMentor(req, res) {
  try {
    const learnerId = parseInt(req.params.learnerId);
    const { content } = req.body;
    
    if (!learnerId) return res.status(400).json({ error: "Invalid learnerId" });
    if (!content) return res.status(400).json({ error: "Thiếu nội dung report" });
    
    // Get learner user_id and mentor user_id
    const learnerRes = await pool.query(
      `SELECT l.user_id AS learner_user_id, m.user_id AS mentor_user_id
       FROM learners l
       JOIN mentors m ON l.mentor_id = m.id
       WHERE l.id = $1`,
      [learnerId]
    );
    
    if (!learnerRes.rows[0]) {
      return res.status(404).json({ error: "Learner không tìm thấy hoặc chưa có mentor" });
    }
    
    const { learner_user_id, mentor_user_id } = learnerRes.rows[0];
    
    // Check 24h constraint
    const canReportRes = await pool.query(
      `SELECT MAX(created_at) AS last_report_date
       FROM reports
       WHERE reporter_id = $1 AND target_id = $2`,
      [learner_user_id, mentor_user_id]
    );
    
    const lastDate = canReportRes.rows[0]?.last_report_date;
    if (lastDate) {
      const lastReportTime = new Date(lastDate).getTime();
      const now = Date.now();
      const hoursSince = (now - lastReportTime) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        const hoursRemaining = Math.ceil(24 - hoursSince);
        return res.status(400).json({ 
          error: `Bạn chỉ có thể report lại sau 24 giờ. Còn ${hoursRemaining} giờ nữa.`,
          canReport: false,
          hoursRemaining
        });
      }
    }
    
    // Handle image/video upload
    let image_url = null;
    let video_url = null;
    
    if (req.files) {
      if (req.files.image && req.files.image[0]) {
        image_url = `/uploads/${req.files.image[0].filename}`;
      }
      if (req.files.video && req.files.video[0]) {
        video_url = `/uploads/${req.files.video[0].filename}`;
      }
    }
    
    // Create report using reportController
    const originalBody = req.body;
    req.body = {
      reporter_id: learner_user_id,
      target_id: mentor_user_id,
      content,
      status: "pending",
      image_url,
      video_url
    };
    
    // Create report directly using pool
    try {
      const reportResult = await pool.query(
        `INSERT INTO reports (reporter_id, target_id, content, status, created_at, updated_at, image_url, video_url)
         VALUES (
           $1, 
           $2, 
           '[Report - ' || TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI:SS') || '] ' || $3,
           $4,
           NOW(),
           NOW(),
           $5,
           $6
         )
         RETURNING *`,
        [learner_user_id, mentor_user_id, content, "pending", image_url || null, video_url || null]
      );
      
      return res.json({ success: true, report: reportResult.rows[0] });
    } catch (err) {
      // Nếu lỗi do thiếu column, thử insert không có image/video
      if (err.code === "42703" || err.message.includes("image_url") || err.message.includes("video_url")) {
        const reportResult = await pool.query(
          `INSERT INTO reports (reporter_id, target_id, content, status, created_at, updated_at)
           VALUES (
             $1, 
             $2, 
             '[Report - ' || TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI:SS') || '] ' || $3,
             $4,
             NOW(),
             NOW()
           )
           RETURNING *`,
          [learner_user_id, mentor_user_id, content, "pending"]
        );
        return res.json({ success: true, report: reportResult.rows[0], warning: "Bảng reports chưa có cột image_url/video_url" });
      }
      throw err;
    }
  } catch (err) {
    console.error("Error reportMentor: - learnerController.js", err);
    return res.status(500).json({ error: "Server error" });
  }
}

export async function reassignMentor(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid learner id" });

    const mentorId = await learnerService.reassignMentorService(id);
    if (!mentorId) return res.status(404).json({ message: "Learner not found" });

    return res.json({ learnerId: id, mentorId });
  } catch (err) {
    console.error("Error learnerController.reassignMentor: - learnerController.js:182", err);
    return res.status(500).json({ message: "Server error" });
  }
}

/* ========== Resource download helpers ========== */

export async function downloadResourceById(req, res) {
  try {
    const resourceId = parseInt(req.params.resourceId || req.params.id, 10);
    if (Number.isNaN(resourceId)) return res.status(400).json({ message: "Invalid resource id" });

    const resource = await learnerService.getResourceByIdService(resourceId);
    if (!resource || !resource.file_url) return res.status(404).json({ message: "Tài liệu không tồn tại" });

    return res.redirect(resource.file_url);
  } catch (err) {
    console.error("Error downloadResourceById: - learnerController.js:199", err);
    return res.status(500).json({ message: "Lỗi máy chủ" });
  }
}

export async function downloadLearnerResource(req, res) {
  try {
    const learnerId = parseInt(req.params.learnerId, 10);
    const resourceId = parseInt(req.params.resourceId, 10);
    if (Number.isNaN(learnerId) || Number.isNaN(resourceId)) return res.status(400).json({ message: "Invalid id(s)" });

    const fileUrl = await learnerService.downloadLearnerResourceService(learnerId, resourceId);
    if (!fileUrl) return res.status(404).json({ message: "Tài liệu không tồn tại hoặc không thuộc mentor của learner này" });

    return res.redirect(fileUrl);
  } catch (err) {
    console.error("Error downloadLearnerResource: - learnerController.js:215", err);
    return res.status(500).json({ message: "Lỗi máy chủ" });
  }
}

/* ========== Challenges / Submissions ========== */

export async function listAllChallenges(req, res) {
  try {
    const { q, level, mentorId, page, limit } = req.query;
    const data = await learnerService.getChallenges({ query: q, level, mentorId, page, limit });
    res.json({ challenges: data });
  } catch (err) {
    console.error("listAllChallenges error: - learnerController.js:228", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getChallengeById(req, res) {
  try {
    const id = parseInt(req.params.id);
    const ch = await learnerService.getChallengeById(id);
    if (!ch) return res.status(404).json({ message: "Challenge not found" });
    res.json({ challenge: ch });
  } catch (err) {
    console.error("getChallengeById error: - learnerController.js:240", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getLearnerChallenges(req, res) {
  try {
    const learnerId = parseInt(req.params.learnerId);
    if (Number.isNaN(learnerId)) return res.status(400).json({ message: "Invalid learner id" });

    const { page = 1, limit = 20, mentorId = null } = req.query;
    const rows = await learnerService.getLearnerChallenges(learnerId, { page, limit }, mentorId);
    res.json({ challenges: rows });
  } catch (err) {
    console.error("getLearnerChallenges error: - learnerController.js:254", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function createSubmission(req, res) {
  try {
    const learnerId = req.body.learner_id || req.body.learnerId;
    const challengeId = req.body.challenge_id || req.body.challengeId;
    const assignmentId = req.body.assignment_id || req.body.assignmentId;

    if (!learnerId || !challengeId) {
      return res.status(400).json({ message: "Missing learnerId or challengeId" });
    }

    let audioUrl = null;
    let transcript = null;

    if (req.file) {
      const backendDir = getProjectRoot();
      const uploadsDir = path.resolve(backendDir, "uploads");
      const localPath = req.file.filename
        ? path.join(uploadsDir, req.file.filename)
        : path.resolve(req.file.path);

      if (!fs.existsSync(localPath)) {
        console.error("createSubmission: audio file not found - learnerController.js:279", localPath);
        return res.status(500).json({ message: "Audio file missing on server", path: localPath });
      }

      // Format audioUrl as relative path (frontend will normalize through Vite proxy)
      // This ensures it goes through API Gateway instead of direct service port
      audioUrl = `/uploads/${req.file.filename}`;
      
      // Verify file exists after upload
      if (!fs.existsSync(localPath)) {
        console.error("createSubmission: audio file not found after upload - learnerController.js:503", localPath);
        return res.status(500).json({ message: "Audio file missing on server", path: localPath });
      }
      
      console.log(`[DEBUG] Audio file uploaded successfully: ${req.file.filename}, path: ${localPath}, url: ${audioUrl}`);

      try {
        const { json: transcriptJson } = await runWhisperX(localPath, {
          model: "base",
          computeType: "float32"
        });
        transcript = transcriptJson;
      } catch (err) {
        console.error("createSubmission: whisperx transcription failed - learnerController.js:292", err);
        try {
          // Fallback: use runWhisperX directly
          const out = await runWhisperX(localPath, { model: "base" });
          transcript = out.json ?? out.text ?? null;
        } catch (err2) {
          console.error("Fallback runWhisperX failed - learnerController.js:299", err2);
          transcript = null;
        }
      }
    } else {
      return res.status(400).json({ message: "No audio provided" });
    }

    const attemptNumber = await learnerService.getNextAttemptNumber(learnerId, challengeId);

    const submission = await learnerService.createSubmission({
      learnerId: parseInt(learnerId),
      challengeId: parseInt(challengeId),
      assignmentId: assignmentId ? parseInt(assignmentId) : null,
      attemptNumber,
      audioUrl,
      transcript
    });

    await learnerService.upsertLearnerChallenge({
      learnerId: parseInt(learnerId),
      challengeId: parseInt(challengeId),
      assignmentId: assignmentId ? parseInt(assignmentId) : null,
      status: "in_progress",
      attempts: 1
    });

  
    await enqueue("analyzeSubmission", { submissionId: submission.id });

    res.json({
      submissionId: submission.id,
      status: "pending",
      audio_url: audioUrl
    });
  } catch (err) {
    console.error("createSubmission error: - learnerController.js:335", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

export async function getSubmissionAnalysis(req, res) {
  try {
    const submissionId = parseInt(req.params.id);
    if (Number.isNaN(submissionId)) return res.status(400).json({ message: "Invalid submission id" });

    const analysis = await learnerService.getAnalysisBySubmissionId(submissionId);
    if (!analysis) return res.status(404).json({ message: "Analysis not found" });

    res.json({ analysis });
  } catch (err) {
    console.error("getSubmissionAnalysis error: - learnerController.js:350", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function analyzeSubmission(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid submission id" });

    const analysisRow = await learnerService.analyzeSubmissionWithAI(id);
    const updatedSubmission = await learnerService.getSubmissionById(id);
    res.json({ submission: updatedSubmission, analysis: analysisRow });
  } catch (err) {
    console.error("analyzeSubmission error: - learnerController.js:364", err);
    res.status(500).json({ message: "Server error" });
  }
}

// GET /api/learners/submissions/:id
export async function getSubmissionById(req, res) {
  try {
    const id = parseInt(req.params.id);
    const sub = await learnerService.getSubmissionById(id);
    if (!sub) return res.status(404).json({ message: "Submission not found" });
    
    // Format audio_url - convert absolute URL with wrong port to relative path
    if (sub.audio_url && typeof sub.audio_url === "string") {
      if (/^https?:\/\//i.test(sub.audio_url)) {
        try {
          const urlObj = new URL(sub.audio_url);
          // Extract pathname to make it relative (frontend will normalize)
          sub.audio_url = urlObj.pathname;
          sub.audioUrl = urlObj.pathname;
        } catch (e) {
          // If URL parsing fails, keep as is
        }
      }
    }
    
    // Format mentor_review audio_url if exists
    if (sub.mentor_review?.audio_url && typeof sub.mentor_review.audio_url === "string") {
      if (/^https?:\/\//i.test(sub.mentor_review.audio_url)) {
        try {
          const urlObj = new URL(sub.mentor_review.audio_url);
          sub.mentor_review.audio_url = urlObj.pathname;
        } catch (e) {
          // If URL parsing fails, keep as is
        }
      }
    }
    
    res.json({ submission: sub });
  } catch (err) {
    console.error("getSubmissionById error: - learnerController.js:377", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function reviewSubmissionByMentor(req, res) {
  try {
    const id = parseInt(req.params.id);
    const { mentorId, finalScore, feedback, overrideAI } = req.body;
    const updated = await learnerService.reviewSubmissionByMentor(id, { mentorId, finalScore, feedback, overrideAI });
    res.json({ submission: updated });
  } catch (err) {
    console.error("reviewSubmissionByMentor error: - learnerController.js:389", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function upsertLearnerChallenge(req, res) {
  try {
    const { learnerId, challengeId, assignmentId, status, attempts, is_bookmarked } = req.body;
    if (!learnerId || !challengeId) return res.status(400).json({ message: "Missing learnerId or challengeId" });
    const rec = await learnerService.upsertLearnerChallenge({
      learnerId: parseInt(learnerId),
      challengeId: parseInt(challengeId),
      assignmentId: assignmentId ? parseInt(assignmentId) : null,
      status,
      attempts,
      is_bookmarked
    });
    res.json({ learnerChallenge: rec });
  } catch (err) {
    console.error("upsertLearnerChallenge error: - learnerController.js:408", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function updateLearnerChallenge(req, res) {
  try {
    const id = parseInt(req.params.id);
    const payload = req.body;
    const updated = await learnerService.updateLearnerChallenge(id, payload);
    res.json({ learnerChallenge: updated });
  } catch (err) {
    console.error("updateLearnerChallenge error: - learnerController.js:420", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function listSubmissionsForLearner(req, res) {
  try {
    const learnerId = parseInt(req.params.learnerId);
    const rows = await learnerService.listSubmissionsForLearner(learnerId);
    res.json({ submissions: rows });
  } catch (err) {
    console.error("listSubmissionsForLearner error: - learnerController.js:431", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getBookmarkedChallenges(req, res) {
  try {
    const learnerId = parseInt(req.params.learnerId);
    if (!learnerId) return res.status(400).json({ message: "Invalid learnerId" });
    const challenges = await learnerService.getBookmarkedChallenges(learnerId);
    res.json({ challenges });
  } catch (err) {
    console.error("getBookmarkedChallenges error:", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function toggleBookmark(req, res) {
  try {
    const learnerId = parseInt(req.params.learnerId);
    const challengeId = parseInt(req.params.challengeId);
    if (!learnerId || !challengeId) {
      return res.status(400).json({ message: "Invalid learnerId or challengeId" });
    }
    const result = await learnerService.toggleBookmark(learnerId, challengeId);
    res.json({ learnerChallenge: result });
  } catch (err) {
    console.error("toggleBookmark error:", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function checkSubmission(req, res) {
  try {
    const id = parseInt(req.params.id);
    const sub = await learnerService.getSubmissionById(id);
    if (!sub || !sub.transcript) return res.status(404).json({ message: "Transcript not found" });

    const sampleText = req.body.sampleText || "";
    const comparison = compareTranscript(sub.transcript, sampleText);

    res.json({ transcript: sub.transcript, comparison });
  } catch (err) {
    console.error("checkSubmission error: - learnerController.js:447", err);
    res.status(500).json({ message: "Server error" });
  }
}

/* ========== Utility: simple transcript comparison (example) ========== */
function compareTranscript(transcript = "", sample = "") {
  const normalize = s =>
    (s || "")
      .replace(/[^\w\s]/g, "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

  const tTokens = normalize(transcript);
  const sTokens = normalize(sample);

  const result = tTokens.map((tok, idx) => {
    const expected = sTokens[idx] ?? null;
    return { word: tok, expected, correct: expected ? tok === expected : null };
  });

  return { tokens: result, transcriptTokens: tTokens.length, sampleTokens: sTokens.length };
}

/* ========== Progress Analytics ========== */

/**
 * GET /api/learners/:learnerId/progress-analytics
 * Lấy progress analytics với AI recommendations
 */
export async function getProgressAnalytics(req, res) {
  try {
    const learnerId = parseInt(req.params.learnerId);
    if (Number.isNaN(learnerId)) {
      return res.status(400).json({ message: "Invalid learner id" });
    }

    // Forward authorization token for AI Service calls
    const authToken = req.headers.authorization;
    const analytics = await progressAnalyticsService.getProgressAnalytics(learnerId, authToken);
    return res.json(analytics);
  } catch (err) {
    console.error("Error getProgressAnalytics: - learnerController.js", err);
    return res.status(500).json({ message: "Server error" });
  }
}
