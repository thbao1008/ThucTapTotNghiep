// Count completed learning independently of optional human feedback. EXISTS
// keeps multiple attempts/reviews from multiplying the challenge count.
export const challengeActivityQuery = `
  SELECT COUNT(*) AS count,
    COUNT(*) FILTER (WHERE lc.status = 'completed' OR EXISTS (
      SELECT 1 FROM submissions s JOIN ai_reports ar ON ar.submission_id = s.id
      WHERE s.learner_id = lc.learner_id AND s.challenge_id = lc.challenge_id
        AND s.status IN ('completed', 'reviewed')
        AND ar.overall_score BETWEEN 0 AND 100
        AND ar.raw_ai_response->'assessment_contract'->>'status' = 'completed'
        AND ar.raw_ai_response->'assessment_contract'->>'type' = 'transcript_language_analysis'
        AND ar.raw_ai_response->'assessment_contract'->>'scale' = '0-100'
        AND ar.raw_ai_response->'assessment_contract'->>'source' IN ('openrouter', 'groq')
        AND ar.raw_ai_response->'assessment_contract'->'metrics'->'language_quality' = to_jsonb(ar.overall_score)
    )) AS completed_count,
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM feedbacks f WHERE f.id = lc.feedback_id
    )) AS feedback_count
  FROM learner_challenges lc WHERE lc.learner_id = $1
`;

export async function getChallengeActivity(db, learnerId) {
  const { rows } = await db.query(challengeActivityQuery, [learnerId]);
  return {
    total_challenges: Number(rows[0]?.count ?? 0),
    completed_challenges: Number(rows[0]?.completed_count ?? 0),
    graded_challenges: Number(rows[0]?.feedback_count ?? 0)
  };
}
