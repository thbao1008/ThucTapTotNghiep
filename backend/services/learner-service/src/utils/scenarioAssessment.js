import { createAssessmentContract, normalizeOptionalScore } from "./assessmentContract.js";

export function parseScenarioScoreResponse(content) {
  let scoreData;
  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
      content.match(/```\s*([\s\S]*?)\s*```/);
    scoreData = JSON.parse(jsonMatch ? jsonMatch[1] : content);
  } catch {
    throw Object.assign(new Error("AI returned malformed scenario score JSON"), {
      status: 502,
      code: "AI_RESPONSE_INVALID"
    });
  }

  if (
    !Number.isFinite(scoreData?.final_score) ||
    scoreData.final_score < 0 ||
    scoreData.final_score > 100 ||
    typeof scoreData.feedback !== "string" ||
    !scoreData.feedback.trim()
  ) {
    throw Object.assign(new Error("AI returned an invalid scenario score"), {
      status: 502,
      code: "AI_RESPONSE_INVALID"
    });
  }

  return scoreData;
}

export function normalizeScenarioAssessment(scoreData, { provider = 'groq', model = null } = {}) {
  if (provider !== 'groq') {
    throw Object.assign(new Error('Unsupported scenario assessment provider'), { status: 502, code: 'AI_RESPONSE_INVALID' });
  }
  const assessmentContract = createAssessmentContract({
    type: "scenario_task_alignment",
    source: provider,
    method: "transcript_and_interaction_analysis",
    scale: "0-100",
    metricScales: {
      final_score: "0-100",
      reasonableness_score: "0-40",
      reflex_score: "0-30",
      task_completion_score: "0-20",
      independence_score: "0-10",
      base_score: "0-100",
      hints_penalty: "0-100",
      pronunciation: "not_assessed",
      fluency: "not_assessed"
    },
    status: "completed",
    metrics: {
      final_score: scoreData.final_score,
      base_score: normalizeOptionalScore(scoreData.base_score),
      hints_penalty: normalizeOptionalScore(scoreData.hints_penalty),
      reasonableness_score: normalizeOptionalScore(scoreData.reasonableness_score, { max: 40 }),
      reflex_score: normalizeOptionalScore(scoreData.reflex_score, { max: 30 }),
      task_completion_score: normalizeOptionalScore(scoreData.task_completion_score, { max: 20 }),
      independence_score: normalizeOptionalScore(scoreData.independence_score, { max: 10 }),
      pronunciation: null,
      fluency: null
    }
  });

  return {
    ...scoreData,
    pronunciation_score: null,
    fluency_score: null,
    pronunciation_assessed: false,
    fluency_assessed: false,
    provider_metadata: { provider, model: typeof model === 'string' ? model : null },
    assessment_contract: assessmentContract
  };
}
