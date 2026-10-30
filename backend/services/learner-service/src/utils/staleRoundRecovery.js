// Stale Speaking Round Recovery Scanner
// Finds processing rounds stuck beyond timeout and re-enqueues them for recovery
import pool from "../config/db.js";
import { enqueue } from "./queue.js";

/**
 * Processing timeout policy (must match queueHandlers.js)
 * Rounds in 'processing' status longer than this are considered stale
 */
export const PROCESSING_TIMEOUT_SECONDS = 10 * 60; // 10 minutes

/**
 * Default scan interval: Run every 5 minutes
 * Less frequent than timeout to avoid hammering the database
 */
export const DEFAULT_SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Maximum rounds to recover in a single scan
 * Prevents overwhelming the queue with a large batch
 */
export const MAX_RECOVERY_BATCH_SIZE = 100;

/**
 * Scan for stale speaking rounds and enqueue them for recovery
 *
 * A round is considered stale if:
 * - analysis.status = 'processing'
 * - updated_at is older than PROCESSING_TIMEOUT_SECONDS
 * - NOT completed (score IS NULL or out of valid range)
 *
 * @param {Object} options - Configuration options
 * @param {number} options.timeoutSeconds - Override default timeout
 * @param {number} options.maxBatch - Override max batch size
 * @returns {Promise<Object>} Scan results with counts
 */
export async function recoverStaleSpeakingRounds(options = {}) {
  const timeoutSeconds = options.timeoutSeconds ?? PROCESSING_TIMEOUT_SECONDS;
  const maxBatch = options.maxBatch ?? MAX_RECOVERY_BATCH_SIZE;

  const result = {
    scannedAt: new Date().toISOString(),
    found: 0,
    enqueued: 0,
    skipped: 0,
    failed: 0,
    errors: []
  };

  try {
    // Find stale rounds
    // Query matches the claimable conditions in queueHandlers.js but specifically targets stale processing
    const staleRounds = await pool.query(
      `SELECT
         id, session_id, round_number, prompt, audio_url,
         analysis, score, updated_at,
         EXTRACT(EPOCH FROM (NOW() - updated_at)) AS seconds_stale
       FROM speaking_practice_rounds
       WHERE analysis->>'status' = 'processing'
         AND updated_at < NOW() - INTERVAL '1 second' * $1
         AND NOT COALESCE((
           analysis->>'status' = 'completed'
           AND score IS NOT NULL
           AND score >= 0
           AND score <= 100
         ), false)
       ORDER BY updated_at ASC
       LIMIT $2`,
      [timeoutSeconds, maxBatch]
    );

    result.found = staleRounds.rowCount;

    if (result.found === 0) {
      return result;
    }

    // Enqueue each stale round for recovery
    for (const round of staleRounds.rows) {
      try {
        // Enqueue with same payload structure as original job
        // Worker will perform atomic claim with new claim_token
        await enqueue("processSpeakingRound", {
          roundId: round.id,
          sessionId: round.session_id,
          audioUrl: round.audio_url,
          prompt: round.prompt,
          // Recovery context (not used by worker but helpful for debugging)
          recoveryAttempt: true,
          staleSeconds: Math.floor(round.seconds_stale)
        });

        result.enqueued++;
      } catch (enqueueError) {
        result.failed++;
        result.errors.push({
          roundId: round.id,
          error: enqueueError.message,
          code: enqueueError.code
        });
      }
    }

    result.skipped = result.found - result.enqueued - result.failed;

    return result;
  } catch (scanError) {
    result.errors.push({
      phase: "scan",
      error: scanError.message,
      code: scanError.code
    });
    throw scanError;
  }
}

/**
 * Recovery scheduler state
 */
let schedulerInterval = null;
let scanInProgress = false;

/**
 * Start periodic recovery scanner
 *
 * @param {Object} options - Scheduler configuration
 * @param {number} options.intervalMs - Scan interval in milliseconds
 * @param {Function} options.onScanComplete - Callback after each scan
 * @param {Function} options.onError - Error handler callback
 * @returns {Object} Scheduler control object with stop method
 */
export function startRecoveryScheduler(options = {}) {
  if (schedulerInterval) {
    throw new Error("Recovery scheduler is already running");
  }

  const intervalMs = options.intervalMs ?? DEFAULT_SCAN_INTERVAL_MS;
  const onScanComplete = options.onScanComplete ?? (() => {});
  const onError = options.onError ?? ((err) => {
    console.error("Recovery scheduler error:", err);
  });

  async function runScan() {
    if (scanInProgress) {
      console.log("⏭️  Previous recovery scan still in progress, skipping");
      return;
    }

    scanInProgress = true;
    try {
      const result = await recoverStaleSpeakingRounds();

      if (result.found > 0 || result.errors.length > 0) {
        console.log("🔄 Recovery scan complete:", {
          found: result.found,
          enqueued: result.enqueued,
          failed: result.failed,
          errors: result.errors.length
        });
      }

      onScanComplete(result);
    } catch (err) {
      onError(err);
    } finally {
      scanInProgress = false;
    }
  }

  // Run initial scan immediately
  runScan().catch(onError);

  // Schedule periodic scans
  schedulerInterval = setInterval(() => {
    runScan().catch(onError);
  }, intervalMs);

  return {
    stop: () => {
      if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log("🛑 Recovery scheduler stopped");
      }
    },
    isRunning: () => schedulerInterval !== null,
    isScanInProgress: () => scanInProgress
  };
}

/**
 * Stop the recovery scheduler
 * Safe to call multiple times
 */
export function stopRecoveryScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  scanInProgress = false;
}
