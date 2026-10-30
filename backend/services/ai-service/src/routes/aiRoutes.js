import express from "express";
import { authGuard, allowRoles, allowServices } from "../middleware/authGuard.js";
import { detectTopics } from "../controllers/aiController.js";
import * as aiService from "../services/aiService.js";
import { createTranscriptAiRouter } from "./transcriptAiRoutes.js";

const router = express.Router();
const learnerServiceAuth = allowServices("learner");
const learnerOrMentorServiceAuth = allowServices("learner", "mentor");

// AI routes
router.post("/auto-topics", authGuard, allowRoles("admin", "learner", "mentor"), detectTopics);

// Raw provider access is limited to authenticated backend services.
router.post("/call-groq", learnerOrMentorServiceAuth, async (req, res) => {
  try {
    const { messages, options } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages must be an array" });
    }
    // Groq accepts text chat messages only; audio is handled by separate services.
    const result = await aiService.callGroq(messages, options || {});
    res.json(result);
  } catch (err) {
    console.error("Error calling Groq:", err);
    res.status(err.status || 500).json({
      error: err.message || "Failed to call AI",
      code: err.code
    });
  }
});

// Internal AI conversation route.
router.post("/internal/assistant/conversation", learnerServiceAuth, async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }
    
    // Convert to messages format for Groq
    const messages = [
      ...history,
      { role: "user", content: message }
    ];
    
    const result = await aiService.callGroq(messages, { task_type: "assistant_conversation" });
    const responseText = result.choices?.[0]?.message?.content;
    if (typeof responseText !== "string" || !responseText.trim()) {
      throw Object.assign(new Error("AI returned an empty assistant response"), {
        status: 502,
        code: "AI_RESPONSE_INVALID"
      });
    }
    res.json({ 
      ...result,
      response: responseText
    });
  } catch (err) {
    console.error("Error in internal assistant conversation:", err);
    res.status(err.status || 500).json({
      error: err.message || "Failed to process conversation",
      code: err.code 
    });
  }
});

// Assistant conversation route (for the Learner Service).
router.post("/assistant/conversation", learnerServiceAuth, async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }
    
    // Convert to messages format for Groq
    const messages = [
      ...history,
      { role: "user", content: message }
    ];
    
    const result = await aiService.callGroq(messages, { task_type: "assistant_conversation" });
    const responseText = result.choices?.[0]?.message?.content;
    if (typeof responseText !== "string" || !responseText.trim()) {
      throw Object.assign(new Error("AI returned an empty assistant response"), {
        status: 502,
        code: "AI_RESPONSE_INVALID"
      });
    }
    res.json({ ...result, response: responseText });
  } catch (err) {
    console.error("Error in assistant conversation:", err);
    res.status(err.status || 500).json({
      error: err.message || "Failed to process conversation",
      code: err.code 
    });
  }
});

router.use(createTranscriptAiRouter({ authenticateService: learnerServiceAuth }));

export default router;
