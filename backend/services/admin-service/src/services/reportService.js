import pool from "../config/db.js";

// Thống kê số lượng học viên, mentor, report theo thời gian
export async function getReportSummary(from, to) {
  if (!from || !to) {
    const result = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM learners) AS total_learners,
        (SELECT COUNT(*) FROM mentors) AS total_mentors,
        (SELECT COUNT(*) FROM reports) AS total_reports
    `);
    return result.rows[0];
  }

  const result = await pool.query(`
    SELECT 
      (SELECT COUNT(*) 
         FROM learners l
         JOIN users u ON l.user_id = u.id
         WHERE u.created_at >= $1::date 
           AND u.created_at < ($2::date + interval '1 day')) AS total_learners,
      (SELECT COUNT(*) 
         FROM mentors m
         JOIN users u ON m.user_id = u.id
         WHERE u.created_at >= $1::date 
           AND u.created_at < ($2::date + interval '1 day')) AS total_mentors,
      (SELECT COUNT(*) 
         FROM reports r
         WHERE r.created_at >= $1::date 
           AND r.created_at < ($2::date + interval '1 day')) AS total_reports
  `, [from, to]);

  return result.rows[0];
}

// Lấy danh sách learners với mentor name và average score cho admin
export async function getAllLearnersWithProgress(mentorId = null, searchQuery = null) {
  let query = `
    SELECT 
      l.id AS learner_id,
      u.id AS user_id,
      u.name AS learner_name,
      u.email,
      u.phone,
      m.id AS mentor_id,
      mu.id AS mentor_user_id,
      mu.name AS mentor_name,
      NULL::numeric AS average_score,
      (SELECT COUNT(*) 
       FROM practice_history 
       WHERE learner_id = l.id 
         AND practice_type = 'speaking_practice') AS practice_attempts,
      (SELECT COUNT(*) 
       FROM submissions s
       JOIN challenges c ON s.challenge_id = c.id
       WHERE s.learner_id = l.id) AS challenge_attempts
    FROM learners l
    JOIN users u ON l.user_id = u.id
    LEFT JOIN mentors m ON l.mentor_id = m.id
    LEFT JOIN users mu ON m.user_id = mu.id
    WHERE 1=1
  `;
  
  const params = [];
  let paramIndex = 1;
  
  // Filter theo mentor
  if (mentorId) {
    query += ` AND m.id = $${paramIndex}`;
    params.push(mentorId);
    paramIndex++;
  }
  
  // Search theo tên hoặc số điện thoại
  if (searchQuery && searchQuery.trim()) {
    query += ` AND (u.name ILIKE $${paramIndex} OR u.phone ILIKE $${paramIndex})`;
    params.push(`%${searchQuery.trim()}%`);
    paramIndex++;
  }
  
  query += ` ORDER BY u.name ASC`;
  
  const result = await pool.query(query, params);
  return result.rows;
}

// Lấy danh sách tất cả mentors để hiển thị trong dropdown
export async function getAllMentors() {
  const result = await pool.query(`
    SELECT 
      m.id AS mentor_id,
      u.name AS mentor_name,
      u.email,
      u.phone
    FROM mentors m
    JOIN users u ON m.user_id = u.id
    ORDER BY u.name ASC
  `);
  return result.rows;
}

// Lấy danh sách reports (có filter trạng thái)
export async function getReports(status) {
  const result = await pool.query(`
    SELECT r.id AS report_id,
           r.content,
           r.status,
           r.created_at,
           r.reply,
           r.reply_by,
           r.reply_at,
           r.image_url,
           r.video_url,
           reporter.id AS reporter_id,
           reporter.name AS reporter_name,
           reporter.role AS reporter_role,
           target.id AS target_id,
           target.name AS target_name,
           target.role AS target_role
    FROM reports r
    LEFT JOIN users reporter ON r.reporter_id = reporter.id
    LEFT JOIN users target   ON r.target_id   = target.id
    WHERE ($1::text = '' OR r.status = $1)
    ORDER BY r.created_at DESC;
  `, [status || '']);
  return result.rows;
}

// Search learner progress (alias for getAllLearnersWithProgress)
export async function searchLearnerProgress(query) {
  return getAllLearnersWithProgress(null, query);
}

// Cập nhật trạng thái report + xử lý reply/note
export async function updateReportStatus(id,status,replyContent=null){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const {rows:[current]}=await client.query('SELECT * FROM reports WHERE id=$1 FOR UPDATE',[id]);
  if(!current){await client.query('COMMIT');return null;}
  const reply=typeof replyContent==='string'?replyContent.trim():status==='resolved'?'Phản hồi được chấp nhận đang tiến hành xử lý':status==='dismissed'?'Phản hồi bị từ chối vì chưa đủ căn cứ.':null;
  await client.query(`UPDATE reports SET status=$2,reply=COALESCE($3,reply),reply_by=CASE WHEN $3::text IS NULL THEN reply_by ELSE 'admin' END,reply_at=CASE WHEN $3::text IS NULL THEN reply_at ELSE NOW() END,updated_at=NOW() WHERE id=$1`,[id,status,reply]);
  if(current.status!==status && ['resolved','dismissed'].includes(status)){
   await client.query(`UPDATE learners SET note=COALESCE(note,'')||E'\n[Admin report] '||$2,updated_at=NOW() WHERE user_id=$1`,[current.target_id,status]);
  }
  const {rows:[updated]}=await client.query(`SELECT r.*,r.id AS report_id,reporter.name AS reporter_name,reporter.role AS reporter_role,target.name AS target_name,target.role AS target_role FROM reports r LEFT JOIN users reporter ON reporter.id=r.reporter_id LEFT JOIN users target ON target.id=r.target_id WHERE r.id=$1`,[id]);
  await client.query('COMMIT');return updated;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

/**
 * Check if reporter can report target (24 hours since last report)
 */
export async function canReport(reporterId, targetId) {
  const result = await pool.query(
    `SELECT MAX(created_at) AS last_report_date
     FROM reports
     WHERE reporter_id = $1 AND target_id = $2`,
    [reporterId, targetId]
  );
  
  const lastDate = result.rows[0]?.last_report_date;
  if (!lastDate) return { canReport: true, hoursRemaining: 0, lastReportDate: null };
  
  const lastReportTime = new Date(lastDate).getTime();
  const now = Date.now();
  const hoursSince = (now - lastReportTime) / (1000 * 60 * 60);
  const canReport = hoursSince >= 24;
  const hoursRemaining = canReport ? 0 : Math.ceil(24 - hoursSince);
  
  return { canReport, hoursRemaining, lastReportDate: lastDate };
}

// Cập nhật ghi chú cho learner (mentor nhập)
// Fixed: nhận id và note thay vì req, res
export async function updateLearnerNote(id, note) {
  try {
    const nowFormatted = await pool.query(
      `SELECT TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI:SS') AS ts`
    );
    const timestamp = nowFormatted.rows[0].ts;

    const result = await pool.query(
      `UPDATE learners 
       SET note = COALESCE(note, '') || '\n[Mentor nhập - ${timestamp}] ' || $1,
           updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [note, id]
    );

    if (!result.rows.length) {
      return null;
    }

    return result.rows[0];
  } catch (err) {
    console.error("Error updateLearnerNote: - reportService.js", err);
    throw err;
  }
}

