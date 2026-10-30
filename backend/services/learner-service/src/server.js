import "../../shared/loadBackendEnv.js";
import pool from "./config/db.js";
import { createAuthGuard } from "./middleware/authGuard.js";
import { packageGuard } from "./middleware/packageGuard.js";
import learnerRoutes from "./routes/learnerRoutes.js";
import "./queueHandlers.js"; // Register queue processors
import { createLearnerApp } from "./app.js";
import { startRecoveryScheduler, stopRecoveryScheduler } from "./utils/staleRoundRecovery.js";
import { startSubmissionRecovery } from "./utils/submissionRecovery.js";
import { enqueue, closeAll } from "./utils/queue.js";
import { warmStoryWhisper, closeStoryWhisper } from './utils/storyWhisperWorker.js';
import {ensureStoryRetentionSchema,startStoryRetentionCleanup} from '../../shared/practiceRetention.js';
import {practiceRetention} from './utils/practiceRetentionRuntime.js';

await ensureStoryRetentionSchema(pool);
const storyRetention=startStoryRetentionCleanup(pool,{onError:error=>console.warn('Story cleanup will retry',error.code||error.name)});
const pronunciationRetention=practiceRetention.start();

const authGuard = createAuthGuard({ pool });
const app = createLearnerApp({ authGuard, learnerRoutes, packageGuard });
const PORT = process.env.LEARNER_SERVICE_PORT || 4007;

// Opt-in during G9.55 deferral: do not silently replay historical work/providers.
const submissionRecovery = process.env.ENABLE_SUBMISSION_RECOVERY === "true"
  ? startSubmissionRecovery({ pool, enqueueJob: enqueue }) : null;

// Start recovery scheduler if enabled
let recoveryScheduler = null;
const RECOVERY_ENABLED = process.env.ENABLE_STALE_ROUND_RECOVERY !== "false"; // Enabled by default

if (RECOVERY_ENABLED) {
  try {
    recoveryScheduler = startRecoveryScheduler({
      intervalMs: parseInt(process.env.RECOVERY_SCAN_INTERVAL_MS, 10) || undefined,
      onScanComplete: (result) => {
        if (result.found > 0) {
          console.log(`✅ Recovery: enqueued ${result.enqueued}/${result.found} stale rounds`);
        }
      },
      onError: (err) => {
        console.error("❌ Recovery scheduler error:", err.message);
      }
    });
    console.log("🔄 Stale round recovery scheduler started");
  } catch (err) {
    console.error("❌ Failed to start recovery scheduler:", err.message);
  }
}

const server = app.listen(PORT, () => {
  console.log(`📚 Learner Service running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  if (process.env.WARM_STORY_WHISPER !== 'false') {
    try { warmStoryWhisper(); } catch { console.warn('Story transcriber will retry initialization on demand.'); }
  }
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use!`);
  } else {
    console.error(`❌ Error starting Learner Service:`, err);
  }
  process.exit(1);
});

// Graceful shutdown
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n🛑 Shutting down Learner Service...");
  submissionRecovery?.stop();
  storyRetention.stop();
  pronunciationRetention.stop();

  if (recoveryScheduler) {
    recoveryScheduler.stop();
  }

  server.close(async () => {
    try {
      await closeAll();
      closeStoryWhisper();
      await pool.end();
      console.log("✅ Server and queue closed");
      process.exit(0);
    } catch (error) {
      console.error("Shutdown failed", error.code || error.name || "UNKNOWN_ERROR");
      process.exit(1);
    }
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.error("❌ Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});
