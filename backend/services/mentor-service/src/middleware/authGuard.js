import jwt from "jsonwebtoken";
import "../../../shared/loadBackendEnv.js";
import { requireJwtSecret } from "../../../shared/jwtConfig.js";
import pool from "../config/db.js";
import { validateActiveSession } from "../../../shared/sessionValidation.js";
import { createMentorAccessGuards } from "./mentorAccess.js";

const JWT_SECRET = requireJwtSecret();
const mentorAccess = createMentorAccessGuards({ pool });

export async function authGuard(req, res, next) {
  const match = typeof req.headers.authorization === "string"
    ? req.headers.authorization.match(/^Bearer\s+(\S+)$/i)
    : null;
  if (!match) {
    return res.status(401).json({ message: "Thiếu token" });
  }

  let decoded;
  try {
    decoded = jwt.verify(match[1], JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return res.status(403).json({ message: "Token không hợp lệ", requiresLogin: true });
  }

  try {
    const session = await validateActiveSession(pool, match[1], decoded.id);
    if (!session.valid) {
      return res.status(403).json({ message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", requiresLogin: true });
    }
    req.user = decoded;
    req.session = session.session;
    return next();
  } catch (error) {
    console.error("Unable to validate Mentor session:", error);
    return res.status(503).json({ message: "Không thể xác minh phiên đăng nhập" });
  }
}

export function mentorGuard(req, res, next) {
  if (req.user?.role?.toLowerCase() !== "mentor") {
    return res.status(403).json({ message: "Chỉ mentor mới có quyền truy cập" });
  }
  return next();
}

export function adminGuard(req, res, next) {
  if (req.user?.role?.toLowerCase() !== "admin") {
    return res.status(403).json({ message: "Chỉ admin mới có quyền truy cập" });
  }
  return next();
}

/**
 * mentorScopeGuard — kiểm tra mentorId trong URL params khớp với mentor đang đăng nhập.
 * Sử dụng cho routes có :mentorId hoặc :id là mentor ID.
 * param: tên param chứa mentorId trong URL (mặc định 'mentorId')
 */
export function mentorScopeGuard(param = 'mentorId') {
  return mentorAccess.mentorScope(param);
}

export const assignedLearnerGuard = param => mentorAccess.assignedLearner(param);
export const assignedLearnerByUserGuard = param => mentorAccess.assignedLearnerByUser(param);
export const assignedToMentorGuard = param => mentorAccess.assignedToMentor(param);
export const mentorOwnsRecordGuard = (kind, param) => mentorAccess.ownsRecord(kind, param);
export const selfOrAdminUserGuard = param => mentorAccess.selfOrAdminUser(param);
