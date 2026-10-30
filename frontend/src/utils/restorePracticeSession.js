export async function restorePracticeSession(api, sessionId) {
  const id = Number(sessionId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Mã bài luyện tập không hợp lệ.");
  const { data } = await api.get(`/learners/speaking-practice/sessions/${id}/summary`);
  if (Number(data?.session?.id) !== id || !Array.isArray(data?.rounds) || data.rounds.length > 10 ||
      !["processing", "failed", "completed"].includes(data?.summary?.status)) {
    throw new Error("Không thể khôi phục dữ liệu bài luyện tập. Vui lòng thử lại.");
  }
  const numbers = data.rounds.map(round => Number(round.round_number)).sort((a, b) => a - b);
  if (numbers.some((number, index) => number !== index + 1)) {
    throw new Error("Dữ liệu vòng luyện tập bị thiếu hoặc trùng. Vui lòng thử lại.");
  }
  return {
    rounds: data.rounds,
    currentRound: data.rounds.length,
    sessionData: { ...data.session, summary: data.summary }
  };
}
