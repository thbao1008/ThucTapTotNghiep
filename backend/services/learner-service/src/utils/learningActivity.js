// Activity is evidence of participation, never an inferred skill score.
export async function getAdditionalLearningActivity(database, learnerId) {
  const {rows:[row]}=await database.query(`
    SELECT
      (SELECT COUNT(*)::int FROM story_sessions WHERE learner_id=$1 AND created_at<=NOW()) AS story_total,
      (SELECT COUNT(DISTINCT s.id)::int FROM story_sessions s JOIN story_conversations c ON c.session_id=s.id
        WHERE s.learner_id=$1 AND c.message_type='user' AND LENGTH(TRIM(COALESCE(c.text_content,'')))>0 AND c.created_at<=NOW())
        +(SELECT COUNT(*)::int FROM story_session_lifetimes WHERE learner_id=$1 AND cleaned_at IS NOT NULL AND user_turns>0) AS story_practiced,
      (SELECT COUNT(*)::int FROM story_sessions s JOIN story_conversations c ON c.session_id=s.id
        WHERE s.learner_id=$1 AND c.message_type='user' AND LENGTH(TRIM(COALESCE(c.text_content,'')))>0 AND c.created_at<=NOW())
        +(SELECT COALESCE(SUM(user_turns),0)::int FROM story_session_lifetimes WHERE learner_id=$1 AND cleaned_at IS NOT NULL) AS story_turns,
      (SELECT COUNT(*)::int FROM public.scenario_world_sessions WHERE learner_id=$1 AND created_at<=NOW()) AS world_total,
      (SELECT COUNT(*)::int FROM public.scenario_world_sessions WHERE learner_id=$1 AND status='completed' AND revision>0 AND updated_at<=NOW()) AS world_completed
  `,[learnerId]);
  return {
    story:{total_sessions:row.story_total,practiced_sessions:row.story_practiced,user_turns:row.story_turns},
    scenario_world:{total_sessions:row.world_total,completed_sessions:row.world_completed}
  };
}
