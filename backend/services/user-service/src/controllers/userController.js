import pool from "../config/db.js";
import {
  findUserById,
  findUserByIdentifier,
  createUserInDb,
  updateUserInDb,
  deleteUserInDb,
  toggleUserStatusInDb
} from "../models/userModel.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Tìm project root (đi lên từ user-service/src/controllers đến root)
 */
function getProjectRoot() {
  // __dirname = backend/services/user-service/src/controllers
  // Đi lên 3 cấp: controllers -> src -> user-service -> services -> backend
  return path.resolve(__dirname, "..", "..", "..");
}

function safeUserForClient(user) {
  if (!user) return null;
  const u = { ...user };
  delete u.password;
  return u;
}

// Ensure uploads directory exists at backend/uploads
const backendDir = getProjectRoot();
const uploadsDir = path.resolve(backendDir, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config for avatar upload - lưu vào memory để convert base64, không lưu file
const uploadAvatarMiddleware = multer({ 
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

export async function listUsers(req, res) {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.dob, u.role, u.status, u.created_at,
        l.id AS learner_id,
        lp.package_name,
        lp.status AS package_status,
        lp.expiry_date,
        lp.days_left,
        mu.id AS mentor_id,
        mu.name AS mentor_name
      FROM users u
      LEFT JOIN learners l ON l.user_id = u.id
      LEFT JOIN learner_package_view lp ON lp.learner_id = l.id
      LEFT JOIN mentors m ON l.mentor_id = m.id
      LEFT JOIN users mu ON m.user_id = mu.id
      ORDER BY u.id DESC
    `);

    return res.json({ success: true, users: result.rows });
  } catch (err) {
    console.error("listUsers error: - userController.js:76", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get user's own profile (không cần admin)
export async function getMyProfile(req, res) {
  try {
    const userId = req.user?.id || req.user?.user_id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.dob, u.role, u.status, u.created_at, u.avatar_url,
        l.id AS learner_id,
        lp.package_name,
        lp.status AS package_status,
        lp.expiry_date,
        lp.days_left,
        mu.id AS mentor_id,
        mu.name AS mentor_name,
        m.id AS mentor_mentor_id,
        m.rating AS mentor_rating,
        COALESCE(
          (SELECT AVG(average_score) 
           FROM practice_history 
           WHERE learner_id = l.id 
             AND practice_type = 'speaking_practice' 
             AND average_score IS NOT NULL),
          0
        ) AS learner_average_score
      FROM users u
      LEFT JOIN learners l ON l.user_id = u.id
      LEFT JOIN learner_package_view lp ON lp.learner_id = l.id
      LEFT JOIN mentors m ON l.mentor_id = m.id
      LEFT JOIN users mu ON m.user_id = mu.id
      WHERE u.id = $1
    `, [userId]);
    
    if (result.rows.length > 0 && result.rows[0].role?.toUpperCase() === "MENTOR") {
      const mentorRes = await pool.query(`
        SELECT m.rating
        FROM mentors m
        WHERE m.user_id = $1
      `, [userId]);
      if (mentorRes.rows.length > 0) {
        result.rows[0].mentor_rating = mentorRes.rows[0].rating;
      }
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    // Format avatar_url to absolute URL (chỉ format relative paths, không format base64)
    const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
    const host = req.get("x-forwarded-host") || req.get("host") || "localhost:4000";
    const baseUrl = `${protocol}://${host}`;
    
    const user = result.rows[0];
    if (user.avatar_url && !user.avatar_url.startsWith("data:") && user.avatar_url.startsWith("/")) {
      user.avatar_url = `${baseUrl}${user.avatar_url}`;
    }

    return res.json({ success: true, user });
  } catch (err) {
    console.error("getMyProfile error: - userController.js:144", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

export async function getMyPackage(req, res) {
  try {
    const userId = req.user?.id || req.user?.user_id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if user is learner and has active package
    const learnerCheck = await pool.query(`
      SELECT l.id AS learner_id FROM learners l WHERE l.user_id = $1
    `, [userId]);

    if (learnerCheck.rows.length > 0) {
      const subscriptionResult = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM learners l 
          LEFT JOIN purchases p ON l.id = p.learner_id AND p.status = 'active'
          LEFT JOIN packages pkg ON p.package_id = pkg.id
          WHERE l.user_id = $1 AND (
            p.expiry_date > NOW() OR
            (p.expiry_date IS NULL AND 
             p.created_at + (COALESCE(pkg.duration_days, 0) * INTERVAL '1 day') + (COALESCE(p.extra_days, 0) * INTERVAL '1 day') > NOW())
          )
        ) AS has_active_package
      `, [userId]);

      const hasActivePackage = subscriptionResult.rows[0]?.has_active_package || false;

      if (!hasActivePackage) {
        return res.status(403).json({
          message: "Khóa học của bạn đã hết hạn, vui lòng liên hệ hỗ trợ!",
          expired: true
        });
      }
    }

    const result = await pool.query(`
      SELECT
        lp.package_name,
        lp.status,
        lp.expiry_date,
        lp.days_left
      FROM users u
      LEFT JOIN learners l ON l.user_id = u.id
      LEFT JOIN learner_package_view lp ON lp.learner_id = l.id
      WHERE u.id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        package: {
          status: 'no-package',
          package_name: null,
          expiry_date: null,
          days_left: null,
          purchase_date: null,
          total_sessions: 0,
          used_sessions: 0,
          remaining_sessions: 0
        }
      });
    }

    const packageData = result.rows[0];
    return res.json({
      success: true,
      package: {
        package_name: packageData.package_name,
        status: packageData.status || 'no-package',
        expiry_date: packageData.expiry_date,
        days_left: packageData.days_left,
        purchase_date: null, // Not available in view
        total_sessions: 0, // Not available in view
        used_sessions: 0, // Not available in view
        remaining_sessions: 0 // Not available in view
      }
    });
  } catch (err) {
    console.error("getMyPackage error: - userController.js:199", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

export async function getUser(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.dob, u.role, u.status, u.created_at, u.avatar_url,
        l.id AS learner_id,
        lp.package_name,
        lp.status AS package_status,
        lp.expiry_date,
        lp.days_left,
        mu.id AS mentor_id,
        mu.name AS mentor_name,
        m.id AS mentor_mentor_id,
        m.rating AS mentor_rating,
        COALESCE(
          (SELECT AVG(average_score) 
           FROM practice_history 
           WHERE learner_id = l.id 
             AND practice_type = 'speaking_practice' 
             AND average_score IS NOT NULL),
          0
        ) AS learner_average_score
      FROM users u
      LEFT JOIN learners l ON l.user_id = u.id
      LEFT JOIN learner_package_view lp ON lp.learner_id = l.id
      LEFT JOIN mentors m ON l.mentor_id = m.id
      LEFT JOIN users mu ON m.user_id = mu.id
      WHERE u.id = $1
    `, [id]);
    
    if (result.rows.length > 0 && result.rows[0].role?.toUpperCase() === "MENTOR") {
      const mentorRes = await pool.query(`
        SELECT m.rating
        FROM mentors m
        WHERE m.user_id = $1
      `, [id]);
      if (mentorRes.rows.length > 0) {
        result.rows[0].mentor_rating = mentorRes.rows[0].rating;
      }
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    return res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error("getUser error: - userController.js:252", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

export async function createUser(req, res) {
  try {
    const { name, email, phone, dob, role, password, packageId } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin bắt buộc" });
    }

    const existingEmail = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existingEmail.rows.length > 0) {
      return res.status(400).json({ success: false, message: "Email đã tồn tại" });
    }

    const bcrypt = (await import("bcryptjs")).default;
    const hashed = await bcrypt.hash(password, 10);

    const userResult = await pool.query(
      "INSERT INTO users (name, email, password, phone, dob, role, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [name, email, hashed, phone || null, dob || null, role, 'active']
    );
    const user = userResult.rows[0];

    if (role.toUpperCase() === "LEARNER" && packageId) {
      await pool.query(
        "INSERT INTO purchases (learner_id, package_id, status, created_at) VALUES ($1,$2,$3,NOW())",
        [user.id, packageId, "completed"]
      );
    }

    res.status(201).json({ success: true, user: safeUserForClient(user) });
  } catch (err) {
    console.error("createUser error: - userController.js:288", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

export async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updated = await updateUserInDb(id, updates);
    if (!updated) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, user: safeUserForClient(updated) });
  } catch (err) {
    console.error("updateUser error: - userController.js:303", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

export async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    const deleted = await deleteUserInDb(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    console.error("deleteUser error: - userController.js:317", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

export async function toggleUserStatus(req, res) {
  try {
    const { id } = req.params;
    const updated = await toggleUserStatusInDb(id);
    if (!updated) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, user: safeUserForClient(updated) });
  } catch (err) {
    console.error("toggleUserStatus error: - userController.js:331", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Upload avatar cho chính user (không cần admin)
// Lưu base64 vào avatar_url, không lưu file vào thư mục upload
export async function uploadMyAvatar(req, res) {
  try {
    const userId = req.user?.id || req.user?.user_id || req.user?._id;
    console.log(`[uploadMyAvatar] Request received: userId=${userId}, hasFile=${!!req.file} - userController.js:341`);
    
    if (!userId) {
      console.error("[uploadMyAvatar] No userId found in token - userController.js:344");
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    if (!req.file) {
      console.error("[uploadMyAvatar] No file uploaded - userController.js:349");
      return res.status(400).json({ message: "No file uploaded" });
    }
    
    // Convert file buffer to base64
    const base64String = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';
    const avatarUrl = `data:${mimeType};base64,${base64String}`;
    
    console.log(`[uploadMyAvatar] File converted to base64, size: ${base64String.length} chars - userController.js:358`);
    
    // Lưu base64 vào avatar_url trong database
    const updated = await updateUserInDb(userId, { avatar_url: avatarUrl });
    if (!updated) {
      console.error(`[uploadMyAvatar] User not found: userId=${userId} - userController.js:363`);
      return res.status(404).json({ message: "User not found" });
    }
    
    const user = safeUserForClient(updated);
    console.log(`[uploadMyAvatar] Avatar updated successfully for user ${userId} - userController.js:368`);
    return res.json({ success: true, user });
  } catch (err) {
    console.error("uploadMyAvatar error: - userController.js:371", err);
    return res.status(500).json({ message: "Server error", error: process.env.NODE_ENV === "development" ? err.message : undefined });
  }
}

// Upload avatar cho user khác (yêu cầu admin)
// Lưu base64 vào avatar_url, không lưu file vào thư mục upload
export async function uploadAvatar(req, res) {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    
    // Convert file buffer to base64
    const base64String = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';
    const avatarUrl = `data:${mimeType};base64,${base64String}`;
    
    const updated = await updateUserInDb(id, { avatar_url: avatarUrl });
    if (!updated) return res.status(404).json({ message: "User not found" });
    return res.json({ success: true, user: safeUserForClient(updated) });
  } catch (err) {
    console.error("uploadAvatar error: - userController.js:394", err);
    return res.status(500).json({ message: "Server error" });
  }
}

export { uploadAvatarMiddleware };

