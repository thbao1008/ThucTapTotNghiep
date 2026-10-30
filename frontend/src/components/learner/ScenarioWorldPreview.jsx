import { UiOption } from '../../i18n/UiLanguage.jsx';

import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import catalog from '../../data/scenarioWorldCatalog.json';
import { presentScenePreview, presentWorldTurn, presentWorldHistory, presentWorldSession, presentMissionProgress } from '../../utils/scenarioWorld.js';
import { readWorldAfterMutation } from '../../utils/scenarioWorldRecovery.js';
import ScenarioNpcVoice from './ScenarioNpcVoice';
import ScenarioSessionArchive from './ScenarioSessionArchive';
import '../../styles/scenario-world.css';

const roleNames = { customer: 'Khách hàng', student: 'Sinh viên', traveler: 'Du khách', barista: 'Nhân viên pha chế', manager: 'Quản lý' };
export const sampleWorldScene = {
  title: englishText("Một buổi sáng ở quán cà phê"), brief: 'Bạn ghé một quán cà phê mới. Hãy làm quen và tìm hiểu đồ uống phù hợp với mình.',
  objective: 'Chủ động bắt chuyện, hỏi thông tin và diễn đạt lựa chọn của bạn.',
  scene_name: catalog.scenes[0].name, background: catalog.scenes[0].background, source: 'authored_sample',
  cast: catalog.npcs.map((npc,index) => ({ npc_id: npc.id, name: npc.name, portrait: npc.portrait, role: ['customer','barista','manager'][index] })),
  opening: { npc_id: 'minh', text: 'Good morning! Welcome to our café.', translation: 'Chào buổi sáng! Chào mừng bạn đến quán.' },
  suggested_replies: [
    { id: 'reply-1', text: 'Good morning! What would you recommend?', translation: 'Chào buổi sáng! Bạn gợi ý món nào?' },
    { id: 'reply-2', text: 'Hi! Do you have any drinks without caffeine?', translation: 'Chào bạn! Quán có đồ uống không chứa caffeine không?' },
    { id: 'reply-3', text: 'Hello! Is this seat available?', translation: 'Xin chào! Chỗ này còn trống không?' }
  ]
};

export default function ScenarioWorldPreview({ client = api, fixtureIdentity = null, voiceObserver, onBack }) {
  const auth = useAuth();
  const identity = fixtureIdentity ?? auth?.user?.id ?? null;
  return <WorldPreview key={String(identity)} client={client} voiceObserver={voiceObserver} onBack={onBack} />;
}

function WorldPreview({ client, voiceObserver, onBack }) {
  const [scene,setScene] = useState(sampleWorldScene), [level,setLevel] = useState('A2'), [topic,setTopic] = useState('ordering');
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [draft,setDraft] = useState('');
  const [uncertain,setUncertain] = useState(false), [selectedNpc,setSelectedNpc] = useState('minh');

  const [showTranslation,setShowTranslation] = useState(false);


  const [turns,setTurns] = useState([]), [turnUncertain,setTurnUncertain] = useState(false);
  const [mode,setMode]=useState('conversation'),[missionProgress,setMissionProgress]=useState(null);
  const [archiveAvailable,setArchiveAvailable]=useState(false);
  const [loading,setLoading]=useState(true),[restoreError,setRestoreError]=useState(false),[durable,setDurable]=useState(false),[sessionStatus,setSessionStatus]=useState('ready');
  const turnRequest = useRef(null);
  const request = useRef(null), active = useRef(null), locked = useRef(false), alive = useRef(true);
  function clearProtectedState(message = 'Bạn chưa có quyền truy cập phiên luyện tập. Hãy kiểm tra lại đăng nhập.') {
    // Revocation ends this mounted view. Even transports that ignore abort cannot
    // publish an already queued response after its protected state is cleared.
    alive.current=false;active.current?.abort();active.current=null;locked.current=false;
    request.current=null;turnRequest.current=null;
    setScene(null);setTurns([]);setMissionProgress(null);setDraft('');
    setArchiveAvailable(false);setDurable(false);setSessionStatus('ready');
    setUncertain(false);setTurnUncertain(false);setLoading(false);setBusy(false);setRestoreError(true);setError(message);
  }
  function clearIfDenied(err) {
    if(![401,403].includes(err.response?.status))return false;
    clearProtectedState(err.response?.data?.message);return true;
  }
  function applySaved(saved) {
    setScene(saved.scene);setTurns(saved.turns);setSessionStatus(saved.status);setTurnUncertain(saved.pending);
    setMissionProgress(saved.mission_progress??null);setMode(saved.scene.mission?.id??'conversation');
    setSelectedNpc(saved.turns.at(-1)?.npc_id??saved.scene.opening.npc_id);
    if(saved.request){setLevel(saved.request.level);setTopic(saved.request.topic_id);}
  }
  useEffect(() => {
    alive.current = true;
    const expire = () => clearProtectedState('Phiên đăng nhập đã hết hạn.');
    window.addEventListener('session-expired', expire);
    return () => { alive.current = false; active.current?.abort(); locked.current=false; window.removeEventListener('session-expired', expire); };
  }, []);
  useEffect(()=>{loadCurrent();return()=>{active.current?.abort();locked.current=false;};},[client]);
  async function loadCurrent() {
    if(locked.current||!alive.current)return;
    const controller=new AbortController();active.current=controller;locked.current=true;setLoading(true);setError('');
    try {
      const response=await client.get('/learners/scenario-world/current',{signal:controller.signal,timeout:15000});
      if(!alive.current||controller.signal.aborted)return;
      if(!response.data||typeof response.data.transient!=='boolean'||!Object.hasOwn(response.data,'session'))throw Error('Invalid session lookup');
      setDurable(!response.data.transient);
      setArchiveAvailable(response.data.archive_available===true);
      if(response.data.session) {
        const saved=presentWorldSession(response.data.session,catalog);
        applySaved(saved);
        setLevel(response.data.session.request.level);setTopic(response.data.session.request.topic_id);
      }
      setRestoreError(false);
    }catch(err){
      if(!alive.current||controller.signal.aborted)return;
      if(clearIfDenied(err))return;
      setRestoreError(true);setError(err.response?.data?.message||'Chưa tải được phiên đã lưu. Hãy thử tải lại trước khi tạo phiên mới.');
    }finally{if(alive.current&&!controller.signal.aborted){locked.current=false;setLoading(false);}}
  }
  async function generate(retry = false) {
    if (locked.current || !alive.current || loading || restoreError) return;
    if (!retry) request.current = { client_id: crypto.randomUUID(), level, topic_id: mode==='cafe-order-v1'?'ordering':topic, ...(mode==='cafe-order-v1'?{mission_id:mode}:{}) };
    if (!request.current) return;
    const payload = request.current;
    const controller = new AbortController(); active.current = controller;
    locked.current = true; setBusy(true); setError('');
    try {
      const response = await client.post('/learners/scenario-world/preview', payload, { signal: controller.signal, timeout: 65000 });
      if (!alive.current || controller.signal.aborted) return;
      const result = presentScenePreview(response.data, catalog, payload);
      if(response.data.transient===false) {
        const saved=await readWorldAfterMutation({client,sceneId:result.client_id,catalog,signal:controller.signal});
        if(!alive.current||controller.signal.aborted)return;
        applySaved(saved);
      }else{
        let progress=null;
        if(result.mission){
          const state=await client.get(`/learners/scenario-world/conversation/${result.client_id}`,{signal:controller.signal,timeout:15000});
          if(!alive.current||controller.signal.aborted)return;
          progress=presentMissionProgress(state.data.mission_progress,result,[]);
        }
        setScene(result);setSelectedNpc(result.opening.npc_id);setTurns([]);setMissionProgress(progress);setSessionStatus('ready');setTurnUncertain(false);
      }
      setDraft('');setUncertain(false);setDurable(response.data.transient===false);request.current=null;
    } catch (err) {
      if (!alive.current || controller.signal.aborted) return;
      const status = err.response?.status;
      if(clearIfDenied(err))return;
      setUncertain(![400,401,403,409,429,502].includes(status));
      setError(err.response?.data?.message || 'Chưa nhận được phân cảnh hợp lệ. Bạn có thể kiểm tra lại yêu cầu vừa gửi.');
    } finally {
      if (alive.current && !controller.signal.aborted) { locked.current = false; setBusy(false); }
    }
  }
  async function loadSavedSession(sceneId) {
    if(locked.current||!alive.current||loading||restoreError||uncertain||turnUncertain||draft.trim())return;
    const controller=new AbortController();active.current=controller;locked.current=true;setBusy(true);setError('');
    try {
      const saved=await readWorldAfterMutation({client,sceneId,catalog,signal:controller.signal});
      if(!alive.current||controller.signal.aborted)return;
      applySaved(saved);setDurable(true);setDraft('');setUncertain(false);request.current=null;turnRequest.current=null;
    }catch(err){
      if(!alive.current||controller.signal.aborted)return;
      if(clearIfDenied(err))throw err;
      setError(err.response?.data?.message||'Chưa mở được phiên đã lưu. Phiên đang xem được giữ nguyên.');
      throw err;
    }finally{if(alive.current&&!controller.signal.aborted){locked.current=false;setBusy(false);}}
  }
  async function sendTurn(retry=false, choice=null, npcId=selectedNpc) {
    if (locked.current || !alive.current || loading || restoreError || sessionStatus==='completed' || !scene?.client_id || uncertain || (!retry && (turnUncertain || turns.length>=12 || !choice))) return;
    if (!retry) {
      turnRequest.current={scene_id:scene.client_id,client_id:crypto.randomUUID(),revision:turns.length,npc_id:npcId,text:choice.text,assistance:'suggestion'};
      setSelectedNpc(npcId);
      if(scene.mission)turnRequest.current.choice_id=choice.id;
      setDraft(choice.text);
    }
    const payload=turnRequest.current;if (!payload) return;
    const controller=new AbortController();active.current=controller;locked.current=true;setBusy(true);setError('');
    try {
      const response=await client.post('/learners/scenario-world/reply',payload,{signal:controller.signal,timeout:65000});
      if (!alive.current||controller.signal.aborted) return;
      const turn=presentWorldTurn(response.data,payload);
      if(durable){
        const saved=await readWorldAfterMutation({client,sceneId:scene.client_id,catalog,signal:controller.signal,minimumRevision:response.data.revision});
        if(!alive.current||controller.signal.aborted)return;
        applySaved(saved);
      }else{
        const updated=[...turns,turn];
        const progress=scene.mission?presentMissionProgress(response.data.mission_progress,scene,updated):null;
        setTurns(updated);setMissionProgress(progress);setTurnUncertain(false);
      }
      setDraft('');turnRequest.current=null;
    } catch(err) {
      if (!alive.current||controller.signal.aborted) return;
      const status=err.response?.status;
      if(clearIfDenied(err))return;
      setTurnUncertain(![400,401,403,410,429,502].includes(status));
      setError(err.response?.data?.message || 'Chưa nhận được lượt phản hồi hợp lệ. Hãy kiểm tra lại đúng lượt đã gửi.');
    } finally {if (alive.current&&!controller.signal.aborted) {locked.current=false;setBusy(false);}}
  }
  async function reloadConversation() {
    if (locked.current||!alive.current||!scene?.client_id) return;
    const controller=new AbortController();active.current=controller;locked.current=true;setBusy(true);setError('');
    try {
      const response=await client.get(`/learners/scenario-world/conversation/${scene.client_id}`,{signal:controller.signal,timeout:15000});
      if (!alive.current||controller.signal.aborted) return;
      const history=presentWorldHistory(response.data,scene);
      const progress=scene.mission?presentMissionProgress(response.data.mission_progress,scene,history):null;
      setTurns(history);setMissionProgress(progress);setTurnUncertain(response.data.pending);
      if(response.data.status)setSessionStatus(response.data.status);
      if (history.some(turn=>turn.client_id===turnRequest.current?.client_id)) setDraft('');
      if(response.data.pending){setError('Lượt AI vẫn đang xử lý. Hãy kiểm tra lại sau.');return;}
      turnRequest.current=null;
    } catch(err) {
      if (!alive.current||controller.signal.aborted) return;
      if(clearIfDenied(err))return;
      if (err.response?.status===410) {setTurnUncertain(false);turnRequest.current=null;}
      setError(err.response?.data?.message||'Chưa tải được hội thoại.');
    } finally {if (alive.current&&!controller.signal.aborted) {locked.current=false;setBusy(false);}}
  }
  async function finishSession() {
    if(locked.current||!alive.current||!durable||!scene?.client_id||!turns.length||turnUncertain)return;
    const controller=new AbortController();active.current=controller;locked.current=true;setBusy(true);setError('');
    try {
      const response=await client.post('/learners/scenario-world/finish',{scene_id:scene.client_id,revision:turns.length},{signal:controller.signal,timeout:15000});
      if(!alive.current||controller.signal.aborted)return;
      const saved=presentWorldSession(response.data,catalog);
      if(saved.scene.client_id!==scene.client_id||saved.status!=='completed')throw Error('Invalid finish response');
      applySaved(saved);setDraft('');
    }catch(err){if(alive.current&&!controller.signal.aborted){
      if(clearIfDenied(err))return;
      setTurnUncertain(true);
      setError(err.response?.data?.message||'Chưa xác nhận được việc kết thúc. Hãy tải lại hội thoại để kiểm tra.');
    }}
    finally{if(alive.current&&!controller.signal.aborted){locked.current=false;setBusy(false);}}
  }
  const latest=turns.findLast(turn=>turn.npc_id===selectedNpc);
  const replyNpcId=scene?.mission?missionProgress?.next_npc_id:selectedNpc;
  const replies=scene?.mission?(missionProgress?.next_choices??[]):latest?latest.suggested_replies:scene?.opening.npc_id===selectedNpc?scene.suggested_replies:[
    {id:'greeting-1',text:'Hi! How is your day going?',translation:'Chào bạn! Hôm nay của bạn thế nào?'},
    {id:'greeting-2',text:'Hello! May I ask you something?',translation:'Xin chào! Tôi có thể hỏi bạn một chút không?'},
    {id:'greeting-3',text:'Hi! It is nice to meet you.',translation:'Chào bạn! Rất vui được gặp bạn.'}
  ];
  const speaker = scene?.cast.find(member => member.npc_id === selectedNpc);
  const dialogue = latest?.npc ?? (scene?.opening.npc_id===selectedNpc?scene.opening:null);
  const Container=onBack?'section':'main';
  return <Container className="world-preview">
    <header className="world-heading"><div><span className="world-kicker">AESP · Scenario Studio</span><h1><UiText text={"Nhân vật quen thuộc."} /><br/><UiText text={"Cuộc gặp gỡ mới."} /></h1>
      <p><UiText text={"AI chọn nhân vật từ thư viện, dựng tình huống và gợi ý cách bắt đầu trò chuyện."} /></p></div>{onBack?<button type="button" className="world-back" onClick={onBack}><UiText text={"Quay lại"} /></button>:<Link to="/learn/practice"><UiText text={"Về luyện nói"} /></Link>}</header>
    <div className="world-controls"><label><UiText text={"Trình độ"} /><select value={level} disabled={mode==='cafe-order-v1'||loading||restoreError||busy || uncertain || turnUncertain} onChange={e=>setLevel(e.target.value)}>{['A1','A2','B1','B2'].map(value=><UiOption key={value}>{value}</UiOption>)}</select></label>
      <label><UiText text={"Cách luyện"} /><select value={mode} disabled={loading||restoreError||busy||uncertain||turnUncertain} onChange={e=>{setMode(e.target.value);if(e.target.value==='cafe-order-v1'){setTopic('ordering');setLevel('A2');}}}><UiOption value="conversation">{"Hội thoại theo chủ đề"}</UiOption><UiOption value="cafe-order-v1">{"Nhiệm vụ quán cà phê (A2)"}</UiOption></select></label>
      <label><UiText text={"Chủ đề"} /><select value={topic} disabled={mode==='cafe-order-v1'||loading||restoreError||busy || uncertain || turnUncertain} onChange={e=>setTopic(e.target.value)}>{catalog.topics.map(value=><UiOption key={value.id} value={value.id}>{value.name}</UiOption>)}</select></label>
      <button className="world-primary" disabled={loading||restoreError||busy || uncertain || turnUncertain || Boolean(draft.trim())} onClick={()=>generate()}><UiText>{loading?'Đang tải phiên đã lưu…':busy ? 'Đang xử lý…' : 'Để AI chọn NPC và dựng cảnh'}</UiText></button>
      {restoreError&&<button disabled={loading} onClick={loadCurrent}><UiText text={"Thử tải phiên đã lưu"} /></button>}
      {uncertain && <><button disabled={busy} onClick={()=>generate(true)}><UiText text={"Kiểm tra lại yêu cầu vừa gửi"} /></button><button disabled={busy} onClick={()=>{ request.current=null; setUncertain(false); setError(''); }}><UiText text={"Bỏ yêu cầu chưa xác nhận"} /></button></>}
    </div>
    {draft.trim() && !busy && !turnUncertain && <p className="world-note"><UiText text={"Lượt vừa chọn chưa gửi thành công. Bạn có thể chọn lại hoặc"} />{" "}<button onClick={()=>setDraft('')}><UiText text={"bỏ lựa chọn để tạo cảnh khác"} /></button>.</p>}
    <p className="world-note"><UiText>{durable?'Phiên được lưu để bạn tải lại và học tiếp.':'Bản thử giữ tạm khoảng 10 phút, mất khi máy chủ khởi động lại.'}</UiText>{" "}<UiText text={"Tối đa 12 lượt mỗi phiên."} />{" "}<UiText>{scene?.mission?'Nhiệm vụ dùng lời thoại theo kịch bản; mỗi lựa chọn không gọi thêm AI.':'Tạo cảnh và trả lời sử dụng hạn mức AI.'}</UiText></p>
    {missionProgress&&<section className="world-mission-progress" aria-label={englishText("Tiến độ nhiệm vụ")}><h2><UiText>{missionProgress.status==='completed'?'Đã hoàn thành nhiệm vụ có hướng dẫn':'Nhiệm vụ của bạn'}</UiText></h2><ol>{missionProgress.objectives.map(item=><li key={item.id} className={item.completed?'is-complete':''}><span aria-hidden="true"><UiText>{item.completed?'✓':'○'}</UiText></span> <UiText>{item.label}</UiText></li>)}</ol><p><UiText text={"Chọn nhân vật để hỏi thông tin và quyết định cách xử lý. Đây là nhiệm vụ có gợi ý, chưa chấm khả năng nói độc lập."} /></p>{missionProgress.active_facts.length>0&&<details><summary><UiText text={"Thông tin đã biết"} /></summary><ul>{missionProgress.active_facts.map((fact,index)=><li key={index}><UiText>{fact}</UiText></li>)}</ul></details>}</section>}
    {scene?.client_id&&<div className="world-actions"><button disabled={busy||loading||uncertain} onClick={reloadConversation}><UiText text={"Tải lại hội thoại đã nhận"} /></button>{durable&&sessionStatus!=='completed'&&<button disabled={busy||loading||turnUncertain||!turns.length} onClick={finishSession}><UiText text={"Kết thúc phiên luyện tập"} /></button>}</div>}
    {sessionStatus==='completed'&&<section className="world-session-summary" aria-label={englishText("Tổng kết phiên")}><h2><UiText text={"Đã kết thúc phiên luyện tập"} /></h2><p><UiText>{turns.length}</UiText>{" "}<UiText text={"lượt · Đã nói chuyện với"} />{" "}{new Set(turns.map(t=>t.npc_id)).size}{" "}<UiText text={"nhân vật ·"} />{" "}{turns.filter(t=>t.assistance!=='self_written').length}{" "}<UiText text={"lượt dùng gợi ý."} /></p>{scene?.mission&&<p><UiText>{missionProgress?.status==='completed'?'Đã hoàn thành nhiệm vụ có hướng dẫn.':'Nhiệm vụ chưa hoàn thành.'}</UiText></p>}<p><UiText text={"Đây là ghi nhận hoạt động, chưa đánh giá khả năng tự diễn đạt hoặc xác nhận đạt mục tiêu giao tiếp độc lập."} /></p></section>}
    {error && <p role="alert" className="world-error"><UiText>{error}</UiText></p>}
    {scene && <div className="world-layout world-cinematic"><section className="world-stage-panel">
      <div className="world-scene-top"><span><UiText>{scene.scene_name}</UiText></span><span><UiText>{scene.mission?'Nhiệm vụ theo kịch bản · AI chọn nhân vật':scene.source === 'ai_generated' ? 'Phân cảnh do AI tạo' : 'Bố cục và lời thoại mẫu · chưa gọi AI'}</UiText></span></div>
      <div className="world-stage" style={{ backgroundImage: `url(${scene.background})` }} aria-label={englishText("Phân cảnh quán cà phê")}>
        {scene.cast.map((member,index)=><button disabled={loading||restoreError||busy||turnUncertain} key={member.npc_id} className={`world-character ${selectedNpc===member.npc_id?'is-selected is-speaking':''}`} style={{ left: `${(index+1)*100/(scene.cast.length+1)}%` }} onClick={()=>{setSelectedNpc(member.npc_id);setDraft('');}} aria-pressed={selectedNpc===member.npc_id} aria-label={englishText(`Nói chuyện với ${member.name}, ${roleNames[member.role]}`)}>
          <img src={member.portrait} alt={member.name}/><span>{member.name}<small><UiText>{roleNames[member.role]}</UiText></small></span></button>)}
        <section className="world-scene-dialogue" aria-label={englishText(`Hộp thoại của ${speaker?.name}`)}>
          {(draft || latest?.learner) && <div className="world-learner-line"><strong><UiText text={"Bạn"} /></strong><span lang="en">{draft || latest.learner}</span></div>}
          <div className="world-speech" aria-live="polite" aria-busy={busy}>
            <div className="world-dialogue-heading"><strong className="world-speaker-name">{speaker?.name}<small><UiText>{roleNames[speaker?.role]}</UiText></small></strong><label><input type="checkbox" checked={showTranslation} onChange={e=>setShowTranslation(e.target.checked)}/>{" "}<UiText text={"Bản dịch"} /></label></div>
            {busy ? <p className="world-current-line"><UiText text={"Đang chờ phản hồi…"} /></p> : dialogue ? <><p className="world-current-line">{dialogue.text}</p>{showTranslation&&<p lang="vi" className="world-translation">{dialogue.translation}</p>}</> : <p className="world-current-line"><UiText text={"Chọn một câu bên dưới để mở lời với"} />{" "}{speaker?.name}.</p>}
            <ScenarioNpcVoice text={dialogue?.text} speakerId={selectedNpc} disabled={busy||loading||restoreError||turnUncertain||!dialogue} onPlaybackEvent={voiceObserver}/>
            {scene.mission&&replyNpcId&&<p className="world-next-step"><UiText text={"Bước tiếp theo · Nói với"} />{" "}<strong>{scene.cast.find(n=>n.npc_id===replyNpcId)?.name}</strong></p>}
            <div className="world-replies" aria-label={englishText("Chọn câu trả lời")}>{replies.map((reply,index)=><button disabled={loading||restoreError||sessionStatus==='completed'||busy||turnUncertain||uncertain||!scene.client_id||turns.length>=12} key={reply.id} onClick={()=>sendTurn(false,reply,replyNpcId)}><span className="world-choice-number"><UiText>{index+1}</UiText></span><span>{reply.text}{showTranslation&&<small lang="vi">{reply.translation}</small>}</span></button>)}</div>
            <div className="world-dialogue-footer"><span><UiText>{turns.length}</UiText><UiText text={"/12 lượt ·"} />{" "}<UiText>{sessionStatus==='completed'?'Phiên đã kết thúc':'Chọn một câu để trả lời ngay'}</UiText></span>{!scene.client_id&&<span><UiText text={"Hãy tạo cảnh AI để bắt đầu."} /></span>}{turnUncertain&&turnRequest.current&&<button disabled={busy} onClick={()=>sendTurn(true)}><UiText text={"Kiểm tra lại đúng lượt đã gửi"} /></button>}{turnUncertain&&<button disabled={busy} onClick={reloadConversation}><UiText text={"Kiểm tra trạng thái hội thoại"} /></button>}</div>
          </div>
        </section>
      </div>
      <div className="world-context"><h2 lang="en">{englishText(scene.title)}</h2><p lang="en">{englishText(scene.brief)}</p><p><strong><UiText text={"Mục tiêu giao tiếp:"} /></strong> <span lang="en">{englishText(scene.objective)}</span></p></div>
    </section><details className="world-dialogue"><summary><UiText text={"Xem lại hội thoại ·"} />{" "}<UiText>{turns.length}</UiText>{" "}<UiText text={"lượt"} /></summary>
      <div className="world-history">{turns.map(turn=><article key={turn.client_id}><p><strong><UiText text={"Bạn:"} /></strong> {turn.learner}</p><p><strong>{scene.cast.find(n=>n.npc_id===turn.npc_id)?.name}:</strong> {turn.npc.text}</p>{showTranslation&&<p lang="vi" className="world-translation">{turn.npc.translation}</p>}</article>)}</div>
      <div className="world-actions">
      {scene.client_id&&<button disabled={busy||uncertain} onClick={reloadConversation}><UiText text={"Tải lại hội thoại đã nhận"} /></button>}</div>
      <small className="world-note"><UiText>{!scene.client_id?'Hãy tạo phân cảnh AI để trò chuyện. ':''}</UiText><UiText>{scene.mission?'Chỉ lựa chọn hợp lệ mới ghi nhận bước nhiệm vụ có hướng dẫn, không chấm khả năng nói độc lập.':'Chọn gợi ý không được tính là hoàn thành nhiệm vụ.'}</UiText></small>
    </details></div>}
    {archiveAvailable&&<ScenarioSessionArchive client={client} currentSceneId={scene?.client_id} disabled={loading||busy||uncertain||turnUncertain||restoreError||Boolean(draft.trim())} onSelect={loadSavedSession} onAccessDenied={clearProtectedState}/>}
    <details className="world-library" open><summary><UiText text={"Thư viện nhân vật ·"} />{" "}<UiText>{catalog.npcs.length}</UiText> NPC</summary><div className="world-cast-grid">{catalog.npcs.map(npc=><article key={npc.id}><div className="world-portrait"><img src={npc.portrait} alt={englishText(`Nhân vật ${npc.name}`)} loading="lazy"/></div><div><h3>{npc.name}</h3><p><UiText>{npc.description}</UiText></p><small>{npc.roles.map((role,index)=><React.Fragment key={role}>{index>0&&' · '}<UiText>{roleNames[role]}</UiText></React.Fragment>)}</small></div></article>)}</div></details>
  </Container>;
}
