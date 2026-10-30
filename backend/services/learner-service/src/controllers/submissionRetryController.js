import { SUBMISSION_LOCK_NAMESPACE } from "../utils/submissionWorkerLock.js";

async function claimRetry(pool, id, learnerId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Briefly serialize concurrent retries, but never wait for a long AI job.
    await client.query("SET LOCAL lock_timeout = '1000ms'");
    await client.query("SELECT pg_advisory_xact_lock($1::integer, $2::integer)",
      [SUBMISSION_LOCK_NAMESPACE, id]);
    const result = await client.query(`UPDATE submissions SET status='pending', updated_at=NOW()
      WHERE id=$1 AND learner_id=$2 AND status='failed' RETURNING id`, [id, learnerId]);
    // Release before enqueue: EventEmitter can deliver the new job immediately.
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export function createSubmissionRetryHandler({ pool, enqueueJob }) {
  return async (req, res) => {
    const id = Number(req.params.id);
    try {
      const claimed = await claimRetry(pool, id, req.learnerId);
      if (!claimed.rows[0]) {
        const current = await pool.query("SELECT status FROM submissions WHERE id=$1 AND learner_id=$2", [id, req.learnerId]);
        if (!current.rows[0]) return res.status(404).json({ message: "Submission not found" });
        return res.status(200).json({ submissionId: id, status: current.rows[0].status, requeued: false });
      }
      try {
        await enqueueJob("analyzeSubmission", { submissionId: id });
      } catch {
        // Never overwrite a worker that has already started/completed.
        await pool.query("UPDATE submissions SET status='failed', updated_at=NOW() WHERE id=$1 AND learner_id=$2 AND status='pending'", [id, req.learnerId]);
        return res.status(503).json({ message: "Bài nộp vẫn được giữ. Chưa đưa được vào xử lý; hãy thử lại sau.", submissionId: id });
      }
      return res.status(202).json({ submissionId: id, status: "pending", requeued: true });
    } catch {
      return res.status(503).json({ message: "Không thể xác minh trạng thái xử lý. Hãy tải lại bài nộp trước khi thử lại." });
    }
  };
}
