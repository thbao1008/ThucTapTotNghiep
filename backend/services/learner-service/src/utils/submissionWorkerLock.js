// Session advisory locks disappear when the worker's PostgreSQL connection dies.
// All worker reads/writes use that SAME connection: a disconnected old worker
// cannot later persist through a fresh pool connection after recovery takes over.
export const SUBMISSION_LOCK_NAMESPACE = 95601;

export function createSubmissionWorkerLock({ pool, service }) {
  return async (submissionId, run) => {
    const id = Number(submissionId);
    if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
      throw new TypeError("Invalid Submission job ID");
    }
    const client = await pool.connect();
    let connectionError;
    let locked = false;
    const onError = error => { connectionError = error; };
    const onEnd = () => { connectionError ??= new Error("Submission worker connection ended"); };
    client.on("error", onError);
    client.on("end", onEnd);
    const query = (...args) => {
      if (connectionError) return Promise.reject(connectionError);
      return client.query(...args);
    };
    // Persistence helpers expect a pool. Never acquire a second connection:
    // doing so would both lose fencing and deadlock a saturated worker pool.
    const db = { query, async connect() { return { query, release() {} }; } };
    try {
      let result;
      try {
        result = await query("SELECT pg_try_advisory_lock($1::integer, $2::integer) AS locked",
          [SUBMISSION_LOCK_NAMESPACE, id]);
      } catch (error) {
        // The server may have acquired a lock before its response was lost.
        connectionError = error;
        throw error;
      }
      locked = result.rows[0].locked;
      if (!locked) return;
      const scoped = {};
      for (const name of ["getSubmissionById", "getChallengeById", "updateSubmissionTranscript",
        "updateSubmissionSegments", "updateSubmissionAnalysis", "updateSubmissionStatus"]) {
        scoped[name] = (...args) => service[name](...args, db);
      }
      scoped.claimSubmissionForAnalysis = submission => service.claimSubmissionForAnalysis(submission, db, true);
      return await run(scoped);
    } finally {
      if (locked && !connectionError) {
        try {
          const result = await query("SELECT pg_advisory_unlock($1::integer, $2::integer) AS unlocked",
            [SUBMISSION_LOCK_NAMESPACE, id]);
          if (!result.rows[0].unlocked) connectionError = new Error("Submission lock was lost");
        } catch (error) { connectionError = error; }
      }
      client.removeListener("error", onError);
      client.removeListener("end", onEnd);
      client.release(connectionError);
    }
  };
}
