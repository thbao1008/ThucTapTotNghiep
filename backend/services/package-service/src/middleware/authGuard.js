import jwt from "jsonwebtoken";
import "../../../shared/loadBackendEnv.js";
import { requireJwtSecret } from "../../../shared/jwtConfig.js";
import pool from "../config/db.js";
import { validateActiveSession } from "../../../shared/sessionValidation.js";

const JWT_SECRET = requireJwtSecret();

export function createAuthGuard({
  sessionPool = pool,
  verifyToken = jwt.verify,
  jwtSecret = JWT_SECRET,
  validateSession = validateActiveSession
} = {}) {
  return async function authGuard(req, res, next) {
  try {
    const match = typeof req.headers.authorization === "string"
      ? req.headers.authorization.match(/^Bearer\s+(\S+)$/i)
      : null;
    if (!match) {
      return res.status(401).json({ message: "Thiếu token" });
    }

    const token = match[1];
    const decoded = verifyToken(token, jwtSecret, { algorithms: ["HS256"] });
    const session = await validateSession(sessionPool, token, decoded.id);
    if (!session.valid) {
      return res.status(403).json({ message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." });
    }
    req.user = decoded;
    req.session = session.session;
    return next();
  } catch (err) {
    if (err?.name === "JsonWebTokenError" || err?.name === "TokenExpiredError") {
      return res.status(403).json({ message: "Token không hợp lệ" });
    }
    console.error("Unable to validate Package session:", err);
    return res.status(503).json({ message: "Không thể xác minh phiên đăng nhập" });
  }
  };
}

export const authGuard = createAuthGuard();

export function adminGuard(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: "Chỉ admin mới có quyền truy cập" });
  }
  next();
}

