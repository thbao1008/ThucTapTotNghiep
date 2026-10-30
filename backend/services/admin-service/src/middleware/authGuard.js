// backend/src/middleware/authGuard.js
import jwt from "jsonwebtoken";
import "../../../shared/loadBackendEnv.js";
import { requireJwtSecret } from "../../../shared/jwtConfig.js";
import { validateActiveSession } from "../../../shared/sessionValidation.js";

const JWT_SECRET = requireJwtSecret();

export function createAuthGuard({
  validateSession = async (token, userId) => {
    const { default: pool } = await import("../config/db.js");
    return validateActiveSession(pool, token, userId);
  },
  verifyToken = token => jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] })
} = {}) {
  return async function authGuard(req, res, next) {
    const authHeader = req.headers.authorization;
    const tokenMatch = typeof authHeader === "string"
      ? authHeader.match(/^Bearer\s+(\S+)$/i)
      : null;
    if (!tokenMatch) {
      return res.status(401).json({ message: "Thiếu hoặc sai định dạng token" });
    }

    let decoded;
    try {
      decoded = verifyToken(tokenMatch[1]);
    } catch {
      return res.status(403).json({ message: "Token không hợp lệ" });
    }
    if (!decoded || !decoded.id) {
      return res.status(403).json({ message: "Token không hợp lệ" });
    }

    let session;
    try {
      session = await validateSession(tokenMatch[1], decoded.id);
    } catch {
      console.error("Admin session validation is unavailable");
      return res.status(503).json({ message: "Không thể xác minh phiên đăng nhập" });
    }
    if (!session?.valid) {
      return res.status(401).json({ message: "Phiên đăng nhập không còn hiệu lực" });
    }

    req.user = decoded;
    return next();
  };
}

export const authGuard = createAuthGuard();
