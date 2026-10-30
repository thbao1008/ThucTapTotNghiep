import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
import React,{useEffect,useRef,useState} from 'react';
import api from '../../api';
import {getAuth} from '../../utils/auth';
import {useAuth} from '../../context/AuthContext';
import {useLocation} from 'react-router-dom';
import {createMentorChatController,initialMentorChatState,parseChatContacts} from '../../utils/mentorChat.js';
import {selectAssignedChatContact} from '../../utils/mentorSupport.js';
import '../../styles/classroom.css';
const base='/mentors/classroom';
export default function MentorLearnerChat(){const context=useAuth();const user=context?context.user:getAuth()?.user;const {search}=useLocation();return <ChatView key={String(user?.id)} userId={user?.id} search={search}/>;}
function ChatView({userId,search}){
 const [contacts,setContacts]=useState([]),[selected,setSelected]=useState(''),[revision,setRevision]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [selectionNotice,setSelectionNotice]=useState('');
 useEffect(()=>{const c=new AbortController();setLoading(true);setError('');setSelectionNotice('');setSelected('');setContacts([]);const expire=()=>{c.abort();setSelected('');setContacts([]);setSelectionNotice('');setLoading(false);setError('Phiên đăng nhập hết hạn.');};window.addEventListener('session-expired',expire);api.get(`${base}/contacts`,{signal:c.signal}).then(r=>{if(!c.signal.aborted){const rows=parseChatContacts(r.data),next=selectAssignedChatContact(rows,search);setContacts(rows);setSelected(next);setSelectionNotice(!next&&new URLSearchParams(search).has('learner')?'Học viên trong liên kết không còn nằm trong danh bạ được gán. Hãy chọn người trò chuyện từ danh bạ hiện tại.':'');setError('');}}).catch(()=>{if(!c.signal.aborted)setError('Không thể tải danh bạ chat. Hãy bấm Làm mới danh bạ.');}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>{c.abort();window.removeEventListener('session-expired',expire);};},[revision,search]);
 return <section className="classroom"><header className="classroom-heading"><div><h2><UiText text={"Nhắn tin với mentor / learner"} /></h2><p><UiText text={"Chat riêng giữa learner và mentor đang được gán · tự cập nhật mỗi 3 giây"} /></p></div><button onClick={()=>setRevision(v=>v+1)}><UiText text={"Làm mới danh bạ"} /></button></header>
 {error&&<p role="alert" className="classroom-error"><UiText>{error}</UiText></p>}{selectionNotice&&<p role="status"><UiText>{selectionNotice}</UiText></p>}{loading?<p><UiText text={"Đang tải danh bạ…"} /></p>:error&&!contacts.length?null:!contacts.length?<p><UiText text={"Chưa có mentor/learner được gán để trò chuyện."} /></p>:<div className="classroom-chat"><nav aria-label={englishText("Người trò chuyện")}>{contacts.map(c=><button className={String(c.learner_id)===selected?'selected':''} key={c.learner_id} onClick={()=>{setSelected(String(c.learner_id));setSelectionNotice('');}}>{c.name}</button>)}</nav>
 {selected&&<Conversation key={selected} learnerId={selected} userId={userId} name={contacts.find(c=>String(c.learner_id)===selected)?.name}/>}</div>}
 </section>;
}
function Conversation({learnerId,userId,name}){
 const [view,setView]=useState(initialMentorChatState),[draft,setDraft]=useState('');
 const controllerRef=useRef(null),lastAcknowledged=useRef(null);
 const {messages,loading,error,sending,pending,denied,hasOlder,olderBusy}=view;
 useEffect(()=>{
  lastAcknowledged.current=null;setView(initialMentorChatState());setDraft('');
  const controller=createMentorChatController(api,{userId,learnerId,onChange:next=>{
   setView(next);
   if(next.acknowledgedClientId&&lastAcknowledged.current!==next.acknowledgedClientId){lastAcknowledged.current=next.acknowledgedClientId;setDraft('');}
  }});
  controllerRef.current=controller;const expire=()=>controller.disable();
  window.addEventListener('session-expired',expire);controller.start();
  return()=>{controller.dispose();window.removeEventListener('session-expired',expire);if(controllerRef.current===controller)controllerRef.current=null;};
 },[learnerId,userId]);
 function send(e){e.preventDefault();controllerRef.current?.send(draft);}
 return <section className="classroom-conversation" aria-label={englishText(`Chat với ${name}`)}><h3>{name}</h3>{error&&<p role="alert" className="classroom-error"><UiText>{error}</UiText>{!denied&&<button type="button" onClick={()=>controllerRef.current?.refresh()}><UiText text={"Tải lại"} /></button>}</p>}{hasOlder&&<button disabled={olderBusy||denied} onClick={()=>controllerRef.current?.loadOlder()}><UiText text={"Tải tin cũ"} /></button>}
 <div className="classroom-messages" role="log" aria-live="polite">{loading&&<p><UiText text={"Đang tải tin nhắn…"} /></p>}{messages.length===0&&!loading&&!error&&!denied&&<p><UiText text={"Chưa có tin nhắn. Hãy bắt đầu trao đổi."} /></p>}{messages.map(m=><article key={m.id} className={String(m.sender_user_id)===String(userId)?'message-own':'message-peer'}><strong>{String(m.sender_user_id)===String(userId)?<UiText text={"Bạn"} />:name}</strong><p>{m.body}</p><small><UiText>{new Date(m.created_at).toLocaleString('en-GB')}</UiText></small></article>)}</div>
 <form onSubmit={send}><label><UiText text={"Tin nhắn"} /><textarea required maxLength={3000} disabled={sending||pending||denied} value={draft} onChange={e=>setDraft(e.target.value)} placeholder={englishText("Nhập câu hỏi hoặc nội dung trao đổi…")}/></label><button disabled={sending||denied||!draft.trim()}><UiText>{sending?'Đang gửi…':pending?'Thử gửi lại':'Gửi tin nhắn'}</UiText></button></form>
 </section>;
}
