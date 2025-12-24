// Admin Service - Routes
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { authGuard } from "../middleware/authGuard.js";
import { adminGuard } from "../middleware/adminGuard.js";
import pool from "../config/db.js";

// Controllers
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  removeLearnerFromMentor,
  changeLearnerMentor,
  getAvailableMentors,
  uploadAvatar,
} from "../controllers/adminController.js";
// TODO: Replace with API calls to Dashboard Service (if created) or keep in Admin Service
import {
  getDashboardStats,
  getRecentActivity,
  getAIProgress,
  getTrafficStats,
  getChartData
} from "../controllers/dashboardController.js";
import { getSystemEvaluation } from "../controllers/aiEvaluationController.js";
// TODO: Replace with API calls to Package Service
import {
  getPackages,
  createNewPackage,
  updateExistingPackage,
  deleteExistingPackage,
} from "../controllers/packageController.js";
// TODO: Replace with API calls to Purchase Service
import {
  getAllPurchases,
  listLearnerPurchases,
  createNewPurchase,
  renewPurchaseController,
  changePackageController,
} from "../controllers/purchaseController.js";
// TODO: Replace with API calls to Report Service (if created) or Mentor Service
import {
  createReport,
  getReportSummary,
  getReports,
  searchLearnerProgress,
  updateReportStatus,
  updateLearnerNote,
  checkCanReport,
  getAllLearnersWithProgress,
  getAllMentors
} from "../controllers/reportController.js";
import * as reportService from "../services/reportService.js";
import { findUserByIdentifier } from "../models/userModel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * Tìm project root (đi lên từ admin-service/src/routes đến root)
 */
function getProjectRoot() {
  // __dirname = backend/services/admin-service/src/routes
  // Đi lên 3 cấp: routes -> src -> admin-service -> services -> backend
  return path.resolve(__dirname, "..", "..", "..");
}

// Ensure uploads directory exists at backend/uploads
const backendDir = getProjectRoot();
const uploadsDir = path.resolve(backendDir, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config for avatar upload - lưu vào memory để convert base64, không lưu file
const upload = multer({ 
  storage: multer.memoryStorage(), // Lưu vào memory thay vì disk
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file ảnh'));
    }
  }
});

// ====== PUBLIC SUPPORT ROUTE ======
router.post("/support", async (req, res) => {
  const { name, email, phone, note } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO support_requests (name, email, phone, note) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, email, phone, note]
    );
    res.json({ success: true, request: result.rows[0] });
  } catch (err) {
    console.error("❌ Lỗi tạo support request: - adminRoutes.js", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ====== Apply middleware to all admin routes ======
router.use(authGuard);
router.use(adminGuard);

// ====== USERS ROUTES ======
// Check trùng email/phone (đặt trước :id để không bị nuốt route)
router.get("/users/check", async (req, res) => {
  try {
    const { email, phone } = req.query;
    if (!email && !phone) {
      return res.json({ exists: false });
    }

    const identifier = email || phone;
    const user = await findUserByIdentifier(identifier);

    if (email && user && user.email === email) {
      return res.json({ exists: true });
    }
    if (phone && user && user.phone === phone) {
      return res.json({ exists: true });
    }

    return res.json({ exists: false });
  } catch (err) {
    console.error("❌ check route error - adminRoutes.js", err);
    return res.status(500).json({ exists: false });
  }
});

// Upload avatar (đặt trước các route khác để không bị conflict)
router.post("/users/:id/avatar", upload.single("avatar"), uploadAvatar);

// User CRUD
router.get("/users", listUsers);
router.get("/users/:id", getUser);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);
router.put("/users/:id/status", toggleUserStatus);
router.get("/users/:id/ban-history", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT * FROM ban_history 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [id]
    );
    res.json({ success: true, history: result.rows });
  } catch (err) {
    console.error("❌ Error getting ban history:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Mentor-Learner management
router.post("/users/learners/remove-from-mentor", removeLearnerFromMentor);
router.post("/users/learners/change-mentor", changeLearnerMentor);
router.get("/users/learners/:learnerId/available-mentors", getAvailableMentors);

// Get learners assigned to a mentor
router.get("/mentors/:mentorId/learners", async (req, res) => {
  try {
    const { mentorId } = req.params;
    const learners = await reportService.getAllLearnersWithProgress(Number(mentorId), null);
    res.json({ learners });
  } catch (err) {
    console.error("❌ Error getting learners for mentor:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ====== DASHBOARD ROUTES ======
router.get("/dashboard/stats", getDashboardStats);
router.get("/dashboard/activity", getRecentActivity);
router.get("/dashboard/ai-progress", getAIProgress);
router.get("/dashboard/traffic", getTrafficStats);
router.get("/dashboard/charts", getChartData);
router.get("/dashboard/ai-evaluation", getSystemEvaluation);

// ====== PACKAGES ROUTES ======
// Public route (no auth required)
router.get("/packages/public", getPackages);

// Admin CRUD
router.get("/packages", getPackages);
router.post("/packages", createNewPackage);
router.put("/packages/:id", updateExistingPackage);
router.delete("/packages/:id", deleteExistingPackage);

// ====== PURCHASES ROUTES ======
router.get("/purchases", getAllPurchases);
router.get("/purchases/:learnerId", listLearnerPurchases);
router.post("/purchases", createNewPurchase);
router.patch("/purchases/:id/renew", renewPurchaseController);
router.post("/purchases/change-package", changePackageController);

// ====== REPORTS ROUTES ======
// Mentor/Learner tạo report (no admin guard needed)
router.post("/reports", createReport);
router.get("/reports/can-report", checkCanReport);

// Admin routes
router.get("/reports/summary", getReportSummary);
router.get("/reports", getReports);
router.get("/reports/learner-progress", searchLearnerProgress);
router.get("/reports/learners-progress", getAllLearnersWithProgress);
router.get("/reports/mentors", getAllMentors);
router.patch("/reports/:id/status", updateReportStatus);
router.put("/reports/learner/:id/note", updateLearnerNote);

// Admin xem danh sách support requests
router.get("/support", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM support_requests ORDER BY created_at DESC"
    );
    res.json({ requests: result.rows });
  } catch (err) {
    console.error("❌ Lỗi lấy support requests: - adminRoutes.js", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin cập nhật trạng thái (pending → resolved)
router.patch("/support/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const result = await pool.query(
      "UPDATE support_requests SET status=$1 WHERE id=$2 RETURNING *",
      [status, id]
    );
    res.json({ success: true, request: result.rows[0] });
  } catch (err) {
    console.error("❌ Lỗi update support request: - adminRoutes.js", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

