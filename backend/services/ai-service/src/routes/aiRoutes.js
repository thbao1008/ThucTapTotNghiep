import express from "express";
import { authGuard } from "../middleware/authGuard.js";
import { detectTopics } from "../controllers/aiController.js";
import {
  getAiESPStatus,
  isAiESPReady,
  checkLearningStatus,
  triggerTraining,
  checkReadiness
} from "../controllers/assistantAIController.js";
import * as challengeLearningService from "../services/challengeLearningService.js";
import * as aiService from "../services/aiService.js";
import * as learnerAiService from "../services/learnerAiService.js";
import * as trainedAIService from "../services/trainedAIService.js";

const router = express.Router();

// AI routes
router.post("/auto-topics", authGuard, detectTopics);

// AI API route (chỉ dùng AiESP, không cần auth cho internal calls)
// Route này được gọi từ các services khác, không cần auth
router.post("/call-openrouter", async (req, res) => {
  try {
    const { messages, options } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages must be an array" });
    }
    // Chỉ dùng AiESP - đã loại bỏ OpenRouter
    const result = await aiService.callOpenRouter(messages, options || {});
    res.json(result);
  } catch (err) {
    console.error("Error calling AI (AiESP):", err);
    res.status(err.status || 500).json({ 
      error: err.message || "Failed to call AI",
      code: err.code 
    });
  }
});

// Internal AI conversation route (no auth required for service-to-service calls)
router.post("/internal/assistant/conversation", async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }
    
    // Convert to messages format for OpenRouter
    const messages = [
      ...history,
      { role: "user", content: message }
    ];
    
    const result = await aiService.callOpenRouter(messages, {});
    res.json({ 
      response: result.choices?.[0]?.message?.content || result.response || result.message || "",
      ...result 
    });
  } catch (err) {
    console.error("Error in internal assistant conversation:", err);
    res.status(err.status || 500).json({ 
      error: err.message || "Failed to process conversation",
      code: err.code 
    });
  }
});

// Assistant conversation route (for Learner Service)
// Allow internal calls without auth, but require auth for external calls
router.post("/assistant/conversation", async (req, res) => {
  try {
    // Check if this is an internal call (from API Gateway)
    const isInternalCall = req.headers['x-forwarded-host'] || req.headers['x-forwarded-proto'];
    
    // For internal calls, skip auth check
    if (!isInternalCall) {
      // Apply auth guard for external calls
      const authGuard = (await import("../middleware/authGuard.js")).authGuard;
      await new Promise((resolve, reject) => {
        authGuard(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    const { message, history = [] } = req.body;
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }
    
    // Convert to messages format for OpenRouter
    const messages = [
      ...history,
      { role: "user", content: message }
    ];
    
    const result = await aiService.callOpenRouter(messages, {});
    res.json({ 
      response: result.response || result.message || result.content || "",
      ...result 
    });
  } catch (err) {
    console.error("Error in assistant conversation:", err);
    res.status(err.status || 500).json({ 
      error: err.message || "Failed to process conversation",
      code: err.code 
    });
  }
});

// Mentor learn feedback route (for Learner Service)
router.post("/mentor/learn-feedback", authGuard, async (req, res) => {
  try {
    const { feedback, scores, learnerId, mentorId } = req.body;
    // This is a placeholder - can be implemented later
    // For now, just return success
    res.json({ success: true, message: "Feedback received" });
  } catch (err) {
    console.error("Error in mentor learn feedback:", err);
    res.status(500).json({ 
      error: err.message || "Failed to process feedback"
    });
  }
});

// Assistant AI routes
router.get("/aiesp/status", authGuard, getAiESPStatus);
router.get("/aiesp/ready", authGuard, isAiESPReady);
router.get("/assistant-ai/status", authGuard, checkLearningStatus);
router.post("/assistant-ai/train", authGuard, triggerTraining);
router.get("/assistant-ai/readiness", authGuard, checkReadiness);

// Challenge Learning routes (for Mentor Service to call)
router.post("/challenge/learn-creation", authGuard, async (req, res) => {
  try {
    const { challengeId, mentorId } = req.body;
    await challengeLearningService.learnFromChallengeCreation(challengeId, mentorId);
    res.json({ success: true });
  } catch (err) {
    console.error("Error learning from challenge creation:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/challenge/learn-submission", authGuard, async (req, res) => {
  try {
    const { submissionId, challengeId, learnerId } = req.body;
    await challengeLearningService.learnFromLearnerSubmission(submissionId, challengeId, learnerId);
    res.json({ success: true });
  } catch (err) {
    console.error("Error learning from learner submission:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/challenge/learn-feedback", authGuard, async (req, res) => {
  try {
    const { submissionId, feedbackId, mentorId, scores, feedback } = req.body;
    await challengeLearningService.learnFromMentorFeedback(submissionId, feedbackId, mentorId, scores, feedback);
    res.json({ success: true });
  } catch (err) {
    console.error("Error learning from mentor feedback:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Trained AI route (for Learner Service - prompt generation, etc.)
// Internal service calls không cần auth
router.post("/trained/call", async (req, res) => {
  try {
    const { trainingType, options = {}, messages = null, aiOptions = {} } = req.body;
    
    if (!trainingType) {
      return res.status(400).json({ error: "trainingType is required" });
    }
    
    // Gọi trainedAIService để xử lý với Python training data
    const result = await trainedAIService.callTrainedAI(trainingType, options, messages, aiOptions);
    res.json(result);
  } catch (err) {
    console.error("Error calling Trained AI:", err);
    res.status(err.status || 500).json({ 
      error: err.message || "Failed to call Trained AI",
      code: err.code 
    });
  }
});

// Learner transcript analysis route (for Learner Service)
// Note: This is called from queue handlers (background jobs) so we don't require auth
// Internal service calls should go through API Gateway which can add internal service tokens if needed
router.post("/learner/analyze-transcript", async (req, res) => {
  try {
    const { transcript, options = {} } = req.body;
    
    if (!transcript || typeof transcript !== "string") {
      return res.status(400).json({ error: "transcript is required and must be a string" });
    }
    
    const challenge = options.challenge || null;
    const analysis = await learnerAiService.analyzeWithOpenRouter(transcript, challenge);
    
    // Convert scores from 0-10 scale to 0-100 scale if needed
    if (analysis.overall_score !== undefined && analysis.overall_score <= 10) {
      analysis.overall_score = analysis.overall_score * 10;
    }
    if (analysis.pronunciation_score !== undefined && analysis.pronunciation_score <= 10) {
      analysis.pronunciation_score = analysis.pronunciation_score * 10;
    }
    if (analysis.fluency_score !== undefined && analysis.fluency_score <= 10) {
      analysis.fluency_score = analysis.fluency_score * 10;
    }
    
    res.json(analysis);
  } catch (err) {
    console.error("Error analyzing transcript:", err);
    res.status(500).json({ 
      error: err.message || "Failed to analyze transcript",
      code: err.code 
    });
  }
});

export default router;

