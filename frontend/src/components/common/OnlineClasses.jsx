import { UiOption } from '../../i18n/UiLanguage.jsx';
import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { getAuth } from '../../utils/auth';
import { useAuth } from '../../context/AuthContext';
import { safeMeetingHref } from '../../utils/calendar.js';
import { presentClassRequest } from '../../utils/classroomRequest.js';
import '../../styles/classroom.css';

const base='/mentors/classroom';
const errorText=error=>error.response?.data?.message || 'Không thể kết nối. Hãy tải lại để kiểm tra kết quả.';
const format=value=>new Date(value).toLocaleString('en-GB');
const blank=()=>({clientId:crypto.randomUUID(),topicId:'',title:'',description:'',startTime:'',endTime:'',meetingLink:'',requestId:null});
function TopicSelect({topics,value,onChange,required=true}) {
 return <select aria-label={englishText("Chủ đề")} required={required} value={value} onChange={e=>onChange(e.target.value)}><UiOption value="">{"Chọn chủ đề"}</UiOption>
  {[...new Set(topics.map(t=>t.category))].map(category=><optgroup key={category} label={englishText(topics.find(t=>t.category===category).categoryLabel)}>
   {topics.filter(t=>t.category===category).map(t=><option key={t.id} value={t.id}>{englishText(t.level)} · {englishText(t.title)}</option>)}
  </optgroup>)}</select>;
}
export default function OnlineClasses({compact=false}) {
 const context=useAuth();const user=context?.user??getAuth()?.user;return <ClassroomView key={String(user?.id)} compact={compact} accountRole={user?.role}/>;
}
function ClassroomView({compact,accountRole}) {
 const [catalog,setCatalog]=useState({topics:[],mentors:[],actor:null}),[classes,setClasses]=useState([]),[requests,setRequests]=useState([]);
 const [filters,setFilters]=useState({q:'',category:'',level:'',mentorId:'',mine:false,history:false,page:1});
 const [total,setTotal]=useState(0),[revision,setRevision]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [draft,setDraft]=useState(blank),[request,setRequest]=useState({topicId:'',mentorId:'',message:''}),[roster,setRoster]=useState(null),[links,setLinks]=useState({});
 const scope=useRef({active:true,busy:false,controller:new AbortController()}),createForm=useRef(null);
 useEffect(()=>{const current=scope.current;current.active=true;current.controller=new AbortController();const expire=()=>{current.active=false;current.controller.abort();setCatalog({topics:[],mentors:[],actor:null});setClasses([]);setRequests([]);setRoster(null);setLinks({});setError('Phiên đăng nhập đã hết hạn.');};window.addEventListener('session-expired',expire);return()=>{current.active=false;current.controller.abort();window.removeEventListener('session-expired',expire);};},[]);
 useEffect(()=>{const c=new AbortController();setLoading(true);setError('');setClasses([]);setLinks({});
  const timer=setTimeout(async()=>{try{
   const query=new URLSearchParams(Object.entries(filters).filter(([,v])=>v!==''&&v!==false).map(([k,v])=>[k,String(v)]));
   const [meta,list,reqs]=await Promise.all([api.get(`${base}/catalog`,{signal:c.signal}),api.get(`${base}/classes?${query}`,{signal:c.signal}),compact?null:api.get(`${base}/requests`,{signal:c.signal})]);
   if(!c.signal.aborted&&scope.current.active){setCatalog(meta.data);setClasses(list.data.classes);setTotal(list.data.total);if(reqs)setRequests(reqs.data.requests);}
  }catch(e){if(!c.signal.aborted&&scope.current.active)setError(errorText(e));}finally{if(!c.signal.aborted&&scope.current.active)setLoading(false);}},200);
  return()=>{clearTimeout(timer);c.abort();};
 },[filters,revision,compact]);
 async function act(work,success,reload=true){const current=scope.current;if(current.busy||!current.active)return;current.busy=true;setBusy(true);setError('');setNotice('');try{const result=await work(current.controller.signal);if(current.active){success?.(result);if(reload)setRevision(v=>v+1);}}catch(e){if(current.active)setError(errorText(e));}finally{current.busy=false;if(current.active)setBusy(false);}}
 const mentor=(catalog.actor?.role??accountRole)==='mentor', myId=catalog.actor?.mentor_id;
 const filter=(key,value)=>setFilters(f=>({...f,[key]:value,page:1}));
 const selectedTopic=catalog.topics.find(t=>t.id===draft.topicId);
 const topicTitle=id=>catalog.topics.find(t=>t.id===id)?.title || id;
 function chooseTopic(value){const t=catalog.topics.find(t=>t.id===value);setDraft(d=>({...d,topicId:value,title:englishText(t?.title||'')}));}
 async function create(e){e.preventDefault();const start=new Date(draft.startTime),end=new Date(draft.endTime);if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start||end-start>7200000){setError('Buổi học phải có thời lượng lớn hơn 0 và tối đa 2 tiếng.');return;}await act(signal=>api.post(`${base}/classes`,{...draft,startTime:start.toISOString(),endTime:end.toISOString()},{signal}),()=>{setDraft(blank());setNotice('Đã mở lớp trực tuyến cho mọi learner.');});}
 return <section className={`classroom ${compact?'classroom-compact':''}`} aria-label={englishText("Lớp trực tuyến")}>
  <header className="classroom-heading"><div><h2><UiText text={"Lớp trực tuyến"} /></h2><p><UiText text={"Học cùng cộng đồng · tối đa 20 learner/lớp · mentor tham gia không chiếm chỗ"} /></p></div>{compact?<Link to={mentor?'/mentor/schedules':'/learn/schedules'}><UiText text={"Xem tất cả lớp →"} /></Link>:<button disabled={busy||loading} onClick={()=>setRevision(v=>v+1)}><UiText text={"Làm mới lớp / yêu cầu"} /></button>}</header>
  {error&&<div className="classroom-error" role="alert"><UiText>{error}</UiText> <button onClick={()=>setRevision(v=>v+1)}><UiText text={"Tải lại"} /></button></div>}
  {notice&&<p role="status" className="classroom-notice"><UiText>{notice}</UiText></p>}
  <div className="classroom-filters">
   <input aria-label={englishText("Tìm lớp")} placeholder={englishText("Tìm tên lớp…")} value={filters.q} maxLength={100} onChange={e=>filter('q',e.target.value)}/>
   <select aria-label={englishText("Nhóm chủ đề")} value={filters.category} onChange={e=>filter('category',e.target.value)}><UiOption value="">{"Mọi nhóm chủ đề"}</UiOption>{[...new Set(catalog.topics.map(t=>t.category))].map(c=><option key={c} value={c}>{catalog.topics.find(t=>t.category===c).categoryLabel}</option>)}</select>
   <select aria-label={englishText("Trình độ")} value={filters.level} onChange={e=>filter('level',e.target.value)}><UiOption value="">{"Mọi trình độ"}</UiOption>{['A1','A2','B1','B2','C1','C2'].map(l=><UiOption key={l}>{l}</UiOption>)}</select>
   {!compact&&<><select aria-label={englishText("Mentor tổ chức")} value={filters.mentorId} onChange={e=>filter('mentorId',e.target.value)}><UiOption value="">{"Mọi mentor"}</UiOption>{catalog.mentors.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>
   <label><input type="checkbox" checked={filters.mine} onChange={e=>filter('mine',e.target.checked)}/><UiText>{mentor?'Lớp tôi tổ chức':'Lớp đã đăng ký'}</UiText></label>
   <label><input type="checkbox" checked={filters.history} onChange={e=>filter('history',e.target.checked)}/><UiText text={"Cả lớp đã kết thúc/hủy"} /></label></>}
  </div>
  {loading?<p role="status"><UiText text={"Đang tải lớp học…"} /></p>:<>
   <div className="classroom-grid">{(compact?classes.slice(0,3):classes).map(c=>{const own=mentor&&c.mentor_id===myId,started=new Date(c.start_time)<=new Date(),ended=new Date(c.end_time)<=new Date(),cancelled=c.status==='cancelled',registered=c.registration_status==='registered';const t=catalog.topics.find(t=>t.id===c.topic_id);return <article key={c.id} className="classroom-card">
    <div className="classroom-tags"><span><UiText>{t?.level}</UiText> · <UiText>{t?.categoryLabel}</UiText></span><span><UiText>{cancelled?'Đã hủy':ended?'Đã kết thúc':registered?'Đã đăng ký':'Đang mở'}</UiText></span></div>
    <h3>{c.title}</h3><p>{c.description}</p><p>Mentor: <strong>{c.mentor_name}</strong></p><p><UiText>{format(c.start_time)}</UiText> → <UiText>{format(c.end_time)}</UiText></p>
    <p><strong><UiText>{c.registered_count}</UiText>/20</strong>{" "}<UiText text={"learner đăng ký"} /><UiText>{mentor?' · Bạn vào tự do, không cần đăng ký':''}</UiText></p>
    {c.attendance&&c.attendance!=='pending'&&<p><UiText text={"Điểm danh:"} />{" "}<UiText>{{present:'Tham gia đầy đủ',partial:'Tham gia chưa đủ',absent:'Vắng mặt'}[c.attendance]}</UiText></p>}
    <div className="classroom-actions">
     {!mentor&&!ended&&!cancelled&&<button disabled={busy||(registered&&started)||(!registered&&(c.registered_count>=20||c.has_time_conflict))} onClick={()=>act(signal=>api.post(`${base}/classes/${c.id}/registration`,{registered:!registered},{signal}),()=>setNotice(registered?'Đã hủy đăng ký.':'Đã đăng ký lớp.'))}><UiText>{registered?(started?'Đã bắt đầu — giữ đăng ký':'Hủy đăng ký'):c.has_time_conflict?'Trùng giờ đã đăng ký':c.registered_count>=20?'Đã đủ chỗ':'Đăng ký'}</UiText></button>}
     {!ended&&!cancelled&&(mentor||registered)&&(links[c.id]?<a target="_blank" rel="noopener noreferrer" href={links[c.id]}><UiText text={"Mở phòng học ↗"} /></a>:<button disabled={busy} onClick={()=>act(signal=>api.get(`${base}/classes/${c.id}/join`,{signal}),r=>{const url=safeMeetingHref(r.data.url);if(url)setLinks(v=>({...v,[c.id]:url}));else setError('Link phòng học không hợp lệ.');},false)}><UiText text={"Lấy link tham gia"} /></button>)}
     {own&&!compact&&<><button disabled={busy} onClick={()=>setRoster(c)}><UiText text={"Đăng ký & điểm danh"} /></button>{!ended&&!cancelled&&<button disabled={busy} onClick={()=>{if(window.confirm(englishText("Hủy buổi học này?")))act(signal=>api.post(`${base}/classes/${c.id}/cancel`,{},{signal}),()=>setNotice('Đã hủy buổi học.'));}}><UiText text={"Hủy buổi học"} /></button>}</>}
    </div></article>;})}</div>
   {!classes.length&&!error&&<p><UiText text={"Chưa có lớp phù hợp với bộ lọc."} /></p>}
   {!compact&&<div className="classroom-actions"><button disabled={filters.page===1||loading} onClick={()=>setFilters(f=>({...f,page:f.page-1}))}><UiText text={"Trang trước"} /></button><span><UiText text={"Trang"} />{" "}<UiText>{filters.page}</UiText> · <UiText>{total}</UiText>{" "}<UiText text={"lớp"} /></span><button disabled={filters.page*20>=total||loading} onClick={()=>setFilters(f=>({...f,page:f.page+1}))}><UiText text={"Trang sau"} /></button></div>}
  </>}
  {!compact&&catalog.actor&&<>
   {mentor?<form ref={createForm} className="classroom-panel" onSubmit={create}><h3><UiText>{draft.requestId?'Mở lớp từ yêu cầu learner':'Tổ chức một buổi học'}</UiText></h3><fieldset disabled={busy}>
    <TopicSelect topics={catalog.topics} value={draft.topicId} onChange={chooseTopic}/><p><UiText>{selectedTopic?.categoryLabel}</UiText> <UiText>{selectedTopic?.level}</UiText></p>
    <label><UiText text={"Tên buổi học"} /><input required maxLength={160} value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label>
    <label><UiText text={"Nội dung / mục tiêu"} /><textarea maxLength={5000} value={draft.description} onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/></label>
    <div className="classroom-filters"><label><UiText text={"Bắt đầu"} /><input type="datetime-local" required value={draft.startTime} onChange={e=>setDraft(d=>({...d,startTime:e.target.value}))}/></label><label><UiText text={"Kết thúc"} /><input type="datetime-local" required value={draft.endTime} onChange={e=>setDraft(d=>({...d,endTime:e.target.value}))}/></label></div>
    <label><UiText text={"Link phòng học (Meet / Teams / Zoom…)"} /><input type="url" required value={draft.meetingLink} onChange={e=>setDraft(d=>({...d,meetingLink:e.target.value}))}/></label><p><UiText text={"20 chỗ cho learner. Mentor khác tham gia tự do. Thời lượng tối đa 2 tiếng. Learner chỉ đăng ký các ca không trùng giờ."} /></p>
    <button type="submit"><UiText text={"Mở lớp"} /></button>{draft.requestId&&<button type="button" onClick={()=>setDraft(blank())}><UiText text={"Bỏ chọn yêu cầu"} /></button>}
   </fieldset></form>:<form className="classroom-panel" onSubmit={e=>{e.preventDefault();act(signal=>api.post(`${base}/requests`,request,{signal}),()=>{setRequest({topicId:'',mentorId:'',message:''});setNotice('Đã gửi yêu cầu tới mentor.');});}}><h3><UiText text={"Đề nghị một buổi học"} /></h3><fieldset disabled={busy}>
    <TopicSelect topics={catalog.topics} value={request.topicId} onChange={value=>setRequest(r=>({...r,topicId:value}))}/>
    <select aria-label={englishText("Mentor nhận yêu cầu")} required value={request.mentorId} onChange={e=>setRequest(r=>({...r,mentorId:e.target.value}))}><UiOption value="">{"Chọn mentor nhận yêu cầu"}</UiOption>{catalog.mentors.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>
    <label><UiText text={"Vấn đề bạn muốn được hỗ trợ"} /><textarea required maxLength={3000} value={request.message} onChange={e=>setRequest(r=>({...r,message:e.target.value}))}/></label><button><UiText text={"Gửi yêu cầu mở lớp"} /></button>
   </fieldset></form>}
   <section className="classroom-panel"><h3><UiText>{mentor?'Yêu cầu learner gửi cho bạn':'Yêu cầu của bạn'}</UiText> <small><UiText text={"(100 yêu cầu gần nhất)"} /></small></h3>{requests.length===0?<p><UiText text={"Chưa có yêu cầu."} /></p>:requests.map(r=><article key={r.id} className="classroom-request"><strong><UiText>{topicTitle(r.topic_id)}</UiText></strong><p>{mentor?r.learner_name:r.mentor_name} · <UiText>{presentClassRequest(r).label}</UiText></p><p>{r.message}</p>{r.response&&<p><UiText text={"Phản hồi:"} />{" "}<UiText>{r.response}</UiText></p>}{r.class_id&&<p><UiText text={"Mã lớp:"} />{" "}<UiText>{r.class_id}</UiText> — <UiText>{presentClassRequest(r).classHint}</UiText></p>}
    {mentor&&r.status==='pending'&&<div className="classroom-actions"><button disabled={busy} onClick={()=>{setDraft({...blank(),requestId:r.id,topicId:r.topic_id,title:topicTitle(r.topic_id),description:r.message});setNotice('Đã điền chủ đề/yêu cầu vào biểu mẫu mở lớp bên trên. Hãy chọn giờ và link học.');createForm.current?.scrollIntoView({block:'start'});}}><UiText text={"Tạo lớp từ yêu cầu"} /></button><button disabled={busy} onClick={()=>act(signal=>api.post(`${base}/requests/${r.id}/decline`,{response:'Mentor chưa thể tổ chức buổi này.'},{signal}),()=>setNotice('Đã phản hồi yêu cầu.'))}><UiText text={"Chưa thể tổ chức"} /></button></div>}</article>)}</section>
   {roster&&<ClassRoster key={roster.id} row={roster} onClose={()=>setRoster(null)}/>}
  </>}
 </section>;
}
function ClassRoster({row,onClose}) {
 const [learners,setLearners]=useState([]),[savedCounts,setSavedCounts]=useState({present:0,partial:0,absent:0,pending:0}),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false);const live=useRef(true),write=useRef(null),panel=useRef(null);
 useEffect(()=>{live.current=true;panel.current?.scrollIntoView({block:'start'});return()=>{live.current=false;write.current?.abort();};},[]);
 useEffect(()=>{const c=new AbortController();api.get(`${base}/classes/${row.id}/roster`,{signal:c.signal}).then(r=>{if(!c.signal.aborted){setLearners(r.data.learners);setSavedCounts(r.data.learners.reduce((counts,l)=>({...counts,[l.attendance]:counts[l.attendance]+1}),{present:0,partial:0,absent:0,pending:0}));}}).catch(e=>{if(!c.signal.aborted)setError(errorText(e));});return()=>c.abort();},[row.id,revision]);
 const ended=new Date(row.end_time)<=new Date();
 async function save(e,learner){e.preventDefault();if(write.current||learner.attendance==='pending')return;const c=new AbortController();write.current=c;setBusy(true);setError('');setNotice('');try{await api.put(`${base}/classes/${row.id}/attendance/${learner.learner_id}`,{attendance:learner.attendance,note:learner.attendance_note},{signal:c.signal});if(live.current){setRevision(v=>v+1);setNotice('Đã lưu điểm danh.');}}catch(err){if(live.current)setError(errorText(err));}finally{write.current=null;if(live.current)setBusy(false);}}
 return <section ref={panel} className="classroom-panel" aria-label={englishText("Điểm danh lớp")}><header className="classroom-heading"><h3>{row.title} · <UiText>{learners.length}</UiText> learner</h3><button onClick={onClose}><UiText text={"Đóng danh sách"} /></button></header>{error&&<p role="alert"><UiText>{error}</UiText><button onClick={()=>setRevision(v=>v+1)}><UiText text={"Tải lại"} /></button></p>}{!ended&&<p><UiText text={"Có thể lưu điểm danh sau khi buổi học kết thúc."} /></p>}
  <p><UiText text={"Điểm danh đã lưu: đầy đủ"} />{" "}<UiText>{savedCounts.present}</UiText>{" "}<UiText text={"· chưa đủ"} />{" "}<UiText>{savedCounts.partial}</UiText>{" "}<UiText text={"· vắng"} />{" "}<UiText>{savedCounts.absent}</UiText>{" "}<UiText text={"· chưa điểm danh"} />{" "}<UiText>{savedCounts.pending}</UiText></p>
  {notice&&<p role="status"><UiText>{notice}</UiText></p>}{learners.map(l=><form key={l.learner_id} className="classroom-request" onSubmit={e=>save(e,l)}><strong>{l.name}</strong><p><UiText>{l.email || 'Chưa có email'}</UiText> · <UiText>{l.phone || 'Chưa có SĐT'}</UiText></p><fieldset disabled={busy||!ended||row.status==='cancelled'}><select aria-label={englishText(`Điểm danh ${l.name}`)} value={l.attendance} onChange={e=>setLearners(v=>v.map(x=>x.learner_id===l.learner_id?{...x,attendance:e.target.value}:x))}><UiOption value="pending">{"Chưa điểm danh"}</UiOption><UiOption value="present">{"Tham gia đầy đủ"}</UiOption><UiOption value="partial">{"Tham gia chưa đủ"}</UiOption><UiOption value="absent">{"Vắng mặt"}</UiOption></select><input aria-label={`Ghi chú ${l.name}`} maxLength={1000} value={l.attendance_note} onChange={e=>setLearners(v=>v.map(x=>x.learner_id===l.learner_id?{...x,attendance_note:e.target.value}:x))}/><button disabled={l.attendance==='pending'}><UiText text={"Lưu điểm danh"} /></button></fieldset>
   {ended&&['partial','absent'].includes(l.attendance)&&<div className="classroom-actions">{l.email&&<a href={`mailto:${encodeURIComponent(l.email)}?subject=${encodeURIComponent('Nhắc nhở buổi học '+row.title)}&body=${encodeURIComponent(`Chào ${l.name}, bạn chưa tham gia đầy đủ buổi ${row.title} lúc ${format(row.start_time)}. Hãy trao đổi với mentor để được hỗ trợ.`)}`}><UiText text={"Soạn email nhắc nhở"} /></a>}{l.phone&&<a href={`sms:${encodeURIComponent(l.phone)}?body=${encodeURIComponent('Bạn chưa tham gia đầy đủ buổi '+row.title+'. Hãy trao đổi với mentor.')}`}><UiText text={"Soạn SMS"} /></a>}<small><UiText text={"Bạn tự kiểm tra và gửi bằng ứng dụng email/SMS của mình."} /></small></div>}
  </form>)}
 </section>;
}
