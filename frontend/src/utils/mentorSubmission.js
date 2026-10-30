function assertActive(signal) {
  if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
}

function positiveId(value) {
  const id = /^(?:[1-9]\d*)$/.test(String(value)) ? Number(value) : Number.NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function resolveMentorId(api, userId, { signal } = {}) {
  assertActive(signal);
  const id = positiveId(userId);
  if (!id) throw new Error("Không tìm thấy người dùng đăng nhập");
  const { data } = await api.get(`/mentors/by-user/${id}`, { signal });
  assertActive(signal);
  const mentorId = positiveId(data?.mentor_id ?? data?.id);
  if (!mentorId) throw new Error("Không tìm thấy mentor tương ứng");
  return mentorId;
}

export async function loadMentorSubmission(api, mentorId, submissionId, { signal } = {}) {
  assertActive(signal);
  const mid = positiveId(mentorId);
  const sid = positiveId(submissionId);
  if (!mid || !sid) throw new Error("Mentor hoặc bài nộp không hợp lệ");
  const { data } = await api.get(`/mentors/${mid}/submissions/${sid}`, { signal });
  assertActive(signal);
  const detail = data?.submission;
  if (!detail || typeof detail !== "object" || Array.isArray(detail) || positiveId(detail.id) !== sid) {
    throw Object.assign(new Error("Submission detail does not match request"), { code: "SUBMISSION_DETAIL_MISMATCH" });
  }
  return detail;
}
