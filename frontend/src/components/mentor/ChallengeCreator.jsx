import React, {useEffect,useRef,useState} from 'react';
import DOMPurify from 'dompurify';
import {FiPlus,FiEdit2,FiCopy,FiArrowLeft,FiBookOpen,FiCheck,FiLock} from 'react-icons/fi';
import api from '../../api';
import {getAuth} from '../../utils/auth';
import {UiText} from '../../i18n/UiLanguage.jsx';
import {CEFR_LEVELS,normalizeChallengeLevel} from '../../utils/challengeLevel.js';
import '../../styles/challenge-creator.css';

const blank = () => ({title:'',content:'',level:'A2'});
function plainContent(html) {
  const node=document.createElement('div');
  node.innerHTML=DOMPurify.sanitize(String(html||'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(p|div|h[1-6])>/gi,'\n\n').replace(/<\/li>/gi,'\n'));
  return (node.textContent||'').trim();
}
export default function ChallengeCreator() {
  const userId=getAuth()?.user?.id;
  const [mentorId,setMentorId]=useState(null),[items,setItems]=useState([]),[loading,setLoading]=useState(true);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[reload,setReload]=useState(0);
  const [editing,setEditing]=useState(null),[saving,setSaving]=useState(false);
  const [similarity,setSimilarity]=useState(null),[reviewed,setReviewed]=useState(false),[checking,setChecking]=useState(false);
  const checkPending=useRef(false);
  const pending=useRef(false),scope=useRef(null);
  useEffect(()=>{
    const controller=new AbortController();scope.current=controller;setLoading(true);setError('');setEditing(null);setItems([]);setMentorId(null);
    async function load(){
      try {
        const {data:profile}=await api.get(`/mentors/by-user/${userId}`,{signal:controller.signal});
        const mid=profile.mentor_id??profile.id;
        if(!mid)throw Error('Missing Mentor');
        const {data}=await api.get(`/mentors/${mid}/challenges`,{signal:controller.signal});
        if(!controller.signal.aborted){setMentorId(mid);setItems(data.challenges);}
      } catch {if(!controller.signal.aborted)setError('Unable to load challenges. Please try again.');}
      finally {if(!controller.signal.aborted)setLoading(false);}
    }
    load();return ()=>controller.abort();
  },[userId,reload]);
  function open(item,copy=false){
    setError('');setNotice('');setSimilarity(null);setReviewed(false);
    const content=plainContent(item?.description);
    const level=normalizeChallengeLevel(item?.level);
    setEditing(item?{id:copy?null:item.id,title:item.title,content,originalContent:content,level:CEFR_LEVELS.includes(level)?level:''}:blank());
  }
  async function checkDraft(){
    if(checkPending.current||!mentorId)return null;
    checkPending.current=true;setChecking(true);setError('');setReviewed(false);
    const current=scope.current;
    try {
      const {data}=await api.post(`/mentors/${mentorId}/challenges/check`,{title:editing.title.trim(),content:editing.content,level:editing.level,...(editing.id?{exclude_id:editing.id}:{})},{signal:current.signal});
      if(current.signal.aborted)return null;
      setSimilarity(data);return data;
    }catch(err){if(!current.signal.aborted)setError(err.response?.data?.message||'Unable to check similar challenges. Please try again.');return null;}
    finally{checkPending.current=false;if(!current.signal.aborted)setChecking(false);}
  }
  async function save(event){
    event.preventDefault();if(pending.current||checkPending.current||!mentorId)return;
    const current=scope.current;pending.current=true;setSaving(true);setError('');setNotice('');
    try {
      const checked=similarity??await checkDraft();
      if(!checked||checked.duplicate||checked.total&&!reviewed)return;
      const body={title:editing.title.trim(),level:editing.level,...(checked.total?{review_key:checked.review_key}:{})};
      if(!editing.id||editing.content!==editing.originalContent)body.content=editing.content;
      const {data}=editing.id
        ?await api.put(`/mentors/challenges/${editing.id}`,body,{signal:current.signal})
        :await api.post(`/mentors/${mentorId}/challenges`,body,{signal:current.signal});
      if(current.signal.aborted)return;
      setItems(previous=>[data.challenge,...previous.filter(item=>item.id!==data.challenge.id)]);
      setEditing(null);setNotice('Challenge saved. Learners can now find it in Challenges.');
    } catch(err){
      if(!current.signal.aborted){if(err.response?.data?.similarity){setSimilarity(err.response.data.similarity);setReviewed(false);}setError(err.response?.data?.message||'Unable to confirm the save. Reload the list before trying again.');}
    } finally {pending.current=false;if(!current.signal.aborted)setSaving(false);}
  }
  const field=(key,value)=>{setSimilarity(null);setReviewed(false);setEditing(previous=>({...previous,[key]:value}));};
  const busy=saving||checking;
  return <section className="mentor-challenges">
    <header className="mc-heading"><div><span className="mc-eyebrow">AESP · MENTOR</span><h1><UiText>My challenges</UiText></h1><p><UiText>Create speaking tasks for learners to practise and submit.</UiText></p></div>
      {!editing&&<button className="mc-primary" disabled={loading||!mentorId} onClick={()=>open()}><FiPlus/><UiText>New challenge</UiText></button>}
    </header>
    {error&&<div className="mc-message mc-error" role="alert"><UiText>{error}</UiText><button type="button" disabled={saving} onClick={()=>setReload(n=>n+1)}><UiText>Reload list</UiText></button></div>}
    {notice&&<p className="mc-message mc-success" role="status"><FiCheck/><UiText>{notice}</UiText></p>}
    {editing?<>
      <button className="mc-back" disabled={busy} onClick={()=>{setEditing(null);setError('');}}><FiArrowLeft/><UiText>Back to my challenges</UiText></button>
      <div className="mc-workspace"><form className="mc-editor" onSubmit={save}>
        <h2><UiText>{editing.id?'Edit challenge':'New challenge'}</UiText></h2>
        <label htmlFor="challenge-title"><UiText>Challenge title</UiText></label>
        <input id="challenge-title" lang="en" required maxLength={180} value={editing.title} disabled={busy} onChange={e=>field('title',e.target.value)}/>
        <label htmlFor="challenge-level"><UiText>English level (CEFR)</UiText></label>
        <select id="challenge-level" required value={editing.level} disabled={busy} onChange={e=>field('level',e.target.value)}>
          {!editing.level&&<option value="" disabled>—</option>}
          {CEFR_LEVELS.map(level=><option key={level}>{level}</option>)}
        </select>
        <label htmlFor="challenge-content"><UiText>Instructions in English</UiText></label>
        <textarea id="challenge-content" lang="en" required maxLength={16000} rows={12} value={editing.content} disabled={busy} onChange={e=>field('content',e.target.value)}/>
        <p className="mc-hint"><UiText>Include the goal, questions to cover and suggested speaking time.</UiText></p>
        <div className="mc-publish-note"><FiBookOpen/><UiText>Saving makes this task visible to all learners. Once learners save or start it, create a copy to make changes.</UiText></div>
        <button type="button" disabled={busy||!editing.level||!editing.title.trim()||!editing.content.trim()} onClick={checkDraft}><FiBookOpen/><UiText>{checking?'Checking existing challenges…':'Check similar challenges'}</UiText></button>
        {similarity&&<section className="mc-similarity" aria-label="Similar challenges" aria-live="polite">
          <h3><UiText>{similarity.duplicate?'This content already exists. Change the task before publishing.':similarity.total?'Similar challenges found':'No similar challenges found'}</UiText></h3>
          {similarity.total>0&&<p><UiText>Compare the goal and instructions before creating another task.</UiText></p>}
          {similarity.matches.map(match=><article key={match.id}><h4 lang="en">{match.title}</h4><span className="mc-level">{match.level}</span> <span>{match.mentor_name}</span><p lang="en">{match.excerpt}</p></article>)}
          {similarity.total>0&&!similarity.duplicate&&<label className="mc-review"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/><UiText>I reviewed these tasks. My challenge has a different learning goal.</UiText></label>}
        </section>}
        <button className="mc-primary" disabled={busy||!editing.level||!editing.title.trim()||!editing.content.trim()||similarity?.duplicate||Boolean(similarity?.total&&!reviewed)}><FiCheck/><UiText>{saving?'Saving…':editing.id?'Save changes':'Publish challenge'}</UiText></button>
      </form>
      <aside className="mc-preview"><div className="mc-preview-label"><FiBookOpen/><UiText>Learner preview</UiText></div><span className="mc-level">{editing.level}</span><h2 lang="en">{editing.title||'Your challenge title'}</h2><div lang="en" className="mc-preview-content">{editing.content||'Your instructions will appear here.'}</div><div className="mc-preview-footer"><UiText>Speaking challenge</UiText></div></aside></div>
    </>:loading?<p role="status"><UiText>Loading challenges…</UiText></p>:<>
      <div className="mc-list-bar"><span><UiText>Challenges</UiText> · <strong>{items.length}</strong></span><button onClick={()=>setReload(n=>n+1)}><UiText>Reload list</UiText></button></div>
      {!items.length?<div className="mc-empty"><FiBookOpen/><h2><UiText>Your first challenge starts here</UiText></h2><p><UiText>Give learners a topic and a clear speaking goal.</UiText></p><button className="mc-primary" disabled={!mentorId} onClick={()=>open()}><FiPlus/><UiText>New challenge</UiText></button></div>:<div className="mc-grid">{items.map(item=><article key={item.id} className="mc-card">
        <div className="mc-card-top"><span className="mc-level">{normalizeChallengeLevel(item.level)}</span><span><UiText>Speaking challenge</UiText></span></div>
        <h2 lang="en">{item.title}</h2><div className="mc-card-content" lang="en" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(item.description||'')}}/>
        {item.has_activity&&<p className="mc-locked"><FiLock/><UiText>In use · create a copy to make changes</UiText></p>}
        <footer><button disabled={item.has_activity} onClick={()=>open(item)}><FiEdit2/><UiText>Edit</UiText></button><button onClick={()=>open(item,true)}><FiCopy/><UiText>Create a copy</UiText></button></footer>
      </article>)}</div>}
    </>}
  </section>;
}
