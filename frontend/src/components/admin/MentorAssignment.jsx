import { UiOption } from '../../i18n/UiLanguage.jsx';
import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
import React, {useState} from 'react';
import api from '../../api.js';
import Modal from '../common/Modal.jsx';

export default function MentorAssignment({learnerId,onChanged}) {
  const [open,setOpen]=useState(false),[mentors,setMentors]=useState([]),[selected,setSelected]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  async function load(){
    setOpen(true);setBusy(true);setError('');setSelected('');
    try{const res=await api.get(`/admin/users/learners/${learnerId}/available-mentors`);setMentors(res.data.mentors||[]);}
    catch{setMentors([]);setError('Không thể tải danh sách Mentor.');}
    finally{setBusy(false);}
  }
  async function save(){
    if(!selected||busy)return;
    setBusy(true);setError('');
    try{
      await api.post('/admin/users/learners/change-mentor',{learnerId,newMentorId:Number(selected)});
      await onChanged();setOpen(false);setNotice('Đã cập nhật Mentor cho học viên.');
    }catch(err){setError(err.response?.data?.message||'Chưa xác nhận được kết quả. Hãy tải lại hồ sơ trước khi thử lại.');}
    finally{setBusy(false);}
  }
  return <>
    <button className="user-for-page-btn user-for-page-btn-secondary" onClick={load}><UiText text={"Gán / Đổi Mentor"} /></button>
    {notice&&<p role="status"><UiText>{notice}</UiText></p>}
    {open&&<Modal title={englishText("Chọn Mentor mới")} onClose={()=>{if(!busy)setOpen(false);}}>
      <div style={{padding:20}}>
        <p><UiText text={"Chọn Mentor đang hoạt động để hỗ trợ học viên này."} /></p>
        {error&&<p role="alert"><UiText>{error}</UiText></p>}
        {busy&&<p role="status"><UiText text={"Đang xử lý..."} /></p>}
        {!busy&&!mentors.length&&<p><UiText text={"Hiện chưa có Mentor khác có thể nhận học viên."} /></p>}
        <label><UiText text={"Mentor mới"} />{" "}<select aria-label={englishText("Mentor mới")} value={selected} disabled={busy} onChange={e=>setSelected(e.target.value)}>
          <UiOption value="">{"Chọn Mentor"}</UiOption>
          {mentors.map(m=><option key={m.mentor_id} value={m.mentor_id}>{m.mentor_name} · {englishText(m.learner_count)}{englishText("học viên")}</option>)}
        </select></label>
        <div style={{display:'flex',gap:12,marginTop:16}}>
          <button disabled={busy} onClick={()=>setOpen(false)}><UiText text={"Hủy"} /></button>
          <button disabled={busy||!selected} onClick={save}><UiText text={"Xác nhận đổi Mentor"} /></button>
        </div>
      </div>
    </Modal>}
  </>;
}
