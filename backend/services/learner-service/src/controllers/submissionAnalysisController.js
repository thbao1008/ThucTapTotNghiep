export function createAnalyzeSubmissionHandler({
  analyzeSubmissionWithAI,
  getSubmissionById,
  getAnalysisBySubmissionId
} = {}) {
  if (
    typeof analyzeSubmissionWithAI !== "function" ||
    typeof getSubmissionById !== "function" ||
    typeof getAnalysisBySubmissionId !== "function"
  ) {
    throw new TypeError("Submission analysis controller dependencies are required");
  }

  return async function analyzeSubmission(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid submission id" });
      }

      await analyzeSubmissionWithAI(id);
      const [submission, analysis] = await Promise.all([
        getSubmissionById(id),
        getAnalysisBySubmissionId(id)
      ]);
      return res.json({ submission, analysis });
    } catch (err) {
      console.error("analyzeSubmission error: - learnerController.js:364", err);
      return res.status(500).json({ message: "Server error" });
    }
  };
}
