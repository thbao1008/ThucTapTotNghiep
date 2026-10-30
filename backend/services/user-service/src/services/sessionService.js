/**
 * Session Service
 * Quản lý user sessions để đảm bảo 1 tài khoản chỉ hoạt động trên 1 thiết bị
 */

import pool from "../config/db.js";
import {publicUser} from "../utils/accountCredentials.js";
import {randomUUID} from "node:crypto";
import jwt from "jsonwebtoken";
import "../../../shared/loadBackendEnv.js";
import { requireJwtSecret } from "../../../shared/jwtConfig.js";
import { validateActiveSession } from "../../../shared/sessionValidation.js";
import {cleanupExpiredStorySessions} from '../../../shared/practiceRetention.js';

const JWT_SECRET = requireJwtSecret();
const JWT_EXPIRES = process.env.JWT_EXPIRES || "1d";

/**
 * Tạo session mới cho user và invalidate tất cả sessions cũ
 */
export function createSessionCreator({ database = pool, secret = JWT_SECRET, expires = JWT_EXPIRES } = {}) {
  return async function createSession(userId, deviceInfo = null, ipAddress = null, userAgent = null, { expectedPasswordHash = null } = {}) {
    const client = typeof database.connect === 'function' ? await database.connect() : database;
    let open = false, result;
    try {
      await client.query('BEGIN');
      open = true;
      // Serialize replacement sessions per account, including simultaneous logins.
      await client.query('SELECT pg_advisory_xact_lock(1380143952,$1::integer)', [userId]);
      const { rows: [user] } = await client.query(
        "SELECT * FROM users WHERE id=$1 AND status='active' FOR SHARE", [userId]
      );
      if (!user || (expectedPasswordHash !== null && user.password !== expectedPasswordHash)) {
        throw Object.assign(new Error('Credentials changed before login completed.'), {
          status: 401, code: 'AUTH_CREDENTIALS_CHANGED'
        });
      }
      await client.query('UPDATE user_sessions SET is_active=FALSE WHERE user_id=$1 AND is_active=TRUE', [userId]);
      const role = typeof user.role === 'string' ? user.role.toLowerCase() : user.role;
      const token = jwt.sign({
        id: user.id, email: user.email, phone: user.phone, role, name: user.name, sessionId: randomUUID()
      }, secret, { expiresIn: expires });
      const { rows: [session] } = await client.query(
        'INSERT INTO user_sessions(user_id,token,device_info,ip_address,user_agent,expires_at,is_active) VALUES($1,$2,$3,$4,$5,$6,TRUE) RETURNING *',
        [userId, token, deviceInfo, ipAddress, userAgent, new Date(Date.now() + parseJWTExpires(expires))]
      );
      await client.query('COMMIT');
      open = false;
      result = { session, token, user: publicUser({ ...user, role }) };
    } catch (error) {
      if (open) await client.query('ROLLBACK');
      console.error('Session creation failed', error.code || error.name);
      throw error;
    } finally {
      if (client !== database) client.release();
    }
    await cleanupExpiredStorySessions(database, { userId }).catch(() => {});
    return result;
  };
}
export const createSession=createSessionCreator();

/**
 * Kiểm tra session có hợp lệ không
 */
export async function validateSession(token) {
  try {
    // Kiểm tra JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    } catch (jwtErr) {
      return { valid: false, reason: "Invalid token" };
    }

    const sessionCheck = await validateActiveSession(pool, token, decoded.id);
    return { ...sessionCheck, userId: decoded.id };
  } catch (err) {
    console.error("❌ Error validating session:", err);
    return { valid: false, reason: "Server error" };
  }
}

/**
 * Xóa session (logout)
 */
export async function deleteSession(token) {
  try {
    const retired=await pool.query(
      `UPDATE user_sessions 
       SET is_active = FALSE 
       WHERE token = $1 RETURNING user_id`,
      [token]
    );
    if(retired.rows[0])await cleanupExpiredStorySessions(pool,{userId:retired.rows[0].user_id}).catch(()=>{});
    return true;
  } catch (err) {
    console.error("❌ Error deleting session:", err);
    return false;
  }
}

/**
 * Xóa tất cả sessions của user
 */
export async function deleteAllUserSessions(userId) {
  try {
    await pool.query(
      `UPDATE user_sessions 
       SET is_active = FALSE 
       WHERE user_id = $1`,
      [userId]
    );
    await cleanupExpiredStorySessions(pool,{userId}).catch(()=>{});
    return true;
  } catch (err) {
    console.error("❌ Error deleting all user sessions:", err);
    return false;
  }
}

/**
 * Parse JWT_EXPIRES string thành milliseconds
 */
function parseJWTExpires(expires) {
  const match = expires.match(/^(\d+)([smhd])$/);
  if (!match) return 24 * 60 * 60 * 1000; // Default 1 day

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

/**
 * Cleanup expired sessions (có thể gọi định kỳ)
 */
export async function cleanupExpiredSessions() {
  try {
    const result = await pool.query(
      `UPDATE user_sessions 
       SET is_active = FALSE 
       WHERE expires_at < NOW() AND is_active = TRUE`
    );
    return result.rowCount;
  } catch (err) {
    console.error("❌ Error cleaning up expired sessions:", err);
    return 0;
  }
}

