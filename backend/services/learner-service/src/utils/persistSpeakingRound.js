export async function persistSpeakingRound({
  pool,
  sessionId,
  roundNumber,
  prompt,
  audioUrl,
  timeTaken
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const {rows:[session]}=await client.query('SELECT status FROM speaking_practice_sessions WHERE id=$1 FOR UPDATE',[sessionId]);
    if(!session||session.status!=='active')throw Object.assign(new Error('Practice session has ended'),{status:409,code:'PRACTICE_SESSION_ENDED',discardUploadSafe:true});
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1), $2)",
      [String(sessionId), roundNumber]
    );
    const existing = await client.query(
      `SELECT *
       FROM speaking_practice_rounds
       WHERE session_id = $1 AND round_number = $2
       ORDER BY id
       LIMIT 1
       FOR UPDATE`,
      [sessionId, roundNumber]
    );

    if (existing.rows[0]) {
      await client.query("COMMIT");
      return { ...existing.rows[0], idempotent_replay: true };
    }

    const result = await client.query(
      `INSERT INTO speaking_practice_rounds
       (session_id, round_number, prompt, audio_url, transcript, time_taken, score, analysis)
       VALUES ($1, $2, $3, $4, NULL, $5, NULL, $6)
       RETURNING *`,
      [
        sessionId,
        roundNumber,
        prompt,
        audioUrl,
        timeTaken,
        JSON.stringify({ status: "processing" })
      ]
    );
    await client.query("COMMIT");
    return result.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
