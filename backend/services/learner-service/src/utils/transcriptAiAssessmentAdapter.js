import { createAssessmentContract } from "./assessmentContract.js";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidTranscriptAssessment(details) {
  return Object.assign(new TypeError("Transcript AI assessment cannot be adapted"), {
    code: "ASSESSMENT_RESULT_INVALID",
    details
  });
}

export function adaptTranscriptAiAssessmentToCanonical(analysis, { assessedAt } = {}) {
  if (!isRecord(analysis) || !isRecord(analysis.assessment_contract)) {
    throw invalidTranscriptAssessment(["completed transcript assessment metadata is required"]);
  }

  const legacy = analysis.assessment_contract;
  if (
    legacy.type !== "transcript_language_analysis" ||
    !["openrouter", "groq"].includes(legacy.source) ||
    legacy.method !== "llm_transcript_analysis" ||
    legacy.scale !== "0-100" ||
    legacy.status !== "completed" ||
    analysis.assessment_scope !== "transcript_only"
  ) {
    throw invalidTranscriptAssessment(["input must be a completed transcript-only result on the API 0-100 scale"]);
  }

  const score = analysis.overall_score;
  if (
    typeof score !== "number" ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100 ||
    legacy.metrics?.language_quality !== score
  ) {
    throw invalidTranscriptAssessment(["overall_score must be a finite 0-100 number matching language_quality"]);
  }
  if (
    analysis.pronunciation_score !== null ||
    analysis.fluency_score !== null ||
    legacy.metrics?.pronunciation !== null ||
    legacy.metrics?.fluency !== null
  ) {
    throw invalidTranscriptAssessment(["transcript-only results cannot include acoustic scores"]);
  }
  if (
    analysis.pronunciation_assessed !== false ||
    analysis.fluency_assessed !== false
  ) {
    throw invalidTranscriptAssessment(["transcript-only results must explicitly leave acoustic metrics unassessed"]);
  }
  if (typeof assessedAt !== "string" || !assessedAt.trim()) {
    throw invalidTranscriptAssessment(["an explicitly sourced assessedAt timestamp is required"]);
  }

  return createAssessmentContract({
    mode: "canonical",
    assessment_type: "transcript_language_analysis",
    source: "ai",
    method: "llm_transcript_analysis",
    status: "completed",
    result_kind: "scored",
    score,
    scale_min: 0,
    scale_max: 100,
    metrics: {
      language_quality: {
        value: score,
        scale_min: 0,
        scale_max: 100,
        status: "assessed"
      },
      pronunciation: {
        value: null,
        scale_min: null,
        scale_max: null,
        status: "not_assessed"
      },
      fluency: {
        value: null,
        scale_min: null,
        scale_max: null,
        status: "not_assessed"
      }
    },
    assessed_at: assessedAt,
    version: 1,
    error_code: null,
    provenance: {
      input_type: "transcript",
      provider: legacy.source
    }
  });
}
