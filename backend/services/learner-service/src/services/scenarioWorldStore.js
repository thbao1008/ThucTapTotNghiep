import { validateSceneRequest, sceneDirectorMessages, parseDirectedScene } from '../utils/scenarioWorldDirector.js';
import { createWorldConversation, validateWorldReply } from '../utils/scenarioWorldConversation.js';
import { missionView } from '../utils/scenarioWorldMission.js';

const fail=(status,code)=>Object.assign(new Error(code),{status,code});
const allowedStatus=error=>[400,409,429,502,503,504].includes(error.status)?error.status:503;
const validId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const archiveTime=/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export function validateWorldArchiveCursor(cursor) {
  if(cursor===undefined)return null;
  if(typeof cursor!=='string'||!cursor.length||cursor.length>256||!/^[A-Za-z0-9_-]+$/.test(cursor))throw fail(400,'WORLD_ARCHIVE_CURSOR_INVALID');
  let value;
  try {
    const raw=Buffer.from(cursor,'base64url');
    if(raw.toString('base64url')!==cursor)throw Error();
    value=JSON.parse(raw.toString('utf8'));
  }catch{throw fail(400,'WORLD_ARCHIVE_CURSOR_INVALID');}
  if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!=='at,id,v'||value.v!==1
    ||typeof value.at!=='string'||!archiveTime.test(value.at)||!validId(value.id)
    ||!Number.isFinite(Date.parse(value.at))||new Date(value.at).toISOString().slice(0,19)!==value.at.slice(0,19))throw fail(400,'WORLD_ARCHIVE_CURSOR_INVALID');
  return value;
}

export async function verifyWorldTarget(client) {
  const {rows:[target]}=await client.query(`SELECT current_database() AS db,current_schema() AS schema,inet_server_addr()::text AS address,inet_server_port() AS port`);
  if (target.db!=='aesp'||target.schema!=='public'||target.port!==5432||!['127.0.0.1','127.0.0.1/32','::1','::1/128'].includes(target.address)) throw fail(503,'WORLD_DATABASE_TARGET');
  return target;
}

export function createScenarioWorldStore({pool,callAI}) {
  async function transaction(work) {
    const client=await pool.connect();let open=false;
    try {
      await verifyWorldTarget(client);
      await client.query('BEGIN');open=true;await client.query("SET LOCAL lock_timeout='3s'");
      const result=await work(client);await client.query('COMMIT');open=false;return result;
    }catch(error){if(open)await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }
  async function owned(client,learnerId,id,lock=false) {
    if(!validId(id))throw fail(400,'WORLD_ID_INVALID');
    const {rows:[row]}=await client.query(`SELECT *,active_since>clock_timestamp()-interval '2 minutes' AS lease_live FROM public.scenario_world_sessions WHERE learner_id=$1 AND id=$2 ${lock?'FOR UPDATE':''}`,[learnerId,id]);
    if(!row)throw fail(410,'WORLD_NOT_FOUND');
    if(row.definition_version!=='world-dialogue-v1')throw fail(409,'WORLD_VERSION_UNSUPPORTED');
    return row;
  }
  const history=row=>({scene_id:row.id,revision:row.revision,turns:row.turns,pending:Boolean(row.active_request&&row.lease_live),transient:false,status:row.status,
    scene:row.scene,request:row.request,definition_version:row.definition_version,
    ...(row.scene?.mission?{mission_progress:missionView(row.scene,row.turns)}:{})});

  async function preview(learnerId,input) {
    const request=validateSceneRequest(input);
    const reservation=await transaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(1380143950,$1::integer)',[learnerId]);
      const {rows:[prior]}=await client.query('SELECT * FROM public.scenario_world_sessions WHERE learner_id=$1 AND id=$2',[learnerId,request.client_id]);
      if(prior) {
        const signature=r=>[r.client_id,r.level,r.topic_id,r.scene_id??null,r.mission_id??null];
        if(!same(signature(prior.request),signature(request)))throw fail(409,'SCENE_REQUEST_CONFLICT');
        if(prior.scene)return {result:prior.scene};
        throw fail(prior.generation_error||503,'SCENE_GENERATION_UNCERTAIN');
      }
      const {rows:[limit]}=await client.query("SELECT count(*)::int AS count FROM public.scenario_world_sessions WHERE learner_id=$1 AND created_at>clock_timestamp()-interval '1 minute'",[learnerId]);
      if(limit.count>=3)throw fail(429,'SCENE_REQUEST_LIMIT');
      await client.query("INSERT INTO public.scenario_world_sessions(learner_id,id,request,status,created_at,updated_at) VALUES($1,$2,$3::jsonb,'generating',clock_timestamp(),clock_timestamp())",[learnerId,request.client_id,JSON.stringify(request)]);
      return {};
    });
    if(reservation.result)return reservation.result;
    let scene;
    try {
      const response=await callAI(sceneDirectorMessages(request),{task_type:'scenario_generation',temperature:0.8,max_tokens:1800,response_format:{type:'json_object'}});
      scene={...parseDirectedScene(response?.choices?.[0]?.message?.content,request),client_id:request.client_id,preview_only:false,transient:false};
    }catch(error){
      await transaction(client=>client.query("UPDATE public.scenario_world_sessions SET status='failed',generation_error=$3,updated_at=clock_timestamp() WHERE learner_id=$1 AND id=$2 AND status='generating'",[learnerId,request.client_id,allowedStatus(error)])).catch(()=>{});
      throw error;
    }
    // If this commit is ambiguous, retries only inspect the reservation; never call AI again.
    await transaction(client=>client.query("UPDATE public.scenario_world_sessions SET scene=$3::jsonb,status='ready',updated_at=clock_timestamp() WHERE learner_id=$1 AND id=$2 AND status='generating'",[learnerId,request.client_id,JSON.stringify(scene)]));
    return scene;
  }
  async function read(learnerId,id) {return history(await owned(pool,learnerId,id));}
  async function latest(learnerId) {
    const {rows:[row]}=await pool.query("SELECT id FROM public.scenario_world_sessions WHERE learner_id=$1 AND definition_version='world-dialogue-v1' AND status IN ('ready','completed') AND scene IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1",[learnerId]);
    return row?read(learnerId,row.id):null;
  }
  async function list(learnerId,cursor) {
    const before=validateWorldArchiveCursor(cursor);
    const {rows}=await pool.query(`SELECT id AS scene_id,scene->>'title' AS title,
      request->>'level' AS level,request->>'topic_id' AS topic_id,request->>'mission_id' AS mission_id,
      status,revision,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
      FROM public.scenario_world_sessions AS saved
      WHERE saved.learner_id=$1 AND definition_version='world-dialogue-v1' AND status IN ('ready','completed') AND scene IS NOT NULL
        AND ($2::timestamptz IS NULL OR (saved.created_at,saved.id)<($2::timestamptz,$3::uuid))
      ORDER BY saved.created_at DESC,saved.id DESC LIMIT 11`,[learnerId,before?.at??null,before?.id??null]);
    const sessions=rows.slice(0,10).map(row=>({scene_id:row.scene_id,title:row.title,level:row.level,topic_id:row.topic_id,
      mission_id:row.mission_id??null,status:row.status,revision:row.revision,created_at:row.created_at}));
    const last=sessions.at(-1);
    if(last&&(!validId(last.scene_id)||!archiveTime.test(last.created_at)))throw fail(503,'WORLD_ARCHIVE_INVALID');
    const next_cursor=rows.length>10?Buffer.from(JSON.stringify({v:1,at:last.created_at,id:last.scene_id}),'utf8').toString('base64url'):null;
    return {sessions,next_cursor,transient:false};
  }
  async function reply(learnerId,raw) {
    const input=validateWorldReply(raw);
    const reservation=await transaction(async client=>{
      const row=await owned(client,learnerId,input.scene_id,true);
      const {rows:[prior]}=await client.query('SELECT * FROM public.scenario_world_requests WHERE learner_id=$1 AND session_id=$2 AND client_id=$3',[learnerId,input.scene_id,input.client_id]);
      if(prior) {
        const normalize=v=>[v.scene_id,v.client_id,v.revision,v.npc_id,v.text,v.assistance,v.choice_id??null];
        if(!same(normalize(prior.input),normalize(input)))throw fail(409,'WORLD_REQUEST_CONFLICT');
        if(prior.status==='completed')return {result:prior.result};
        throw fail(prior.error_status||503,'WORLD_REQUEST_UNCERTAIN');
      }
      if(row.status!=='ready'||row.revision!==input.revision||row.active_request&&row.lease_live)throw fail(409,'WORLD_REVISION_CONFLICT');
      if(!row.scene.cast.some(n=>n.npc_id===input.npc_id))throw fail(400,'WORLD_NPC_INVALID');
      const {rows:[attempts]}=await client.query('SELECT count(*)::int AS count FROM public.scenario_world_requests WHERE learner_id=$1 AND session_id=$2',[learnerId,input.scene_id]);
      if(row.revision>=12||attempts.count>=24)throw fail(429,'WORLD_TURN_LIMIT');
      await client.query("INSERT INTO public.scenario_world_requests(learner_id,session_id,client_id,input,status) VALUES($1,$2,$3,$4::jsonb,'pending')",[learnerId,input.scene_id,input.client_id,JSON.stringify(input)]);
      await client.query('UPDATE public.scenario_world_sessions SET active_request=$3,active_since=clock_timestamp() WHERE learner_id=$1 AND id=$2',[learnerId,input.scene_id,input.client_id]);
      return {row};
    });
    if(reservation.result)return reservation.result;
    let result;
    try {
      const engine=createWorldConversation({getScene:()=>reservation.row.scene,callAI,initialTurns:reservation.row.turns});
      result={...await engine.reply(learnerId,input),transient:false};
    }catch(error){
      await transaction(async client=>{
        await owned(client,learnerId,input.scene_id,true);
        await client.query("UPDATE public.scenario_world_requests SET status='failed',error_status=$4 WHERE learner_id=$1 AND session_id=$2 AND client_id=$3 AND status='pending'",[learnerId,input.scene_id,input.client_id,allowedStatus(error)]);
        await client.query('UPDATE public.scenario_world_sessions SET active_request=NULL,active_since=NULL WHERE learner_id=$1 AND id=$2 AND active_request=$3',[learnerId,input.scene_id,input.client_id]);
      }).catch(()=>{});
      throw error;
    }
    await transaction(async client=>{
      const current=await owned(client,learnerId,input.scene_id,true);
      if(current.active_request!==input.client_id||current.revision!==input.revision||current.status!=='ready')throw fail(409,'WORLD_LEASE_REPLACED');
      await client.query('UPDATE public.scenario_world_sessions SET turns=turns||$3::jsonb,revision=revision+1,active_request=NULL,active_since=NULL,updated_at=clock_timestamp() WHERE learner_id=$1 AND id=$2',[learnerId,input.scene_id,JSON.stringify([result.turn])]);
      await client.query("UPDATE public.scenario_world_requests SET status='completed',result=$4::jsonb WHERE learner_id=$1 AND session_id=$2 AND client_id=$3",[learnerId,input.scene_id,input.client_id,JSON.stringify(result)]);
    });
    return result;
  }
  async function finish(learnerId,input) {
    if(!input||Object.keys(input).some(k=>!['scene_id','revision'].includes(k))||!validId(input.scene_id)||!Number.isSafeInteger(input.revision))throw fail(400,'WORLD_INPUT_INVALID');
    return transaction(async client=>{
      const row=await owned(client,learnerId,input.scene_id,true);
      if(row.revision!==input.revision||row.revision<1||row.active_request&&row.lease_live||!['ready','completed'].includes(row.status))throw fail(409,'WORLD_REVISION_CONFLICT');
      if(row.status==='completed')return history(row);
      await client.query("UPDATE public.scenario_world_sessions SET status='completed',active_request=NULL,active_since=NULL,updated_at=clock_timestamp() WHERE learner_id=$1 AND id=$2",[learnerId,input.scene_id]);
      return {...history(row),status:'completed',pending:false};
    });
  }
  return {preview,reply,read,latest,list,finish};
}
