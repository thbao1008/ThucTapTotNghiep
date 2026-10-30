// Mentor Controller
import * as mentorService from "../services/mentorService.js";
import * as mentorAiService from "../services/mentorAiService.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../config/db.js";

function getProjectRoot() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "..", "..", "..", "..");
}

/**
 * Lấy mentorId từ user ID trong JWT (req.user.id).
 * Admin bypass — trả null để không giới hạn ownership.
 */
async function getOwnMentorId(req) {
  if (req.user?.role?.toLowerCase() === 'admin') return null;
  const result = await pool.query("SELECT id FROM mentors WHERE user_id = $1", [req.user.id]);
  return result.rows[0]?.id || null;
}

/** Kiểm tra kết quả ownership check và trả 403 nếu forbidden */
function checkOwnershipResult(result, res) {
  if (result && result.forbidden === true) {
    res.status(403).json({ message: "Bạn không có quyền thao tác với tài nguyên này" });
    return true;
  }
  return false;
}

/* ========== Mentor CRUD ========== */

export async function createMentor(req, res) {
  try {
    const result = await mentorService.createMentor(req.body);
    res.status(201).json({ message: "Mentor created", ...result });
  } catch (err) {
    console.error("createMentor error - mentor-service mentorController.js:12", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getAllMentors(req, res) {
  try {
    const mentors = await mentorService.getAllMentors();
    res.json({ mentors });
  } catch (err) {
    console.error("getAllMentors error - mentor-service mentorController.js:22", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getMentorById(req, res) {
  try {
    const mentor = await mentorService.getMentorById(req.params.id);
    if (!mentor) return res.status(404).json({ message: "Mentor not found" });
    res.json({ mentor });
  } catch (err) {
    console.error("getMentorById error - mentor-service mentorController.js:33", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function updateMentor(req, res) {
  try {
    await mentorService.updateMentor(req.params.id, req.body);
    res.json({ message: "Mentor updated" });
  } catch (err) {
    console.error("updateMentor error - mentor-service mentorController.js:43", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function updateOwnProfile(req, res) {
  const body = req.body;
  if (!body || typeof body.bio !== 'string' || body.bio.length > 4000 || Object.keys(body).some(key => key !== 'bio')) {
    return res.status(400).json({ message: 'Provide a bio of up to 4000 characters.' });
  }
  try {
    const { rows: [mentor] } = await pool.query(
      'UPDATE mentors SET bio=$1 WHERE id=$2 AND user_id=$3 RETURNING id,bio',
      [body.bio.trim(), req.params.id, req.user.id]
    );
    if (!mentor) return res.status(404).json({ message: 'Mentor not found' });
    return res.json({ mentor });
  } catch {
    return res.status(503).json({ message: 'Unable to save your profile. Please try again.' });
  }
}

export async function removeMentor(req, res) {
  try {
    await mentorService.removeMentor(req.params.id);
    res.json({ message: "Mentor deleted" });
  } catch (err) {
    console.error("removeMentor error - mentor-service mentorController.js:53", err);
    res.status(500).json({ message: "Server error" });
  }
}

/* ========== Learners ========== */

export async function getLearnersByMentor(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Mentor ID không hợp lệ" });
    }
    const learners = await mentorService.getLearnersByMentor(id);
    res.json({ learners });
  } catch (err) {
    console.error("getLearnersByMentor error - mentor-service mentorController.js:69", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getAssignedLearnerProgress(req, res) {
  try {
    const learnerId = Number(req.params.learnerId);
    if (!Number.isSafeInteger(learnerId) || learnerId <= 0) {
      return res.status(400).json({ error: "Invalid learner id" });
    }
    const progress = await mentorService.getAssignedLearnerProgress(learnerId, req.mentorId);
    if (!progress) return res.status(404).json({ message: "Learner not found" });
    return res.json(progress);
  } catch (err) {
    console.error("getAssignedLearnerProgress error - mentor-service", err);
    return res.status(500).json({ error: "Server error" });
  }
}

export async function getMentorByUserId(req, res) {
  try {
    const userId = req.params.userId;
    if (!userId) return res.status(400).json({ message: "Missing userId" });

    const mentor = await mentorService.getMentorByUserId(userId);
    if (!mentor) return res.status(404).json({ message: "Mentor not found for this userId" });
    res.json({ mentor_id: mentor.mentor_id, ...mentor });
  } catch (err) {
    console.error("getMentorByUserId error - mentor-service mentorController.js:83", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function updateLearnerNote(req, res) {
  try {
    if(typeof req.body.note!=='string'||req.body.note.length>5000)return res.status(400).json({message:'Ghi chú cần là văn bản tối đa 5000 ký tự.'});
    const learner = await mentorService.updateLearnerNote(req.params.learnerId, req.body.note, req.mentorId);
    if (!learner) return res.status(404).json({ message: "Learner not found" });
    res.json({ learner });
  } catch (err) {
    console.error("updateLearnerNote error - mentor-service mentorController.js:94", err);
    res.status(500).json({ message: "Server error" });
  }
}

/* ========== Resources ========== */

export async function getResources(req, res) {
  try {
    const resources = await mentorService.getResourcesByMentor(req.params.id);
    // Format file_url to absolute URL (giống code cũ trong src)
    // Sử dụng x-forwarded-host và x-forwarded-proto từ API Gateway
    const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
    const host = req.get("x-forwarded-host") || req.get("host") || "localhost:4000";
    const baseUrl = `${protocol}://${host}`;
    const formatted = resources.map(r => ({
      ...r,
      file_url: r.file_url?.startsWith("/") ? `${baseUrl}${r.file_url}` : r.file_url
    }));
    res.json({ resources: formatted });
  } catch (err) {
    console.error("getResources error - mentor-service mentorController.js:112", err);
    res.status(500).json({ message: err.message });
  }
}

export async function getPublishedResources(req, res) {
  try {
    const resources = await mentorService.getResourcesByMentor(req.params.id, false);
    // Format file_url to absolute URL (giống code cũ trong src)
    // Sử dụng x-forwarded-host và x-forwarded-proto từ API Gateway
    const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
    const host = req.get("x-forwarded-host") || req.get("host") || "localhost:4000";
    const baseUrl = `${protocol}://${host}`;
    const formatted = resources.map(r => ({
      ...r,
      file_url: r.file_url?.startsWith("/") ? `${baseUrl}${r.file_url}` : r.file_url
    }));
    res.json({ resources: formatted });
  } catch (err) {
    console.error("getPublishedResources error - mentor-service mentorController.js", err);
    res.status(500).json({ message: err.message });
  }
}

export async function createResource(req, res) {
  try {
    console.log(`[createResource] Request received: mentorId=${req.params.id}, hasFile=${!!req.file}, fileField=${req.file?.fieldname}, filename=${req.file?.filename}`);

    let file_url = req.body.file_url;
    if (req.file) {
      // Verify file was saved
      const backendDir = getProjectRoot();
      const uploadsDir = path.resolve(backendDir, "uploads");
      const filePath = path.join(uploadsDir, req.file.filename);

      console.log(`[createResource] Checking file: path=${filePath}, exists=${fs.existsSync(filePath)}`);

      if (!fs.existsSync(filePath)) {
        console.error(`[createResource] File was not saved! Path: ${filePath}`);
        console.error(`[createResource] req.file:`, JSON.stringify({
          filename: req.file.filename,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          path: req.file.path
        }, null, 2));
        return res.status(500).json({ error: "File upload failed - file not saved", path: filePath });
      }

      console.log(`[createResource] File uploaded successfully: ${req.file.filename}, path: ${filePath}, size: ${fs.statSync(filePath).size} bytes`);
      file_url = `/uploads/${req.file.filename}`;
    } else {
      console.log(`[createResource] No file in request, using existing file_url: ${file_url}`);
    }

    const resource = await mentorService.createResource({
      mentor_id: req.params.id,
      title: req.body.title,
      description: req.body.description,
      type: req.body.type,
      file_url: file_url,
      is_published: req.body.is_published !== undefined ? req.body.is_published === 'true' || req.body.is_published === true : true
    });

    // Format file_url to absolute URL (giống code cũ trong src)
    // Sử dụng x-forwarded-host và x-forwarded-proto từ API Gateway
    const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
    const host = req.get("x-forwarded-host") || req.get("host") || "localhost:4000";
    const baseUrl = `${protocol}://${host}`;
    const formatted = {
      ...resource,
      file_url: resource.file_url?.startsWith("/") ? `${baseUrl}${resource.file_url}` : resource.file_url
    };
    res.json({ resource: formatted });
  } catch (err) {
    console.error("createResource error - mentor-service mentorController.js:158", err);
    res.status(500).json({ message: err.message });
  }
}

export async function updateResource(req, res) {
  try {
    const fields = {};

    if (req.file) {
      fields.file_url = `/uploads/${req.file.filename}`;
    }

    if (req.body.title !== undefined) fields.title = req.body.title;
    if (req.body.description !== undefined) fields.description = req.body.description;
    if (req.body.type !== undefined) fields.type = req.body.type;
    if (req.body.is_published !== undefined) {
      fields.is_published = req.body.is_published === 'true' || req.body.is_published === true;
    }

    const ownMentorId = await getOwnMentorId(req);
    const resource = await mentorService.updateResource(req.params.id, fields, ownMentorId);

    if (checkOwnershipResult(resource, res)) return;
    if (!resource) return res.status(404).json({ message: "Resource not found" });

    // Format file_url to absolute URL (giống code cũ trong src)
    // Sử dụng x-forwarded-host và x-forwarded-proto từ API Gateway
    const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
    const host = req.get("x-forwarded-host") || req.get("host") || "localhost:4000";
    const baseUrl = `${protocol}://${host}`;
    const formatted = {
      ...resource,
      file_url: resource.file_url?.startsWith("/") ? `${baseUrl}${resource.file_url}` : resource.file_url
    };
    res.json({ resource: formatted });
  } catch (err) {
    console.error("updateResource error - mentor-service mentorController.js:190", err);
    res.status(500).json({ message: err.message });
  }
}

export async function deleteResource(req, res) {
  try {
    const ownMentorId = await getOwnMentorId(req);
    const result = await mentorService.deleteResource(req.params.id, ownMentorId);
    if (checkOwnershipResult(result, res)) return;
    if (!result) return res.status(404).json({ message: "Resource not found" });
    res.json({ message: "Resource deleted" });
  } catch (err) {
    console.error("deleteResource error - mentor-service mentorController.js:200", err);
    res.status(500).json({ message: err.message });
  }
}

export async function toggleResourceVisibility(req, res) {
  try {
    const { id } = req.params;
    const { is_published } = req.body;
    const ownMentorId = await getOwnMentorId(req);
    const updated = await mentorService.toggleResourceVisibility(id, is_published, ownMentorId);
    if (checkOwnershipResult(updated, res)) return;
    if (!updated) return res.status(404).json({ message: "Resource not found" });
    res.json({ resource: updated });
  } catch (err) {
    console.error("toggleResourceVisibility error:", err);
    res.status(500).json({ message: err.message });
  }
}

/* ========== Report ========== */

export async function mentorCreateReport(req, res) {
  try {
    const { target_id, content } = req.body;
    if (!req.user?.id || !req.assignedLearnerId || !target_id || !content?.trim()) {
      return res.status(400).json({ message: "Missing assigned learner or report content" });
    }

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

    const report = await mentorService.mentorCreateReport({
      reporter_id: req.user.id,
      target_id,
      content,
      image_url,
      video_url
    });
    res.json({ report });
  } catch (err) {
    console.error("mentorCreateReport error - mentor-service mentorController.js:246", err);
    if (err.canReport === false) {
      return res.status(400).json({
        message: err.message,
        canReport: false,
        hoursRemaining: err.hoursRemaining
      });
    }
    if (err.message && err.message.includes("24 giờ")) {
      return res.status(400).json({ message: err.message });
    }
    // Removed: Allow updating existing reports instead of blocking
    res.status(500).json({ message: "Server error" });
  }
}

/* ========== Topics & Challenges ========== */

export async function getTopicsByMentor(req, res) {
  const { id } = req.params;
  try {
    const mentorId = parseInt(id);
    if (isNaN(mentorId)) {
      return res.status(400).json({ message: "Mentor ID không hợp lệ" });
    }
    const topics = await mentorService.getTopicsByMentor(mentorId);
    res.json({ topics });
  } catch (err) {
    console.error("getTopicsByMentor error - mentor-service mentorController.js:276", err);
    res.status(500).json({ message: "Không thể lấy topics" });
  }
}

export async function createTopic(req, res) {
  const { id } = req.params;
  const { title, description, level } = req.body;
  try {
    const mentorId = parseInt(id);
    if (isNaN(mentorId)) {
      return res.status(400).json({ message: "Mentor ID không hợp lệ" });
    }
    const topic = await mentorService.createTopic(mentorId, title, description, level);
    res.json({ topic });
  } catch (err) {
    console.error("createTopic error - mentor-service mentorController.js:292", err);
    res.status(500).json({ message: "Không thể tạo topic" });
  }
}

export async function getChallengesByTopic(req, res) {
  const { topicId } = req.params;
  try {
    const tid = parseInt(topicId);
    if (isNaN(tid)) {
      return res.status(400).json({ message: "Topic ID không hợp lệ" });
    }
    const challenges = await mentorService.getChallengesByTopic(tid);
    res.json({ challenges });
  } catch (err) {
    console.error("getChallengesByTopic error - mentor-service mentorController.js:307", err);
    res.status(500).json({ message: "Không thể lấy challenges" });
  }
}

export async function getChallengesByMentor(req, res) {
  const { mentorId } = req.params;
  try {
    const mid = parseInt(mentorId);
    if (isNaN(mid)) {
      return res.status(400).json({ message: "Mentor ID không hợp lệ" });
    }
    const challenges = await mentorService.getChallengesByMentor(mid);
    res.json({ challenges });
  } catch (err) {
    console.error("getChallengesByMentor error - mentor-service mentorController.js", err);
    res.status(500).json({ message: "Không thể lấy challenges" });
  }
}

export async function createChallenge(req, res) {
  const { mentorId } = req.params;
  const { title, description, type, level, created_by } = req.body;
  try {
    const mid = parseInt(mentorId);
    if (isNaN(mid)) {
      return res.status(400).json({ message: "Mentor ID không hợp lệ" });
    }
    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ message: "Tiêu đề và nội dung không được để trống" });
    }
    const challenge = await mentorService.createChallenge(mid, title, description, type || "speaking", level || "medium", created_by);
    res.json({ challenge });
  } catch (err) {
    console.error("createChallenge error - mentor-service mentorController.js", err);
    res.status(500).json({ message: "Không thể tạo challenge", error: err.message });
  }
}

export async function deleteTopic(req, res) {
  try {
    const topicId = req.params.topicId;
    const ownMentorId = await getOwnMentorId(req);
    const deleted = await mentorService.deleteTopic(topicId, ownMentorId);
    if (deleted && deleted.forbidden) {
      return res.status(403).json({ message: "Bạn không có quyền xóa topic này" });
    }
    if (!deleted) {
      return res.status(404).json({ message: "Topic not found" });
    }
    res.json({ message: "Topic deleted successfully" });
  } catch (err) {
    console.error("deleteTopic error - mentor-service mentorController.js:355", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function deleteChallenge(req, res, next) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Thiếu id challenge" });
    }
    const ownMentorId = await getOwnMentorId(req);
    const deleted = await mentorService.deleteChallenge(id, ownMentorId);
    if (deleted && deleted.forbidden) {
      return res.status(403).json({ error: "Bạn không có quyền xóa challenge này" });
    }
    if (!deleted) {
      return res.status(404).json({ error: "Challenge không tồn tại" });
    }
    return res.status(200).json({ ok: true, deletedId: Number(id) });
  } catch (err) {
    console.error("deleteChallenge error - mentor-service mentorController.js:372", err);
    next(err);
  }
}

/* ========== AI endpoints ========== */

export async function createChallengeAI(req, res) {
  try {
    const { topicId } = req.params;
    const { prompt, level, learner } = req.body || {};
    const saved = await mentorService.createChallengeAI(topicId, prompt, level);
    return res.json({ challenge: saved });
  } catch (err) {
    console.error("createChallengeAI error - mentor-service mentorController.js:386", err);
    return res.status(500).json({ message: "AI tạo challenge thất bại", error: err.message });
  }
}

export async function editChallengeAI(req, res) {
  try {
    const { id } = req.params;
    const { content } = req.body;
    if (!id) return res.status(400).json({ message: "Thiếu id challenge" });
    const result = await mentorService.editChallengeAI(id, content);

    if (result?.issues && result.issues.length > 0) {
      return res.json({ challenge: result.challenge, issues: result.issues });
    }

    return res.json({ challenge: result.challenge });
  } catch (err) {
    console.error("editChallengeAI error - mentor-service mentorController.js:404", err);
    return res.status(500).json({ message: "AI cải thiện thất bại", error: err.message });
  }
}

export async function chatWithAI(req, res) {
  try {
    const { message, context } = req.body || {};
    const suggestion = await mentorAiService.chatWithAI(message, context);
    return res.json({ suggestion });
  } catch (err) {
    console.error("chatWithAI error - mentor-service mentorController.js:416", err);
    return res.status(500).json({ message: "AI chat thất bại", error: err.message });
  }
}

export async function updateChallenge(req, res) {
  try {
    const { id } = req.params;
    const { title, description, type, level } = req.body;

    if (!id) return res.status(400).json({ message: "Thiếu id challenge" });

    const ownMentorId = await getOwnMentorId(req);
    const updated = await mentorService.updateChallenge(id, { title, description, type, level }, ownMentorId);

    if (checkOwnershipResult(updated, res)) return;
    if (!updated) return res.status(404).json({ message: "Challenge not found" });

    return res.json({ challenge: updated });
  } catch (err) {
    console.error("updateChallenge error - mentor-service mentorController.js:431", err);
    return res.status(500).json({ message: "Không thể cập nhật challenge", error: err.message });
  }
}

export async function improveChallengeDraft(req, res) {
  try {
    const { content } = req.body || {};
    if (!content) return res.status(400).json({ message: "Thiếu content để AI cải thiện" });

    const aiResult = await mentorAiService.editChallengeAI(content, "");
    const issues = aiResult?.issues || [];
    return res.json({ challenge: aiResult, issues });
  } catch (err) {
    console.error("improveChallengeDraft error - mentor-service mentorController.js:445", err);
    return res.status(500).json({ message: "AI cải thiện thất bại", error: err.message });
  }
}

/* ========== Submissions & Reviews ========== */

export async function getSubmission(req, res) {
  try {
    const submissionId = req.params.id;
    const mentorId = req.params.mentorId;
    if (!mentorId) return res.status(400).json({ error: "Missing mentorId in path" });

    const result = await mentorService.getSubmissionForMentor(submissionId, mentorId);
    if (!result) return res.status(404).json({ error: "Submission not found" });
    if (!result.allowed) return res.status(403).json({ error: "Forbidden: learner not assigned to this mentor" });

    // Format audio_url to absolute URL (giống code cũ trong src)
    // Sử dụng x-forwarded-host và x-forwarded-proto từ API Gateway
    const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
    const host = req.get("x-forwarded-host") || req.get("host") || "localhost:4000";
    const baseUrl = `${protocol}://${host}`;

    // Format submission audio_url (learner's audio)
    if (result.submission?.audio_url) {
      const audioUrl = result.submission.audio_url;
      // If it's already an absolute URL with wrong port, convert to relative path
      // Otherwise, if it's relative, make it absolute
      if (/^https?:\/\//i.test(audioUrl)) {
        // Extract path from absolute URL
        try {
          const urlObj = new URL(audioUrl);
          result.submission.audio_url = urlObj.pathname;
          result.submission.audioUrl = urlObj.pathname;
        } catch (e) {
          // If URL parsing fails, keep as is
        }
      } else if (audioUrl.startsWith("/")) {
        // Relative path - keep as is (frontend will normalize)
        result.submission.audio_url = audioUrl;
        result.submission.audioUrl = audioUrl;
      }
    }

    // Format mentor review audio_url
    if (result.submission?.mentor_review?.audio_url) {
      const audioUrl = result.submission.mentor_review.audio_url;
      if (/^https?:\/\//i.test(audioUrl)) {
        // Extract path from absolute URL
        try {
          const urlObj = new URL(audioUrl);
          result.submission.mentor_review.audio_url = urlObj.pathname;
        } catch (e) {
          // If URL parsing fails, keep as is
        }
      }
      result.submission.mentor_audio_play_url = result.submission.mentor_review.audio_url;
    } else {
      result.submission.mentor_audio_play_url = null;
    }

    return res.json({ submission: result.submission, challenge: result.challenge });
  } catch (err) {
    console.error("mentorController.getSubmission error - mentor-service mentorController.js:476", err);
    return res.status(500).json({ error: "Server error" });
  }
}

export async function listSubmissions(req, res) {
  try {
    const mentorId = req.params.mentorId;
    if (!mentorId) return res.status(400).json({ error: "Missing mentorId in path" });

    const limit = Math.min(200, Number(req.query.limit) || 50);
    const offset = Number(req.query.offset) || 0;
    const rows = await mentorService.listSubmissionsForMentor(mentorId, { limit, offset });
    return res.json({ submissions: rows });
  } catch (err) {
    console.error("mentorController.listSubmissions error - mentor-service mentorController.js:494", err);
    return res.status(500).json({ error: "Server error" });
  }
}

export async function postReview(req, res) {
  try {
    const submissionId = req.params.id;
    const mentorId = req.params.mentorId;
    if (!mentorId) return res.status(400).json({ error: "Missing mentorId in path" });

    const normalizedSubmissionId = Number(submissionId);
    if (!Number.isSafeInteger(normalizedSubmissionId) || normalizedSubmissionId <= 0) {
      return res.status(400).json({ error: "Invalid submission id" });
    }
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ error: "Invalid review payload" });
    }
    const reviewFields = ["final_score", "feedback", "pronunciation_score", "fluency_score", "audio_url"];
    if (!reviewFields.some(field => Object.prototype.hasOwnProperty.call(req.body, field))) {
      return res.status(400).json({ error: "At least one review field is required" });
    }

    const { final_score, feedback, pronunciation_score, fluency_score, audio_url } = req.body;
    if (feedback !== undefined && feedback !== null && typeof feedback !== "string") {
      return res.status(400).json({ error: "Feedback must be a string" });
    }

    function isValidAudioUrl(u) {
      if (!u) return true;
      try {
        const parsed = new URL(u);
        const baseHost = (process.env.BASE_URL && new URL(process.env.BASE_URL).hostname) || `localhost`;
        return parsed.pathname.startsWith("/uploads/") && parsed.hostname === baseHost;
      } catch (e) {
        return typeof u === "string" && u.startsWith("/uploads/");
      }
    }
    if (audio_url && !isValidAudioUrl(audio_url)) {
      return res.status(400).json({ error: "Invalid audio_url" });
    }

    const payload = {
      final_score,
      feedback,
      pronunciation_score,
      fluency_score,
      audio_url
    };

    const result = await mentorService.saveMentorReview(normalizedSubmissionId, mentorId, payload);
    if (!result.ok) return res.status(result.status || 400).json({ error: result.message || "Cannot save review" });

    return res.json({
      success: true,
      review: result.review,
      feedback_id: result.feedback_id
    });
  } catch (err) {
    console.error("mentorController.postReview error - mentor-service mentorController.js:544", err);
    if (err.code === "MENTOR_SCORE_INVALID") {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: "Server error" });
  }
}

export async function listReviews(req, res) {
  try {
    const mentorId = req.params.mentorId;
    if (!mentorId) return res.status(400).json({ error: "Missing mentorId in path" });

    const limit = req.query.limit===undefined?50:Number(req.query.limit);
    const offset = req.query.offset===undefined?0:Number(req.query.offset);
    if(!Number.isSafeInteger(limit)||limit<1||limit>200||!Number.isSafeInteger(offset)||offset<0||offset>2147483647)return res.status(400).json({error:'Invalid pagination'});
    const rows = await mentorService.listReviewsByMentor(mentorId, { limit, offset });
    return res.json({ reviews: rows });
  } catch (err) {
    console.error("mentorController.listReviews error - mentor-service mentorController.js:562", err);
    return res.status(500).json({ error: "Server error" });
  }
}
