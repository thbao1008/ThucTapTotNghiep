import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,realpath,lstat,unlink} from 'node:fs/promises';

const backendRoot=fileURLToPath(new URL('../../',import.meta.url));
const migrationUrl=new URL('../../db/migrations/009_story_session_lifetimes.sql',import.meta.url);
export async function verifyPracticeRetentionTarget(database) {
  const {rows:[target]}=await database.query(`SELECT current_database() AS db,current_schema() AS schema,
    inet_server_addr()::text AS host,inet_server_port() AS port`);
  if(target?.db!=='aesp'||target?.schema!=='public'||Number(target?.port)!==5432
    ||!['127.0.0.1','127.0.0.1/32','::1','::1/128'].includes(target?.host))throw Error('Practice cleanup requires local aesp.public on port 5432');
}
export async function ensureStoryRetentionSchema(database) {
  await verifyPracticeRetentionTarget(database);
  await database.query(await readFile(migrationUrl,'utf8'));
}

function uploadFilename(value) {
  if(typeof value!=='string')return null;
  let pathname=value;
  if(/^https?:\/\//i.test(value)){
    const url=new URL(value);
    if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash)return null;
    pathname=url.pathname;
  }
  const match=/^\/uploads\/([a-zA-Z0-9][a-zA-Z0-9_.-]*)$/.exec(pathname);
  return match&&!match[1].includes('..')?match[1]:null;
}
async function removeContainedFile(folder,filename) {
  const candidate=path.join(folder,filename);
  try {
    const stat=await lstat(candidate);
    if(stat.isSymbolicLink()||!stat.isFile())throw Error('Unsafe practice artifact');
    if((await lstat(folder)).isSymbolicLink())throw Error('Unsafe practice folder');
    const [root,resolved,backend]=await Promise.all([realpath(folder),realpath(candidate),realpath(path.dirname(folder))]);
    if(path.dirname(root)!==backend)throw Error('Practice folder outside backend');
    if(path.dirname(resolved)!==root)throw Error('Practice artifact outside its folder');
    await unlink(candidate);
  } catch(error) { if(error.code!=='ENOENT')throw error; }
}
// Never enumerate directories. Each deletion derives from an owned database URL.
export async function removePracticeArtifacts(audioUrls,{backendDir=backendRoot}={}) {
  const failed=[];let removed=0;
  for(const url of new Set(audioUrls.filter(Boolean))) {
    const filename=uploadFilename(url);
    if(!filename){failed.push(url);continue;}
    try {
      await removeContainedFile(path.join(backendDir,'uploads'),filename);
      await removeContainedFile(path.join(backendDir,'outputs'),`${path.parse(filename).name}.json`);
      removed++;
    } catch {failed.push(url);}
  }
  return {removed,failed};
}

export async function registerStoryLifetime(database,{storySessionId,authSessionId,userId,learnerId}) {
  await verifyPracticeRetentionTarget(database);
  const result=await database.query(`INSERT INTO story_session_lifetimes(story_session_id,auth_session_id,user_id,learner_id)
    SELECT s.id,a.id,a.user_id,s.learner_id FROM story_sessions s
    JOIN learners l ON l.id=s.learner_id JOIN user_sessions a ON a.user_id=l.user_id
    WHERE s.id=$1 AND a.id=$2 AND a.user_id=$3 AND l.id=$4 AND a.is_active=TRUE AND a.expires_at>NOW()
    ON CONFLICT(story_session_id) DO NOTHING RETURNING story_session_id`,[storySessionId,authSessionId,userId,learnerId]);
  if(!result.rows[0])throw Object.assign(Error('Login session is no longer active'),{status:403,code:'STORY_LOGIN_EXPIRED'});
}
export async function assertStoryLifetime(database,storySessionId,authSessionId) {
  const {rows:[row]}=await database.query(`SELECT t.auth_session_id,t.cleaned_at,t.ended_at,
    (a.is_active=TRUE AND a.expires_at>NOW()) AS active
    FROM story_session_lifetimes t JOIN user_sessions a ON a.id=t.auth_session_id WHERE t.story_session_id=$1`,[storySessionId]);
  if(row&&(String(row.auth_session_id)!==String(authSessionId)||!row.active||row.cleaned_at||row.ended_at))
    throw Object.assign(Error('This conversation has ended'),{status:410,code:'STORY_SESSION_ENDED',discardUploadSafe:true});
}

export async function registerPronunciationLifetime(database,{sessionId,authSessionId,userId,learnerId}) {
  await verifyPracticeRetentionTarget(database);
  const {rows}=await database.query(`INSERT INTO pronunciation_session_lifetimes(practice_session_id,auth_session_id,user_id,learner_id)
    SELECT s.id,a.id,a.user_id,s.learner_id FROM speaking_practice_sessions s
    JOIN learners l ON l.id=s.learner_id JOIN user_sessions a ON a.user_id=l.user_id
    WHERE s.id=$1 AND a.id=$2 AND a.user_id=$3 AND l.id=$4 AND a.is_active=TRUE AND a.expires_at>NOW()
    ON CONFLICT(practice_session_id) DO NOTHING RETURNING practice_session_id`,[sessionId,authSessionId,userId,learnerId]);
  if(!rows[0])throw Object.assign(Error('Login session is no longer active'),{status:403,code:'PRACTICE_LOGIN_EXPIRED'});
}
export async function retireExpiredPracticeLogins(database,endSession,{userId=null}={}) {
  const {rows:[schema]}=await database.query("SELECT to_regclass('public.pronunciation_session_lifetimes') AS name");
  if(!schema?.name)return;
  const {rows}=await database.query(`SELECT t.practice_session_id,t.learner_id FROM pronunciation_session_lifetimes t
    JOIN user_sessions a ON a.id=t.auth_session_id JOIN speaking_practice_sessions s ON s.id=t.practice_session_id
    WHERE s.status='active' AND (a.is_active=FALSE OR a.expires_at<=NOW())
      AND ($1::int IS NULL OR t.user_id=$1) ORDER BY t.practice_session_id LIMIT 100`,[userId]);
  for(const row of rows)await endSession(row.practice_session_id,row.learner_id);
}

export async function cleanupExpiredStorySessions(database,{userId=null,limit=20,removeArtifacts=removePracticeArtifacts}={}) {
  // User Service can invoke this before the additive migration has been installed.
  const {rows:[schema]}=await database.query("SELECT to_regclass('public.story_session_lifetimes') AS name");
  if(!schema?.name)return {cleaned:0};
  await verifyPracticeRetentionTarget(database);
  const {rows:candidates}=await database.query(`SELECT t.story_session_id FROM story_session_lifetimes t
    JOIN user_sessions a ON a.id=t.auth_session_id
    WHERE t.cleaned_at IS NULL AND ($1::int IS NULL OR t.user_id=$1)
      AND (t.ended_at IS NOT NULL OR a.is_active=FALSE OR a.expires_at<=NOW())
    ORDER BY t.story_session_id LIMIT $2`,[userId,limit]);
  let cleaned=0;
  for(const candidate of candidates) {
    const client=await database.connect();
    try {
      await client.query('BEGIN');
      // Same lock as Story turn persistence; never unlink while ASR is reading.
      const {rows:[lock]}=await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1),$2::int) AS locked',
        ['aesp-story-turn-session',candidate.story_session_id]);
      if(!lock.locked){await client.query('ROLLBACK');continue;}
      const {rows:[lease]}=await client.query(`SELECT t.story_session_id FROM story_session_lifetimes t
        JOIN user_sessions a ON a.id=t.auth_session_id WHERE t.story_session_id=$1 AND t.cleaned_at IS NULL
        AND (t.ended_at IS NOT NULL OR a.is_active=FALSE OR a.expires_at<=NOW()) FOR UPDATE OF t SKIP LOCKED`,[candidate.story_session_id]);
      if(!lease){await client.query('ROLLBACK');continue;}
      const {rows:audio}=await client.query('SELECT audio_url FROM story_conversations WHERE session_id=$1 AND audio_url IS NOT NULL',[lease.story_session_id]);
      const owned=[];
      for(const url of new Set(audio.map(row=>row.audio_url))) {
        const {rows:[references]}=await client.query(`SELECT EXISTS(
          SELECT 1 FROM story_conversations WHERE audio_url=$1 AND session_id<>$2
          UNION ALL SELECT 1 FROM speaking_practice_rounds WHERE audio_url=$1
          UNION ALL SELECT 1 FROM submissions WHERE audio_url=$1
          UNION ALL SELECT 1 FROM feedbacks WHERE audio_url=$1
          UNION ALL SELECT 1 FROM scenario_conversations WHERE audio_url=$1
          UNION ALL SELECT 1 FROM community_posts WHERE audio_url=$1
          UNION ALL SELECT 1 FROM post_comments WHERE audio_url=$1
        ) AS shared`,[url,lease.story_session_id]);
        if(!references.shared)owned.push(url);
      }
      const removed=await removeArtifacts(owned);
      if(removed.failed.length){await client.query('ROLLBACK');continue;}
      await client.query(`UPDATE story_session_lifetimes SET user_turns=(SELECT COUNT(*)::int FROM story_conversations
        WHERE session_id=$1 AND message_type='user' AND LENGTH(TRIM(COALESCE(text_content,'')))>0),
        activity_days=ARRAY(SELECT DISTINCT (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date FROM story_conversations
        WHERE session_id=$1 AND message_type='user' AND LENGTH(TRIM(COALESCE(text_content,'')))>0),cleaned_at=NOW() WHERE story_session_id=$1`,[lease.story_session_id]);
      await client.query('DELETE FROM story_conversations WHERE session_id=$1',[lease.story_session_id]);
      await client.query("UPDATE story_sessions SET status='ended',updated_at=NOW() WHERE id=$1",[lease.story_session_id]);
      await client.query('COMMIT');cleaned++;
    } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;}
    finally {client.release();}
  }
  return {cleaned};
}
export function startStoryRetentionCleanup(database,{intervalMs=15000,onError=()=>{}}={}) {
  let busy=false,stopped=false;
  const run=async()=>{if(busy||stopped)return;busy=true;try{await cleanupExpiredStorySessions(database);}catch(error){onError(error);}finally{busy=false;}};
  const timer=setInterval(run,intervalMs);timer.unref?.();
  return {run,stop(){stopped=true;clearInterval(timer);}};
}
