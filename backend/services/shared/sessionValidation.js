export async function validateActiveSession(pool, token, expectedUserId = null) {
  const userPredicate = expectedUserId === null ? "" : " AND user_id = $2";
  const values = expectedUserId === null ? [token] : [token, expectedUserId];
  const result = await pool.query(
    `UPDATE user_sessions
     SET last_activity = NOW()
     WHERE token = $1 AND is_active = TRUE AND expires_at > NOW()${userPredicate}
       AND EXISTS (SELECT 1 FROM users u WHERE u.id = user_sessions.user_id AND u.status = 'active')
     RETURNING *`,
    values
  );
  const session = result.rows[0];
  if (!session) {
    return { valid: false, reason: "Session not found, expired, or user mismatch" };
  }

  return { valid: true, session };
}
