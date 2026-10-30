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
import pool from "../config/db.js";
import { createLearnerAccessGuards } from "../middleware/learnerAccess.js";
import { createSubmissionAnalysisRouter } from "./submissionAnalysisRoutes.js";
import { createAudioUploadRouter } from "./audioUploadRoutes.js";
import { createWeeklyGoalRouter } from "./weeklyGoalRoutes.js";
import { createScenarioWorldRouter } from './scenarioWorldRoutes.js';
import { callGroq } from '../utils/aiServiceClient.js';
import { createChallengeTranslationRouter } from './challengeTranslationRoutes.js';

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
router.use(createChallengeTranslationRouter({pool,callAI:callGroq}));
router.use(createWeeklyGoalRouter({ pool }));
router.use(createScenarioWorldRouter({ pool, callAI: callGroq, persistent: true }));
const { adminOnly, ownRecord, selfLearner } = createLearnerAccessGuards({ pool });
const ownPracticeSession = ownRecord("practiceSession", req => req.params.sessionId);
const ownPracticeRound = ownRecord("practiceRound", req => req.params.roundId);
const ownScenarioSession = ownRecord("scenarioSession", req => req.params.sessionId);
const ownStorySession = ownRecord("storySession", req => req.params.session_id ?? req.body.session_id);
const ownSubmission = ownRecord("submission", req => req.params.id);
const ownSchedule = ownRecord("schedule", req => req.params.scheduleId);

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

const upload = multer({ storage }); // Used by non-audio report and story routes.

/* ===== Lookup by user / resource download (static-like) ===== */
router.get("/by-user/:userId", selfLearner({ userParam: "userId" }), learnerCtrl.getLearnerByUserId);
router.get("/:learnerId/resource/:resourceId/download", selfLearner({ learnerParam: "learnerId" }), learnerCtrl.downloadLearnerResource);

/* ===== Purchases / Mentor (specific before generic :id) ===== */
router.get("/:id/purchases", selfLearner({ learnerParam: "id", allowAdmin: true }), learnerCtrl.getPurchases);
router.get("/:id/latest-purchase", selfLearner({ learnerParam: "id", allowAdmin: true }), learnerCtrl.getLatestPurchase);
router.get("/:id/mentor", selfLearner({ learnerParam: "id", allowAdmin: true }), learnerCtrl.getMentorByLearnerId);

/* ===== Learners CRUD ===== */
router.get("/", adminOnly, learnerCtrl.getAll);        // Lấy danh sách learners
router.post("/", adminOnly, learnerCtrl.create);      // Tạo learner mới

router.get("/:id", selfLearner({ learnerParam: "id", allowAdmin: true }), learnerCtrl.getById);   // Lấy learner theo ID
router.put("/:id", selfLearner({ learnerParam: "id", allowAdmin: true }), learnerCtrl.update);    // Cập nhật learner
router.delete("/:id", adminOnly, learnerCtrl.remove); // Xóa learner

/* ===== Progress Analytics ===== */
router.get("/:learnerId/progress-analytics", selfLearner({ learnerParam: "learnerId", allowAdmin: true }), learnerCtrl.getProgressAnalytics);

/* ===== Schedules (Lịch học) ===== */
router.get("/:learnerId/schedules", selfLearner({ learnerParam: "learnerId" }), scheduleCtrl.getLearnerSchedules);
router.get("/schedules/:scheduleId", ownSchedule, scheduleCtrl.getScheduleById);

/* ===== Challenges & Submissions ===== */
router.get("/:learnerId/challenges", selfLearner({ learnerParam: "learnerId" }), learnerCtrl.getLearnerChallenges);
router.get("/:learnerId/challenges/bookmarked", selfLearner({ learnerParam: "learnerId" }), learnerCtrl.getBookmarkedChallenges);
router.post("/:learnerId/challenges/:challengeId/bookmark", selfLearner({ learnerParam: "learnerId" }), learnerCtrl.toggleBookmark);
router.delete("/:learnerId/challenges/:challengeId/bookmark", selfLearner({ learnerParam: "learnerId" }), learnerCtrl.toggleBookmark);
router.get("/:learnerId/submissions", selfLearner({ learnerParam: "learnerId" }), learnerCtrl.listSubmissionsForLearner);
router.use(createSubmissionAnalysisRouter({
  pool,
  handler: learnerCtrl.analyzeSubmission
}));
// ✅ dùng upload.single("file") để parse form-data có file + field text
router.use(createAudioUploadRouter({
  pool,
  submissionHandler: learnerCtrl.createSubmission,
  uploadsDir
}));
router.get("/submissions/:id/analysis", ownSubmission, learnerCtrl.getSubmissionAnalysis);

/* ===== Learner Feedback & Reports ===== */
router.get("/:learnerId/mentor/feedback-status", selfLearner({ learnerParam: "learnerId" }), learnerCtrl.getMentorFeedbackStatus);
router.get("/:learnerId/mentor/feedbacks", selfLearner({ learnerParam: "learnerId" }), learnerCtrl.getLearnerFeedbacksForMentor);
router.post("/:learnerId/mentor/feedback", selfLearner({ learnerParam: "learnerId" }), learnerCtrl.createLearnerFeedbackForMentor);
router.post("/:learnerId/mentor/report", selfLearner({ learnerParam: "learnerId" }), upload.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), learnerCtrl.reportMentor);

/* ===== Speaking Practice ===== */
// Practice mode routes
router.get("/speaking-practice/incomplete-session", selfLearner(), speakingPracticeCtrl.getIncompleteSession);
router.post("/speaking-practice/sessions", selfLearner(), speakingPracticeCtrl.createPracticeSession);
router.post("/speaking-practice/sessions/:sessionId/end", ownPracticeSession, speakingPracticeCtrl.endPracticeSession);
router.get("/speaking-practice/sessions/:sessionId/prompt", ownPracticeSession, speakingPracticeCtrl.getPrompt);
router.get("/speaking-practice/sessions/:sessionId/rounds", ownPracticeSession, speakingPracticeCtrl.getRoundsForSession);
router.get("/speaking-practice/sessions/:sessionId/rounds/:roundId/analysis", ownPracticeSession, speakingPracticeCtrl.getRoundAnalysis);
router.post("/speaking-practice/sessions/:sessionId/rounds/:roundId/translation", ownPracticeSession, speakingPracticeCtrl.checkTranslation);
router.post("/speaking-practice/sessions/:sessionId/analyze-and-summary", ownPracticeSession, speakingPracticeCtrl.analyzeAndSummary);
router.post("/speaking-practice/sessions/:sessionId/save-to-history", ownPracticeSession, speakingPracticeCtrl.saveToHistory);
router.get("/speaking-practice/sessions/:sessionId/summary", ownPracticeSession, speakingPracticeCtrl.getSummary);
router.get("/speaking-practice/recent-activities", selfLearner(), speakingPracticeCtrl.getRecentActivities);
router.get("/speaking-practice/competition-score", selfLearner(), speakingPracticeCtrl.getCurrentCompetitionScore);
router.get("/speaking-practice/weekly-history", selfLearner(), speakingPracticeCtrl.getWeeklyHistory);
router.get("/speaking-practice/top-ratings", speakingPracticeCtrl.getTopRatings);

// TTS routes (cho story mode)
router.post("/tts/generate", storyCtrl.generateTTS);

// Story mode routes
router.get("/speaking-practice/story/active-session", selfLearner(), storyCtrl.getActiveStorySession);
router.post("/speaking-practice/story/sessions", selfLearner(), storyCtrl.createStorySession);
router.get("/speaking-practice/story/sessions/:session_id/history", ownStorySession, storyCtrl.getStoryHistory);
router.post("/speaking-practice/story/message", upload.single("audio"), ownStorySession, storyCtrl.processStoryMessage);

// Dictionary route
router.get("/dictionary/:word", dictionaryCtrl.getWordDefinition);

// NOTE: Assistant AI routes have been moved to AI Service
// Use /api/ai/assistant-ai/* endpoints instead

// Scenario-based speaking practice routes
router.get("/speaking-practice/scenarios", scenarioCtrl.getScenarios);
router.get("/speaking-practice/scenario/incomplete-session", selfLearner(), scenarioCtrl.getIncompleteScenarioSession);
router.post("/speaking-practice/scenario/sessions", selfLearner(), scenarioCtrl.createScenarioSession);
router.get("/speaking-practice/scenario/sessions/:sessionId", ownScenarioSession, scenarioCtrl.getScenarioSession);
router.post("/speaking-practice/scenario/sessions/:sessionId/start", ownScenarioSession, scenarioCtrl.startConversation);
router.post("/speaking-practice/scenario/sessions/:sessionId/message", ownScenarioSession, upload.single("audio"), scenarioCtrl.sendMessage);
router.get("/speaking-practice/scenario/sessions/:sessionId/hint", ownScenarioSession, scenarioCtrl.getHint);
router.post("/speaking-practice/scenario/sessions/:sessionId/evaluate", ownScenarioSession, scenarioCtrl.evaluateFinalScore);

export default router;
