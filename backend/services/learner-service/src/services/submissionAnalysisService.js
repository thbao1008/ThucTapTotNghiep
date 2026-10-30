export function createSubmissionAnalysisService({
  getSubmission,
  analyzeTranscript,
  persistAnalysis
} = {}) {
  if (
    typeof getSubmission !== "function" ||
    typeof analyzeTranscript !== "function" ||
    typeof persistAnalysis !== "function"
  ) {
    throw new TypeError("Submission analysis dependencies are required");
  }

  return {
    async analyzeSubmissionWithAI(submissionId) {
      const submission = await getSubmission(submissionId);
      if (!submission || !submission.transcript) {
        throw new Error("Transcript not found");
      }

      try {
        const result = await analyzeTranscript(submission.transcript, {
          runTopicDetection: true,
          challenge: null
        });
        return await persistAnalysis(submissionId, result);
      } catch (err) {
        console.error("Error calling AI Service:", err);
        throw err;
      }
    }
  };
}
