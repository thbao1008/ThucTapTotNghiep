const listFields = ["strengths", "improvements_needed", "recommendations", "priority_areas"];
const activityCount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

// Activity counters have no score or skill implication. Missing legacy fields
// remain unavailable rather than being presented as measured zero activity.
export function presentProgressActivity(analytics) {
  const overall = analytics?.overall ?? {};
  const counts = overall.activity_counts;
  return {
    total: activityCount(overall.total_practice_count),
    speaking: activityCount(counts ? counts.speaking : overall.speaking_practice_count),
    challenges: activityCount(counts ? counts.challenges : overall.challenge_count),
    story: activityCount(counts ? counts.story : analytics?.story?.practiced_sessions),
    scenario_world: activityCount(counts ? counts.scenario_world : analytics?.scenario_world?.completed_sessions)
  };
}

function readable(value, maxLength = 1200) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
}

// Protect both progress views from malformed/legacy API payloads, not just the
// current backend parser. Never present unknown provenance as AI generation.
export function presentProgressRecommendations(value) {
  const unavailable = {
    overall_assessment: "Chưa có gợi ý học tập đã xác minh cho lượt tải này.",
    strengths: [], improvements_needed: [], recommendations: [], priority_areas: [],
    recommendation_source: "unavailable", heading: "Gợi ý luyện tập",
    notice: "Không có nội dung AI đã xác minh để hiển thị."
  };
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !readable(value.overall_assessment, 4000)
    || !["ai_generated", "static_fallback"].includes(value.recommendation_source)) return unavailable;
  const result = { overall_assessment: value.overall_assessment.trim() };
  for (const field of listFields) {
    const list = value[field] === undefined ? [] : value[field];
    if (!Array.isArray(list) || list.length > 12 || !list.every(item => readable(item))) return unavailable;
    result[field] = list.map(item => item.trim());
  }
  const generated = value.recommendation_source === "ai_generated";
  if (generated && result.recommendations.length === 0) return unavailable;
  return {
    ...result, recommendation_source: value.recommendation_source,
    heading: generated ? "Đánh giá & gợi ý từ AI" : "Gợi ý luyện tập dự phòng",
    notice: generated ? "" : "Đây là gợi ý tĩnh dự phòng, không phải nội dung do AI tạo."
  };
}

export async function loadProgressAnalytics(api, userId, { signal } = {}) {
  const checkActive = () => {
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  };
  checkActive();
  const response = await api.get(`/learners/by-user/${userId}`, { signal });
  checkActive();
  const learner = response.data?.learner ?? response.data;
  const rawId = learner?.id ?? learner?.learner_id;
  const learnerId = Number(rawId);
  if (!/^[1-9]\d*$/.test(String(rawId)) || !Number.isSafeInteger(learnerId)) throw new Error("Không tìm thấy học viên");
  const { data } = await api.get(`/learners/${learnerId}/progress-analytics`, { signal });
  checkActive();
  return data;
}
