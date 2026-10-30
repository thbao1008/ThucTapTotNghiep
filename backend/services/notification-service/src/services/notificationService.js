import pool from "../config/db.js";

export async function createNotification({
  userId,
  type,
  title,
  message,
  relatedPostId = null,
  relatedCommentId = null,
  relatedUserId = null
}) {
  const sql = `
    INSERT INTO notifications (user_id, type, title, message, related_post_id, related_comment_id, related_user_id, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING *
  `;
  const result = await pool.query(sql, [
    userId,
    type,
    title,
    message,
    relatedPostId,
    relatedCommentId,
    relatedUserId
  ]);
  return result.rows[0];
}

export async function createNotificationsForUsers({
  userIds,
  type,
  title,
  message,
  relatedPostId = null,
  relatedCommentId = null,
  relatedUserId = null
}) {
  if (!userIds || userIds.length === 0) return [];

  const values = userIds.map((_, index) => {
    const baseIndex = index * 7;
    return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, NOW())`;
  }).join(', ');

  const params = [];
  userIds.forEach(userId => {
    params.push(userId, type, title, message, relatedPostId, relatedCommentId, relatedUserId);
  });

  const sql = `
    INSERT INTO notifications (user_id, type, title, message, related_post_id, related_comment_id, related_user_id, created_at)
    VALUES ${values}
    RETURNING *
  `;
  const result = await pool.query(sql, params);
  return result.rows;
}

export async function getAllUserIds(excludeUserId = null) {
  let sql = `
    SELECT DISTINCT u.id
    FROM users u
    LEFT JOIN learners l ON u.id = l.user_id
    LEFT JOIN mentors m ON u.id = m.user_id
    WHERE (l.id IS NOT NULL OR m.id IS NOT NULL)
  `;
  const params = [];
  if (excludeUserId) {
    params.push(excludeUserId);
    sql += ` AND u.id != $1`;
  }
  const result = await pool.query(sql, params);
  return result.rows.map(row => row.id);
}

export async function getNotifications(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  const params = [userId];
  let sql = `
    SELECT 
      n.*,
      u.name AS related_user_name,
      p.content AS related_post_content,
      c.content AS related_comment_content
    FROM notifications n
    LEFT JOIN users u ON n.related_user_id = u.id
    LEFT JOIN community_posts p ON n.related_post_id = p.id
    LEFT JOIN post_comments c ON n.related_comment_id = c.id
    WHERE n.user_id = $1
  `;

  if (unreadOnly) {
    sql += ` AND n.is_read = false`;
  }

  sql += ` ORDER BY n.created_at DESC,n.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(parseInt(limit), offset);

  const result = await pool.query(sql, params);
  return result.rows;
}

export async function getUnreadCount(userId) {
  const sql = `
    SELECT COUNT(*) as count
    FROM notifications
    WHERE user_id = $1 AND is_read = false
  `;
  const result = await pool.query(sql, [userId]);
  return parseInt(result.rows[0].count);
}

export async function markAsRead(notificationId, userId) {
  const sql = `
    UPDATE notifications
    SET is_read = true
    WHERE id = $1 AND user_id = $2
    RETURNING *
  `;
  const result = await pool.query(sql, [notificationId, userId]);
  return result.rows[0];
}

export async function markAllAsRead(userId) {
  const sql = `
    UPDATE notifications
    SET is_read = true
    WHERE user_id = $1 AND is_read = false
    RETURNING *
  `;
  const result = await pool.query(sql, [userId]);
  return result.rows;
}

