import express from "express";
import { createLearnerAccessGuards } from "../middleware/learnerAccess.js";

export function createSubmissionAnalysisRouter({ pool, handler } = {}) {
  if (!pool || typeof handler !== "function") {
    throw new TypeError("Submission analysis route dependencies are required");
  }

  const router = express.Router();
  const { ownRecord } = createLearnerAccessGuards({ pool });
  router.post(
    "/submissions/:id/analyze",
    ownRecord("submission", req => req.params.id),
    handler
  );
  return router;
}
