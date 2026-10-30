const fields = ["strengths", "improvements_needed", "recommendations", "priority_areas"];
export const PROGRESS_RECOMMENDATION_TIMEOUT_MS = 12_000;

function readableString(value, maxLength = 1200) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
}

function readableList(value) {
  if (!Array.isArray(value) || value.length > 12 || !value.every(item => readableString(item))) return null;
  return value.map(item => item.trim());
}

export function chooseRecommendations(aiRecommendations, fallbackRecommendations) {
  const ai = readableList(aiRecommendations);
  const fallback = readableList(fallbackRecommendations) || [];
  const hasAiRecommendations = Boolean(ai?.length);

  return {
    recommendations: hasAiRecommendations ? ai : fallback,
    recommendation_source: hasAiRecommendations ? "ai_generated" : "static_fallback"
  };
}

export function createStaticProgressRecommendations(fallbackRecommendations) {
  return {
    overall_assessment: "Chưa có đánh giá AI đáng tin cậy cho lượt tải này. Các gợi ý dự phòng dưới đây dựa trên hoạt động luyện tập, không phải đánh giá năng lực của AI.",
    strengths: [], improvements_needed: [], priority_areas: [],
    ...chooseRecommendations(null, fallbackRecommendations)
  };
}

export function parseProgressRecommendations(responseText, fallbackRecommendations) {
  const fallback = () => createStaticProgressRecommendations(fallbackRecommendations);
  if (!readableString(responseText, 30_000)) return fallback();
  try {
    // Accept plain JSON or a single fenced JSON response, not prose/raw errors.
    const text = responseText.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, "$1");
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
      || !readableString(parsed.overall_assessment, 4000)) return fallback();
    const result = { overall_assessment: parsed.overall_assessment.trim() };
    for (const field of fields) {
      const values = readableList(parsed[field] === undefined ? [] : parsed[field]);
      if (!values) return fallback();
      result[field] = values;
    }
    if (!result.recommendations.length) return fallback();
    return { ...result, recommendation_source: "ai_generated" };
  } catch {
    return fallback();
  }
}

// Bound the complete HTTP/body wait, including transports that ignore abort.
// Callers retain ownership of the internal service URL and authentication.
export async function requestProgressRecommendations({ url, headers, message, fallbackRecommendations,
  fetchImpl = globalThis.fetch, timeoutMs = PROGRESS_RECOMMENDATION_TIMEOUT_MS,
  schedule = setTimeout, unschedule = clearTimeout } = {}) {
  const controller = new AbortController();
  let timer;
  const fallback = () => createStaticProgressRecommendations(fallbackRecommendations);
  try {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return fallback();
    const deadline = new Promise((_, reject) => {
      timer = schedule(() => {
        controller.abort();
        reject(new Error("PROGRESS_RECOMMENDATION_TIMEOUT"));
      }, timeoutMs);
    });
    const work = Promise.resolve().then(async () => {
      const response = await fetchImpl(url, {
        method: "POST", headers, signal: controller.signal,
        body: JSON.stringify({ message, history: [] })
      });
      if (!response.ok) return fallback();
      if (controller.signal.aborted) return fallback();
      const payload = await response.json();
      return parseProgressRecommendations(payload?.response ?? payload?.message, fallbackRecommendations);
    });
    return await Promise.race([work, deadline]);
  } catch {
    return fallback();
  } finally {
    if (timer !== undefined) unschedule(timer);
    // Release unread error/late response streams as well as timed-out requests.
    controller.abort();
  }
}
