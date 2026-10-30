import { resolveTranscriptAssessmentRead } from "@aesp/assessment-contract";

export function serializeMentorTranscriptAssessment(row, rawResponse) {
  const assessment = resolveTranscriptAssessmentRead({
    rawResponse,
    overallScore: row.overall_score
  });

  return {
    overall_score: assessment.overallScore,
    score: assessment.overallScore,
    ai_overall_score: assessment.overallScore,
    ai_assessment_contract: assessment.legacy,
    ai_raw_response: assessment.rawResponse
  };
}
