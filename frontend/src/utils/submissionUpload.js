const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;

export function createSubmissionUpload(api, { learnerId, challengeId }) {
  let attempt = null;
  let busy = false;
  let finished = false;
  const resultFrom = (data, processingFailed = false) => {
    if (!positiveId(data?.submissionId)) throw new Error("Phản hồi nộp bài không hợp lệ. Hãy kiểm tra lịch sử trước khi nộp lại.");
    return { submissionId: data.submissionId, audio_url: data.audio_url ?? null, processingFailed };
  };
  return {
    async prepare() {
      const { data } = await api.get(`/learners/submissions/next-attempt?challenge_id=${challengeId}`);
      if (String(data?.challenge_id) !== String(challengeId) || !positiveId(data.next_attempt_number)) {
        throw new Error("Không thể xác định lượt nộp bài.");
      }
      attempt = Number(data.next_attempt_number);
    },
    async submit(audioBlob) {
      if (busy || finished) return null;
      if (!attempt || !audioBlob) throw new Error("Chưa sẵn sàng nộp bài.");
      busy = true;
      try {
        const form = new FormData();
        form.append("learner_id", learnerId);
        form.append("challenge_id", challengeId);
        form.append("expected_attempt_number", attempt);
        form.append("file", audioBlob.type ? audioBlob : new Blob([audioBlob], { type: "audio/webm" }), `record-${Date.now()}.webm`);
        const response = await api.post("/learners/submissions", form);
        const result = resultFrom(response.data);
        finished = true;
        return result;
      } catch (error) {
        if (error.response?.status === 503 && positiveId(error.response.data?.submissionId)) {
          finished = true;
          return resultFrom(error.response.data, true);
        }
        if (error.response?.status === 409) {
          finished = true;
          throw Object.assign(new Error("Đã có bài nộp mới. Hãy đóng biểu mẫu và kiểm tra lịch sử trước khi nộp lại."), { code: "SUBMISSION_ATTEMPT_CHANGED" });
        }
        if (error.request && !error.response) {
          throw Object.assign(new Error("Chưa xác định bài đã được lưu hay chưa. Hãy kiểm tra lịch sử; nếu thử lại, hệ thống sẽ giữ nguyên lượt nộp."), { code: "SUBMISSION_OUTCOME_UNKNOWN" });
        }
        // Keep the SAME attempt on a timeout/retry; never silently advance it.
        throw error;
      } finally { busy = false; }
    }
  };
}
