export async function retrySubmission(api, submissionId) {
  const { data } = await api.post(`/learners/submissions/${submissionId}/retry`, {});
  if (String(data?.submissionId) !== String(submissionId)) throw new Error("Phản hồi xử lý lại không hợp lệ. Hãy tải lại bài nộp.");
  const response = await api.get(`/learners/submissions/${submissionId}`);
  const submission = response.data?.submission;
  if (String(submission?.id) !== String(submissionId)) throw new Error("Không thể xác minh bài nộp sau khi yêu cầu xử lý lại.");
  return submission;
}
