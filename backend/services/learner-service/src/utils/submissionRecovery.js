import { SUBMISSION_LOCK_NAMESPACE } from "./submissionWorkerLock.js";

// Discovery probes transaction locks, released when this single SELECT finishes.
// Only the session-locked worker may reclaim a stale processing row.
// Failed submissions require explicit learner retry; completed/reviewed rows stay intact.
export async function scanAbandonedSubmissions({ pool, enqueueJob }) {
  const result = await pool.query(`SELECT id FROM submissions
    WHERE status IN ('pending', 'pending_transcription', 'processing')
      AND updated_at < NOW() - INTERVAL '15 minutes'
      AND pg_try_advisory_xact_lock(${SUBMISSION_LOCK_NAMESPACE}, id)
    ORDER BY updated_at, id LIMIT 100`);
  let enqueued = 0;
  let failed = 0;
  for (const { id } of result.rows) {
    try {
      await enqueueJob("analyzeSubmission", { submissionId: id });
      enqueued++;
    } catch { failed++; }
  }
  return { found: result.rows.length, enqueued, failed };
}

export function startSubmissionRecovery({ pool, enqueueJob, logger = console, intervalMs = 60_000 }) {
  if (!Number.isInteger(intervalMs) || intervalMs < 1000) throw new TypeError("Invalid recovery interval");
  let running = false;
  let stopped = false;
  const scan = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const result = await scanAbandonedSubmissions({ pool, enqueueJob });
      if (result.failed) logger.warn("Submission recovery enqueue failures", result.failed);
    } catch (error) {
      logger.error("Submission recovery scan failed", error.code || "UNKNOWN_ERROR");
    } finally { running = false; }
  };
  const timer = setInterval(scan, intervalMs);
  timer.unref?.();
  void scan();
  return { stop() { stopped = true; clearInterval(timer); }, scan };
}
