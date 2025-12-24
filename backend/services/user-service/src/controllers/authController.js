import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import {
  findUserByEmail,
  findUserByPhone,
  findUserById,
  findUserByIdentifier,
  createUserInDb,
  updateUserInDb,
  updateUserPasswordByEmail,
  updateUserPasswordById,
} from "../models/userModel.js";
import * as sessionService from "../services/sessionService.js";

function safeUserForClient(user) {
  if (!user) return null;
  const u = { ...user };
  delete u.password;
  return u;
}

function validateEmail(email) {
  return typeof email === "string" && /\S+@\S+\.\S+/.test(email);
}

function validatePhone(phone) {
  return typeof phone === "string" && /^0\d{9}$/.test(phone);
}

function validatePassword(pw) {
  if (typeof pw !== "string") return false;
  
  // Mật khẩu chặt chẽ: tối thiểu 8 ký tự, có chữ hoa, chữ thường, số, ký tự đặc biệt
  const minLength = pw.length >= 8;
  const hasUpperCase = /[A-Z]/.test(pw);
  const hasLowerCase = /[a-z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw);
  
  return minLength && hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar;
}

function getPasswordValidationMessage(pw) {
  if (typeof pw !== "string") return "Mật khẩu không hợp lệ";
  if (pw.length < 8) return "Mật khẩu phải có ít nhất 8 ký tự";
  if (!/[A-Z]/.test(pw)) return "Mật khẩu phải có ít nhất 1 chữ hoa";
  if (!/[a-z]/.test(pw)) return "Mật khẩu phải có ít nhất 1 chữ thường";
  if (!/[0-9]/.test(pw)) return "Mật khẩu phải có ít nhất 1 số";
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw)) return "Mật khẩu phải có ít nhất 1 ký tự đặc biệt";
  return null;
}

const JWT_SECRET = process.env.JWT_SECRET || "secret_key";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "1d";
const RESET_TOKEN_EXPIRES = process.env.RESET_TOKEN_EXPIRES || "1h";

export async function register(req, res) {
  try {
    const { name, email, phone, dob, role, password } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ message: "Vui lòng cung cấp email hoặc số điện thoại" });
    }
    const passwordError = getPasswordValidationMessage(password);
    if (passwordError) {
      return res.status(400).json({ 
        message: passwordError,
        requirements: {
          minLength: 8,
          needsUpperCase: true,
          needsLowerCase: true,
          needsNumber: true,
          needsSpecialChar: true
        }
      });
    }
    if (email && !validateEmail(email)) {
      return res.status(400).json({ message: "Email không hợp lệ" });
    }
    if (phone && !validatePhone(phone)) {
      return res.status(400).json({ message: "Số điện thoại không hợp lệ" });
    }

    if (email) {
      const existingEmail = await findUserByEmail(email);
      if (existingEmail) return res.status(400).json({ message: "Email đã tồn tại" });
    }

    if (phone) {
      const existingPhone = await findUserByPhone(phone);
      if (existingPhone) return res.status(400).json({ message: "Số điện thoại đã tồn tại" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const created = await createUserInDb({
      name,
      email: email || null,
      phone: phone || null,
      dob: dob || null,
      role: role || "USER",
      password: hashed,
    });

    return res.status(201).json({ message: "Đăng ký thành công", user: safeUserForClient(created) });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
}

export async function login(req, res) {
  try {
    const { identifier, password } = req.body;
    console.log(`[Login] Attempt: identifier=${identifier?.substring(0, 20)}...`);
    
    if (!identifier || !password) {
      console.log(`[Login] Missing credentials`);
      return res.status(400).json({ message: "Vui lòng cung cấp tài khoản và mật khẩu" });
    }

    // Find user with timeout
    let user;
    try {
      console.log(`[Login] Searching for user: ${identifier}`);
      user = await Promise.race([
        findUserByIdentifier(identifier),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Database query timeout")), 10000)
        )
      ]);
      console.log(`[Login] User found: ${user ? `ID=${user.id}, email=${user.email}` : 'NOT FOUND'}`);
    } catch (dbErr) {
      console.error("[Login] Database query error:", dbErr.message);
      if (dbErr.message === "Database query timeout") {
        return res.status(503).json({ 
          message: "Database query timeout. Vui lòng thử lại sau.",
          error: process.env.NODE_ENV === "development" ? dbErr.message : undefined
        });
      }
      if (dbErr.code === "ECONNREFUSED" || dbErr.code === "ETIMEDOUT") {
        return res.status(503).json({ 
          message: "Không thể kết nối đến database. Vui lòng kiểm tra database đã chạy chưa.",
          error: process.env.NODE_ENV === "development" ? dbErr.message : undefined
        });
      }
      throw dbErr; // Re-throw other errors
    }
    
    if (!user) {
      console.log(`[Login] User not found for identifier: ${identifier}`);
      return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu" });
    }

    // Check if user is banned
    if (user.status === 'banned') {
      return res.status(403).json({ 
        message: "Tài khoản của bạn đang bị tạm khóa. Hãy liên hệ hỗ trợ để được giải quyết.",
        banned: true,
        banReason: user.ban_reason || null
      });
    }

    console.log(`[Login] Comparing password for user: ${user.email}`);
    const match = await bcrypt.compare(password, user.password);
    console.log(`[Login] Password match: ${match}`);
    if (!match) {
      console.log(`[Login] Password mismatch for user: ${user.email}`);
      return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu" });
    }

    // Check subscription for learners (users who have learner records)
    console.log(`[Login] Checking if user is learner: ${user.email}`);
    try {
      const learnerCheck = await pool.query(`
        SELECT l.id AS learner_id FROM learners l WHERE l.user_id = $1
      `, [user.id]);

      if (learnerCheck.rows.length > 0) {
        console.log(`[Login] User is learner, checking subscription: ${user.email}`);
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
        `, [user.id]);

        const hasActivePackage = subscriptionResult.rows[0]?.has_active_package || false;

        if (!hasActivePackage) {
          console.log(`[Login] No active package for learner: ${user.email}`);
          return res.status(403).json({
            message: "Khóa học của bạn đã hết hạn, vui lòng liên hệ hỗ trợ!",
            expired: true
          });
        }
      }
    } catch (subErr) {
      console.error(`[Login] Error checking subscription for user ${user.id}:`, subErr);
      // Allow login if subscription check fails (fail-safe)
    }

    // Lấy thông tin device từ request
    const deviceInfo = req.headers['user-agent'] || 'Unknown';
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'Unknown';
    const userAgent = req.headers['user-agent'] || 'Unknown';

    // Tạo session mới (sẽ tự động invalidate tất cả sessions cũ của user này)
    // Tính theo phiên hoạt động (session), không phải thiết bị
    // 1 tài khoản chỉ có 1 session active tại một thời điểm
    // Khi đăng nhập từ tab/window mới → tự động invalidate session cũ (tab/window cũ sẽ tự động logout)
    const { token, session } = await sessionService.createSession(
      user.id,
      deviceInfo,
      ipAddress,
      userAgent
    );

    return res.json({ 
      message: "Đăng nhập thành công", 
      token, 
      user: safeUserForClient(user),
      sessionId: session.id
    });
  } catch (err) {
    console.error("Login error:", err);
    console.error("Error stack:", err.stack);
    
    // Handle specific database errors
    if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") {
      return res.status(503).json({ 
        message: "Không thể kết nối đến database. Vui lòng kiểm tra database đã chạy chưa.",
        error: process.env.NODE_ENV === "development" ? err.message : undefined
      });
    }
    
    return res.status(500).json({ 
      message: "Lỗi server", 
      error: process.env.NODE_ENV === "development" ? err.message : undefined 
    });
  }
}

export async function requestPasswordReset(req, res) {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ message: "Vui lòng cung cấp email hoặc số điện thoại" });

    const user = await findUserByIdentifier(identifier);
    if (!user) return res.status(404).json({ message: "Người dùng không tồn tại" });

    if (!user.security_question || !user.security_answer) {
      return res.status(400).json({ 
        message: "Tài khoản chưa thiết lập câu hỏi bảo mật. Vui lòng liên hệ quản trị viên." 
      });
    }

    return res.json({ 
      message: "Vui lòng trả lời câu hỏi bảo mật",
      security_question: user.security_question,
      userId: user.id
    });
  } catch (err) {
    console.error("RequestPasswordReset error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
}

export async function verifySecurityAnswer(req, res) {
  try {
    const { identifier, security_answer } = req.body;
    if (!identifier || !security_answer) {
      return res.status(400).json({ message: "Vui lòng cung cấp đầy đủ thông tin" });
    }

    const user = await findUserByIdentifier(identifier);
    if (!user) return res.status(404).json({ message: "Người dùng không tồn tại" });

    if (!user.security_answer) {
      return res.status(400).json({ message: "Tài khoản chưa thiết lập câu hỏi bảo mật" });
    }

    const userAnswer = (user.security_answer || "").trim().toLowerCase();
    const providedAnswer = (security_answer || "").trim().toLowerCase();

    if (userAnswer !== providedAnswer) {
      return res.status(400).json({ message: "Câu trả lời không đúng" });
    }

    const resetToken = jwt.sign(
      { id: user.id, email: user.email, type: "password_reset" },
      JWT_SECRET,
      { expiresIn: "15m" }
    );

    return res.json({ 
      message: "Xác thực thành công",
      resetToken 
    });
  } catch (err) {
    console.error("VerifySecurityAnswer error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
}

export async function logout(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(" ")[1];
      if (token) {
        await sessionService.deleteSession(token);
      }
    }
    return res.json({ message: "Đăng xuất thành công" });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
}

export async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;
    if (!token) {
      return res.status(400).json({ message: "Token không hợp lệ" });
    }
    
    const passwordError = getPasswordValidationMessage(newPassword);
    if (passwordError) {
      return res.status(400).json({ 
        message: passwordError,
        requirements: {
          minLength: 8,
          needsUpperCase: true,
          needsLowerCase: true,
          needsNumber: true,
          needsSpecialChar: true
        }
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.type !== "password_reset") {
        return res.status(400).json({ message: "Token không hợp lệ" });
      }
    } catch (e) {
      return res.status(400).json({ message: "Token không hợp lệ hoặc đã hết hạn" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    if (decoded.id) {
      await updateUserPasswordById(decoded.id, hashed);
    } else if (decoded.email) {
      await updateUserPasswordByEmail(decoded.email, hashed);
    } else {
      return res.status(400).json({ message: "Token không hợp lệ" });
    }

    return res.json({ message: "Đặt lại mật khẩu thành công" });
  } catch (err) {
    console.error("ResetPassword error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
}

export async function getProfile(req, res) {
  try {
    const requester = req.user;
    if (!requester) return res.status(401).json({ message: "Chưa đăng nhập" });

    const dbUser = await findUserByIdentifier(requester.email || requester.phone || requester.id);
    if (!dbUser) return res.status(404).json({ message: "Người dùng không tồn tại" });

    return res.json({ profile: safeUserForClient(dbUser) });
  } catch (err) {
    console.error("GetProfile error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
}

export async function getSecurityQuestion(req, res) {
  try {
    const requester = req.user;
    if (!requester) return res.status(401).json({ message: "Chưa đăng nhập" });

    if (requester.role?.toLowerCase() === "admin") {
      return res.status(403).json({ message: "Admin không có câu hỏi bảo mật" });
    }

    const dbUser = await findUserById(Number(requester.id));
    if (!dbUser) return res.status(404).json({ message: "Người dùng không tồn tại" });

    return res.json({ 
      security_question: dbUser.security_question || null,
      has_question: !!dbUser.security_question 
    });
  } catch (err) {
    console.error("GetSecurityQuestion error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
}

export async function setSecurityQuestion(req, res) {
  try {
    const requester = req.user;
    if (!requester) return res.status(401).json({ message: "Chưa đăng nhập" });

    if (requester.role?.toLowerCase() === "admin") {
      return res.status(403).json({ message: "Admin không có câu hỏi bảo mật" });
    }

    const { security_question, security_answer, old_answer } = req.body;
    
    if (!security_question || !security_answer) {
      return res.status(400).json({ message: "Vui lòng cung cấp câu hỏi và câu trả lời" });
    }

    const dbUser = await findUserById(Number(requester.id));
    if (!dbUser) return res.status(404).json({ message: "Người dùng không tồn tại" });

    if (dbUser.security_question && dbUser.security_answer) {
      if (!old_answer) {
        return res.status(400).json({ message: "Vui lòng nhập câu trả lời của câu hỏi bảo mật hiện tại" });
      }

      const oldAnswerNormalized = (dbUser.security_answer || "").trim().toLowerCase();
      const providedOldAnswer = (old_answer || "").trim().toLowerCase();

      if (oldAnswerNormalized !== providedOldAnswer) {
        return res.status(400).json({ message: "Câu trả lời câu hỏi bảo mật hiện tại không đúng" });
      }
    }

    await updateUserInDb(dbUser.id, {
      security_question: security_question.trim(),
      security_answer: security_answer.trim().toLowerCase()
    });

    return res.json({ message: "Cập nhật câu hỏi bảo mật thành công" });
  } catch (err) {
    console.error("SetSecurityQuestion error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
}

export async function changePassword(req, res) {
  try {
    const { oldPassword, newPassword } = req.body;
    const requester = req.user;
    if (!requester) return res.status(401).json({ message: "Chưa đăng nhập" });
    if (!oldPassword) return res.status(400).json({ message: "Vui lòng cung cấp mật khẩu cũ" });
    
    const passwordError = getPasswordValidationMessage(newPassword);
    if (passwordError) {
      return res.status(400).json({ 
        message: passwordError,
        requirements: {
          minLength: 8,
          needsUpperCase: true,
          needsLowerCase: true,
          needsNumber: true,
          needsSpecialChar: true
        }
      });
    }

    let dbUser = null;
    if (requester.id) {
      dbUser = await findUserById(Number(requester.id));
    }
    
    if (!dbUser) {
      dbUser = await findUserByIdentifier(requester.email || requester.phone || requester.id);
    }
    
    if (!dbUser) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    const match = await bcrypt.compare(oldPassword, dbUser.password);
    if (!match) {
      return res.status(400).json({ message: "Mật khẩu cũ không đúng" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    if (dbUser.id) {
      await updateUserPasswordById(dbUser.id, hashed);
    } else if (dbUser.email) {
      await updateUserPasswordByEmail(dbUser.email, hashed);
    } else {
      return res.status(500).json({ message: "Không thể cập nhật mật khẩu" });
    }

    return res.json({ message: "Đổi mật khẩu thành công" });
  } catch (err) {
    console.error("ChangePassword error:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
}

export { requestPasswordReset as forgotPassword };

