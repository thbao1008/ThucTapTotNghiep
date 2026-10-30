import pool from "../config/db.js";
import {communityId,communityTransaction,readablePost,toggleCommunityLike,notifyCommunity} from './communityInteractions.js';
const postCounts=`(SELECT count(*)::int FROM post_likes pl WHERE pl.post_id=p.id) AS likes_count,
  (SELECT count(*)::int FROM post_comments pc WHERE pc.post_id=p.id AND pc.is_deleted=false) AS comments_count`;

export async function createPost({ authorId, authorRole, title, content, audioUrl = null, imageUrl = null }) {
  const status = authorRole === 'admin' ? 'approved' : 'pending';
  const sql = `
    INSERT INTO community_posts (author_id, author_role, title, content, audio_url, image_url, status, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    RETURNING *
  `;
  return communityTransaction(async client=>{
    const {rows:[post]}=await client.query(sql,[authorId,authorRole,title,content,audioUrl,imageUrl,status]);
    if(status==='pending'){
      const {rows:admins}=await client.query("SELECT id FROM users WHERE role='admin' AND status='active'");
      for(const admin of admins)await notifyCommunity(client,{userId:admin.id,actorId:authorId,type:'post_submitted',title:'Post awaiting review',message:'A Community post is ready for review.',postId:post.id});
    }
    return post;
  });
}

export async function getPosts({ userId = null, role = null, includePending = false, page = 1, limit = 20 } = {}) {
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  const params = [];
  let sql = `
    SELECT 
      p.*,
      ${postCounts},
      u.name AS author_name,
      u.email AS author_email,
      u.avatar_url AS author_avatar_url,
      reviewer.name AS reviewer_name,
      CASE WHEN pv.id IS NULL THEN 0 ELSE 1 END AS is_viewed
    FROM community_posts p
    JOIN users u ON p.author_id = u.id
    LEFT JOIN users reviewer ON p.reviewed_by = reviewer.id
    LEFT JOIN post_views pv ON pv.post_id = p.id AND pv.user_id = ${userId ? '$' + (params.length + 1) : 'NULL'}
    WHERE p.is_deleted = false
  `;
  if (userId) {
    params.push(userId);
  }

  if (!includePending) {
    sql += ` AND p.status = 'approved'`;
  } else if (role !== 'admin') {
    params.push(userId);
    sql += ` AND (p.status = 'approved' OR p.author_id = $${params.length})`;
  }

  sql += ` ORDER BY p.is_pinned DESC, is_viewed ASC, p.created_at DESC, p.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(parseInt(limit), offset);

  const result = await pool.query(sql, params);
  return result.rows;
}

export async function getPostById(postId, { userId = null, role = null } = {}) {
  const sql = `
    SELECT 
      p.*,
      ${postCounts},
      u.name AS author_name,
      u.email AS author_email,
      u.avatar_url AS author_avatar_url,
      reviewer.name AS reviewer_name
    FROM community_posts p
    JOIN users u ON p.author_id = u.id
    LEFT JOIN users reviewer ON p.reviewed_by = reviewer.id
    WHERE p.id = $1 AND p.is_deleted = false
  `;
  const result = await pool.query(sql, [postId]);
  if (!result.rows[0]) return null;

  const post = result.rows[0];
  // Nếu không phải admin và không phải tác giả, chỉ trả về nếu approved
  if (role !== 'admin' && post.author_id !== userId && post.status !== 'approved') {
    return null;
  }

  return post;
}

export async function getUserPosts(userId, { page = 1, limit = 20 } = {}) {
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  const sql = `
    SELECT 
      p.*,
      ${postCounts},
      u.name AS author_name,
      u.email AS author_email,
      u.avatar_url AS author_avatar_url,
      reviewer.name AS reviewer_name
    FROM community_posts p
    JOIN users u ON p.author_id = u.id
    LEFT JOIN users reviewer ON p.reviewed_by = reviewer.id
    WHERE p.is_deleted = false AND p.author_id = $1
    ORDER BY p.created_at DESC
    LIMIT $2 OFFSET $3
  `;
  const result = await pool.query(sql, [userId, parseInt(limit), offset]);
  return result.rows;
}

export async function getLikedPosts(userId, { page = 1, limit = 20 } = {}) {
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  const sql = `
    SELECT 
      p.*,
      ${postCounts},
      u.name AS author_name,
      u.email AS author_email,
      u.avatar_url AS author_avatar_url,
      reviewer.name AS reviewer_name
    FROM community_posts p
    JOIN post_likes pl ON p.id = pl.post_id
    JOIN users u ON p.author_id = u.id
    LEFT JOIN users reviewer ON p.reviewed_by = reviewer.id
    WHERE pl.user_id = $1 
      AND p.is_deleted = false 
      AND p.status = 'approved'
    ORDER BY pl.created_at DESC
    LIMIT $2 OFFSET $3
  `;
  const result = await pool.query(sql, [userId, parseInt(limit), offset]);
  return result.rows;
}

export async function getPendingPosts({ page = 1, limit = 20 } = {}) {
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  const sql = `
    SELECT 
      p.*,
      ${postCounts},
      u.name AS author_name,
      u.email AS author_email,
      u.role AS author_role,
      u.avatar_url AS author_avatar_url
    FROM community_posts p
    JOIN users u ON p.author_id = u.id
    WHERE p.is_deleted = false AND p.status = 'pending'
    ORDER BY p.created_at ASC
    LIMIT $1 OFFSET $2
  `;
  const result = await pool.query(sql, [parseInt(limit), offset]);
  return result.rows;
}

export async function reviewPost({ postId, adminId, action, rejectionReason = null }) {
  if (!['approved', 'rejected'].includes(action)) {
    throw new Error('Invalid action. Must be "approved" or "rejected"');
  }

  const sql = `
    UPDATE community_posts
    SET status = $1,
        rejection_reason = $2,
        reviewed_by = $3,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = $4 AND status = 'pending' AND is_deleted = false
    RETURNING *
  `;
  return communityTransaction(async client=>{
    const {rows:[post]}=await client.query(sql,[action,rejectionReason,adminId,postId]);
    if(post)await notifyCommunity(client,{userId:post.author_id,actorId:adminId,type:action==='approved'?'post_approved':'post_rejected',title:action==='approved'?'Post approved':'Post not approved',message:action==='approved'?'Your Community post was approved.':'Open your Community post to view the review reason.',postId:post.id});
    return post;
  });
}

export async function deletePost(postId, userId, role) {
  const sql = `
    UPDATE community_posts
    SET is_deleted = true, updated_at = NOW()
    WHERE id = $1 AND (author_id = $2 OR $3 = 'admin')
    RETURNING *
  `;
  const result = await pool.query(sql, [postId, userId, role]);
  return result.rows[0];
}

export async function togglePinPost(postId, isPinned) {
  const sql = `
    UPDATE community_posts
    SET is_pinned = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `;
  const result = await pool.query(sql, [isPinned, postId]);
  return result.rows[0];
}

export async function markPostAsViewed(userId, postId) {
  const sql = `
    INSERT INTO post_views (user_id, post_id, viewed_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (user_id, post_id) 
    DO UPDATE SET viewed_at = NOW()
    RETURNING *
  `;
  const result = await pool.query(sql, [userId, postId]);
  return result.rows[0];
}

export async function createComment({ postId, authorId, authorRole, content = null, audioUrl = null, parentCommentId = null }) {
  if (!content && !audioUrl) {
    throw new Error('Comment must have either content or audioUrl');
  }

  const sql = `
    INSERT INTO post_comments (post_id, author_id, author_role, content, audio_url, parent_comment_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    RETURNING *
  `;
  return communityTransaction(async client=>{
    const post=await readablePost(client,communityId(postId),authorId,authorRole);
    let parent;
    if(parentCommentId!==null){({rows:[parent]}=await client.query('SELECT id,author_id FROM post_comments WHERE id=$1 AND post_id=$2 AND is_deleted=false',[communityId(parentCommentId),postId]));if(!parent)throw Object.assign(new Error('Reply must belong to this post'),{status:400});}
    const result=await client.query(sql,[postId,authorId,authorRole,content,audioUrl,parentCommentId]);
    if(!parent||parent.author_id!==post.author_id)await notifyCommunity(client,{userId:post.author_id,actorId:authorId,type:'post_comment',title:'New comment',message:'A member commented on your Community post.',postId,commentId:result.rows[0].id});
    if(parent)await notifyCommunity(client,{userId:parent.author_id,actorId:authorId,type:'comment_reply',title:'New reply',message:'A member replied to your comment.',postId,commentId:result.rows[0].id});
    const {rows:[count]}=await client.query('SELECT count(*)::int AS comments_count FROM post_comments WHERE post_id=$1 AND is_deleted=false',[postId]);
    return {...result.rows[0],comments_count:count.comments_count,likes_count:0,is_liked:false};
  });
}

export async function getPostComments(postId, { includeReplies = true } = {}) {
  let sql = `
    SELECT 
      c.*,
      (SELECT count(*)::int FROM post_likes pl WHERE pl.comment_id=c.id) AS likes_count,
      u.name AS author_name,
      u.email AS author_email,
      u.avatar_url AS author_avatar_url
    FROM post_comments c
    JOIN users u ON c.author_id = u.id
    WHERE c.post_id = $1 AND c.is_deleted = false
  `;

  if (includeReplies) {
    sql += ` ORDER BY c.parent_comment_id NULLS FIRST, c.created_at ASC`;
  } else {
    sql += ` AND c.parent_comment_id IS NULL ORDER BY c.created_at ASC`;
  }

  const result = await pool.query(sql, [postId]);
  return result.rows;
}

export async function getComments(postId) {
  return getPostComments(postId);
}

export async function deleteComment(commentId, userId, role) {
  const sql = `
    UPDATE post_comments
    SET is_deleted = true, updated_at = NOW()
    WHERE id = $1 AND (author_id = $2 OR $3 = 'admin')
    RETURNING *
  `;
  const result = await pool.query(sql, [commentId, userId, role]);
  return result.rows[0];
}

export const toggleLike = toggleCommunityLike;

export async function checkUserLikes(userId, { postIds = [], commentIds = [] }) {
  const results = { posts: {}, comments: {} };

  if (postIds.length > 0) {
    const sql = `SELECT post_id FROM post_likes WHERE user_id = $1 AND post_id = ANY($2::int[])`;
    const result = await pool.query(sql, [userId, postIds]);
    result.rows.forEach(row => {
      results.posts[row.post_id] = true;
    });
  }

  if (commentIds.length > 0) {
    const sql = `SELECT comment_id FROM post_likes WHERE user_id = $1 AND comment_id = ANY($2::int[])`;
    const result = await pool.query(sql, [userId, commentIds]);
    result.rows.forEach(row => {
      results.comments[row.comment_id] = true;
    });
  }

  return results;
}

export async function getLikeCount(postId) {
  const sql = `SELECT COUNT(*) as count FROM post_likes WHERE post_id = $1`;
  const result = await pool.query(sql, [postId]);
  return parseInt(result.rows[0].count);
}

export async function getUserLikedPost(userId, postId) {
  const sql = `SELECT * FROM post_likes WHERE user_id = $1 AND post_id = $2`;
  const result = await pool.query(sql, [userId, postId]);
  return result.rows.length > 0;
}

