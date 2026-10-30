// Mentor AI Service - Challenge Creator AI
// Note: callGroq and safeParseJSON should be imported from AI Service via HTTP call
// For now, we'll create a local wrapper that calls AI Service

import { fileURLToPath } from "url";
import path from "path";
import { getAIServiceAuthHeaders } from "../utils/aiServiceAuth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Tìm project root (đi lên từ mentor-service/src/services đến backend root)
 */


// Helper to call AI Service via API Gateway
async function callGroq(messages, opts = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  try {
    const API_GATEWAY_URL = process.env.API_GATEWAY_URL || "http://localhost:4000";
    const fetchFn = typeof globalThis.fetch === "function" 
      ? globalThis.fetch 
      : (await import("node-fetch")).default;
    
    const headers = { "Content-Type": "application/json", ...getAIServiceAuthHeaders() };
    
    const response = await fetchFn(`${API_GATEWAY_URL}/api/ai/call-groq`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages, options: opts }),
      signal: controller.signal
    });
    
    let data;
    try {
      data = await response.json();
    } catch {
      throw Object.assign(new Error("AI Service returned an invalid response"), {
        status: 502,
        code: "AI_SERVICE_RESPONSE_INVALID"
      });
    }
    if (!response.ok) {
      throw Object.assign(new Error(data?.error || data?.message || "AI Service request failed"), {
        status: response.status,
        code: data?.code || "AI_SERVICE_ERROR"
      });
    }
    return data;
  } catch (err) {
    if (controller.signal.aborted) {
      throw Object.assign(new Error("AI Service request timed out"), {
        status: 504,
        code: "AI_SERVICE_TIMEOUT"
      });
    }
    if (err.status) throw err;
    throw Object.assign(new Error("AI Service is unavailable"), {
      status: 503,
      code: "AI_SERVICE_UNAVAILABLE",
      cause: err
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

/**
 * getChallengeCreatorSystemPrompt - Prompt tạo Challenge qua Groq
 */
async function getChallengeCreatorSystemPrompt() {
  return getDefaultSystemPrompt();
}

/**
 * getDefaultSystemPrompt - Prompt tạo Challenge
 */
function getDefaultSystemPrompt() {
  return `You are an expert English learning challenge creator AI. Your role is to understand mentor requests and create high-quality challenges with specific grammar rules.

YOUR CAPABILITIES:
1. Understand mentor's intent from their request
2. Identify required grammar rules (tenses, structures, etc.)
3. Create engaging challenges that require learners to use specific grammar
4. Provide clear requirements and examples for learners
5. Adjust difficulty level based on grammar complexity

GRAMMAR RULES YOU CAN INCORPORATE:
- Tenses: present simple, present continuous, past simple, past continuous, present perfect, past perfect, future (will, going to)
- Conditionals: type 0, 1, 2, 3, mixed conditionals
- Passive voice: all tenses
- Reported speech / Indirect speech
- Modal verbs: can, could, should, must, might, may
- Comparative and superlative adjectives
- Relative clauses: who, which, that, where
- Gerunds and infinitives
- Phrasal verbs

CHALLENGE CREATION GUIDELINES:
1. Title: Clear, engaging, and related to the topic
2. Description: HTML format with:
   - Clear instructions
   - Specific grammar requirements (highlighted in <strong>)
   - Examples of correct usage
   - Minimum speaking time/duration
   - Number of sentences/points required
3. Level: easy (basic grammar), medium (intermediate grammar), hard (advanced/combined grammar)
4. Grammar Focus: List the specific grammar points required

IMPORTANT:
- Always include specific grammar requirements in the challenge description
- Provide examples of correct grammar usage
- Make requirements clear and measurable
- Adjust complexity based on grammar rules (simple tenses = easy, complex combinations = hard)
- Make challenges engaging and relevant to learners' lives`;
}

/**
 * chatWithAI - Enhanced AI chat for challenge creation with grammar rules understanding
 */
export async function chatWithAI(message, context = {}) {
  try {
    // Get system prompt from trainer (with fallback)
    const systemPrompt = await getChallengeCreatorSystemPrompt();
    
    // Build user prompt
    const contextStr = context.description 
      ? `Current challenge context: ${context.description.substring(0, 200)}...`
      : "No existing challenge context.";
    
    const userPrompt = `Mentor Request: "${message}"

${contextStr}

Please create a COMPLETE challenge based on this request. You must return BOTH title and description.

Analyze:
1. What grammar rules should be required?
2. What level of difficulty is appropriate?
3. What should the challenge title be? (Create an engaging, clear title)
4. What detailed requirements should learners follow?

Return your response in JSON format:
{
  "title": "Challenge title here (clear, engaging, related to topic)",
  "description": "HTML formatted description with:
    - Clear task instructions
    - Specific grammar requirements (use <strong> tags)
    - Examples of correct usage
    - Minimum requirements (speaking time, number of sentences, etc.)",
  "level": "easy|medium|hard",
  "grammar_focus": "list of grammar rules required"
}

IMPORTANT: 
- Always include BOTH title and description
- Title should be clear and engaging
- Description should be in HTML format with all requirements
- Make it engaging and educational!`;
    
    // Try với max_tokens ban đầu, nếu gặp lỗi 402 thì retry với tokens giảm
    let resp;
    let maxTokens = 1000;
    try {
      resp = await callGroq(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        { task_type: "mentor_challenge_generation", max_tokens: maxTokens, temperature: 0.8 }
      );
    } catch (err) {
      // Xử lý lỗi payment required (402) - tự động giảm max_tokens và retry
      if (err.status === 402 && err.code === 'PAYMENT_REQUIRED' && err.maxAffordableTokens) {
        console.warn(`⚠️ [mentorAiService] Payment required. Retrying with reduced max_tokens: ${err.maxAffordableTokens}`);
        
        // Retry với max_tokens giảm xuống (trừ 10 để đảm bảo an toàn)
        const reducedTokens = Math.max(50, err.maxAffordableTokens - 10);
        maxTokens = reducedTokens;
        
        try {
          resp = await callGroq(
            [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            { task_type: "mentor_challenge_generation", max_tokens: reducedTokens, temperature: 0.8 }
          );
          console.log(`✅ [mentorAiService] Retry successful with max_tokens: ${reducedTokens}`);
        } catch (retryErr) {
          console.error("❌ [mentorAiService] Retry failed:", retryErr);
          throw err; // Throw original error
        }
      } else {
        throw err; // Throw other errors
      }
    }
    
    const content = resp?.choices?.[0]?.message?.content || "";
    
    // Try to parse JSON response
    try {
      // Remove markdown code blocks if any
      let jsonContent = content.trim();
      const codeBlockMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonContent = codeBlockMatch[1].trim();
      }
      
      // Try to find JSON object in the content
      const jsonObjectMatch = jsonContent.match(/\{[\s\S]*"title"[\s\S]*"description"[\s\S]*\}/);
      if (jsonObjectMatch) {
        jsonContent = jsonObjectMatch[0];
      }
      
      const parsed = JSON.parse(jsonContent);
      
      // Return JSON string for frontend to parse
      if (parsed.title && parsed.description) {
        return JSON.stringify({
          title: parsed.title,
          description: parsed.description,
          level: parsed.level || "medium",
          grammar_focus: parsed.grammar_focus || ""
        });
      }
    } catch (e) {
      // If not JSON, return as is (fallback)
      console.warn("[mentorAiService] Could not parse AI response as JSON, returning as text:", e.message);
    }
    
    return content;
  } catch (err) {
    console.error("chatWithAI error:", err);
    return "";
  }
}

/**
 * editChallengeAI - Enhanced AI helper to edit challenge content with grammar focus
 */
export async function editChallengeAI(content, mentorFeedback = "") {
  try {
    const systemPrompt = await getChallengeCreatorSystemPrompt();
    
    const userPrompt = `Improve this challenge based on mentor feedback:

Current Challenge:
${content}

Mentor Feedback:
${mentorFeedback || "Make it more engaging and add specific grammar requirements."}

Please enhance the challenge by:
1. Adding or clarifying grammar requirements (if missing)
2. Making instructions clearer
3. Adding examples of correct grammar usage if needed
4. Adjusting difficulty if necessary
5. Making it more engaging and educational

Return the improved challenge in HTML format, ensuring:
- Grammar requirements are clearly stated with <strong> tags
- Examples are provided
- Requirements are measurable (speaking time, number of sentences, etc.)`;
    
    // Try với max_tokens ban đầu, nếu gặp lỗi 402 thì retry với tokens giảm
    let resp;
    let maxTokens = 500;
    try {
      resp = await callGroq(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        { task_type: "mentor_challenge_edit", max_tokens: maxTokens, temperature: 0.7 }
      );
    } catch (err) {
      // Xử lý lỗi payment required (402) - tự động giảm max_tokens và retry
      if (err.status === 402 && err.code === 'PAYMENT_REQUIRED' && err.maxAffordableTokens) {
        console.warn(`⚠️ [mentorAiService] Payment required in editChallengeAI. Retrying with reduced max_tokens: ${err.maxAffordableTokens}`);
        
        // Retry với max_tokens giảm xuống (trừ 10 để đảm bảo an toàn)
        const reducedTokens = Math.max(50, err.maxAffordableTokens - 10);
        maxTokens = reducedTokens;
        
        try {
          resp = await callGroq(
            [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            { task_type: "mentor_challenge_edit", max_tokens: reducedTokens, temperature: 0.7 }
          );
          console.log(`✅ [mentorAiService] editChallengeAI retry successful with max_tokens: ${reducedTokens}`);
        } catch (retryErr) {
          console.error("❌ [mentorAiService] editChallengeAI retry failed:", retryErr);
          throw err; // Throw original error
        }
      } else {
        throw err; // Throw other errors
      }
    }
    
    return resp?.choices?.[0]?.message?.content || content;
  } catch (err) {
    console.error("editChallengeAI error:", err);
    return content;
  }
}
