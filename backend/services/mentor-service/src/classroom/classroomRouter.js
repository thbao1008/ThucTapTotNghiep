import { Router } from 'express';
import { CLASS_TOPICS, topicById } from './catalog.js';
import { notifyClassroom } from './classroomNotifications.js';

const problem = (status, message) => Object.assign(new Error(message), { status });
const id = value => {
 if (!['string','number'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw problem(400,'ID không hợp lệ');
 return Number(value);
};
const text = (value, max, required = true) => {
 if (value === undefined && !required) return '';
 if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw problem(400,'Nội dung không hợp lệ');
 return value.trim();
};
const topic = value => { if (!topicById(value)) throw problem(400,'Chọn một chủ đề hợp lệ'); return value; };
const uuid = value => {if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw problem(400,'Mã yêu cầu không hợp lệ');return value;};
export function validateClassSlot(body, now = new Date()) {
 const start = typeof body.startTime === 'string' ? new Date(body.startTime) : new Date(NaN);
 const end = typeof body.endTime === 'string' ? new Date(body.endTime) : new Date(NaN);
 if (!Number.isFinite(+start) || !Number.isFinite(+end) || start <= now || end <= start || end-start > 7200000) throw problem(400,'Chọn giờ bắt đầu trong tương lai, thời lượng tối đa 2 tiếng');
 let url; try { url = new URL(body.meetingLink); } catch { throw problem(400,'Link học phải dùng HTTP/HTTPS'); }
 if (!['http:','https:'].includes(url.protocol) || url.username || url.password || /[\u0000-\u0020\u007f]/.test(body.meetingLink)) throw problem(400,'Link học không hợp lệ');
 return [start.toISOString(),end.toISOString(),url.href];
}
export function createClassroomRouter({ pool }) {
 const router = Router();
 const wrap = work => async (req,res,next) => {
  try { await work(req,res,next); }
  catch(error) { if(!error.status) console.error('Classroom operation failed',error.code || error.name); res.status(error.status || 500).json({message:error.status ? error.message : 'Không thể xử lý yêu cầu. Hãy tải lại để kiểm tra.'}); }
 };
 const tx = async work => {
  const client=await pool.connect(); let broken=false;
  try { await client.query('BEGIN ISOLATION LEVEL READ COMMITTED'); await client.query("SET LOCAL lock_timeout='3s'"); await client.query("SET LOCAL statement_timeout='8s'"); const result=await work(client); try{await client.query('COMMIT');}catch(error){broken=true;throw error;} return result; }
  catch(error){try{await client.query('ROLLBACK');}catch{broken=true;}throw error;}finally{client.release(broken);}
 };
 router.use(wrap(async(req,res,next)=>{
  const {rows:[actor]}=await pool.query(`SELECT u.id AS user_id,u.role,l.id AS learner_id,m.id AS mentor_id FROM users u
   LEFT JOIN learners l ON l.user_id=u.id LEFT JOIN mentors m ON m.user_id=u.id WHERE u.id=$1 AND u.status='active'`,[id(req.user?.id)]);
  if(!actor || !['learner','mentor'].includes(actor.role) || !(actor.role==='mentor'?actor.mentor_id:actor.learner_id)) throw problem(403,'Chỉ learner/mentor đang hoạt động mới có quyền truy cập');
  req.actor=actor;
  next();
 }));
 const requireMentor = actor => {if(actor.role!=='mentor')throw problem(403,'Chỉ mentor được thực hiện thao tác này');};
 const requireLearner = actor => {if(actor.role!=='learner')throw problem(403,'Chỉ learner được thực hiện thao tác này');};
 const ownedClass = async(client,classId,actor) => {
  requireMentor(actor); const {rows:[row]}=await client.query('SELECT * FROM online_classes WHERE id=$1 FOR UPDATE',[id(classId)]);
  if(!row || row.mentor_id!==actor.mentor_id)throw problem(404,'Không tìm thấy lớp của bạn'); return row;
 };
 router.get('/catalog',wrap(async(req,res)=>{
  const {rows:mentors}=await pool.query(`SELECT m.id,u.name FROM mentors m JOIN users u ON u.id=m.user_id WHERE u.status='active' ORDER BY u.name,m.id`);
  res.json({topics:CLASS_TOPICS,mentors,actor:req.actor});
 }));
 router.get('/classes',wrap(async(req,res)=>{
  const a=req.actor, values=[a.learner_id || null], clauses=[];
  const add=(sql,value)=>{values.push(value);clauses.push(sql.replace('?',`$${values.length}`));};
  if(req.query.topicId)add('c.topic_id=?',topic(req.query.topicId));
  if(req.query.mentorId)add('c.mentor_id=?',id(req.query.mentorId));
  const matching=CLASS_TOPICS.filter(t=>(!req.query.category || t.category===req.query.category)&&(!req.query.level || t.level===req.query.level)).map(t=>t.id);
  add('c.topic_id=ANY(?::text[])',matching);
  if(req.query.q)add('c.title ILIKE ?',`%${text(req.query.q,100)}%`);
  if(req.query.history!=='true')clauses.push("c.status='scheduled' AND c.end_time>now()");
  if(req.query.mine==='true'){if(a.role==='mentor')add('c.mentor_id=?',a.mentor_id);else clauses.push("r.status='registered'");}
  const page=req.query.page===undefined?1:id(req.query.page); if(page>20000)throw problem(400,'Trang không hợp lệ');
  const where=clauses.length?`WHERE ${clauses.join(' AND ')}`:'';
  const joins=`FROM online_classes c JOIN mentors m ON m.id=c.mentor_id JOIN users u ON u.id=m.user_id
   LEFT JOIN online_class_registrations r ON r.class_id=c.id AND r.learner_id=$1`;
  const {rows:[count]}=await pool.query(`SELECT count(*)::integer AS total ${joins} ${where}`,values);
  values.push((page-1)*20);
  const {rows:classes}=await pool.query(`SELECT c.id,c.mentor_id,c.topic_id,c.title,c.description,c.start_time,c.end_time,c.capacity,c.status,
   u.name AS mentor_name,r.status AS registration_status,r.attendance,
   EXISTS(SELECT 1 FROM online_class_registrations booked
     JOIN online_classes other ON other.id=booked.class_id
     WHERE booked.learner_id=$1 AND booked.status='registered' AND other.status='scheduled'
       AND other.id<>c.id AND other.start_time<c.end_time AND other.end_time>c.start_time) AS has_time_conflict,
   (SELECT count(*)::integer FROM online_class_registrations x WHERE x.class_id=c.id AND x.status='registered') AS registered_count
   ${joins} ${where} ORDER BY c.start_time,c.id LIMIT 20 OFFSET $${values.length}`,values);
  res.json({classes,total:count.total,page});
 }));
 router.post('/classes',wrap(async(req,res)=>{
  const a=req.actor; requireMentor(a); const b=req.body||{};
  const clientId=uuid(b.clientId),title=text(b.title,160), description=text(b.description,5000,false), topicId=topic(b.topicId), [start,end,link]=validateClassSlot(b);
  const created=await tx(async client=>{
   await client.query('SELECT pg_advisory_xact_lock(1380143941,hashtext($1))',[`${a.mentor_id}:${clientId}`]);
   const {rows:[previous]}=await client.query('SELECT * FROM online_classes WHERE mentor_id=$1 AND client_id=$2',[a.mentor_id,clientId]);
   if(previous){if(previous.title!==title||previous.topic_id!==topicId||previous.description!==description||new Date(previous.start_time).toISOString()!==start||new Date(previous.end_time).toISOString()!==end||previous.meeting_link!==link)throw problem(409,'Mã mở lớp đã được dùng. Hãy kiểm tra lớp đã lưu trước khi tạo buổi khác.');return {id:previous.id};}
   let request;
   if(b.requestId){const result=await client.query('SELECT * FROM online_class_requests WHERE id=$1 AND mentor_id=$2 FOR UPDATE',[id(b.requestId),a.mentor_id]);request=result.rows[0];if(!request || request.status!=='pending')throw problem(409,'Yêu cầu đã xử lý hoặc không thuộc bạn');}
   const {rows:[row]}=await client.query(`INSERT INTO online_classes(mentor_id,topic_id,title,description,start_time,end_time,meeting_link,client_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[a.mentor_id,topicId,title,description,start,end,link,clientId]);
   if(request){
    await client.query("UPDATE online_class_requests SET status='scheduled',class_id=$1 WHERE id=$2",[row.id,request.id]);
    const {rows:[learner]}=await client.query('SELECT user_id FROM learners WHERE id=$1',[request.learner_id]);
    await notifyClassroom(client,{recipients:[learner.user_id],actorId:a.user_id,type:'classroom_scheduled',title:'Mentor đã mở lớp theo yêu cầu',
     message:`Yêu cầu #${request.id} đã có lớp #${row.id}. Mở Lớp trực tuyến để xem giờ và đăng ký.`});
   }
   return row;
  });res.status(201).json(created);
 }));
 router.get('/classes/:id/join',wrap(async(req,res)=>{
  const a=req.actor; const {rows:[row]}=await pool.query(`SELECT c.meeting_link,c.status,c.end_time,
   EXISTS(SELECT 1 FROM online_class_registrations r WHERE r.class_id=c.id AND r.learner_id=$2 AND r.status='registered') AS registered
   FROM online_classes c WHERE c.id=$1`,[id(req.params.id),a.learner_id || null]);
  if(!row)throw problem(404,'Không tìm thấy lớp');if(row.status!=='scheduled'||new Date(row.end_time)<=new Date())throw problem(409,'Buổi học đã kết thúc hoặc đã hủy');
  if(a.role!=='mentor'&&!row.registered)throw problem(403,'Hãy đăng ký lớp trước khi tham gia');res.json({url:row.meeting_link});
 }));
 router.post('/classes/:id/registration',wrap(async(req,res)=>{
  const a=req.actor;requireLearner(a);if(typeof req.body?.registered!=='boolean')throw problem(400,'Trạng thái đăng ký không hợp lệ');
  const result=await tx(async client=>{
   // Serialize all registrations/cancellations for one learner, including
   // requests for different classes from two tabs. Always lock learner first.
   await client.query('SELECT pg_advisory_xact_lock(1380143944,$1::integer)',[a.learner_id]);
   const classId=id(req.params.id);const {rows:[row]}=await client.query('SELECT * FROM online_classes WHERE id=$1 FOR UPDATE',[classId]);
   if(!row)throw problem(404,'Không tìm thấy lớp');
   if(req.body.registered&&(row.status!=='scheduled'||new Date(row.end_time)<=new Date()))throw problem(409,'Lớp đã kết thúc hoặc bị hủy');
   const {rows:[previous]}=await client.query('SELECT status FROM online_class_registrations WHERE class_id=$1 AND learner_id=$2',[classId,a.learner_id]);
   if(req.body.registered&&previous?.status!=='registered'){
    const {rows:[conflict]}=await client.query(`SELECT c.id FROM online_class_registrations r
      JOIN online_classes c ON c.id=r.class_id
      WHERE r.learner_id=$1 AND r.status='registered' AND c.status='scheduled'
        AND c.id<>$2 AND c.start_time<$4 AND c.end_time>$3 LIMIT 1`,
      [a.learner_id,classId,row.start_time,row.end_time]);
    if(conflict)throw problem(409,'Bạn đã đăng ký một buổi học trùng giờ. Hãy chọn ca không giao nhau.');
    const {rows:[count]}=await client.query("SELECT count(*)::integer AS count FROM online_class_registrations WHERE class_id=$1 AND status='registered'",[classId]);
    if(count.count>=row.capacity)throw problem(409,'Lớp đã đủ 20 learner');
   }
   if(!req.body.registered&&new Date(row.start_time)<=new Date())throw problem(409,'Chỉ được hủy đăng ký trước khi buổi học bắt đầu');
   await client.query(`INSERT INTO online_class_registrations(class_id,learner_id,status) VALUES($1,$2,$3)
    ON CONFLICT(class_id,learner_id) DO UPDATE SET status=EXCLUDED.status,updated_at=now()`,[classId,a.learner_id,req.body.registered?'registered':'cancelled']);
   return {registered:req.body.registered};
  });res.json(result);
 }));
 router.post('/classes/:id/cancel',wrap(async(req,res)=>{
  await tx(async client=>{
   const row=await ownedClass(client,req.params.id,req.actor);if(new Date(row.end_time)<=new Date())throw problem(409,'Lớp đã kết thúc');
   if(row.status==='cancelled')return;
   await client.query("UPDATE online_classes SET status='cancelled' WHERE id=$1",[row.id]);
   const {rows:recipients}=await client.query(`SELECT l.user_id FROM learners l JOIN online_class_registrations r ON r.learner_id=l.id
     WHERE r.class_id=$1 AND r.status='registered'
     UNION SELECT l.user_id FROM learners l JOIN online_class_requests r ON r.learner_id=l.id WHERE r.class_id=$1`,[row.id]);
   await notifyClassroom(client,{recipients:recipients.map(row=>row.user_id),actorId:req.actor.user_id,type:'classroom_cancelled',title:'Buổi học trực tuyến đã hủy',
    message:`Buổi học #${row.id} đã hủy. Mở Lớp trực tuyến để xem và chọn buổi học khác.`});
  });res.json({cancelled:true});
 }));
 router.get('/classes/:id/roster',wrap(async(req,res)=>{
  const rows=await tx(async client=>{const row=await ownedClass(client,req.params.id,req.actor);
   const result=await client.query(`SELECT r.learner_id,r.attendance,r.attendance_note,u.name,u.email,u.phone
    FROM online_class_registrations r JOIN learners l ON l.id=r.learner_id JOIN users u ON u.id=l.user_id
    WHERE r.class_id=$1 AND r.status='registered' ORDER BY u.name,r.learner_id`,[row.id]);return result.rows;});res.json({learners:rows});
 }));
 router.put('/classes/:id/attendance/:learnerId',wrap(async(req,res)=>{
  const b=req.body||{};if(!['present','partial','absent'].includes(b.attendance))throw problem(400,'Điểm danh không hợp lệ');const note=text(b.note,1000,false);
  await tx(async client=>{const row=await ownedClass(client,req.params.id,req.actor);if(row.status==='cancelled'||new Date(row.end_time)>new Date())throw problem(409,'Chỉ điểm danh sau khi buổi học kết thúc');
   const result=await client.query(`UPDATE online_class_registrations SET attendance=$1,attendance_note=$2,updated_at=now()
    WHERE class_id=$3 AND learner_id=$4 AND status='registered' RETURNING learner_id`,[b.attendance,note,row.id,id(req.params.learnerId)]);if(!result.rows[0])throw problem(404,'Learner chưa đăng ký lớp');});res.json({saved:true});
 }));
 router.get('/requests',wrap(async(req,res)=>{
  const a=req.actor;const {rows:requests}=await pool.query(`SELECT r.*,u.name AS learner_name,mu.name AS mentor_name,c.status AS class_status FROM online_class_requests r
   JOIN learners l ON l.id=r.learner_id JOIN users u ON u.id=l.user_id JOIN mentors m ON m.id=r.mentor_id JOIN users mu ON mu.id=m.user_id
   LEFT JOIN online_classes c ON c.id=r.class_id
   WHERE ${a.role==='mentor'?'r.mentor_id':'r.learner_id'}=$1 ORDER BY r.id DESC LIMIT 100`,[a.role==='mentor'?a.mentor_id:a.learner_id]);res.json({requests});
 }));
 router.post('/requests',wrap(async(req,res)=>{
  const a=req.actor;requireLearner(a);const b=req.body||{},mentorId=id(b.mentorId),topicId=topic(b.topicId),message=text(b.message,3000);
  const {rows:[mentor]}=await pool.query("SELECT m.id,m.user_id FROM mentors m JOIN users u ON u.id=m.user_id WHERE m.id=$1 AND u.status='active'",[mentorId]);if(!mentor)throw problem(404,'Không tìm thấy mentor đang hoạt động');
  const request=await tx(async client=>{
   // Serialize retries for this learner even before a request row exists.
   await client.query('SELECT id FROM learners WHERE id=$1 FOR UPDATE',[a.learner_id]);
   const values=[a.learner_id,mentorId,topicId,message];
   const {rows:[pending]}=await client.query(`SELECT id FROM online_class_requests
    WHERE learner_id=$1 AND mentor_id=$2 AND topic_id=$3 AND message=$4 AND status='pending'
    ORDER BY id DESC LIMIT 1 FOR UPDATE`,values);
   if(pending)return pending;
   const {rows:[created]}=await client.query('INSERT INTO online_class_requests(learner_id,mentor_id,topic_id,message) VALUES($1,$2,$3,$4) RETURNING id',values);
   await notifyClassroom(client,{recipients:[mentor.user_id],actorId:a.user_id,type:'classroom_request',title:'Có yêu cầu mở lớp mới',
    message:`Yêu cầu #${created.id}: ${topicById(topicId).title}. Mở Lớp trực tuyến để xem xét.`});
   return created;
  });res.status(201).json(request);
 }));
 router.post('/requests/:id/decline',wrap(async(req,res)=>{
  requireMentor(req.actor);const response=text(req.body?.response,1000,false);
  await tx(async client=>{
   const {rows:[request]}=await client.query("UPDATE online_class_requests SET status='declined',response=$1 WHERE id=$2 AND mentor_id=$3 AND status='pending' RETURNING id,learner_id",[response,id(req.params.id),req.actor.mentor_id]);
   if(!request)throw problem(409,'Yêu cầu đã xử lý hoặc không thuộc bạn');
   const {rows:[learner]}=await client.query('SELECT user_id FROM learners WHERE id=$1',[request.learner_id]);
   await notifyClassroom(client,{recipients:[learner.user_id],actorId:req.actor.user_id,type:'classroom_declined',title:'Mentor đã phản hồi yêu cầu mở lớp',
    message:`Yêu cầu #${request.id} chưa thể tổ chức. Mở Lớp trực tuyến để xem phản hồi.`});
  });res.json({saved:true});
 }));
 const pair = async(client,a,learnerId,lock=false)=>{
  const {rows:[row]}=await client.query(`SELECT l.id AS learner_id,l.mentor_id,m.user_id AS mentor_user_id,l.user_id AS learner_user_id
   FROM learners l JOIN mentors m ON m.id=l.mentor_id WHERE l.id=$1${lock?' FOR SHARE OF l,m':''}`,[id(learnerId)]);
  if(!row||(a.role==='mentor'?row.mentor_id!==a.mentor_id:row.learner_user_id!==a.user_id))throw problem(403,'Chat chỉ dành cho learner và mentor đang được gán');return row;
 };
 router.get('/contacts',wrap(async(req,res)=>{
  const a=req.actor;const {rows:contacts}=await pool.query(a.role==='mentor'?`SELECT l.id AS learner_id,u.name,u.id AS user_id FROM learners l JOIN users u ON u.id=l.user_id WHERE l.mentor_id=$1 AND u.status='active' ORDER BY u.name,l.id`:
   `SELECT l.id AS learner_id,u.name,u.id AS user_id FROM learners l JOIN mentors m ON m.id=l.mentor_id JOIN users u ON u.id=m.user_id WHERE l.id=$1 AND u.status='active'`,[a.role==='mentor'?a.mentor_id:a.learner_id]);res.json({contacts});
 }));
 router.get('/messages/:learnerId',wrap(async(req,res)=>{
  const result=await tx(async client=>{
  const p=await pair(client,req.actor,req.params.learnerId,true);const after=req.query.after===undefined?null:id(req.query.after),before=req.query.before===undefined?null:id(req.query.before);if(after&&before)throw problem(400,'Chỉ chọn một chiều tải tin');
  const values=[p.mentor_id,p.learner_id];let clause='';if(after||before){values.push(after||before);clause=`AND id ${after?'>':'<'} $3`;}
  const {rows}=await client.query(`SELECT id,sender_user_id,body,created_at,client_id FROM mentor_learner_messages WHERE mentor_id=$1 AND learner_id=$2 ${clause} ORDER BY id ${after?'ASC':'DESC'} LIMIT 50`,values);
  return {messages:after?rows:rows.reverse(),hasMore:rows.length===50};});res.json(result);
 }));
 router.post('/messages/:learnerId',wrap(async(req,res)=>{
  const body=text(req.body?.body,3000),clientId=req.body?.clientId;if(typeof clientId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId))throw problem(400,'Mã tin nhắn không hợp lệ');
  const message=await tx(async client=>{const p=await pair(client,req.actor,req.params.learnerId,true);
   const {rows:[row]}=await client.query(`INSERT INTO mentor_learner_messages(mentor_id,learner_id,sender_user_id,client_id,body) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(sender_user_id,client_id) DO UPDATE SET client_id=EXCLUDED.client_id RETURNING id,mentor_id,learner_id,sender_user_id,body,created_at,client_id`,[p.mentor_id,p.learner_id,req.actor.user_id,clientId,body]);
   if(row.mentor_id!==p.mentor_id||row.learner_id!==p.learner_id||row.body!==body)throw problem(409,'Mã tin nhắn đã được dùng cho nội dung khác');return row;
  });res.status(201).json(message);
 }));
 return router;
}
