import express from "express";
import { callGroq } from "../services/aiService.js";
import {
  analyzeWithGroq,
  scaleTranscriptAnalysisForApi
} from "../services/learnerAiService.js";

export function createTranscriptAiRouter({
  authenticateService,
  callAI = callGroq,
  now = () => new Date()
} = {}) {
  if (typeof authenticateService !== "function") {
    throw new TypeError("Transcript AI service authentication middleware is required");
  }
  if (typeof callAI !== "function" || typeof now !== "function") {
    throw new TypeError("Transcript AI provider and clock dependencies must be functions");
  }

  const router = express.Router();

  router.post("/learner/analyze-transcript", authenticateService, async (req, res) => {
    try {
      const { transcript, options = {} } = req.body;

      if (!transcript || typeof transcript !== "string") {
        return res.status(400).json({ error: "transcript is required and must be a string" });
      }

      const analysis = await analyzeWithGroq(
        transcript,
        options.challenge || null,
        callAI
      );
      const apiAnalysis = scaleTranscriptAnalysisForApi(analysis, now);

      res.json(apiAnalysis);
    } catch (err) {
      console.error("Error analyzing transcript", err.code || "UNKNOWN_ERROR");
      res.status(err.status || 500).json({
        error: err.message || "Failed to analyze transcript",
        code: err.code
      });
    }
  });

  return router;
}
