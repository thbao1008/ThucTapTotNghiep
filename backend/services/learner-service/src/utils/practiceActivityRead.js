// Read-only projection: completed Scenario Studio sessions are activities, not
// scored speaking assessments. Do not copy them into legacy practice_history.
const activitySource = `
  SELECT id::text AS id,id AS legacy_order,practice_type,practice_date,duration_minutes,
    CASE WHEN practice_type='speaking_practice' THEN 'Luyện phát âm'
         ELSE 'Luyện nói theo tình huống' END AS activity_type
  FROM public.practice_history
  WHERE learner_id=$1 AND practice_type IN ('speaking_practice','scenario')
    AND practice_date >= $2 AND practice_date < $3 AND practice_date <= $4
  UNION ALL
  SELECT 'world:'||id::text AS id,NULL::integer AS legacy_order,'scenario_world' AS practice_type,updated_at AS practice_date,
    NULL::numeric AS duration_minutes,
    CASE WHEN scene->'mission'->>'id' IS NOT NULL THEN 'Scenario có hướng dẫn'
         ELSE 'Scenario Studio' END AS activity_type
  FROM public.scenario_world_sessions
  WHERE learner_id=$1 AND status='completed' AND revision>0
    AND updated_at >= $2 AND updated_at < $3 AND updated_at <= $4
`;

export function createPracticeActivityReader(database) {
  return {
    dailyCounts(learnerId,from,until,now) {
      return database.query(`WITH activities AS (${activitySource})
        SELECT to_char(practice_date AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD') AS practice_day,
          count(*)::integer AS total_sessions
        FROM activities GROUP BY practice_day`,[learnerId,from,until,now]);
    },
    async history(learnerId,from,until,now) {
      const result=await database.query(`WITH activities AS (${activitySource})
        SELECT id,practice_type,practice_date,duration_minutes,activity_type
        FROM activities ORDER BY practice_date DESC,legacy_order DESC NULLS LAST,id DESC`,[learnerId,from,until,now]);
      return {...result,rows:result.rows.map(row=>({...row,id:row.practice_type==='scenario_world'?row.id:Number(row.id)}))};
    }
  };
}
