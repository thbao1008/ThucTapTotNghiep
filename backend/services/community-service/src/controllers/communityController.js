import * as communityService from "../services/communityService.js";
import pool from "../config/db.js";
import {communityId,readablePost} from '../services/communityInteractions.js';

export async function readablePostGuard(req,res,next) {
  try{const id=communityId(req.params.postId);await readablePost(pool,id,req.user.id,req.user.role);return next();}
  catch(error){return res.status(error.status||503).json({message:error.status?error.message:'Unable to load this discussion'});}
}

function formatPostUrls(post, baseUrl) {
  return {
    ...post,
    audio_url: post.audio_url?.startsWith("/") ? `${baseUrl}${post.audio_url}` : post.audio_url,
    image_url: post.image_url?.startsWith("/") ? `${baseUrl}${post.image_url}` : post.image_url
  };
}

function formatPostsUrls(posts, baseUrl) {
  return posts.map(post => formatPostUrls(post, baseUrl));
}

export async function createPost(req, res) {
  try {
    const userId = req.user.id || req.user.userId;
    const { role } = req.user;
    const { title, content } = req.body;

    let finalAudioUrl = null;
    let finalImageUrl = null;

    if (req.files) {
      if (req.files.audio && req.files.audio[0]) {
        finalAudioUrl = `/uploads/${req.files.audio[0].filename}`;
      }
      if (req.files.image && req.files.image[0]) {
        finalImageUrl = `/uploads/${req.files.image[0].filename}`;
      }
      if (req.files.video && req.files.video[0]) {
        finalImageUrl = `/uploads/${req.files.video[0].filename}`;
      }
    }

    if (!finalAudioUrl && req.body.audioUrl) finalAudioUrl = req.body.audioUrl;
    if (!finalImageUrl && req.body.imageUrl) finalImageUrl = req.body.imageUrl;

    if (!content && !finalAudioUrl && !finalImageUrl) {
      return res.status(400).json({ message: "Post must have content, audio, or image/video" });
    }

    const authorRole = role === 'learner' ? 'learner' : role === 'mentor' ? 'mentor' : role === 'admin' ? 'admin' : null;
    if (!authorRole) {
      return res.status(403).json({ message: "Invalid role" });
    }

    const post = await communityService.createPost({
      authorId: userId,
      authorRole,
      title: title || null,
      content: content || '',
      audioUrl: finalAudioUrl,
      imageUrl: finalImageUrl
    });

    // Call notification service via HTTP (in production)
    // For now, skip notification creation in microservice

    const message = authorRole === 'admin' 
      ? "Post đã được đăng thành công" 
      : "Post đã được gửi, đang chờ admin duyệt";
    res.status(201).json({ post, message });
  } catch (err) {
    console.error("createPost error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

export async function getPosts(req, res) {
  try {
    const userId = req.user?.id || req.user?.userId;
    const role = req.user?.role;
    const { page = 1, limit = 20 } = req.query;

    const posts = await communityService.getPosts({
      userId,
      role,
      includePending: false,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    // Format URLs to absolute URLs (giống code cũ trong src)
    // Sử dụng x-forwarded-host và x-forwarded-proto từ API Gateway
    const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
    const host = req.get("x-forwarded-host") || req.get("host") || "localhost:4000";
    const baseUrl = `${protocol}://${host}`;
    const formattedPosts = formatPostsUrls(posts, baseUrl);

    const postIds = formattedPosts.map(p => p.id);
    const userLikes = userId ? await communityService.checkUserLikes(userId, { postIds }) : { posts: {} };

    const postsWithLikes = formattedPosts.map(post => ({
      ...post,
      is_liked: userLikes.posts[post.id] || false
    }));

    res.json({ posts: postsWithLikes });
  } catch (err) {
    console.error("getPosts error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

export async function markPostViewed(req, res) {
  try {
    const userId = req.user?.id || req.user?.userId;
    const { postId } = req.params;
    
    if (!userId || !postId) {
      return res.status(400).json({ message: "Missing userId or postId" });
    }

    await communityService.markPostAsViewed(userId, parseInt(postId));
    res.json({ message: "Post marked as viewed" });
  } catch (err) {
    console.error("markPostViewed error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

export async function getPostById(req, res) {
  try {
    const userId = req.user?.id || req.user?.userId;
    const role = req.user?.role;
    const { id } = req.params;

    const post = await communityService.getPostById(parseInt(id), { userId, role });
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Format URLs to absolute URLs (giống code cũ trong src)
    // Sử dụng x-forwarded-host và x-forwarded-proto từ API Gateway
    const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
    const host = req.get("x-forwarded-host") || req.get("host") || "localhost:4000";
    const baseUrl = `${protocol}://${host}`;
    const formattedPost = formatPostUrls(post, baseUrl);

    const comments = await communityService.getPostComments(parseInt(id));
    const commentIds = comments.map(c => c.id);
    const userLikes = userId ? await communityService.checkUserLikes(userId, { commentIds }) : { comments: {} };

    const commentsWithLikes = comments.map(comment => ({
      ...comment,
      is_liked: userLikes.comments[comment.id] || false
    }));

    const postLikes = userId ? await communityService.checkUserLikes(userId, { postIds: [formattedPost.id] }) : { posts: {} };
    formattedPost.is_liked = postLikes.posts[formattedPost.id] || false;

    res.json({ post: formattedPost, comments: commentsWithLikes });
  } catch (err) {
    console.error("getPostById error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

export async function getPendingPosts(req, res) {
  try {
    const { role } = req.user;
    if (role !== 'admin') {
      return res.status(403).json({ message: "Only admins can view pending posts" });
    }

    const { page = 1, limit = 20 } = req.query;
    const posts = await communityService.getPendingPosts({
      page: parseInt(page),
      limit: parseInt(limit)
    });

    // Format URLs to absolute URLs (giống code cũ trong src)
    // Sử dụng x-forwarded-host và x-forwarded-proto từ API Gateway
    const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
    const host = req.get("x-forwarded-host") || req.get("host") || "localhost:4000";
    const baseUrl = `${protocol}://${host}`;
    const formattedPosts = formatPostsUrls(posts, baseUrl);

    res.json({ posts: formattedPosts });
  } catch (err) {
    console.error("getPendingPosts error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

export async function getUserPosts(req, res) {
  try {
    const userId = req.user.id || req.user.userId;
    const { page = 1, limit = 20, status } = req.query;
    
    const posts = await communityService.getUserPosts(userId, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    // Format URLs to absolute URLs (giống code cũ trong src)
    // Sử dụng x-forwarded-host và x-forwarded-proto từ API Gateway
    const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
    const host = req.get("x-forwarded-host") || req.get("host") || "localhost:4000";
    const baseUrl = `${protocol}://${host}`;
    const formattedPosts = formatPostsUrls(posts, baseUrl);

    let filteredPosts = formattedPosts;
    if (status && status !== 'all') {
      filteredPosts = formattedPosts.filter(p => p.status === status);
    }

    const postIds = filteredPosts.map(p => p.id);
    const userLikes = await communityService.checkUserLikes(userId, { postIds });

    const postsWithLikes = filteredPosts.map(post => ({
      ...post,
      is_liked: userLikes.posts[post.id] || false
    }));

    res.json({ posts: postsWithLikes });
  } catch (err) {
    console.error("getUserPosts error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

export async function reviewPost(req, res) {
  try {
    const userId = req.user.id || req.user.userId;
    const role = req.user.role;
    if (role !== 'admin') {
      return res.status(403).json({ message: "Only admins can review posts" });
    }

    const { id } = req.params;
    const { action, rejectionReason } = req.body;

    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ message: "Invalid action. Must be 'approved' or 'rejected'" });
    }
    if(action==='rejected' && (typeof rejectionReason!=='string'||!rejectionReason.trim())) {
      return res.status(400).json({message:'Vui lòng nhập lý do từ chối'});
    }

    const post = await communityService.reviewPost({
      postId: parseInt(id),
      adminId: userId,
      action,
      rejectionReason: rejectionReason || null
    });

    if (!post) {
      return res.status(404).json({ message: "Post not found or already reviewed" });
    }

    // Notification will be handled by notification service via HTTP call
    res.json({ post, message: `Post đã được ${action === 'approved' ? 'duyệt' : 'từ chối'}` });
  } catch (err) {
    console.error("reviewPost error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

export async function deletePost(req, res) {
  try {
    const userId = req.user.id || req.user.userId;
    const role = req.user.role;
    const { id } = req.params;

    const post = await communityService.deletePost(parseInt(id), userId, role);
    if (!post) {
      return res.status(404).json({ message: "Post not found or unauthorized" });
    }

    res.json({ message: "Post đã được xóa" });
  } catch (err) {
    console.error("deletePost error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

export async function togglePinPost(req, res) {
  try {
    const { role } = req.user;
    if (role !== 'admin') {
      return res.status(403).json({ message: "Only admins can pin posts" });
    }

    const { id } = req.params;
    const { isPinned } = req.body;
    if(typeof isPinned!=='boolean')return res.status(400).json({message:'Trạng thái ghim không hợp lệ'});

    const post = await communityService.togglePinPost(parseInt(id), isPinned);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    res.json({ post, message: `Post đã được ${isPinned ? 'ghim' : 'bỏ ghim'}` });
  } catch (err) {
    console.error("togglePinPost error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

export async function createComment(req, res) {
  try {
    const userId = req.user.id || req.user.userId;
    const role = req.user.role;
    const { postId } = req.params;
    const { audioUrl, parentCommentId } = req.body;
    if(req.body.content!==undefined&&typeof req.body.content!=='string')return res.status(400).json({message:'Invalid comment text'});
    const content=req.body.content?.trim();

    let finalAudioUrl = audioUrl || null;
    if (req.file) {
      finalAudioUrl = `/uploads/${req.file.filename}`;
    }

    if (!content && !finalAudioUrl) {
      return res.status(400).json({ message: "Comment must have content or audio" });
    }

    const authorRole = role === 'learner' ? 'learner' : role === 'mentor' ? 'mentor' : role === 'admin' ? 'admin' : null;
    if (!authorRole) {
      return res.status(403).json({ message: "Invalid role" });
    }

    const comment = await communityService.createComment({
      postId: communityId(postId),
      authorId: userId,
      authorRole,
      content: content || null,
      audioUrl: finalAudioUrl,
      parentCommentId: parentCommentId ? communityId(parentCommentId) : null
    });

    res.status(201).json({ comment, message: "Comment đã được đăng" });
  } catch (err) {
    if(!err.status)console.error("createComment error:", err);
    res.status(err.status||500).json({ message: err.status?err.message:"Server error" });
  }
}

export async function getComments(req, res) {
  try {
    const { postId } = req.params;
    const userId = req.user?.id || req.user?.userId;

    const comments = await communityService.getPostComments(parseInt(postId));
    const commentIds = comments.map(c => c.id);
    const userLikes = userId ? await communityService.checkUserLikes(userId, { commentIds }) : { comments: {} };

    const commentsWithLikes = comments.map(comment => ({
      ...comment,
      is_liked: userLikes.comments[comment.id] || false
    }));

    res.json({ comments: commentsWithLikes });
  } catch (err) {
    console.error("getComments error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

export async function deleteComment(req, res) {
  try {
    const userId = req.user.id || req.user.userId;
    const role = req.user.role;
    const { id } = req.params;

    const comment = await communityService.deleteComment(parseInt(id), userId, role);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found or unauthorized" });
    }

    res.json({ message: "Comment đã được xóa" });
  } catch (err) {
    console.error("deleteComment error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

export async function toggleLike(req, res) {
  try {
    const userId = req.user.id || req.user.userId;
    const { postId, commentId } = req.body;

    if (!postId && !commentId) {
      return res.status(400).json({ message: "Must provide either postId or commentId" });
    }

    const result = await communityService.toggleLike({ userId, role:req.user.role, postId, commentId });
    res.json(result);
  } catch (err) {
    if(!err.status)console.error("toggleLike error:", err);
    res.status(err.status||500).json({ message: err.status?err.message:"Server error" });
  }
}

export async function getLikedPosts(req, res) {
  try {
    const userId = req.user.id || req.user.userId;
    const { page = 1, limit = 20 } = req.query;

    const posts = await communityService.getLikedPosts(userId, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    // Format URLs to absolute URLs (giống code cũ trong src)
    // Sử dụng x-forwarded-host và x-forwarded-proto từ API Gateway
    const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
    const host = req.get("x-forwarded-host") || req.get("host") || "localhost:4000";
    const baseUrl = `${protocol}://${host}`;
    const formattedPosts = formatPostsUrls(posts, baseUrl);

    const postIds = formattedPosts.map(p => p.id);
    const userLikes = await communityService.checkUserLikes(userId, { postIds });

    const postsWithLikes = formattedPosts.map(post => ({
      ...post,
      is_liked: userLikes.posts[post.id] || true
    }));

    res.json({ posts: postsWithLikes });
  } catch (err) {
    console.error("getLikedPosts error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

