// Mentor Routes
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import * as mentorCtrl from "../controllers/mentorController.js";
import * as scheduleCtrl from "../controllers/scheduleController.js";
import * as dashboardCtrl from "../controllers/mentorDashboardController.js";
import * as challengeAuthoring from "../controllers/challengeAuthoringController.js";
import {
  assignedLearnerByUserGuard,
  assignedLearnerGuard,
  assignedToMentorGuard,
  adminGuard,
  mentorGuard,
  mentorOwnsRecordGuard,
  mentorScopeGuard,
  selfOrAdminUserGuard
} from "../middleware/authGuard.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getProjectRoot() {
  return path.resolve(__dirname, "..", "..", "..", "..");
}

const router = express.Router();

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
    const filename = file.fieldname + "-" + uniqueSuffix + ext;
    cb(null, filename);
  }
});

const upload = multer({ storage: storage });

/* -----------------------------------------------------------------
   PUBLIC (authGuard đã áp dụng ở server.js — đây là sau authGuard)
   ----------------------------------------------------------------- */

// Lookup mentor của user đang đăng nhập (cả mentor tự tra và admin tra)
router.get("/by-user/:userId", selfOrAdminUserGuard("userId"), mentorCtrl.getMentorByUserId);

// Lấy resources đã publish — learner cần xem tài liệu của mentor được gán
router.get("/:id/resources/published", assignedToMentorGuard("id"), mentorCtrl.getPublishedResources);

/* -----------------------------------------------------------------
   ADMIN ONLY — CRUD mentor account (Admin quản trị, không phải Mentor tự tạo)
   ----------------------------------------------------------------- */
router.post("/", adminGuard, mentorCtrl.createMentor);
router.get("/", adminGuard, mentorCtrl.getAllMentors);
router.put("/:id", adminGuard, mentorCtrl.updateMentor);
router.patch("/:id/profile", mentorGuard, mentorScopeGuard('id'), mentorCtrl.updateOwnProfile);
router.delete("/:id", adminGuard, mentorCtrl.removeMentor);

// Admin xem learners của bất kỳ mentor (không bắt scope)
// Mentor xem learners của chính mình (scope check)
router.get("/:id/learners", mentorGuard, mentorScopeGuard('id'), mentorCtrl.getLearnersByMentor);

/* -----------------------------------------------------------------
   MENTOR ONLY — Dashboard (scope check: mentorId phải là mentor mình)
   ----------------------------------------------------------------- */
router.get("/:mentorId/dashboard/stats",
  mentorGuard, mentorScopeGuard('mentorId'), dashboardCtrl.getDashboardStats);
router.get("/:mentorId/dashboard/support",
  mentorGuard, mentorScopeGuard('mentorId'), dashboardCtrl.getSupport);
router.get("/:mentorId/dashboard/pending-submissions",
  mentorGuard, mentorScopeGuard('mentorId'), dashboardCtrl.getPendingSubmissions);
router.get("/:mentorId/dashboard/schedules",
  mentorGuard, mentorScopeGuard('mentorId'), dashboardCtrl.getSchedules);

/* -----------------------------------------------------------------
   MENTOR READ-ONLY — Assigned learning materials
   ----------------------------------------------------------------- */
router.get("/:id/topics", mentorGuard, mentorScopeGuard('id'), mentorCtrl.getTopicsByMentor);
router.get("/topics/:topicId/challenges", mentorGuard, mentorOwnsRecordGuard("topic", "topicId"), mentorCtrl.getChallengesByTopic);
router.get("/:mentorId/challenges", mentorGuard, mentorScopeGuard('mentorId'), mentorCtrl.getChallengesByMentor);
router.post("/:mentorId/challenges", mentorGuard, mentorScopeGuard('mentorId'), challengeAuthoring.createChallenge);
router.post("/:mentorId/challenges/check", mentorGuard, mentorScopeGuard('mentorId'), challengeAuthoring.checkChallenges);
router.put("/challenges/:id", mentorGuard, mentorOwnsRecordGuard("challenge"), challengeAuthoring.updateChallenge);

/* -----------------------------------------------------------------
   MENTOR ONLY — Support resources
   ----------------------------------------------------------------- */
router.get("/:id/resources", mentorGuard, mentorScopeGuard('id'), mentorCtrl.getResources);
router.post("/:id/resources", mentorGuard, mentorScopeGuard('id'), upload.single("file"), mentorCtrl.createResource);
router.put("/resources/:id", mentorGuard, mentorOwnsRecordGuard("resource"), upload.single("file"), mentorCtrl.updateResource);
router.patch("/resources/:id/visibility", mentorGuard, mentorOwnsRecordGuard("resource"), mentorCtrl.toggleResourceVisibility);
router.delete("/resources/:id", mentorGuard, mentorOwnsRecordGuard("resource"), mentorCtrl.deleteResource);

/* -----------------------------------------------------------------
   MENTOR ONLY — Reports (mentor báo cáo)
   ----------------------------------------------------------------- */
router.post("/reports", mentorGuard,
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]),
  assignedLearnerByUserGuard("target_id"),
  mentorCtrl.mentorCreateReport);

/* -----------------------------------------------------------------
   MENTOR ONLY — Learner notes
   ----------------------------------------------------------------- */
router.put("/learners/:learnerId/note", mentorGuard, assignedLearnerGuard("learnerId"), mentorCtrl.updateLearnerNote);
router.get("/learners/:learnerId/progress", mentorGuard, assignedLearnerGuard("learnerId"), mentorCtrl.getAssignedLearnerProgress);

/* -----------------------------------------------------------------
   MENTOR ONLY — Schedules
   ----------------------------------------------------------------- */
router.get("/:mentorId/schedules", mentorGuard, mentorScopeGuard('mentorId'), scheduleCtrl.getMentorSchedules);
router.post("/:mentorId/schedules", mentorGuard, mentorScopeGuard('mentorId'), scheduleCtrl.createSchedule);
router.put("/schedules/:scheduleId", mentorGuard, mentorOwnsRecordGuard("schedule", "scheduleId"), scheduleCtrl.updateSchedule);
router.delete("/schedules/:scheduleId", mentorGuard, mentorOwnsRecordGuard("schedule", "scheduleId"), scheduleCtrl.deleteSchedule);
router.get("/schedules/:scheduleId", mentorGuard, mentorOwnsRecordGuard("schedule", "scheduleId"), scheduleCtrl.getScheduleById);

/* -----------------------------------------------------------------
   PUBLIC — Lấy thông tin mentor (learner cần xem mentor được gán)
   ----------------------------------------------------------------- */
router.get("/:id", mentorCtrl.getMentorById);

/* -----------------------------------------------------------------
   MENTOR ONLY — Submissions & Reviews (scope check)
   ----------------------------------------------------------------- */
router.get("/:mentorId/submissions", mentorGuard, mentorScopeGuard('mentorId'), mentorCtrl.listSubmissions);
router.get("/:mentorId/submissions/:id", mentorGuard, mentorScopeGuard('mentorId'), mentorCtrl.getSubmission);
router.post("/:mentorId/submissions/:id/review", mentorGuard, mentorScopeGuard('mentorId'), mentorCtrl.postReview);
router.get("/:mentorId/reviews", mentorGuard, mentorScopeGuard('mentorId'), mentorCtrl.listReviews);

export default router;
