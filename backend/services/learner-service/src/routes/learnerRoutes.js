import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import * as learnerCtrl from "../controllers/learnerController.js";
import * as speakingPracticeCtrl from "../controllers/speakingPracticeController.js";
import * as storyCtrl from "../controllers/storyController.js";
import * as dictionaryCtrl from "../controllers/dictionaryController.js";
import * as scenarioCtrl from "../controllers/scenarioController.js";
// Assistant AI routes moved to AI Service
import * as scheduleCtrl from "../controllers/scheduleController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Tìm project root (đi lên từ learner-service/src/routes đến root)
 */
function getProjectRoot() {
  // __dirname = backend/services/learner-service/src/routes
  // Đi lên 4 cấp: routes -> src -> learner-service -> services -> backend
  return path.resolve(__dirname, "..", "..", "..", "..");
}

const router = express.Router();

/**
 * NOTE: đặt các route có path tĩnh / nhiều segment trước route động "/:id"
 * để tránh bị bắt nhầm bởi route param "/:id".
 */

/* ===== Public Challenge Routes ===== */
router.get("/challenges", learnerCtrl.listAllChallenges);
router.get("/challenges/:id", learnerCtrl.getChallengeById);

/* ===== Multer config để nhận file ===== */
// Ensure uploads directory exists at backend/uploads
const backendDir = getProjectRoot();
const uploadsDir = path.resolve(backendDir, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  }
});

const upload = multer({ storage: storage }); // lưu file vào thư mục uploads/

/* ===== Lookup by user / resource download (static-like) ===== */
router.get("/by-user/:userId", learnerCtrl.getLearnerByUserId);
router.get("/:learnerId/resource/:resourceId/download", learnerCtrl.downloadLearnerResource);

/* ===== Purchases / Mentor (specific before generic :id) ===== */
router.get("/:id/purchases", learnerCtrl.getPurchases);
router.get("/:id/latest-purchase", learnerCtrl.getLatestPurchase);
router.get("/:id/mentor", learnerCtrl.getMentorByLearnerId);

/* ===== Learners CRUD ===== */
router.get("/", learnerCtrl.getAll);        // Lấy danh sách learners
router.post("/", learnerCtrl.create);      // Tạo learner mới

router.get("/:id", learnerCtrl.getById);   // Lấy learner theo ID
router.put("/:id", learnerCtrl.update);    // Cập nhật learner
router.delete("/:id", learnerCtrl.remove); // Xóa learner

/* ===== Progress Analytics ===== */
router.get("/:learnerId/progress-analytics", learnerCtrl.getProgressAnalytics);

/* ===== Schedules (Lịch học) ===== */
router.get("/:learnerId/schedules", scheduleCtrl.getLearnerSchedules);
router.get("/schedules/:scheduleId", scheduleCtrl.getScheduleById);

/* ===== Challenges & Submissions ===== */
router.get("/:learnerId/challenges", learnerCtrl.getLearnerChallenges);
router.get("/:learnerId/challenges/bookmarked", learnerCtrl.getBookmarkedChallenges);
router.post("/:learnerId/challenges/:challengeId/bookmark", learnerCtrl.toggleBookmark);
router.delete("/:learnerId/challenges/:challengeId/bookmark", learnerCtrl.toggleBookmark);
router.get("/:learnerId/submissions", learnerCtrl.listSubmissionsForLearner);
router.post("/submissions/:id/analyze", learnerCtrl.analyzeSubmission);
// ✅ dùng upload.single("file") để parse form-data có file + field text
router.post("/submissions", upload.single("file"), learnerCtrl.createSubmission);
router.get("/submissions/:id/analysis", learnerCtrl.getSubmissionAnalysis);

router.get("/submissions/:id", learnerCtrl.getSubmissionById);

/* ===== Learner Feedback & Reports ===== */
router.get("/:learnerId/mentor/feedback-status", learnerCtrl.getMentorFeedbackStatus);
router.get("/:learnerId/mentor/feedbacks", learnerCtrl.getLearnerFeedbacksForMentor);
router.post("/:learnerId/mentor/feedback", learnerCtrl.createLearnerFeedbackForMentor);
router.post("/:learnerId/mentor/report", upload.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), learnerCtrl.reportMentor);

/* ===== Speaking Practice ===== */
// Practice mode routes
router.get("/speaking-practice/incomplete-session", speakingPracticeCtrl.getIncompleteSession);
router.post("/speaking-practice/sessions", speakingPracticeCtrl.createPracticeSession);
router.get("/speaking-practice/sessions/:sessionId/prompt", speakingPracticeCtrl.getPrompt);
router.post("/speaking-practice/sessions/:sessionId/rounds", upload.single("audio"), speakingPracticeCtrl.saveRound);
router.get("/speaking-practice/sessions/:sessionId/rounds", speakingPracticeCtrl.getRoundsForSession);
router.get("/speaking-practice/sessions/:sessionId/rounds/:roundId/analysis", speakingPracticeCtrl.getRoundAnalysis);
router.post("/speaking-practice/sessions/:sessionId/rounds/:roundId/translation", speakingPracticeCtrl.checkTranslation);
router.post("/learners/speaking-practice/rounds/:roundId/word-meanings", speakingPracticeCtrl.saveWordMeanings);
router.post("/speaking-practice/sessions/:sessionId/analyze-and-summary", speakingPracticeCtrl.analyzeAndSummary);
router.post("/speaking-practice/sessions/:sessionId/save-to-history", speakingPracticeCtrl.saveToHistory);
router.get("/speaking-practice/sessions/:sessionId/summary", speakingPracticeCtrl.getSummary);
router.get("/speaking-practice/recent-activities", speakingPracticeCtrl.getRecentActivities);
router.get("/speaking-practice/competition-score", speakingPracticeCtrl.getCurrentCompetitionScore);
router.get("/speaking-practice/weekly-history", speakingPracticeCtrl.getWeeklyHistory);
router.get("/speaking-practice/top-ratings", speakingPracticeCtrl.getTopRatings);

// TTS routes (cho story mode)
router.post("/tts/generate", storyCtrl.generateTTS);

// Story mode routes
router.post("/speaking-practice/story/sessions", storyCtrl.createStorySession);
router.get("/speaking-practice/story/sessions/:session_id/history", storyCtrl.getStoryHistory);
router.post("/speaking-practice/story/message", upload.single("audio"), storyCtrl.processStoryMessage);

// Dictionary route
router.get("/dictionary/:word", dictionaryCtrl.getWordDefinition);

// NOTE: Assistant AI routes have been moved to AI Service
// Use /api/ai/assistant-ai/* endpoints instead

// Scenario-based speaking practice routes
router.get("/speaking-practice/scenarios", scenarioCtrl.getScenarios);
router.get("/speaking-practice/scenario/incomplete-session", scenarioCtrl.getIncompleteScenarioSession);
router.post("/speaking-practice/scenario/sessions", scenarioCtrl.createScenarioSession);
router.post("/speaking-practice/scenario/sessions/:sessionId/start", scenarioCtrl.startConversation);
router.post("/speaking-practice/scenario/sessions/:sessionId/message", upload.single("audio"), scenarioCtrl.sendMessage);
router.get("/speaking-practice/scenario/sessions/:sessionId/hint", scenarioCtrl.getHint);
router.post("/speaking-practice/scenario/sessions/:sessionId/evaluate", scenarioCtrl.evaluateFinalScore);

export default router;
