import pool from '../config/db.js';

export function positiveId(value) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw Object.assign(new Error('Mã định danh không hợp lệ'), { status: 400 });
  }
  return Number(value);
}

export async function transaction(work, database = pool) {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function createAccount(input, passwordHash, database = pool) {
  const role = typeof input.role === 'string' ? input.role.toLowerCase() : '';
  if (role === 'admin') throw Object.assign(new Error('Không được tạo admin từ giao diện'), { status: 403 });
  if (!['learner', 'mentor'].includes(role)) throw Object.assign(new Error('Vai trò không hợp lệ'), { status: 400 });
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Tên hoặc email không hợp lệ'), { status: 400 });
  if (input.packageId && role !== 'learner') throw Object.assign(new Error('Chỉ học viên được đăng ký gói'), { status: 400 });
  return transaction(async client => {
    const duplicate=await client.query('SELECT 1 FROM users WHERE LOWER(email)=$1 OR ($2::text IS NOT NULL AND phone=$2) LIMIT 1',[email,input.phone?.trim()||null]);
    if(duplicate.rowCount)throw Object.assign(new Error('Email hoặc SĐT đã tồn tại'),{status:409});
    if (input.packageId) {
      const pkg = await client.query('SELECT duration_days FROM packages WHERE id=$1 FOR SHARE', [positiveId(input.packageId)]);
      if (!pkg.rowCount || !(pkg.rows[0].duration_days > 0)) throw Object.assign(new Error('Gói học không hợp lệ'), { status: 400 });
    }
    const { rows: [user] } = await client.query(`INSERT INTO users (name,email,phone,dob,role,password,status)
      VALUES ($1,$2,$3,$4,$5,$6,'active') RETURNING id,name,email,phone,dob,role,status,created_at`,
    [name, email, input.phone?.trim() || null, input.dob || null, role, passwordHash]);
    let learnerId = null, mentorId = null;
    if (role === 'learner') {
      const { rows: [learner] } = await client.query('INSERT INTO learners (user_id,start_date) VALUES ($1,CURRENT_DATE) RETURNING id', [user.id]);
      learnerId = learner.id;
      if (input.packageId) await client.query(`INSERT INTO purchases (learner_id,package_id,status,created_at,expiry_date,extra_days)
        SELECT $1,id,'active',NOW(),NOW()+duration_days*INTERVAL '1 day',0 FROM packages WHERE id=$2`, [learnerId, input.packageId]);
    } else {
      const { rows: [mentor] } = await client.query('INSERT INTO mentors (user_id) VALUES ($1) RETURNING id', [user.id]);
      mentorId = mentor.id;
    }
    return { user, learnerId, mentorId };
  }, database);
}

export async function setAccountStatus(id, status, reason, adminId, database = pool) {
  id = positiveId(id);
  if (!['active', 'banned'].includes(status)) throw Object.assign(new Error('Trạng thái không hợp lệ'), { status: 400 });
  return transaction(async client => {
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '8s'");
    const { rows: [current] } = await client.query('SELECT id,name,email,phone,dob,avatar_url,role,status,ban_reason FROM users WHERE id=$1 FOR UPDATE', [id]);
    if (!current) throw Object.assign(new Error('Không tìm thấy tài khoản'), { status: 404 });
    if (current.role === 'admin') throw Object.assign(new Error('Không thay đổi trạng thái Admin từ giao diện'), { status: 403 });
    if (current.status === status) return { user: current, changed: false };
    if (typeof reason !== 'string' || !reason.trim()) throw Object.assign(new Error('Vui lòng nhập lý do'), { status: 400 });
    const { rows: [user] } = await client.query(`UPDATE users SET status=$2::varchar,ban_reason=CASE WHEN $2::varchar='banned' THEN $3::text ELSE NULL END,updated_at=NOW()
      WHERE id=$1 RETURNING id,name,email,phone,dob,avatar_url,role,status,ban_reason`, [id, status, reason.trim()]);
    await client.query('INSERT INTO ban_history (user_id,action,reason,admin_id) VALUES ($1,$2,$3,$4)', [id, status === 'banned' ? 'banned' : 'unbanned', reason.trim(), adminId]);
    if (status === 'banned') {
      await client.query('UPDATE user_sessions SET is_active=FALSE WHERE user_id=$1 AND is_active=TRUE', [id]);
      // Admin explicitly selects the replacement Mentor. No automatic assignment or blocklist.
      if(current.role==='mentor')await client.query('UPDATE learners SET mentor_id=NULL,updated_at=NOW() WHERE mentor_id IN (SELECT id FROM mentors WHERE user_id=$1)',[id]);
    }

    // Subscription time always continues. Banning/unbanning never changes purchases.
    return { user, changed: true };
  }, database).catch(error => {
    if (error.code === '55P03') throw Object.assign(new Error('Tài khoản đang được xử lý. Hãy tải lại hồ sơ rồi thử lại.'), {status:409,code:'ACCOUNT_BUSY'});
    if (error.code === '57014') throw Object.assign(new Error('Yêu cầu đã quá thời gian xử lý và được hủy. Hãy tải lại hồ sơ.'), {status:503,code:'ACCOUNT_TIMEOUT'});
    throw error;
  });
}

export async function listAssignableMentors(learnerId, database=pool) {
  learnerId=positiveId(learnerId);
  const exists=await database.query('SELECT id FROM learners WHERE id=$1',[learnerId]);
  if(!exists.rowCount)throw Object.assign(new Error('Không tìm thấy học viên'),{status:404});
  const {rows}=await database.query(`SELECT m.id AS mentor_id,u.id AS user_id,u.name AS mentor_name,
    COUNT(l.id)::int AS learner_count FROM mentors m JOIN users u ON u.id=m.user_id LEFT JOIN learners l ON l.mentor_id=m.id
    WHERE u.status='active' AND u.role='mentor' AND m.id IS DISTINCT FROM (SELECT mentor_id FROM learners WHERE id=$1)
    GROUP BY m.id,u.id,u.name HAVING COUNT(l.id)<15 ORDER BY COUNT(l.id),u.name,m.id`,[learnerId]);
  return rows;
}

export async function assignMentor(learnerId,newMentorId,database=pool) {
  learnerId=positiveId(learnerId);newMentorId=positiveId(newMentorId);
  return transaction(async client=>{
    const {rows:[mentor]}=await client.query(`SELECT m.id,u.status,u.role FROM mentors m JOIN users u ON u.id=m.user_id WHERE m.id=$1 FOR UPDATE OF m,u`,[newMentorId]);
    if(!mentor)throw Object.assign(new Error('Không tìm thấy Mentor'),{status:404});
    if(mentor.status!=='active'||mentor.role!=='mentor')throw Object.assign(new Error('Mentor không còn hoạt động'),{status:409});
    const {rows:[learner]}=await client.query('SELECT id,mentor_id FROM learners WHERE id=$1 FOR UPDATE',[learnerId]);
    if(!learner)throw Object.assign(new Error('Không tìm thấy học viên'),{status:404});
    if(learner.mentor_id===newMentorId)return{newMentorId,changed:false};
    const {rows:[load]}=await client.query('SELECT count(*)::int AS count FROM learners WHERE mentor_id=$1',[newMentorId]);
    if(load.count>=15)throw Object.assign(new Error('Mentor đã đủ số học viên được phân công'),{status:409});
    await client.query('UPDATE learners SET mentor_id=$2,updated_at=NOW() WHERE id=$1',[learnerId,newMentorId]);
    return{newMentorId,changed:true};
  },database);
}

export async function resetManagedPassword(userId,passwordHash,database=pool) {
  userId=positiveId(userId);
  return transaction(async client=>{
    const {rows:[existing]}=await client.query('SELECT id,role FROM users WHERE id=$1 FOR UPDATE',[userId]);
    if(!existing)throw Object.assign(new Error('Không tìm thấy tài khoản'),{status:404});
    if(!['learner','mentor'].includes(existing.role))throw Object.assign(new Error('Chỉ đặt lại mật khẩu Learner hoặc Mentor từ giao diện'),{status:403});
    const {rows:[user]}=await client.query('UPDATE users SET password=$2,updated_at=NOW() WHERE id=$1 RETURNING id,name,email,phone,role,status',[userId,passwordHash]);
    await client.query('UPDATE user_sessions SET is_active=FALSE WHERE user_id=$1 AND is_active=TRUE',[userId]);
    return user;
  },database);
}
