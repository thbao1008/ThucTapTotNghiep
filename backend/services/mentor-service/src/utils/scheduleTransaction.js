// One connection owns the transaction, slot lock, overlap read and mutation.
export async function withScheduleTransaction(pool, work) {
  const client = await pool.connect();
  let begun = false, broken = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED'); begun = true;
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '5s'");
    const result = await work(client);
    try { await client.query('COMMIT'); }
    catch (error) { broken = true; throw error; }
    begun = false;
    return result;
  } catch (error) {
    if (begun) {
      try { await client.query('ROLLBACK'); }
      catch { broken = true; }
    }
    throw error;
  } finally { client.release(broken); }
}

export async function lockSchedulePair(client, mentorId, learnerId) {
  // Dedicated advisory namespace; different learners can share a group session.
  // Hash collisions only serialize extra pairs, never weaken exclusion.
  await client.query('SELECT pg_advisory_xact_lock(1380143940, hashtext($1::text))', [`${mentorId}:${learnerId}`]);
}
