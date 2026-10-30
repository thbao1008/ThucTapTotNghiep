import { getSubmissionAiFeedback } from './submissionAiFeedback.js';

const positiveId = value => /^(?:[1-9]\d*)$/.test(String(value)) && Number.isSafeInteger(Number(value));

// The API serializer marks inconsistent/legacy scores unverified. Keep that
// boundary here too: participation, a Mentor review or text alone is not an AI score.
export function getVerifiedAiFeedback(submission) {
  const contract=submission?.ai_assessment_contract;
  const score=contract?.metrics?.language_quality;
  if (!positiveId(submission?.id) || !['completed','reviewed'].includes(submission.status)
    || contract?.type!=='transcript_language_analysis' || !['groq','openrouter'].includes(contract.source)
    || contract.method!=='llm_transcript_analysis' || contract.scale!=='0-100' || contract.status!=='completed'
    || typeof score!=='number' || !Number.isFinite(score) || score<0 || score>100
    || submission.overall_score!==score
    || contract.metrics.pronunciation!=null || contract.metrics.fluency!=null) return null;
  const {feedback,suggestions}=getSubmissionAiFeedback(submission);
  return {
    submissionId:submission.id,score,feedback,suggestions,
    title:typeof submission.challenge_title==='string'&&submission.challenge_title.trim()
      ? submission.challenge_title.trim() : `Bài nộp #${submission.id}`,
    challengePath:positiveId(submission.challenge_id)?`/learn/challenges/${submission.challenge_id}`:null
  };
}

export async function loadLearnerSubmissions(api, learnerId, { signal } = {}) {
  const submissions = [];
  const seen = new Set();
  const limit = 100;
  let offset = 0;
  while (true) {
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
    const { data } = await api.get(`/learners/${learnerId}/submissions`, {
      params: { limit, offset }, signal
    });
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
    const rows = data?.submissions;
    if (!Array.isArray(rows) || typeof data?.pagination?.has_more !== "boolean") {
      throw new Error("Không thể tải đầy đủ lịch sử bài nộp. Vui lòng thử lại.");
    }
    let added = 0;
    for (const row of rows) {
      if (!row || !positiveId(row.id)) {
        throw new Error("Dữ liệu lịch sử bài nộp không hợp lệ.");
      }
      const key = String(row.id);
      if (seen.has(key)) continue;
      seen.add(key);
      submissions.push(row);
      added += 1;
    }
    if (!data.pagination.has_more) return submissions;
    if (!added) throw new Error("Không thể tải trang tiếp theo của lịch sử bài nộp.");
    offset += rows.length;
  }
}

// Keep detail requests bounded so a long submission history cannot flood the API.
export async function loadMentorFeedback(api, submissions, { signal } = {}) {
  if (!Array.isArray(submissions) || submissions.some(sub => !sub || !positiveId(sub.id))) throw new Error("Invalid submission list");
  const feedbacks = [];
  const details = {};
  let failedCount = 0;
  for (let offset = 0; offset < submissions.length; offset += 4) {
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
    const batch = submissions.slice(offset, offset + 4);
    const results = await Promise.allSettled(batch.map(sub =>
      api.get(`/learners/submissions/${sub.id}`, { signal })
    ));
    for (let i = 0; i < results.length; i += 1) {
      const result = results[i];
      if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
      if (result.status === "rejected") {
        if ([401, 403].includes(result.reason?.response?.status)) throw result.reason;
        failedCount += 1;
        continue;
      }
      const submission = result.value.data?.submission || result.value.data;
      const listed = batch[i];
      if (!submission || typeof submission !== "object" || Array.isArray(submission)
          || !positiveId(submission.id) || String(submission.id) !== String(listed.id)) {
        failedCount += 1;
        continue;
      }
      // AI-first results remain accessible even when the optional human review
      // does not exist. Existing Mentor rows keep their independent semantics.
      if (getVerifiedAiFeedback(submission)) details[listed.id] = submission;
      if (!submission.mentor_review) continue;
      if (typeof submission.mentor_review !== 'object' || Array.isArray(submission.mentor_review)) {
        failedCount += 1; continue;
      }
      feedbacks.push({
        ...submission.mentor_review,
        submission_id: listed.id,
        challenge_title: submission.challenge_title || listed.title || submission.challenge?.title,
        submission_created_at: submission.submitted_at || listed.submitted_at || listed.created_at
      });
      details[listed.id] = submission;
    }
  }
  return { feedbacks, details, failedCount };
}
