// AI Service Client - Helper to call AI Service via API Gateway
const gatewayUrl = () => process.env.API_GATEWAY_URL || `http://localhost:${process.env.API_GATEWAY_PORT || 4000}`;
import { getAIServiceAuthHeaders } from "./aiServiceAuth.js";

async function postAIService(path, payload, {
  baseUrl = gatewayUrl(),
  fetchImpl = fetch,
  getAuthHeaders = getAIServiceAuthHeaders,
  timeoutMs = 60_000
} = {}) {
  const headers = { "Content-Type": "application/json", ...getAuthHeaders() };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let data;

  try {
    response = await fetchImpl(`${baseUrl}/api/ai${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    try {
      data = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw Object.assign(new Error("AI Service returned an invalid response"), {
        status: 502, code: "AI_SERVICE_RESPONSE_INVALID"
      });
    }
  } catch (err) {
    if (controller.signal.aborted) {
      throw Object.assign(new Error("AI Service request timed out"), {
        status: 504,
        code: "AI_SERVICE_TIMEOUT"
      });
    }
    if (err.code === "AI_SERVICE_RESPONSE_INVALID") throw err;
    throw Object.assign(new Error("AI Service is unavailable"), {
      status: 503,
      code: "AI_SERVICE_UNAVAILABLE",
      cause: err
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw Object.assign(new Error(data?.error || data?.message || "AI Service request failed"), {
      status: response.status,
      code: data?.code || "AI_SERVICE_ERROR"
    });
  }
  return data;
}

/**
 * Send text-only model requests through the authenticated AI Service.
 */
export async function callGroq(messages, options = {}) {
  return postAIService("/call-groq", { messages, options });
}

/**
 * Transcribe audio using local WhisperX; the text-only AI endpoint is not an audio API.
 */
export async function transcribeWithWhisperX(audioFilePath, options = {}) {
  const { runWhisperX } = await import("./whisperxRunner.js");
  return runWhisperX(audioFilePath, options);
}




/**
 * Analyze learner transcript through the authenticated AI Service.
 */
export async function analyzeLearnerTranscript(transcript, options = {}, requestOptions = {}) {
  return postAIService(
    "/learner/analyze-transcript",
    { transcript, options },
    requestOptions
  );
}
