import jwt from "jsonwebtoken";
import * as sessionService from "../services/sessionService.js";
import "../../../shared/loadBackendEnv.js";
import { requireJwtSecret } from "../../../shared/jwtConfig.js";

const JWT_SECRET = requireJwtSecret();

export async function authGuard(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: "Thiếu token. Vui lòng đăng nhập." });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Token không hợp lệ. Vui lòng đăng nhập." });
    }

    // Kiểm tra session hợp lệ
    const sessionCheck = await sessionService.validateSession(token);
    
    if (!sessionCheck.valid) {
      return res.status(403).json({ 
        message: "Phiên đăng nhập đã hết hạn hoặc bạn đã đăng nhập từ thiết bị khác. Vui lòng đăng nhập lại.",
        reason: sessionCheck.reason,
        requiresLogin: true
      });
    }

    // Verify JWT token
    try {
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
      req.user = decoded;
      req.session = sessionCheck.session;
      next();
    } catch (jwtErr) {
      return res.status(403).json({ 
        message: "Token không hợp lệ. Vui lòng đăng nhập lại.",
        requiresLogin: true
      });
    }
  } catch (err) {
    console.error("❌ Auth guard error:", err);
    return res.status(500).json({ message: "Lỗi xác thực. Vui lòng thử lại." });
  }
}

export function adminGuard(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: "Chỉ admin mới có quyền truy cập" });
  }
  next();
}

