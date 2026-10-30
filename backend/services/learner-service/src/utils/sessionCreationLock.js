// Serialize session creation per mode and authenticated learner, across service instances.
export async function withSessionCreationLock(pool, mode, learnerId, work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), $2::int)", [
      `aesp-${mode}-session`, learnerId
    ]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
