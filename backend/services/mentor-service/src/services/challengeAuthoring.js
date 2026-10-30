const fail = (status, code, message) => Object.assign(new Error(message), {status, code});
import {CEFR_LEVELS,normalizeChallengeLevel} from '../../../shared/challengeLevels.js';
import {challengePlainText,inspectChallengeSimilarity,requireSimilarityReview} from './challengeSimilarity.js';
const levels = new Set(CEFR_LEVELS);
const escapeHtml = text => text.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function validateChallengeDraft(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['title','content','level','review_key'].includes(key))) {
    throw fail(400, 'CHALLENGE_INPUT', 'Use only title, content and level.');
  }
  const result = {};
  if(Object.hasOwn(body,'review_key')) {
    if(typeof body.review_key!=='string'||!/^[a-f0-9]{64}$/.test(body.review_key))throw fail(400,'CHALLENGE_INPUT','Invalid review. Check for similar challenges again.');
    result.review_key=body.review_key;
  }
  for (const [key, max] of [['title',180],['content',16000]]) {
    if (partial && !Object.hasOwn(body,key)) continue;
    if (typeof body[key] !== 'string' || !body[key].trim() || body[key].trim().length > max) {
      throw fail(400, 'CHALLENGE_INPUT', key === 'title' ? 'Enter a title of up to 180 characters.' : 'Enter instructions of up to 16000 characters.');
    }
    result[key] = body[key].trim();
  }
  if (!partial || Object.hasOwn(body,'level')) {
    if (!levels.has(body.level)) throw fail(400,'CHALLENGE_INPUT','Choose a supported difficulty.');
    result.level = body.level;
  }
  if (!Object.keys(result).some(key=>key!=='review_key')) throw fail(400,'CHALLENGE_INPUT','No changes supplied.');
  return result;
}

export const challengeTextHtml = content => content.split(/\n\s*\n/).map(text => `<p>${escapeHtml(text).replace(/\r?\n/g,'<br>')}</p>`).join('');

export function createChallengeAuthoring({pool}) {
  async function transaction(work) {
    const client = await pool.connect(); let open = false, broken = false;
    try {
      const {rows:[target]} = await client.query('SELECT current_database() AS db,current_schema() AS schema,inet_server_addr()::text AS address,inet_server_port() AS port');
      if (target.db !== 'aesp' || target.schema !== 'public' || target.port !== 5432 ||
          !['127.0.0.1','127.0.0.1/32','::1','::1/128'].includes(target.address)) {
        throw fail(503,'CHALLENGE_DATABASE_TARGET','Local learning database is unavailable.');
      }
      await client.query('BEGIN'); open = true;
      await client.query("SET LOCAL lock_timeout='3s'");
      await client.query("SET LOCAL statement_timeout='5s'");
      const value = await work(client);
      try { await client.query('COMMIT'); }
      catch(error) { broken = true; throw error; }
      open = false; return value;
    } catch (error) {
      if (open) await client.query('ROLLBACK').catch(()=>{broken=true;});
      throw error;
    } finally { client.release(broken); }
  }
  return {
    async check(mentorId,body) {
      const {exclude_id,...input}=body||{};
      const draft=validateChallengeDraft(input);
      if(exclude_id!==undefined&&(!Number.isInteger(exclude_id)||exclude_id<=0||exclude_id>2147483647))throw fail(400,'CHALLENGE_INPUT','Invalid challenge id.');
      return transaction(async client=>{
        if(exclude_id){const {rows:[own]}=await client.query('SELECT id FROM public.challenges WHERE id=$1 AND mentor_id=$2',[exclude_id,mentorId]);if(!own)throw fail(404,'CHALLENGE_NOT_FOUND','Challenge not found.');}
        return inspectChallengeSimilarity(client,draft,exclude_id??null);
      });
    },
    async create(mentorId,userId,body) {
      const draft = validateChallengeDraft(body);
      return transaction(async client => {
        // Serialize publication checks across all Mentors, including simultaneous new tasks.
        await client.query('SELECT pg_advisory_xact_lock(1380143960,1)');
        await requireSimilarityReview(client,draft);
        const {rows:[challenge]} = await client.query(`INSERT INTO public.challenges(mentor_id,created_by,title,description,type,level)
          SELECT id,user_id,$3,$4,'speaking',$5 FROM public.mentors WHERE id=$1 AND user_id=$2 RETURNING *`,
          [mentorId,userId,draft.title,challengeTextHtml(draft.content),draft.level]);
        if (!challenge) throw fail(403,'CHALLENGE_OWNER','Mentor access required.');
        return {...challenge,has_activity:false};
      });
    },
    async update(mentorId,id,body) {
      const draft = validateChallengeDraft(body,true);
      return transaction(async client => {
        await client.query('SELECT pg_advisory_xact_lock(1380143960,1)');
        // FOR UPDATE also excludes concurrent FK references while the activity check and edit run.
        const {rows:[row]} = await client.query('SELECT * FROM public.challenges WHERE id=$1 AND mentor_id=$2 FOR UPDATE',[id,mentorId]);
        if (!row) throw fail(404,'CHALLENGE_NOT_FOUND','Challenge not found.');
        const {rows:[activity]} = await client.query(`SELECT EXISTS(SELECT 1 FROM public.learner_challenges WHERE challenge_id=$1)
          OR EXISTS(SELECT 1 FROM public.submissions WHERE challenge_id=$1) AS used`,[id]);
        if (activity.used) throw fail(409,'CHALLENGE_IN_USE','Learners have saved or started this challenge. Create a copy to make changes.');
        await requireSimilarityReview(client,{title:draft.title??row.title,content:draft.content??challengePlainText(row.description),
          level:draft.level??normalizeChallengeLevel(row.level),review_key:draft.review_key},id);
        const {rows:[challenge]} = await client.query(`UPDATE public.challenges SET title=$3,description=$4,level=$5,updated_at=NOW()
          WHERE id=$1 AND mentor_id=$2 RETURNING *`,[id,mentorId,draft.title??row.title,
          draft.content === undefined ? row.description : challengeTextHtml(draft.content),draft.level??row.level]);
        return {...challenge,has_activity:false};
      });
    }
  };
}
