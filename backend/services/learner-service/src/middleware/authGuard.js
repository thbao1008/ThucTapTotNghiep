import jwt from "jsonwebtoken";
import "../../../shared/loadBackendEnv.js";
import { requireJwtSecret } from "../../../shared/jwtConfig.js";
import { validateActiveSession } from "../../../shared/sessionValidation.js";

export function createAuthGuard({
  pool,
  jwtSecret = requireJwtSecret(),
  validateSession = validateActiveSession
} = {}) {
  if (!pool || typeof validateSession !== "function") {
    throw new TypeError("Learner authentication dependencies are required");
  }

  return async function authGuard(req, res, next) {
  const authHeader = req.headers.authorization;
  const match = typeof authHeader === "string" && authHeader.match(/^Bearer ([^\s]+)$/i);
  if (!match) {
    return res.status(401).json({ message: "Thiếu token" });
  }

  let decoded;
  try {
    decoded = jwt.verify(match[1], jwtSecret, { algorithms: ["HS256"] });
  } catch {
    return res.status(403).json({ message: "Token không hợp lệ", requiresLogin: true });
  }

  try {
    const session = await validateSession(pool, match[1], decoded.id);
    if (!session.valid) {
      return res.status(403).json({ message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", requiresLogin: true });
    }
    req.user = decoded;
    req.session = session.session;

    if (decoded.role?.toLowerCase() === "learner") {
      const learner = await pool.query("SELECT id FROM learners WHERE user_id = $1", [decoded.id]);
      if (!learner.rows[0]) {
        return res.status(403).json({ message: "Không tìm thấy hồ sơ học viên" });
      }
      req.learnerId = learner.rows[0].id;
    }

    return next();
  } catch (err) {
    return res.status(503).json({ message: "Không thể xác minh phiên đăng nhập" });
  }
  };
}

export function mentorGuard(req, res, next) {
  if (req.user?.role?.toLowerCase() !== 'mentor') {
    return res.status(403).json({ message: "Chỉ mentor mới có quyền truy cập" });
  }
  next();
}
