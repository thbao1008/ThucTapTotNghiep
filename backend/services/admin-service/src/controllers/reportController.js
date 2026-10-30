import * as reportService from "../services/reportService.js";
import pool from "../config/db.js";

export async function createReport(req, res) {
  const { reporter_id, target_id, content, status, image_url, video_url } = req.body;
  if (!reporter_id || !target_id || !content) {
    return res.status(400).json({ success: false, message: "Thiếu dữ liệu" });
  }

  try {
    // Thử insert với image_url và video_url (nếu có)
    const result = await pool.query(
      `INSERT INTO reports (reporter_id, target_id, content, status, created_at, updated_at, image_url, video_url)
       VALUES (
         $1, 
         $2, 
         '[Report - ' || TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI:SS') || '] ' || $3,
         $4,
         NOW(),
         NOW(),
         $5,
         $6
       )
       RETURNING *`,
      [reporter_id, target_id, content, status || "pending", image_url || null, video_url || null]
    );
    return res.json({ success: true, report: result.rows[0] });
  } catch (err) {
    // Nếu lỗi do thiếu column image_url/video_url, thử insert không có
    if (err.code === "42703" || err.message.includes("image_url") || err.message.includes("video_url")) {
      try {
        const result = await pool.query(
          `INSERT INTO reports (reporter_id, target_id, content, status, created_at, updated_at)
           VALUES (
             $1, 
             $2, 
             '[Report - ' || TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI:SS') || '] ' || $3,
             $4,
             NOW(),
             NOW()
           )
           RETURNING *`,
          [reporter_id, target_id, content, status || "pending"]
        );
        return res.json({ success: true, report: result.rows[0], warning: "Bảng reports chưa có cột image_url/video_url. Vui lòng chạy ALTER TABLE để thêm." });
      } catch (err2) {
        console.error("createReport error (fallback): - reportController.js", err2.message);
        return res.status(500).json({ success: false, message: "Server error" });
      }
    }
    
    if (err.code === "23505") {
      // nếu đã tồn tại report cho cặp này thì append nội dung mới
      const updateRes = await pool.query(
        `UPDATE reports
         SET content = COALESCE(content, '') || '\n[Report bổ sung - ' || TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI:SS') || '] ' || $3,
             status = 'pending',
             reply = NULL,
             reply_by = NULL,
             reply_at = NULL,
             updated_at = NOW(),
             image_url = COALESCE($4, image_url),
             video_url = COALESCE($5, video_url)
         WHERE reporter_id = $1 AND target_id = $2
         RETURNING *`,
        [reporter_id, target_id, content, image_url || null, video_url || null]
      );

      if (updateRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Không tìm thấy report để cập nhật" });
      }
      return res.json({ success: true, report: updateRes.rows[0] });
    }

    console.error("createReport error: - reportController.js:84", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
}


export async function getReportSummary(req, res) {
  try {
    const { from, to } = req.query;
    const summary = await reportService.getReportSummary(from, to);
    res.json({ success: true, summary });
  } catch (err) {
    console.error("Error getReportSummary: - reportController.js:60", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

export async function getReports(req, res) {
  try {
    const { status } = req.query;
    const reports = await reportService.getReports(status);
    
    // Format image_url and video_url to absolute URLs (giống code cũ trong src)
    // Sử dụng x-forwarded-host và x-forwarded-proto từ API Gateway
    const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
    const host = req.get("x-forwarded-host") || req.get("host") || "localhost:4000";
    const baseUrl = `${protocol}://${host}`;
    
    const formattedReports = reports.map(report => ({
      ...report,
      image_url: report.image_url?.startsWith("/") ? `${baseUrl}${report.image_url}` : report.image_url,
      video_url: report.video_url?.startsWith("/") ? `${baseUrl}${report.video_url}` : report.video_url
    }));
    
    res.json({ success: true, reports: formattedReports });
  } catch (err) {
    console.error("Error getReports: - reportController.js:71", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

export async function searchLearnerProgress(req, res) {
  try {
    const { query } = req.query;
    const learners = await reportService.searchLearnerProgress(query);
    res.json({ success: true, learners });
  } catch (err) {
    console.error("Error searchLearnerProgress: - reportController.js:82", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

export async function getAllLearnersWithProgress(req, res) {
  try {
    const { mentor_id, search } = req.query;
    const mentorId = mentor_id ? parseInt(mentor_id) : null;
    const searchQuery = search || null;
    const learners = await reportService.getAllLearnersWithProgress(mentorId, searchQuery);
    res.json({ success: true, learners });
  } catch (err) {
    console.error("Error getAllLearnersWithProgress: - reportController.js", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

export async function getAllMentors(req, res) {
  try {
    const mentors = await reportService.getAllMentors();
    res.json({ success: true, mentors });
  } catch (err) {
    console.error("Error getAllMentors: - reportController.js", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}


export async function updateReportStatus(req,res){
 try{
  if(!['pending','resolved','dismissed'].includes(req.body.status))return res.status(400).json({success:false,message:'Trạng thái không hợp lệ'});
  const report=await reportService.updateReportStatus(req.params.id,req.body.status,req.body.replyContent);
  if(!report)return res.status(404).json({success:false,message:'Không tìm thấy report'});
  return res.json({success:true,report});
 }catch(error){return res.status(500).json({success:false,message:'Không thể cập nhật report'});}
}

export async function checkCanReport(req, res) {
  try {
    const { reporter_id, target_id } = req.query;
    if (!reporter_id || !target_id) {
      return res.status(400).json({ success: false, message: "Thiếu reporter_id hoặc target_id" });
    }
    
    const result = await reportService.canReport(parseInt(reporter_id), parseInt(target_id));
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Error checkCanReport: - reportController.js", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

export async function updateLearnerNote(req, res) {
  try {
    const { id } = req.params;
    const { note } = req.body;

    const learner = await reportService.updateLearnerNote(id, note);
    if (!learner) {
      return res.status(404).json({ success: false, message: "Learner not found" });
    }

    res.json({ success: true, learner });
  } catch (err) {
    console.error("Error updateLearnerNote: - reportController.js:148", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}
