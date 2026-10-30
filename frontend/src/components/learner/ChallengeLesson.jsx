import React,{useEffect,useRef,useState} from 'react';
import DOMPurify from 'dompurify';
import {FiGlobe} from 'react-icons/fi';
import api from '../../api';
import {UiText} from '../../i18n/UiLanguage.jsx';

export default function ChallengeLesson({challenge,client=api}){
 const [shown,setShown]=useState(false),[translation,setTranslation]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const active=useRef(null);
 useEffect(()=>()=>active.current?.abort(),[]);
 async function toggle(){
  if(busy)return;
  if(shown){setShown(false);return;}
  if(translation){setShown(true);return;}
  const controller=new AbortController();active.current=controller;setBusy(true);setError('');
  try{
   const {data}=await client.post(`/learners/challenges/${challenge.id}/translation`,{}, {signal:controller.signal,timeout:60000});
   if(controller.signal.aborted)return;
   if(typeof data?.title!=='string'||typeof data?.description!=='string')throw Error('Invalid translation');
   setTranslation(data);setShown(true);
  }catch{if(!controller.signal.aborted)setError('Không thể tải bản dịch. Bạn vẫn có thể đọc đề tiếng Anh.');}
  finally{if(!controller.signal.aborted)setBusy(false);}
 }
 return <article className="info-card challenge-lesson">
  <div className="lesson-toolbar"><span className="lesson-language">ENGLISH</span><button type="button" className="btn-ghost" aria-pressed={shown} disabled={busy} onClick={toggle}><FiGlobe aria-hidden="true"/><UiText text={busy?'Đang dịch đề bài…':shown?'Ẩn bản dịch đề bài':'Dịch đề bài'}/></button></div>
  <h3 className="info-title" lang="en">{challenge.title||'Challenge'}</h3>
  {shown&&<p className="lesson-translation lesson-title-translation" lang="vi">{translation.title}</p>}
  <div lang="en" className="info-content" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(challenge.long_description??challenge.description??'')}}/>
  {shown&&<p className="lesson-translation" lang="vi">{translation.description}</p>}
  {error&&<p role="alert" className="lesson-error"><UiText>{error}</UiText></p>}
 </article>;
}
