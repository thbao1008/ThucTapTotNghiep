import React,{useEffect,useState} from 'react';
import api from '../../api.js';
import Modal from './Modal.jsx';
import {UiText} from '../../i18n/UiLanguage.jsx';
import {englishText} from '../../i18n/uiLanguage.js';
import '../../styles/user-for-page.css';

// A Challenge supplies a mentors.id, not a users.id. Never load Admin account data here.
export default function MentorProfileModal({mentorId,onClose,client=api}) {
  const [profile,setProfile]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');setProfile(null);
    async function load(){
      try {
        if(!/^[1-9]\d*$/.test(String(mentorId))||Number(mentorId)>2147483647)throw Error('Invalid Mentor');
        const {data}=await client.get(`/mentors/${mentorId}`,{signal:controller.signal,timeout:12000});
        if(!data?.mentor||String(data.mentor.mentor_id)!==String(mentorId))throw Error('Invalid profile');
        if(!controller.signal.aborted)setProfile(data.mentor);
      } catch {if(!controller.signal.aborted)setError('Không tải được thông tin Mentor. Vui lòng thử lại.');}
      finally {if(!controller.signal.aborted)setLoading(false);}
    }
    load();return ()=>controller.abort();
  },[mentorId,client,retry]);
  return <Modal title={englishText('Thông tin Mentor')} onClose={onClose} className="user-for-page-modal">
    {loading?<p role="status"><UiText>Đang tải...</UiText></p>:error?<div role="alert"><p><UiText>{error}</UiText></p><button type="button" onClick={()=>setRetry(n=>n+1)}><UiText>Thử lại</UiText></button></div>:profile&&<div className="user-for-page-info">
      <h2>{profile.name}</h2>
      <div className="user-for-page-info-item user-for-page-bio"><span className="user-for-page-info-label"><UiText>Giới thiệu:</UiText></span><p className="user-for-page-info-value user-for-page-bio-text">{profile.bio||<UiText>Chưa được cập nhật</UiText>}</p></div>
      {profile.specialization&&<div className="user-for-page-info-item"><span className="user-for-page-info-label"><UiText>Chuyên môn:</UiText></span><span>{profile.specialization}</span></div>}
      {profile.experience_years!=null&&<div className="user-for-page-info-item"><span className="user-for-page-info-label"><UiText>Số năm kinh nghiệm:</UiText></span><span>{profile.experience_years}</span></div>}
    </div>}
  </Modal>;
}
