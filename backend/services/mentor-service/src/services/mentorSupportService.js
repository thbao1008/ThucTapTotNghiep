import pool from '../config/db.js';
import {CURRENT_PURCHASE_JOIN} from '../../../shared/purchaseLedger.js';

// One read snapshot scopes all evidence to the current assignment. Counts and
// timestamps are support cues; this endpoint never infers a skill score.
export async function getMentorSupport(mentorId,userId,database=pool) {
 const {rows}=await database.query(`SELECT l.id AS learner_id,u.id AS user_id,u.name,
   activity.last_activity_at,lp.purchase_id,lp.status AS package_status,lp.expiry_date,lp.days_left,lp.is_active,
   failure.count AS failed_count,failure.at AS failed_at,
   (lp.is_active AND GREATEST(activity.last_activity_at,l.created_at,u.created_at,lp.created_at)<NOW()-INTERVAL '7 days') AS inactive,
   (lp.is_active AND lp.expiry_date<=NOW()+INTERVAL '7 days') AS expiring
 FROM learners l JOIN users u ON u.id=l.user_id
 ${CURRENT_PURCHASE_JOIN}
 LEFT JOIN LATERAL (
   SELECT MAX(occurred_at) AS last_activity_at FROM (
     SELECT completed_at AS occurred_at FROM speaking_practice_sessions WHERE learner_id=l.id AND status='completed'
     UNION ALL SELECT COALESCE(submitted_at,created_at) FROM submissions WHERE learner_id=l.id
     UNION ALL SELECT c.created_at FROM story_sessions s JOIN story_conversations c ON c.session_id=s.id
       WHERE s.learner_id=l.id AND c.message_type='user' AND LENGTH(TRIM(COALESCE(c.text_content,'')))>0
     UNION ALL SELECT updated_at FROM public.scenario_world_sessions WHERE learner_id=l.id AND status='completed' AND revision>0
     UNION ALL SELECT practice_date FROM practice_history WHERE learner_id=l.id
   ) events WHERE occurred_at<=NOW()
 ) activity ON TRUE
 LEFT JOIN LATERAL (
   SELECT COUNT(*)::integer AS count,MAX(observed_at) AS at FROM (
     SELECT DISTINCT ON (challenge_id) challenge_id,status,COALESCE(updated_at,submitted_at,created_at) AS observed_at
     FROM submissions WHERE learner_id=l.id AND COALESCE(submitted_at,created_at)<=NOW()
     ORDER BY challenge_id,COALESCE(submitted_at,created_at) DESC,id DESC
   ) latest WHERE status='failed' AND observed_at>=NOW()-INTERVAL '7 days' AND observed_at<=NOW()
 ) failure ON TRUE
 WHERE l.mentor_id=$1 AND u.status='active' AND EXISTS (
   SELECT 1 FROM mentors m JOIN users mu ON mu.id=m.user_id WHERE m.id=$1 AND mu.id=$2 AND mu.status='active'
 ) ORDER BY l.id`,[mentorId,userId]);
 const learners=rows.map(row=>{
  const signals=[];
  if(row.failed_count>0)signals.push({kind:'analysis_failed',count:row.failed_count,at:row.failed_at});
  if(row.purchase_id && row.package_status==='expired')signals.push({kind:'expired_package'});
  if(row.expiring)signals.push({kind:'expiring_package'});
  if(row.inactive)signals.push({kind:'inactive_7_days'});
  return {learner_id:row.learner_id,user_id:row.user_id,name:row.name,last_activity_at:row.last_activity_at,
   package:{purchase_id:row.purchase_id,status:row.package_status||'no-package',expiry_date:row.expiry_date,days_left:row.days_left,is_active:row.is_active===true},signals};
 }).filter(row=>row.signals.length);
 return {source:'recorded_activity_rules',generated_at:new Date().toISOString(),learners};
}
