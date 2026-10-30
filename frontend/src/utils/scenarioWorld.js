// Reconcile the transport with the authored catalog. Image URLs and names are
// always taken locally, never from generated text or a model-supplied URL.
export function presentScenePreview(value, catalog, expected) {
  const invalid = () => { throw new Error('Phân cảnh trả về chưa hợp lệ.'); };
  const text = (v,max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  const scene = catalog.scenes.find(item => item.id === value?.scene_id);
  if (!value || !scene || value.client_id !== expected.client_id || value.level !== expected.level
    || value.topic_id !== expected.topic_id || value.catalog_version !== catalog.version || value.source !== 'ai_generated'
    || expected.scene_id && value.scene_id !== expected.scene_id
    || !scene.levels.includes(value.level) || !scene.topics.includes(value.topic_id)
    || !text(value.title,120) || !text(value.brief,1000) || !text(value.objective,500)
    || !Array.isArray(value.cast) || value.cast.length < 2 || value.cast.length > 3) return invalid();
  const cast = value.cast.map(member => {
    const npc = catalog.npcs.find(item => item.id === member?.npc_id);
    if (!npc || !npc.roles.includes(member.role) || !scene.roles.includes(member.role)) return invalid();
    return { npc_id: npc.id, name: npc.name, portrait: npc.portrait, role: member.role };
  });
  const openingMember = cast.find(member => member.npc_id === value.opening?.npc_id);
  const topic = catalog.topics.find(topic => topic.id === expected.topic_id);
  if (new Set(cast.map(member => member.npc_id)).size !== cast.length
    || !openingMember || !topic.opening_roles.includes(openingMember.role)
    || !text(value.opening?.text,700) || !text(value.opening?.translation,900)
    || !Array.isArray(value.suggested_replies) || value.suggested_replies.length !== 3
    || !value.suggested_replies.every(reply => text(reply?.text,400) && text(reply?.translation,600))) return invalid();
  let mission;
  if(expected.mission_id||value.mission){
    const candidate=value.mission;
    if(expected.mission_id!=='cafe-order-v1'||expected.level!=='A2'||candidate?.id!==expected.mission_id||candidate.version!==1
      ||candidate.dialogue_revision!==undefined&&candidate.dialogue_revision!==2
      ||candidate.staff_npc_id===candidate.friend_npc_id
      ||!cast.some(n=>n.npc_id===candidate.staff_npc_id&&['barista','manager'].includes(n.role))
      ||!cast.some(n=>n.npc_id===candidate.friend_npc_id&&['customer','student','traveler'].includes(n.role)))return invalid();
    mission={id:candidate.id,version:1,staff_npc_id:candidate.staff_npc_id,friend_npc_id:candidate.friend_npc_id,...(candidate.dialogue_revision?{dialogue_revision:candidate.dialogue_revision}:{})};
  }
  return { client_id: value.client_id, title: value.title, brief: value.brief, objective: value.objective,
    scene_name: scene.name, background: scene.background, cast, opening: { npc_id: value.opening.npc_id, text: value.opening.text, translation: value.opening.translation },
    suggested_replies: value.suggested_replies.map((reply,index) => ({ id: `reply-${index+1}`, text: reply.text, translation: reply.translation })), source: 'ai_generated',...(mission?{mission}:{}) };
}

export function presentWorldTurn(value, expected) {
  const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
  const turn=value?.turn;
  if (value?.scene_id!==expected.scene_id || value.revision!==expected.revision+1
    || turn?.client_id!==expected.client_id || turn.npc_id!==expected.npc_id
    || turn.learner!==expected.text.trim() || turn.assistance!==expected.assistance
    || !text(turn.npc?.text,1000)||!text(turn.npc?.translation,1400)
    || !Array.isArray(turn.suggested_replies)||turn.suggested_replies.length!==3
    || !turn.suggested_replies.every(r=>text(r?.text,400)&&text(r.translation,600))
    ||expected.choice_id!==undefined&&(turn.mission_action?.id!==expected.choice_id||turn.mission_action.npc_id!==expected.npc_id||turn.assistance!=='suggestion')) throw new Error('Lượt phản hồi chưa hợp lệ.');
  return {client_id:turn.client_id,npc_id:turn.npc_id,learner:turn.learner,assistance:turn.assistance,
    npc:{text:turn.npc.text,translation:turn.npc.translation},suggested_replies:turn.suggested_replies.map((r,i)=>({id:`reply-${i+1}`,text:r.text,translation:r.translation})),
    ...(expected.choice_id?{mission_action:{id:turn.mission_action.id,npc_id:turn.npc_id}}:{})};
}

export function presentWorldHistory(value, scene) {
  if (value?.scene_id!==scene.client_id || !Array.isArray(value.turns) || value.turns.length>12
    || value.revision!==value.turns.length || typeof value.pending!=='boolean') throw new Error('Hội thoại trả về chưa hợp lệ.');
  const ids=new Set();
  return value.turns.map((turn,index)=>{
    if (!scene.cast.some(n=>n.npc_id===turn?.npc_id) || typeof turn.client_id!=='string' || ids.has(turn.client_id)
      || typeof turn.learner!=='string' || !turn.learner.trim() || turn.learner.length>2000
      || !['self_written','suggestion','suggestion_edited'].includes(turn.assistance)
      ||scene.mission&&typeof turn.mission_action?.id!=='string') throw new Error('Hội thoại trả về chưa hợp lệ.');
    ids.add(turn.client_id);
    return presentWorldTurn({scene_id:scene.client_id,revision:index+1,turn},{scene_id:scene.client_id,client_id:turn.client_id,revision:index,npc_id:turn.npc_id,text:turn.learner,assistance:turn.assistance,...(scene.mission?{choice_id:turn.mission_action.id}:{})});
  });
}

export function presentWorldSession(value, catalog) {
  if (!value || value.transient!==false || value.definition_version!=='world-dialogue-v1'
    || !['ready','completed'].includes(value.status) || !value.request || value.scene_id!==value.request.client_id) throw new Error('Phiên Scenario đã lưu chưa hợp lệ.');
  const scene=presentScenePreview(value.scene,catalog,value.request);
  const turns=presentWorldHistory(value,scene);
  if (value.status==='completed'&&(value.pending||turns.length===0)) throw new Error('Trạng thái kết thúc chưa hợp lệ.');
  return {scene,turns,status:value.status,pending:value.pending,...(scene.mission?{mission_progress:presentMissionProgress(value.mission_progress,scene,turns)}:{})};
}

export function presentMissionProgress(value,scene,turns) {
  const invalid=()=>{throw new Error('Tiến độ nhiệm vụ chưa hợp lệ.');};
  const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
  if(!scene.mission||value?.id!==scene.mission.id||value.version!==1||!['active','completed'].includes(value.status)
    ||value.evidence_type!=='guided_choice'||value.proficiency_assessed!==false
    ||!Array.isArray(value.objectives)||value.objectives.length!==4||!value.choices_by_npc
    ||!Array.isArray(value.active_facts)||value.active_facts.length>4||!value.active_facts.every(v=>text(v,700)))return invalid();
  const ids=['preferences','menu','ordered','delivered'],evidence=new Set(turns.map(t=>t.client_id));
  const objectives=value.objectives.map((item,index)=>{
    if(item?.id!==ids[index]||typeof item.completed!=='boolean'||!text(item.label,200)||!Array.isArray(item.evidence_client_ids)
      ||item.evidence_client_ids.length!==(item.completed?1:0)||item.evidence_client_ids.some(id=>!evidence.has(id)))return invalid();
    return {id:item.id,label:item.label,completed:item.completed,evidence_client_ids:[...item.evidence_client_ids]};
  });
  if(objectives[2].completed&&(!objectives[0].completed||!objectives[1].completed)||objectives[3].completed&&!objectives[2].completed
    ||(value.status==='completed')!==objectives[3].completed
    ||new Set(objectives.flatMap(item=>item.evidence_client_ids)).size!==objectives.filter(item=>item.completed).length)return invalid();
  if(Object.keys(value.choices_by_npc).length!==scene.cast.length)return invalid();
  const choices_by_npc=Object.fromEntries(scene.cast.map(npc=>{
    const choices=value.choices_by_npc[npc.npc_id];
    if(!Array.isArray(choices)||choices.length!==(value.status==='completed'?0:3)||new Set(choices.map(c=>c?.id)).size!==choices.length
      ||!choices.every(c=>text(c?.id,100)&&text(c.text,400)&&text(c.translation,600)))return invalid();
    return [npc.npc_id,choices.map(c=>({id:c.id,text:c.text,translation:c.translation}))];
  }));
  const nextIndex=objectives.findIndex(item=>!item.completed);
  const nextNpc=nextIndex<0?null:[scene.mission.friend_npc_id,scene.mission.staff_npc_id,scene.mission.staff_npc_id,scene.mission.friend_npc_id][nextIndex];
  const nextAction=nextIndex<0?null:['ask-preferences','ask-menu','order-herbal-tea','deliver-drink'][nextIndex];
  const nextChoices=value.next_choices??(nextNpc?choices_by_npc[nextNpc].filter(c=>c.id===nextAction):[]);
  if(value.next_npc_id!==undefined&&value.next_npc_id!==nextNpc||!Array.isArray(nextChoices)||nextChoices.length>(nextNpc?3:0)
    ||nextNpc&&nextChoices.length===0||!nextChoices.every(c=>choices_by_npc[nextNpc]?.some(real=>real.id===c?.id&&real.text===c.text&&real.translation===c.translation)))return invalid();
  return {id:value.id,version:1,status:value.status,objectives,choices_by_npc,active_facts:[...value.active_facts],evidence_type:'guided_choice',proficiency_assessed:false,
    next_npc_id:nextNpc,next_choices:nextChoices.map(c=>({id:c.id,text:c.text,translation:c.translation}))};
}
