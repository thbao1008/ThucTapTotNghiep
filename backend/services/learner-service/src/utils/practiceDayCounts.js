// Activity counts are independent of whether a practice has a scored assessment.
export async function countPracticeDays(database, learnerIds, from, until) {
  if (!learnerIds.length) return new Map();
  const result = await database.query(`
    SELECT learner_id,
           COUNT(DISTINCT (practice_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::integer AS practiced_days
    FROM (
      SELECT learner_id,practice_date FROM practice_history
      WHERE learner_id = ANY($1::integer[]) AND practice_type IN ('speaking_practice', 'scenario')
        AND practice_date >= $2 AND practice_date <= $3
      UNION ALL
      SELECT learner_id,updated_at AS practice_date FROM public.scenario_world_sessions
      WHERE learner_id = ANY($1::integer[]) AND status='completed' AND revision>0
        AND updated_at >= $2 AND updated_at <= $3
    ) activities
    GROUP BY learner_id
  `, [learnerIds, from, until]);
  return new Map(result.rows.map(row => [Number(row.learner_id), Number(row.practiced_days)]));
}
