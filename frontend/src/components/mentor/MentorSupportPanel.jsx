import { UiText } from '../../i18n/UiLanguage.jsx';
import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import api from '../../api';
import {loadMentorSupport,supportSignalText} from '../../utils/mentorSupport.js';
import '../../styles/mentor-support.css';

export default function MentorSupportPanel({mentorId}) {
  return <SupportPanel key={String(mentorId)} mentorId={mentorId}/>;
}
function SupportPanel({mentorId}) {
  const [learners,setLearners]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[denied,setDenied]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let active=true;
    setLearners(null);setLoading(true);setError('');
    const expire=()=>{controller.abort();setLearners(null);setLoading(false);setDenied(true);setError('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');};
    window.addEventListener('session-expired',expire);
    loadMentorSupport(api,mentorId,{signal:controller.signal}).then(rows=>{
      if(active&&!controller.signal.aborted)setLearners(rows);
    }).catch(err=>{
      if(!active||controller.signal.aborted)return;
      const forbidden=[401,403,404].includes(err.response?.status);setDenied(forbidden);
      setError(forbidden?'Không còn quyền xem danh sách hỗ trợ này. Hãy đăng nhập hoặc tải lại trang.':'Không thể tải tín hiệu hỗ trợ. Vui lòng thử lại.');
    }).finally(()=>{if(active&&!controller.signal.aborted)setLoading(false);});
    return()=>{active=false;controller.abort();window.removeEventListener('session-expired',expire);};
  },[mentorId,attempt]);
  return <section className="mentor-support-panel" aria-labelledby="mentor-support-heading">
    <header><h2 id="mentor-support-heading"><UiText text={"Học viên cần được hỏi thăm"} /></h2><button type="button" disabled={loading||denied} onClick={()=>setAttempt(value=>value+1)}><UiText text={"Làm mới tín hiệu hỗ trợ"} /></button></header>
    <p><UiText text={"Gợi ý từ trạng thái xử lý bài, hoạt động đã lưu và thời hạn gói; không phải kết luận về năng lực hay mức độ chăm học."} /></p>
    {loading?<p role="status"><UiText text={"Đang tải tín hiệu hỗ trợ…"} /></p>:error?<p role="alert"><UiText>{error}</UiText></p>:learners?.length===0?<p><UiText text={"Chưa có tín hiệu cần theo dõi trong nhóm học viên được gán."} /></p>:learners?.map(row=><article key={row.learner_id} className="mentor-support-learner">
      <h3>{row.name}</h3><ul>{row.signals.map(signal=><li key={signal.kind}><UiText>{supportSignalText(signal)}</UiText></li>)}</ul>
      <div className="mentor-support-actions"><Link to={row.progress_path}><UiText text={"Xem tiến độ"} /></Link><Link to={row.chat_path}><UiText text={"Nhắn tin học viên"} /></Link></div>
    </article>)}
  </section>;
}
