import { scenarioWorldCatalog as catalog } from '../../../shared/scenarioWorldCatalog.js';

const ID = 'cafe-order-v1';
const fail = (status,code) => Object.assign(new Error(code),{status,code});
const uuid = value => typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const staffRoles = ['barista','manager'], friendRoles = ['customer','student','traveler'];
const choice = (id,text,translation) => ({id,text,translation});
const choices = {
  'ask-preferences': choice('ask-preferences','What kind of drink would you like?','Bạn muốn uống đồ uống như thế nào?'),
  'offer-help': choice('offer-help','Let me check the menu for you.','Để tôi xem thực đơn giúp bạn.'),
  'deliver-early': choice('deliver-early','Here is your drink.','Đồ uống của bạn đây.'),
  'deliver-drink': choice('deliver-drink','Here is your iced herbal tea.','Trà thảo mộc lạnh của bạn đây.'),
  'ask-menu': choice('ask-menu','Could I see the drinks menu?','Tôi có thể xem thực đơn đồ uống không?'),
  'ask-help': choice('ask-help','Could you help me choose a drink for a friend?','Bạn có thể giúp tôi chọn đồ uống cho một người bạn không?'),
  'order-herbal-tea': choice('order-herbal-tea',"I'd like an iced herbal tea for my friend, please.",'Cho tôi một trà thảo mộc lạnh cho bạn tôi nhé.'),
  'order-coffee': choice('order-coffee',"I'd like an iced coffee for my friend, please.",'Cho tôi một cà phê lạnh cho bạn tôi nhé.'),
  'order-fruit-cooler': choice('order-fruit-cooler',"I'd like an iced fruit cooler for my friend, please.",'Cho tôi một nước trái cây lạnh cho bạn tôi nhé.'),
  'check-order': choice('check-order','Is the drink ready?','Đồ uống đã sẵn sàng chưa?'),
  'thank-staff': choice('thank-staff','Thank you for your help.','Cảm ơn bạn đã giúp đỡ.'),
  'extra-greet': choice('extra-greet','Hi! How is your day going?','Chào bạn! Hôm nay của bạn thế nào?'),
  'find-staff': choice('find-staff','Where can I ask about drinks?','Tôi có thể hỏi về đồ uống ở đâu?'),
  'extra-goodbye': choice('extra-goodbye','It was nice meeting you. See you later!','Rất vui được gặp bạn. Hẹn gặp lại!')
};
const variants = [
  ['ask-preferences-2','ask-preferences','What would you like me to get for you?','Bạn muốn tôi lấy đồ uống gì cho bạn?'],
  ['ask-preferences-3','ask-preferences','Could you tell me what you would like to drink?','Bạn có thể cho tôi biết bạn muốn uống gì không?'],
  ['ask-menu-2','ask-menu','What drinks do you have on the menu?','Thực đơn của quán có những đồ uống nào?'],
  ['ask-menu-3','ask-menu','May I take a look at the drinks menu?','Tôi có thể xem qua thực đơn đồ uống không?'],
  ['order-herbal-tea-2','order-herbal-tea','Could I have an iced herbal tea for my friend?','Cho tôi một trà thảo mộc lạnh cho bạn tôi được không?'],
  ['order-herbal-tea-3','order-herbal-tea','An iced herbal tea for my friend, please.','Một trà thảo mộc lạnh cho bạn tôi nhé.'],
  ['deliver-drink-2','deliver-drink','I got you an iced herbal tea. Here you are!','Tôi đã lấy trà thảo mộc lạnh cho bạn. Của bạn đây!'],
  ['deliver-drink-3','deliver-drink','This is your iced herbal tea. I hope you like it.','Đây là trà thảo mộc lạnh của bạn. Hy vọng bạn sẽ thích.'],
  ['offer-help-2','offer-help','I will ask the staff about your drink.','Tôi sẽ hỏi nhân viên về đồ uống cho bạn.'],
  ['offer-help-3','offer-help','I will check the price before I order.','Tôi sẽ kiểm tra giá trước khi gọi món.'],
  ['thank-staff-2','thank-staff','Thanks! I will take it to my friend now.','Cảm ơn bạn! Tôi sẽ mang cho bạn mình ngay.'],
  ['thank-staff-3','thank-staff','I appreciate your help.','Tôi rất cảm ơn sự giúp đỡ của bạn.'],
  ['check-friend-2','check-friend',"I will check what my friend wants first.",'Tôi sẽ hỏi trước xem bạn mình muốn gì.'],
  ['check-friend-3','check-friend',"Let me ask my friend before I order.",'Để tôi hỏi bạn mình trước khi gọi món.']
];
choices['check-friend']=choice('check-friend',"I need to ask my friend what they would like.",'Tôi cần hỏi xem bạn mình muốn gì.');
const actionBase=Object.fromEntries(variants.map(([id,base])=>[id,base]));
for(const [id,,text,translation] of variants)choices[id]=choice(id,text,translation);
const phrasings = base => [base,`${base}-2`,`${base}-3`];
const closingChoices = () => [
  choice('mission-close-1','You are welcome!','Không có gì!'),
  choice('mission-close-2','Enjoy your drink!','Chúc bạn uống ngon nhé!'),
  choice('mission-close-3','See you later!','Hẹn gặp lại!')
];
const line = (text,translation) => ({text,translation});

function cast(scene) {
  if (!scene || scene.scene_id!=='neighborhood-cafe' || !Array.isArray(scene.cast) || scene.cast.length<2 || scene.cast.length>3
    || new Set(scene.cast.map(n=>n?.npc_id)).size!==scene.cast.length) throw fail(409,'MISSION_CAST_INVALID');
  for (const member of scene.cast) {
    const authored=catalog.npcs.find(n=>n.id===member?.npc_id);
    if (!authored || !authored.roles.includes(member.role)) throw fail(409,'MISSION_CAST_INVALID');
  }
  return scene.cast;
}
function binding(scene) {
  const members=cast(scene), mission=scene.mission;
  if (!mission || mission.id!==ID || mission.version!==1 || mission.staff_npc_id===mission.friend_npc_id
    || mission.dialogue_revision!==undefined&&mission.dialogue_revision!==2
    || !members.some(n=>n.npc_id===mission.staff_npc_id && staffRoles.includes(n.role))
    || !members.some(n=>n.npc_id===mission.friend_npc_id && friendRoles.includes(n.role))) throw fail(409,'MISSION_DEFINITION_INVALID');
  return mission;
}
function roleOf(scene,mission,npcId) {
  if (!scene.cast.some(n=>n.npc_id===npcId)) throw fail(400,'MISSION_NPC_INVALID');
  return npcId===mission.staff_npc_id?'staff':npcId===mission.friend_npc_id?'friend':'extra';
}
function available(state,role,revision) {
  if (state.delivered) return [];
  let ids;
  if(revision===2 && role!=='extra') {
    if(role==='friend')ids=phrasings(state.ordered?'deliver-drink':state.preferences?'offer-help':'ask-preferences');
    else ids=phrasings(state.ordered?'thank-staff':!state.menu?'ask-menu':state.preferences?'order-herbal-tea':'check-friend');
  }
  else if (role==='friend') ids=state.ordered?['deliver-drink','ask-preferences','offer-help']:['ask-preferences','offer-help','deliver-early'];
  else if (role==='extra') ids=['extra-greet','find-staff','extra-goodbye'];
  else if (state.ordered) ids=['check-order','thank-staff','ask-menu'];
  else if (state.preferences && state.menu) ids=['order-herbal-tea','order-coffee','order-fruit-cooler'];
  else if (state.menu) ids=['ask-menu','ask-help','order-herbal-tea'];
  else ids=['ask-menu','ask-help','order-coffee'];
  return ids.map(id=>({...choices[id]}));
}
function transition(state,id,clientId) {
  id=actionBase[id]??id;
  const next={...state};
  let response;
  if (id==='ask-preferences') {
    next.preferences ||= clientId;
    response=line("I'd like an iced drink without caffeine. I can spend up to 40 café credits.",'Tôi muốn đồ uống lạnh không có caffeine. Tôi có thể dùng tối đa 40 điểm quán.');
  } else if (id==='ask-menu') {
    next.menu ||= clientId;
    response=line('Iced herbal tea is 30 credits and has no caffeine. Iced coffee is 25 credits and contains caffeine. An iced fruit cooler is 45 credits and has no caffeine.','Trà thảo mộc lạnh giá 30 điểm và không có caffeine. Cà phê lạnh giá 25 điểm và có caffeine. Nước trái cây lạnh giá 45 điểm và không có caffeine.');
  } else if (id.startsWith('order-')) {
    if (!state.preferences) response=line("Please check your friend's preferences before ordering.",'Hãy hỏi mong muốn của bạn mình trước khi gọi món nhé.');
    else if (!state.menu) response=line('Please check the menu before ordering.','Hãy xem thực đơn trước khi gọi món nhé.');
    else if (id==='order-coffee') response=line("Iced coffee contains caffeine. It does not fit your friend's request.",'Cà phê lạnh có caffeine nên không phù hợp với mong muốn của bạn bạn.');
    else if (id==='order-fruit-cooler') response=line("The fruit cooler costs 45 credits, above your friend's budget.",'Nước trái cây giá 45 điểm, vượt ngân sách của bạn bạn.');
    else {
      next.ordered ||= clientId;
      response=line('Here is the iced herbal tea for 30 credits. It has no caffeine. Please take it to your friend.','Trà thảo mộc lạnh giá 30 điểm của bạn đây. Nó không có caffeine. Hãy mang cho bạn mình nhé.');
    }
  } else if (id==='deliver-drink') {
    if (!state.ordered) throw fail(409,'MISSION_PREREQUISITE_MISSING');
    next.delivered ||= clientId;
    response=line('Thank you! This iced herbal tea is just what I wanted.','Cảm ơn bạn! Trà thảo mộc lạnh này đúng là món tôi muốn.');
  } else if (id==='deliver-early') response=line('We have not ordered a drink yet. Could you ask the staff for help?','Chúng ta chưa gọi đồ uống. Bạn có thể hỏi nhân viên giúp không?');
  else if (id==='offer-help') response=line('Thank you! Let me know when the drink is ready.','Cảm ơn bạn! Khi đồ uống sẵn sàng thì báo tôi nhé.');
  else if (id==='ask-help') response=line('Of course. Ask your friend what they would like, then check the menu.','Được chứ. Hãy hỏi bạn mình muốn gì rồi xem thực đơn nhé.');
  else if (id==='check-order') response=line('The iced herbal tea is ready. Please take it to your friend.','Trà thảo mộc lạnh đã sẵn sàng. Hãy mang cho bạn mình nhé.');
  else if (id==='thank-staff') response=line('You are welcome!','Không có gì!');
  else if (id==='check-friend') response=line('Of course. I will wait while you check with your friend.','Được chứ. Tôi sẽ đợi trong lúc bạn hỏi bạn mình.');
  else if (id==='find-staff') response=line('Please ask the person at the drinks counter.','Hãy hỏi người ở quầy đồ uống nhé.');
  else if (id==='extra-greet') response=line('Hi! I am having a nice day, thank you.','Chào bạn! Hôm nay của tôi khá vui, cảm ơn bạn.');
  else if (id==='extra-goodbye') response=line('See you!','Hẹn gặp lại!');
  else throw fail(400,'MISSION_CHOICE_INVALID');
  return {next,response};
}
function stateFrom(scene,turns) {
  const mission=binding(scene);
  if (!Array.isArray(turns) || turns.length>12) throw fail(409,'MISSION_HISTORY_INVALID');
  let state={preferences:null,menu:null,ordered:null,delivered:null};
  const seen=new Set();
  for (const turn of turns) {
    const action=turn?.mission_action;
    if (!uuid(turn?.client_id) || seen.has(turn.client_id) || turn.assistance!=='suggestion' || !action
      || Object.keys(action).some(k=>!['id','npc_id'].includes(k)) || action.npc_id!==turn.npc_id) throw fail(409,'MISSION_HISTORY_INVALID');
    const role=roleOf(scene,mission,turn.npc_id), selected=available(state,role,mission.dialogue_revision).find(c=>c.id===action.id);
    if (!selected || selected.text!==turn.learner) throw fail(409,'MISSION_HISTORY_INVALID');
    const result=transition(state,action.id,turn.client_id);
    if (turn.npc?.text!==result.response.text || turn.npc?.translation!==result.response.translation) throw fail(409,'MISSION_HISTORY_INVALID');
    state=result.next;seen.add(turn.client_id);
  }
  return {state,mission};
}

export function bindCafeMission(scene) {
  const members=cast(scene);
  const staff=members.find(n=>staffRoles.includes(n.role)), friend=members.find(n=>friendRoles.includes(n.role));
  if (!staff || !friend || staff.npc_id===friend.npc_id || scene.topic_id && scene.topic_id!=='ordering') throw fail(502,'MISSION_CAST_INCOMPATIBLE');
  const mission={id:ID,version:1,dialogue_revision:2,staff_npc_id:staff.npc_id,friend_npc_id:friend.npc_id};
  const bound={...scene,mission,title:'Chọn đồ uống giúp một người bạn',
    brief:'Bạn cùng một người bạn ghé quán cà phê. Hãy tìm hiểu mong muốn của bạn mình, xem thực đơn và mang về món phù hợp. Giá trong nhiệm vụ dùng điểm quán giả lập.',
    objective:'Hỏi mong muốn, tìm thông tin thực đơn, chọn đúng món và đem đồ uống cho bạn mình.',
    opening:{npc_id:staff.npc_id,text:'Welcome to our café! How can I help you?',translation:'Chào mừng bạn đến quán! Tôi có thể giúp gì cho bạn?'}};
  bound.suggested_replies=missionView(bound,[]).choices_by_npc[staff.npc_id];
  return bound;
}

export function missionView(scene,turns) {
  const {state,mission}=stateFrom(scene,turns);
  const objectives=[
    ['preferences','Tìm hiểu mong muốn của bạn mình'],['menu','Hỏi thông tin thực đơn'],
    ['ordered','Chọn món phù hợp với mong muốn và ngân sách'],['delivered','Mang đúng đồ uống cho bạn mình']
  ].map(([id,label])=>({id,label,completed:Boolean(state[id]),evidence_client_ids:state[id]?[state[id]]:[]}));
  const active_facts=[];
  if(state.preferences)active_facts.push('Bạn của bạn muốn đồ uống lạnh, không có caffeine và tối đa 40 điểm quán.');
  if(state.menu)active_facts.push('Thực đơn: trà thảo mộc lạnh 30 điểm, không caffeine; cà phê lạnh 25 điểm, có caffeine; nước trái cây lạnh 45 điểm, không caffeine.');
  if(state.ordered)active_facts.push('Bạn đã nhận trà thảo mộc lạnh giá 30 điểm từ nhân viên.');
  if(state.delivered)active_facts.push('Bạn của bạn đã nhận đúng đồ uống.');
  const choices_by_npc=Object.fromEntries(scene.cast.map(n=>[n.npc_id,available(state,roleOf(scene,mission,n.npc_id),mission.dialogue_revision)]));
  const nextGoal=!state.preferences?['ask-preferences',mission.friend_npc_id]:!state.menu?['ask-menu',mission.staff_npc_id]
    :!state.ordered?['order-herbal-tea',mission.staff_npc_id]:!state.delivered?['deliver-drink',mission.friend_npc_id]:null;
  const next_npc_id=nextGoal?.[1]??null;
  const next_choices=nextGoal?choices_by_npc[next_npc_id].filter(c=>(actionBase[c.id]??c.id)===nextGoal[0]):[];
  return {id:ID,version:1,status:state.delivered?'completed':'active',objectives,
    choices_by_npc,active_facts,next_npc_id,next_choices,
    evidence_type:'guided_choice',proficiency_assessed:false};
}

export function advanceCafeMission(scene,turns,input) {
  const {state,mission}=stateFrom(scene,turns);
  if (state.delivered || turns.length>=12) throw fail(409,'MISSION_ALREADY_FINISHED');
  if (!input || !uuid(input.client_id) || typeof input.choice_id!=='string' || !Object.hasOwn(choices,input.choice_id)
    || input.assistance!=='suggestion') throw fail(400,'MISSION_CHOICE_INVALID');
  if (turns.some(t=>t.client_id===input.client_id)) throw fail(409,'MISSION_REQUEST_REPLAY_REQUIRES_STORE');
  const role=roleOf(scene,mission,input.npc_id),selected=available(state,role,mission.dialogue_revision).find(c=>c.id===input.choice_id);
  if (!selected) throw fail(409,'MISSION_CHOICE_UNAVAILABLE');
  if (input.text!==selected.text) throw fail(400,'MISSION_CHOICE_TEXT_MISMATCH');
  const result=transition(state,selected.id,input.client_id);
  const nextChoices=available(result.next,role,mission.dialogue_revision);
  return {client_id:input.client_id,npc_id:input.npc_id,learner:selected.text,assistance:'suggestion',npc:result.response,
    suggested_replies:nextChoices.length?nextChoices:closingChoices(),mission_action:{id:selected.id,npc_id:input.npc_id}};
}
