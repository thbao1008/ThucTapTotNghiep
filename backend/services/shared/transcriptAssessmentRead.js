import { validateAssessmentContract } from "./assessmentContract.js";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isScore(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function normalizeStoredScore(value) {
  if (typeof value === "number") return isScore(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    const score = Number(value);
    return isScore(score) ? score : null;
  }
  return null;
}

function isCompletedTranscriptLegacy(contract) {
  return isRecord(contract) &&
    contract.type === "transcript_language_analysis" &&
    ["openrouter", "groq"].includes(contract.source) &&
    contract.method === "llm_transcript_analysis" &&
    contract.scale === "0-100" &&
    contract.status === "completed" &&
    isRecord(contract.metrics) &&
    isScore(contract.metrics.language_quality) &&
    (contract.metrics.pronunciation === null || contract.metrics.pronunciation === undefined) &&
    (contract.metrics.fluency === null || contract.metrics.fluency === undefined);
}

export function resolveTranscriptAssessmentRead({
  rawResponse,
  overallScore
} = {}) {
  const response = isRecord(rawResponse) ? rawResponse : {};
  const legacy = response.assessment_contract ?? null;
  const canonical = response.canonical_assessment_contract ?? null;
  const hasCanonical = canonical !== null;
  const isTranscriptAssessment =
    legacy?.type === "transcript_language_analysis" ||
    canonical?.assessment_type === "transcript_language_analysis";
  if (!isTranscriptAssessment) {
    return {
      legacy,
      canonical: null,
      overallScore,
      rawResponse: response,
      consistent: true
    };
  }

  const legacyIsCompletedTranscript = isCompletedTranscriptLegacy(legacy);
  const legacyScore = legacyIsCompletedTranscript
    ? legacy.metrics.language_quality
    : null;
  const hasOverallScore = overallScore !== undefined;
  const normalizedOverallScore = normalizeStoredScore(overallScore);

  let canonicalIsValid = false;
  if (hasCanonical) {
    const validation = validateAssessmentContract(canonical);
    canonicalIsValid = validation.valid &&
      canonical.assessment_type === "transcript_language_analysis" &&
      canonical.status === "completed" &&
      canonical.result_kind === "scored" &&
      isScore(canonical.score);
  }

  const sourcesMatch = legacyIsCompletedTranscript &&
    (!hasOverallScore || (
      normalizedOverallScore !== null &&
      normalizedOverallScore === legacyScore
    )) &&
    (!hasCanonical || (
      canonicalIsValid &&
      canonical.score === legacyScore &&
      (!hasOverallScore || canonical.score === normalizedOverallScore)
    ));

  const legacyHasCompletedClaim = isRecord(legacy) && legacy.status === "completed";
  const markLegacyUnverified = legacyHasCompletedClaim && !sourcesMatch;
  const serializedLegacy = markLegacyUnverified
    ? { ...legacy, status: "legacy_unverified" }
    : legacy;
  const serializedResponse = markLegacyUnverified || (hasCanonical && !sourcesMatch)
    ? {
        ...response,
        ...(legacy !== null ? { assessment_contract: serializedLegacy } : {}),
        ...(hasCanonical && !sourcesMatch ? { canonical_assessment_contract: null } : {})
      }
    : response;

  return {
    legacy: serializedLegacy,
    canonical: sourcesMatch && hasCanonical ? canonical : null,
    overallScore: sourcesMatch
      ? (hasOverallScore ? normalizedOverallScore : overallScore)
      : null,
    rawResponse: serializedResponse,
    consistent: sourcesMatch
  };
}
