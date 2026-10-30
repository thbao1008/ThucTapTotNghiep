import { removePracticeArtifacts,retireExpiredPracticeLogins } from '../../../shared/practiceRetention.js';
import { verifyWorldTarget } from '../services/scenarioWorldStore.js';

const problem = (status, code) => Object.assign(new Error(code), { status, code });
const ended = status => status === 'ended' || status === 'completed';

// A session row lock serializes end-of-practice against round uploads/claims.
// Never remove an audio file while an already claimed transcription is running.
export function createPracticeRetention({ database, removeArtifacts = removePracticeArtifacts,
  verifyTarget = verifyWorldTarget, logger = console } = {}) {
  const pendingCompleted = new Set();

  async function cleanup(sessionId, { learnerId = null, end = false } = {}) {
    const id = Number(sessionId);
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) throw problem(400, 'PRACTICE_SESSION_INVALID');
    const client = await database.connect();
    let open = false;
    try {
      await verifyTarget(client);
      await client.query('BEGIN'); open = true;
      await client.query("SET LOCAL lock_timeout='3s'");
      const { rows: [session] } = await client.query(
        `SELECT id,learner_id,mode,status FROM speaking_practice_sessions WHERE id=$1 FOR UPDATE`, [id]);
      if (!session || session.mode !== 'practice' || (learnerId !== null && String(session.learner_id) !== String(learnerId))) {
        throw problem(404, 'PRACTICE_SESSION_NOT_FOUND');
      }
      if (end && session.status === 'active') {
        await client.query("UPDATE speaking_practice_sessions SET status='ended',updated_at=NOW() WHERE id=$1", [id]);
        session.status = 'ended';
      }
      if (!ended(session.status)) {
        await client.query('COMMIT'); open = false;
        return { session_id: id, status: session.status, cleanup_pending: false, removed_files: 0 };
      }
      await client.query(`UPDATE speaking_practice_sessions SET summary=COALESCE(summary,'{}'::jsonb)
        || '{"media_cleanup_pending":true}'::jsonb WHERE id=$1`,[id]);
      // A queued but unclaimed job has no reader. Claimed work keeps its token
      // and finishes normally; its finally hook retries this cleanup.
      if (session.status === 'ended') await client.query(
        `UPDATE speaking_practice_rounds SET analysis=jsonb_build_object('status','failed','score',NULL,
           'feedback','Practice ended before this round was assessed.','errors',jsonb_build_array(jsonb_build_object('type','practice_ended'))),
           updated_at=NOW()
         WHERE session_id=$1 AND analysis->>'status'='processing' AND analysis->>'claim_token' IS NULL`, [id]);
      const { rows } = await client.query(
        `SELECT id,audio_url,analysis FROM speaking_practice_rounds WHERE session_id=$1 ORDER BY id FOR UPDATE`, [id]);
      const processing=[];
      for(const row of rows) {
        const analysis=typeof row.analysis==='string'?JSON.parse(row.analysis):row.analysis;
        if(!['processing','queued'].includes(analysis?.status))continue;
        const {rows:[lease]}=await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1),$2::int) AS locked',
          ['aesp-practice-media-worker',row.id]);
        if(session.status==='ended'&&lease.locked) {
          // No live worker owns this row (including after a service restart).
          await client.query(`UPDATE speaking_practice_rounds SET analysis=jsonb_build_object('status','failed',
            'score',NULL,'feedback','Practice ended before assessment completed.'),updated_at=NOW() WHERE id=$1`,[row.id]);
        } else processing.push(row);
      }
      if (processing.length) {
        pendingCompleted.add(id);
        await client.query('COMMIT'); open = false;
        return { session_id: id, status: session.status, cleanup_pending: true, pending_rounds: processing.length, removed_files: 0 };
      }
      const failed = new Set(); let removedFiles = 0;
      for (const url of new Set(rows.map(row => row.audio_url).filter(Boolean))) {
        // A malformed legacy reference must never delete another feature's file.
        const { rows: [references] } = await client.query(`SELECT EXISTS(
          SELECT 1 FROM speaking_practice_rounds WHERE audio_url=$1 AND session_id<>$2
          UNION ALL SELECT 1 FROM submissions WHERE audio_url=$1
          UNION ALL SELECT 1 FROM feedbacks WHERE audio_url=$1
          UNION ALL SELECT 1 FROM story_conversations WHERE audio_url=$1
          UNION ALL SELECT 1 FROM scenario_conversations WHERE audio_url=$1
          UNION ALL SELECT 1 FROM community_posts WHERE audio_url=$1
          UNION ALL SELECT 1 FROM post_comments WHERE audio_url=$1
        ) AS shared`, [url, id]);
        if (references.shared) continue; // Detach this session only; keep the shared file.
        const result = await removeArtifacts([url]);
        removedFiles += result.removed;
        if (result.failed.length) failed.add(url);
      }
      const clearIds = rows.filter(row => !failed.has(row.audio_url)).map(row => row.id);
      if (clearIds.length) await client.query(
        `UPDATE speaking_practice_rounds SET audio_url=NULL,transcript=NULL,response=NULL,updated_at=NOW()
         WHERE id=ANY($1::int[])`, [clearIds]);
      if(!failed.size)await client.query("UPDATE speaking_practice_sessions SET summary=COALESCE(summary,'{}'::jsonb)-'media_cleanup_pending' WHERE id=$1",[id]);
      await client.query('COMMIT'); open = false;
      if (failed.size) pendingCompleted.add(id); else pendingCompleted.delete(id);
      return { session_id: id, status: session.status, cleanup_pending: failed.size > 0,
        removed_files: removedFiles, failed_files: failed.size };
    } catch (error) {
      if (open) await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async function scan() {
    await retireExpiredPracticeLogins(database,(id,learnerId)=>cleanup(id,{learnerId,end:true}));
    // 'ended' is written only by the explicit end endpoint. Do not sweep old
    // completed/history sessions merely because they contain an audio URL.
    const { rows } = await database.query(`SELECT id FROM speaking_practice_sessions
      WHERE (status='ended' OR (status='completed' AND summary->>'media_cleanup_pending'='true'))
        AND mode='practice' AND EXISTS(SELECT 1 FROM speaking_practice_rounds r
        WHERE r.session_id=speaking_practice_sessions.id AND (r.audio_url IS NOT NULL OR r.transcript IS NOT NULL OR r.response IS NOT NULL))
      ORDER BY id LIMIT 100`);
    const ids = new Set([...rows.map(row => row.id), ...pendingCompleted]);
    for (const id of ids) {
      try { await cleanup(id); }
      catch (error) { logger.warn('Practice media cleanup will retry', error.code || error.name); }
    }
  }

  function start({ pollMs = 30_000 } = {}) {
    let busy = false;
    const run = async () => { if (busy) return; busy = true;
      try { await scan(); } catch (error) { logger.warn('Practice cleanup scan failed', error.code || error.name); }
      finally { busy = false; } };
    const timer = setInterval(run, Math.max(1000, pollMs)); timer.unref?.();
    return { stop: () => clearInterval(timer), scan: run };
  }
  return { cleanup, end: (sessionId, learnerId) => cleanup(sessionId, { learnerId, end: true }), start };
}

export function withoutPracticeMedia(round) {
  return { ...round, audio_url: null, transcript: null, response: null };
}

export async function acquirePracticeWorkerLease(database,roundId) {
  const client=await database.connect();
  try {
    const {rows:[lease]}=await client.query('SELECT pg_try_advisory_lock(hashtext($1),$2::int) AS locked',
      ['aesp-practice-media-worker',roundId]);
    if(!lease.locked){client.release();return null;}
    return async()=>{
      try{await client.query('SELECT pg_advisory_unlock(hashtext($1),$2::int)',['aesp-practice-media-worker',roundId]);}
      finally{client.release();}
    };
  } catch(error){client.release();throw error;}
}

export async function claimSpeakingRound({ database, roundId, timeoutSeconds = 600,
  verifyTarget = verifyWorldTarget } = {}) {
  const client = await database.connect(); let open = false;
  try {
    await verifyTarget(client);
    await client.query('BEGIN'); open = true;
    await client.query("SET LOCAL lock_timeout='3s'");
    const { rows: [session] } = await client.query(`SELECT s.id,s.status
      FROM speaking_practice_sessions s JOIN speaking_practice_rounds r ON r.session_id=s.id
      WHERE r.id=$1 FOR UPDATE OF s`, [roundId]);
    if (!session) throw problem(404, 'PRACTICE_ROUND_NOT_FOUND');
    let result = { rows: [], rowCount: 0 };
    if (session.status === 'active') result = await client.query(`UPDATE speaking_practice_rounds
      SET score=NULL,analysis=jsonb_build_object('status','processing','claim_token',gen_random_uuid()::text),updated_at=NOW()
      WHERE id=$1 AND NOT COALESCE((analysis->>'status'='completed' AND score IS NOT NULL AND score>=0 AND score<=100),false)
        AND (analysis->>'status' IS NULL OR analysis->>'status'='failed'
          OR (analysis->>'status'='processing' AND (analysis->>'claim_token' IS NULL
            OR updated_at<NOW()-INTERVAL '1 second'*$2)))
      RETURNING id,analysis,score`, [roundId, timeoutSeconds]);
    await client.query('COMMIT'); open = false;
    return { ...result, sessionId: session.id };
  } catch (error) {
    if (open) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}
