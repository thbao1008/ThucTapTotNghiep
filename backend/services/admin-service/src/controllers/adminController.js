import { createAccount, setAccountStatus, assignMentor, listAssignableMentors, resetManagedPassword } from "../services/accountAdministration.js";
﻿// Admin Service - Controller
import bcrypt from "bcryptjs";
import pool from "../config/db.js";
// TODO: Replace with API calls to User Service
import {
  updateUserInDb,
  deleteUserInDb
} from "../models/userModel.js";
// TODO: Replace with API calls to Learner Service
// import * as learnerService from "../services/learnerService.js";

// Lấy danh sách user (JOIN learners + view + mentor)
export async function listUsers(req, res) {
  try {
    const result = await pool.query(`
      SELECT 
    u.id, u.name, u.email, u.phone, u.dob, u.role, u.status, u.created_at,
    l.id AS learner_id,
    lp.package_name,
    lp.status AS package_status,
    (lp.status='active' AND lp.effective_expiry>NOW()) AS package_is_active,
    lp.effective_expiry AS expiry_date,
    CASE WHEN lp.purchase_id IS NULL THEN NULL ELSE GREATEST(0,CEIL(EXTRACT(EPOCH FROM (lp.effective_expiry-NOW()))/86400))::int END AS days_left,
    mu.id AS mentor_id,
    mu.name AS mentor_name
  FROM users u
  LEFT JOIN learners l ON l.user_id = u.id
  LEFT JOIN LATERAL (
    SELECT p.*,COALESCE(p.expiry_date,p.created_at+COALESCE(p.duration_days,0)*INTERVAL '1 day')+COALESCE(p.extra_days,0)*INTERVAL '1 day' AS effective_expiry
    FROM learner_package_view p WHERE p.learner_id=l.id
    ORDER BY (p.status='active' AND COALESCE(p.expiry_date,p.created_at+COALESCE(p.duration_days,0)*INTERVAL '1 day')+COALESCE(p.extra_days,0)*INTERVAL '1 day'>NOW()) DESC,p.created_at DESC,p.purchase_id DESC LIMIT 1
  ) lp ON TRUE
  LEFT JOIN mentors m ON l.mentor_id = m.id
  LEFT JOIN users mu ON m.user_id = mu.id
  ORDER BY u.id DESC
    `);

    // Format avatar_url to absolute URLs (chỉ format relative paths, không format base64)
    // Base64 images (data:image/...) không cần format
    const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
    const host = req.get("x-forwarded-host") || req.get("host") || "localhost:4000";
    const baseUrl = `${protocol}://${host}`;
    
    const formattedUsers = result.rows.map(user => ({
      ...user,
      avatar_url: user.avatar_url?.startsWith("data:") 
        ? user.avatar_url  // Base64, giữ nguyên
        : user.avatar_url?.startsWith("/") 
          ? `${baseUrl}${user.avatar_url}`  // Relative path, format thành absolute
          : user.avatar_url  // Đã là absolute URL hoặc null
    }));

    return res.json({ success: true, users: formattedUsers });
  } catch (err) {
    console.error("listUsers error - adminController.js:34", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// Lấy user theo id (JOIN learners + view + mentor)
export async function getUser(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
    u.id, u.name, u.email, u.phone, u.dob, u.role, u.status, u.created_at, u.avatar_url,
    l.id AS learner_id,
    lp.package_name,
    lp.status AS package_status,
    (lp.status='active' AND lp.effective_expiry>NOW()) AS package_is_active,
    lp.effective_expiry AS expiry_date,
    CASE WHEN lp.purchase_id IS NULL THEN NULL ELSE GREATEST(0,CEIL(EXTRACT(EPOCH FROM (lp.effective_expiry-NOW()))/86400))::int END AS days_left,
    mu.id AS mentor_id,
    mu.name AS mentor_name,
    m.id AS mentor_mentor_id,
    m.rating AS mentor_rating,
    NULL::numeric AS learner_average_score
  FROM users u
  LEFT JOIN learners l ON l.user_id = u.id
  LEFT JOIN LATERAL (
    SELECT p.*,COALESCE(p.expiry_date,p.created_at+COALESCE(p.duration_days,0)*INTERVAL '1 day')+COALESCE(p.extra_days,0)*INTERVAL '1 day' AS effective_expiry
    FROM learner_package_view p WHERE p.learner_id=l.id
    ORDER BY (p.status='active' AND COALESCE(p.expiry_date,p.created_at+COALESCE(p.duration_days,0)*INTERVAL '1 day')+COALESCE(p.extra_days,0)*INTERVAL '1 day'>NOW()) DESC,p.created_at DESC,p.purchase_id DESC LIMIT 1
  ) lp ON TRUE
  LEFT JOIN mentors m ON l.mentor_id = m.id
  LEFT JOIN users mu ON m.user_id = mu.id
  WHERE u.id = $1
    `, [id]);
    
    // Nếu là mentor, lấy thêm rating
    if (result.rows.length > 0 && result.rows[0].role?.toUpperCase() === "MENTOR") {
      const mentorRes = await pool.query(`
        SELECT m.rating,m.bio,m.id
        FROM mentors m
        WHERE m.user_id = $1
      `, [id]);
      if (mentorRes.rows.length > 0) {
        result.rows[0].mentor_rating = mentorRes.rows[0].rating;
        result.rows[0].mentor_bio = mentorRes.rows[0].bio;
        result.rows[0].mentor_mentor_id = mentorRes.rows[0].id;
      }
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    // Format avatar_url to absolute URL (giống code cũ trong src)
    // Sử dụng x-forwarded-host và x-forwarded-proto từ API Gateway
    const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
    const host = req.get("x-forwarded-host") || req.get("host") || "localhost:4000";
    const baseUrl = `${protocol}://${host}`;
    
    const user = result.rows[0];
    // Format avatar_url (chỉ format relative paths, không format base64)
    if (user.avatar_url && !user.avatar_url.startsWith("data:") && user.avatar_url.startsWith("/")) {
      user.avatar_url = `${baseUrl}${user.avatar_url}`;
    }

    return res.json({ success: true, user });
  } catch (err) {
    console.error("getUser error - adminController.js:67", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// Tạo user mới
export async function createUser(req,res) {
  try {
    if (typeof req.body.password !== 'string' || req.body.password.length < 8) return res.status(400).json({success:false,message:'Mật khẩu cần ít nhất 8 ký tự'});
    const hash = await bcrypt.hash(req.body.password,10);
    return res.status(201).json({success:true,...await createAccount(req.body,hash)});
  } catch(err) {
    return res.status(err.code === '23505' ? 409 : err.status || 500).json({success:false,message:err.code==='23505'?'Email hoặc SĐT đã tồn tại':err.status?err.message:'Không thể tạo tài khoản'});
  }
}

// Đặt lại mật khẩu tài khoản được quản lý và thu hồi phiên cũ.
export async function updateUser(req,res){
 try{
  const password=req.body.password;
  if(typeof password!=='string'||password.length<8)return res.status(400).json({success:false,message:'Mật khẩu cần ít nhất 8 ký tự'});
  const hash=await bcrypt.hash(password,10);
  return res.json({success:true,user:await resetManagedPassword(req.params.id,hash)});
 }catch(error){return res.status(error.status||500).json({success:false,message:error.status?error.message:'Không thể đặt lại mật khẩu'});}
}

// Upload avatar
// Lưu base64 vào avatar_url, không lưu file vào thư mục upload
export async function uploadAvatar(req, res) {
  try {
    const { id } = req.params;
    const requester = req.user;
    
    // Chỉ cho phép user upload avatar của chính mình (hoặc admin)
    if (requester.role?.toLowerCase() !== "admin" && requester.id !== parseInt(id) && requester.userId !== parseInt(id) && requester._id !== parseInt(id)) {
      return res.status(403).json({ success: false, message: "Không có quyền cập nhật avatar" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Không có file được upload" });
    }

    // Convert file buffer to base64
    const base64String = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';
    const avatarUrl = `data:${mimeType};base64,${base64String}`;

    const updated = await updateUserInDb(id, { avatar_url: avatarUrl });
    if (!updated) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const { password: _, ...safe } = updated;
    return res.json({ success: true, user: safe });
  } catch (err) {
    console.error("uploadAvatar error - adminController.js", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// Xóa user
export async function deleteUser(req, res) {
  try {
    const current=await pool.query('SELECT role FROM users WHERE id=$1',[req.params.id]);
    if(current.rows[0]?.role?.toLowerCase()==='admin')return res.status(403).json({success:false,message:'Không xóa tài khoản Admin từ giao diện'});
    const deleted = await deleteUserInDb(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true });
  } catch (err) {
    console.error("deleteUser error - adminController.js:168", err);
    return res.status(err.code==='23503'?409:500).json({ success: false, message: err.code==='23503'?'Tài khoản có lịch sử học tập, hãy dùng khóa tài khoản':'Server error' });
  }
}

// Toggle trạng thái (active/banned)
export async function toggleUserStatus(req,res) {
  try {
    const {status,ban_reason,unban_reason}=req.body;
    return res.json({success:true,...await setAccountStatus(req.params.id,status,status==='banned'?ban_reason:unban_reason,req.user.id)});
  } catch(err) {return res.status(err.status || 500).json({success:false,message:err.status?err.message:'Không thể cập nhật trạng thái'});}
}



export async function changeLearnerMentor(req,res){try{return res.json({success:true,...await assignMentor(req.body.learnerId,req.body.newMentorId),message:'Đã cập nhật Mentor cho học viên'});}catch(error){return res.status(error.status||500).json({success:false,message:error.status?error.message:'Không thể đổi Mentor'});}}

export async function getAvailableMentors(req,res){try{return res.json({success:true,mentors:await listAssignableMentors(req.params.learnerId)});}catch(error){return res.status(error.status||500).json({success:false,message:error.status?error.message:'Không thể tải Mentor'});}}
