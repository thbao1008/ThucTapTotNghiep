// AI Service - Groq integration
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { resolveProviderConfig } from "../config/providerConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..", "..", "..", "..");
const MAX_INPUT_CHARACTERS = 32_000;
const MAX_MESSAGES = 40;
const MAX_OUTPUT_TOKENS = 4096;
const TRANSIENT_RETRY_LIMIT = 1;

function createAIError(message, status, code, properties = {}) {
  return Object.assign(new Error(message), { status, code, ...properties });
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    throw createAIError(
      `messages must contain between 1 and ${MAX_MESSAGES} entries`,
      400,
      "AI_REQUEST_INVALID"
    );
  }

  let totalCharacters = 0;
  for (const message of messages) {
    if (
      !message ||
      typeof message !== "object" ||
      !["system", "user", "assistant"].includes(message.role) ||
      typeof message.content !== "string"
    ) {
      throw createAIError(
        "Each message must have a supported role and string content",
        400,
        "AI_REQUEST_INVALID"
      );
    }
    totalCharacters += message.content.length;
    if (totalCharacters > MAX_INPUT_CHARACTERS) {
      throw createAIError("AI input exceeds the configured size limit", 413, "AI_INPUT_TOO_LARGE");
    }
  }
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function resolveModel(options, env, config) {
  const taskType = typeof options.task_type === "string"
    ? options.task_type.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_")
    : "";
  const taskModel = taskType
    ? env[`${config.prefix}_MODEL_${taskType}`]
    : undefined;
  // Groq never inherits an Groq model or a caller's paid-provider default.
  return taskModel || config.model;
}

function normalizeCompletion(response, provider) {
  const choice = response?.choices?.[0];
  const content = choice?.message?.content;
  if (choice?.finish_reason === "length") {
    throw createAIError("Groq response exceeded its output limit", 502, "AI_RESPONSE_TRUNCATED");
  }
  if (typeof content !== "string" || !content.trim() || ["content_filter", "error"].includes(choice?.finish_reason)) {
    throw createAIError(
      "Groq returned an unsupported or empty response",
      502,
      "AI_RESPONSE_INVALID"
    );
  }

  return {
    provider,
    id: typeof response.id === "string" ? response.id : null,
    model: typeof response.model === "string" ? response.model : null,
    choices: [{
      index: Number.isInteger(choice.index) ? choice.index : 0,
      message: {
        role: typeof choice.message.role === "string" ? choice.message.role : "assistant",
        content
      },
      finish_reason: typeof choice.finish_reason === "string" ? choice.finish_reason : null
    }],
    usage: response.usage && typeof response.usage === "object" ? response.usage : null
  };
}

/**
 * getFetch - ensure fetch is available (Node >=18 or node-fetch)
 */
async function getFetch() {
  if (typeof globalThis.fetch === "function") return globalThis.fetch.bind(globalThis);
  try {
    const mod = await import("node-fetch");
    return mod.default ?? mod;
  } catch (err) {
    throw new Error("No fetch available. Install node-fetch or run Node >= 18");
  }
}

/** Call Groq directly without local model training or transcript capture. */
export async function callGroq(messages, opts = {}) {
  return callGroqWithDependencies(messages, opts);
}

export async function callGroqWithDependencies(
  messages,
  opts = {},
  {
    env = process.env,
    fetchImpl,
    sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
  } = {}
) {
  validateMessages(messages);

  const config = resolveProviderConfig(env);
  const apiKey = config.apiKey;
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw createAIError(`${config.label} is not configured`, 503, "AI_PROVIDER_NOT_CONFIGURED");
  }

  const baseUrl = config.baseUrl;
  let endpoint;
  try {
    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    endpoint = new URL("chat/completions", normalizedBaseUrl);
  } catch {
    throw createAIError("Groq API base URL is invalid", 503, "AI_PROVIDER_CONFIG_INVALID");
  }
  if (endpoint.protocol !== "https:") {
    throw createAIError("Groq API base URL must use HTTPS", 503, "AI_PROVIDER_CONFIG_INVALID");
  }

  const model = resolveModel(opts, env, config);
  if (typeof model !== "string" || !model.trim() || model.length > 200) {
    throw createAIError("Groq model configuration is invalid", 503, "AI_PROVIDER_CONFIG_INVALID");
  }
  const configuredTokenLimit = positiveInteger(config.tokenLimit, MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS);
  const requestedTokenLimit = opts.max_tokens === undefined
    ? Math.min(800, configuredTokenLimit)
    : Number(opts.max_tokens);
  if (!Number.isInteger(requestedTokenLimit) || requestedTokenLimit < 1) {
    throw createAIError("max_tokens must be a positive integer", 400, "AI_REQUEST_INVALID");
  }
  const maxTokens = Math.min(requestedTokenLimit, configuredTokenLimit);
  const temperature = opts.temperature === undefined ? 0.7 : Number(opts.temperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    throw createAIError("temperature must be between 0 and 2", 400, "AI_REQUEST_INVALID");
  }
  if (opts.stream === true) {
    throw createAIError("Streaming responses are not supported by this endpoint", 400, "AI_REQUEST_INVALID");
  }
  if (opts.response_format !== undefined &&
      (opts.response_format?.type !== "json_object" || Object.keys(opts.response_format).length !== 1)) {
    throw createAIError("Only JSON object response format is supported", 400, "AI_REQUEST_INVALID");
  }

  const configuredTimeout = positiveInteger(config.timeout, 45_000, 120_000);
  if (opts.reasoning_effort !== undefined && !['low','medium','high'].includes(opts.reasoning_effort)) {
    throw createAIError('Unsupported reasoning effort',400,'AI_REQUEST_INVALID');
  }
  const body = JSON.stringify({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(/^openai\/gpt-oss-(20b|120b)$/.test(model) && opts.reasoning_effort ? {reasoning_effort:opts.reasoning_effort} : {}),
    ...(opts.response_format ? { response_format: { type: "json_object" } } : {})
  });

  const fetchFn = fetchImpl || await getFetch();
  const url = endpoint.toString();
  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), configuredTimeout);
    let response;
    let parsed;
    try {
      response = await fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body,
        redirect: "error",
        signal: controller.signal
      });
      try {
        parsed = await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw error;
        if (response.ok) throw createAIError("Groq returned invalid JSON", 502, "AI_RESPONSE_INVALID");
        parsed = null;
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (controller.signal.aborted) {
        throw createAIError("Groq request timed out", 504, "AI_TIMEOUT");
      }
      if (err.code === "AI_RESPONSE_INVALID") throw err;
      if (attempt < TRANSIENT_RETRY_LIMIT) {
        attempt += 1;
        await sleep(250);
        continue;
      }
      throw createAIError("Groq is unavailable", 503, "AI_PROVIDER_UNAVAILABLE");
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.ok) {
      return normalizeCompletion(parsed, config.provider);
    }

    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < TRANSIENT_RETRY_LIMIT) {
      const retryAfter = Number(response.headers?.get?.("retry-after"));
      if (!Number.isFinite(retryAfter) || retryAfter <= 2) {
        attempt += 1;
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250);
        continue;
      }
    }

    const providerMessage = typeof parsed?.error?.message === "string" ? parsed.error.message : "";
    const affordableTokens = providerMessage.match(/can only afford\s+(\d+)/i)?.[1];
    const mappedErrors = {
      401: ["Groq rejected its configured credentials", 502, "AI_PROVIDER_AUTH_FAILED"],
      403: ["Groq denied the request", 502, "AI_PROVIDER_REQUEST_DENIED"],
      402: ["Groq requires an available payment balance", 503, "PAYMENT_REQUIRED"],
      429: ["Groq rate limit reached", 503, "AI_RATE_LIMITED"]
    };
    const [providerMessageSafe, status, code] = mappedErrors[response.status] ||
      (response.status >= 500
        ? ["Groq is temporarily unavailable", 503, "AI_PROVIDER_UNAVAILABLE"]
        : ["Groq rejected the request", 502, "AI_PROVIDER_REQUEST_FAILED"]);
    throw createAIError(
      providerMessageSafe.replaceAll("Groq", config.label),
      status,
      code,
      response.status === 402 && affordableTokens
        ? { maxAffordableTokens: Number(affordableTokens) }
        : {}
    );
  }
}

/**
 * transcribeWithWhisperX - run local Python whisperx transcriber and return parsed JSON or text
 * localPath: path to audio file
 * returns: { json: <full whisperx json>, text: <joined words text> }
 */
export async function transcribeWithWhisperX(localPath) {
  // Use backendDir defined at top of file
  const outDir = path.resolve(backendDir, "outputs");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outputPath = path.join(outDir, path.basename(localPath).replace(/\.[^/.]+$/, ".json"));

  return new Promise((resolve, reject) => {
    // Use python script that prints JSON to stdout; we redirect to file for reliability
    const cmd = `python whisperx/transcribe_whisperx.py "${localPath}" > "${outputPath}"`;
    exec(cmd, (err) => {
      if (err) return reject(err);
      try {
        const raw = fs.readFileSync(outputPath, "utf-8");
        const json = JSON.parse(raw);
        const text = (json.words || []).map(w => w.text).join(" ");
        resolve({ json, text });
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * compareTranscript - simple token-level comparison helper
 * transcript: string
 * sampleText: string
 * wordSegments: optional array of {word,start,end,score}
 */
export function compareTranscript(transcript, sampleText, wordSegments = []) {
  const transcriptWords = (transcript || "").toLowerCase().split(/\s+/).filter(Boolean);
  const sampleWords = (sampleText || "").toLowerCase().split(/\s+/).filter(Boolean);

  return transcriptWords.map((word, idx) => {
    const expected = sampleWords[idx] || null;
    const segment = wordSegments[idx] || {};
    return {
      word,
      expected,
      correct: expected === word,
      start: segment.start ?? null,
      end: segment.end ?? null,
      confidence: segment.score ?? null
    };
  });
}

export function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}
