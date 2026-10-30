import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createLearnerAccessGuards } from "../middleware/learnerAccess.js";
import { createAudioUploadMiddleware } from "../utils/audioUpload.js";
import * as learnerController from "../controllers/learnerController.js";
import * as speakingPracticeController from "../controllers/speakingPracticeController.js";
import { createSubmissionRetryHandler } from "../controllers/submissionRetryController.js";
import { enqueue } from "../utils/queue.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..", "..", "..", "..");

export function createAudioUploadRouter({
  pool,
  submissionHandler,
  retryEnqueueJob = enqueue,
  submissionReadHandler = learnerController.getSubmissionById,
  speakingPracticeHandler = speakingPracticeController.saveRound,
  uploadsDir = path.resolve(backendDir, "uploads")
} = {}) {
  if (!pool || typeof submissionHandler !== "function" ||
      typeof submissionReadHandler !== "function" ||
      typeof speakingPracticeHandler !== "function") {
    throw new TypeError("Audio upload routes require pool and handlers");
  }

  const router = express.Router();
  const { selfLearner, ownRecord } = createLearnerAccessGuards({ pool });
  const ownPracticeSession = ownRecord("practiceSession", req => req.params.sessionId);
  const ownSubmission = ownRecord("submission", req => req.params.id);
  const upload = createAudioUploadMiddleware(uploadsDir);

  router.post("/submissions", selfLearner(), upload.single("file"), submissionHandler);
  router.get("/submissions/next-attempt", selfLearner(), learnerController.getSubmissionAttempt);
  router.get("/submissions/:id", ownSubmission, submissionReadHandler);
  router.post("/submissions/:id/retry", ownSubmission, createSubmissionRetryHandler({ pool, enqueueJob: retryEnqueueJob }));
  router.post(
    "/speaking-practice/sessions/:sessionId/rounds",
    ownPracticeSession,
    upload.single("audio"),
    speakingPracticeHandler
  );

  return router;
}
