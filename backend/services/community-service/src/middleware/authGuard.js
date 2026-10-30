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
    const match = typeof req.headers.authorization === "string"
      ? req.headers.authorization.match(/^Bearer\s+(\S+)$/i)
      : null;
    if (!match) {
      return res.status(401).json({ message: "Thiếu token" });
    }

    let decoded;
    try {
      decoded = verifyToken(match[1], jwtSecret, { algorithms: ["HS256"] });
    } catch {
      return res.status(403).json({ message: "Token không hợp lệ" });
    }

    try {
      const session = await validateSession(sessionPool, match[1], decoded.id);
      if (!session.valid) {
        return res.status(403).json({ message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", requiresLogin: true });
      }
      req.user = decoded;
      req.session = session.session;
      return next();
    } catch (error) {
      console.error("Unable to validate Community session:", error);
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

