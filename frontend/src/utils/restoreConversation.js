import { getScenarioScores } from './practiceScore.js';
const base = "/learners/speaking-practice";
const validId = id => Number.isSafeInteger(Number(id)) && Number(id) > 0;

function conversationRevision(rows) {
  if (rows.some(row => !validId(row.id))) throw new Error("Thiếu phiên bản hội thoại.");
  return rows.reduce((revision, row) => Math.max(revision, Number(row.id)), 0);
}

export async function restoreScenario(api, sessionId) {
  const { data } = await api.get(`${base}/scenario/sessions/${sessionId}`);
  if (!validId(sessionId) || String(data?.session_id) !== String(sessionId) ||
      !data.scenario || !validId(data.scenario.id) ||
      !["in_progress", "completed"].includes(data.status) ||
      !Array.isArray(data.conversations) ||
      data.conversations.some(row => !["ai", "learner"].includes(row.speaker) || typeof row.text !== "string")) {
    throw new Error("Dữ liệu phiên Scenario không hợp lệ.");
  }
  const score = Number(data.score);
  const hints = Number(data.hints_used);
  if (data.score == null || !Number.isFinite(score) || score < 0 || score > 100 ||
      data.hints_used == null || !Number.isInteger(hints) || hints < 0) {
    throw new Error("Dữ liệu gợi ý không hợp lệ.");
  }
  const greeting = data.scenario.initial_prompt || "Hello! How can I help you?";
  const savedScore = getScenarioScores(data.scoring_details);
  const finalAssessment = data.status === 'completed' && data.final_score != null && savedScore
    && savedScore.final_score === Number(data.final_score) ? data.scoring_details : null;
  return { ...data, final_assessment: finalAssessment, revision: conversationRevision(data.conversations), score, hints_used: hints, conversations: [
    { id: "initial", speaker: "ai", text: greeting }, ...data.conversations
  ] };
}

export async function restoreStoryHistory(api, id) {
  if (!validId(id)) throw new Error("Dữ liệu phiên Story không hợp lệ.");
  const history = await api.get(`${base}/story/sessions/${id}/history`);
  const rows = history.data?.conversations;
  if (!Array.isArray(rows) || !rows.length || rows.some(row =>
    !["ai", "user"].includes(row.type) || typeof row.text !== "string")) {
    throw new Error("Không thể khôi phục hội thoại Story đã lưu.");
  }
  return { sessionId: id, revision: conversationRevision(rows), conversation: rows, resumed: true };
}

async function loadStory(api, forceNew, sessionId) {
  if (!forceNew) {
    const { data } = await api.get(`${base}/story/active-session`);
    if (!data || !("active_session" in data)) throw new Error("Dữ liệu phiên Story không hợp lệ.");
    if (data.active_session !== null) {
      return restoreStoryHistory(api, data.active_session.session_id);
    }
  }
  if (forceNew && !validId(sessionId)) throw new Error("Thiếu phiên Story cần thay thế.");
  const { data } = await api.post(`${base}/story/sessions`, forceNew ? { replace_session_id: sessionId } : {});
  // Another tab may have created the session after our initial GET returned null.
  if (data?.resumed === true) return restoreStoryHistory(api, data.session_id);
  if (!validId(data?.session_id) || !validId(data.revision) || typeof data.initial_message !== "string" || !data.initial_message.trim()) {
    throw new Error("Không thể tạo phiên Story.");
  }
  return { sessionId: data.session_id, revision: Number(data.revision), resumed: false, conversation: [
    { id: "initial", type: "ai", text: data.initial_message, timestamp: new Date() }
  ] };
}

// Scope in-flight requests to one component, never share a session across accounts.
export function createStoryInitializer(api) {
  let pending;
  return ({ forceNew = false, sessionId = null } = {}) => {
    if (forceNew) return loadStory(api, true, sessionId);
    if (!pending) pending = loadStory(api, false).finally(() => { pending = null; });
    return pending;
  }
}
