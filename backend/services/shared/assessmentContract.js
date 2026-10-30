export function normalizeOptionalScore(
  value,
  {
    min = 0,
    max = 100,
    allowNumericString = false
  } = {}
) {
  if (
    allowNumericString &&
    typeof value === "string" &&
    value.trim().length > 0 &&
    Number.isFinite(Number(value))
  ) {
    value = Number(value);
  }
  if (typeof value !== "number") {
    return null;
  }

  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

export function createLegacyAssessmentContract(options = {}) {
  if (!isRecord(options)) {
    throw Object.assign(new TypeError("Assessment contract input must be an object"), {
      code: "ASSESSMENT_CONTRACT_INVALID",
      details: ["assessment contract input must be an object"]
    });
  }
  if (options.mode !== undefined && options.mode !== "legacy") {
    throw Object.assign(new TypeError("Legacy assessment contract mode is invalid"), {
      code: "ASSESSMENT_CONTRACT_INVALID",
      details: ["legacy contract mode must be 'legacy'"]
    });
  }
  if ([...CANONICAL_INPUT_FIELDS].some(field => Object.hasOwn(options, field))) {
    throw Object.assign(new TypeError("Legacy contract cannot contain canonical fields"), {
      code: "ASSESSMENT_CONTRACT_INVALID",
      details: ["canonical fields are not allowed in legacy contract input"]
    });
  }
  const {
    type,
    source,
    method,
    scale,
    metricScales = null,
    status,
    metrics,
    error = null
  } = options;
  return {
    type,
    source,
    method,
    scale,
    ...(metricScales ? { metric_scales: metricScales } : {}),
    status,
    metrics,
    error
  };
}

const CANONICAL_INPUT_FIELDS = new Set([
  "assessment_type",
  "result_kind",
  "score",
  "scale_min",
  "scale_max",
  "assessed_at",
  "version",
  "error_code",
  "provenance"
]);
const LEGACY_INPUT_FIELDS = new Set([
  "type",
  "scale",
  "metricScales",
  "status",
  "metrics",
  "error"
]);

export function createAssessmentContract(options = {}) {
  if (!isRecord(options)) {
    throw Object.assign(new TypeError("Assessment contract input must be an object"), {
      code: "ASSESSMENT_CONTRACT_INVALID",
      details: ["assessment contract input must be an object"]
    });
  }

  if (options.mode === "legacy") {
    if ([...CANONICAL_INPUT_FIELDS].some(field => Object.hasOwn(options, field))) {
      throw Object.assign(new TypeError("Legacy mode cannot contain canonical fields"), {
        code: "ASSESSMENT_CONTRACT_INVALID",
        details: ["canonical fields are not allowed in legacy mode"]
      });
    }
    return createLegacyAssessmentContract(options);
  }
  if (options.mode !== undefined && options.mode !== "canonical") {
    throw Object.assign(new TypeError("Assessment contract mode is invalid"), {
      code: "ASSESSMENT_CONTRACT_INVALID",
      details: ["mode must be 'canonical' or 'legacy'"]
    });
  }

  const hasCanonicalFields = [...CANONICAL_INPUT_FIELDS]
    .some(field => Object.hasOwn(options, field));
  if (options.mode !== "canonical" && hasCanonicalFields) {
    throw Object.assign(new TypeError("Canonical assessment contract mode must be explicit"), {
      code: "ASSESSMENT_CONTRACT_INVALID",
      details: ["canonical input requires mode 'canonical'"]
    });
  }
  if (options.mode !== "canonical") {
    const hasLegacyFields = [...LEGACY_INPUT_FIELDS]
      .some(field => Object.hasOwn(options, field));
    if (!hasLegacyFields) {
      throw Object.assign(new TypeError("Assessment contract mode must be explicit"), {
        code: "ASSESSMENT_CONTRACT_INVALID",
        details: ["use mode 'canonical' or provide legacy-shaped input"]
      });
    }
    return createLegacyAssessmentContract(options);
  }
  const legacyFields = ["type", "scale", "metricScales", "error"];
  const mixedFields = legacyFields.filter(field => Object.hasOwn(options, field));
  if (mixedFields.length > 0) {
    throw Object.assign(new TypeError("Canonical contract cannot contain legacy fields"), {
      code: "ASSESSMENT_CONTRACT_INVALID",
      details: mixedFields.map(field => `${field} is not allowed in canonical mode`)
    });
  }

  const canonicalContract = {
    assessment_type: options.assessment_type,
    source: options.source,
    method: options.method,
    status: options.status,
    result_kind: options.result_kind,
    score: options.score === undefined ? null : options.score,
    scale_min: options.scale_min === undefined ? null : options.scale_min,
    scale_max: options.scale_max === undefined ? null : options.scale_max,
    metrics: options.metrics === undefined ? {} : options.metrics,
    assessed_at: options.assessed_at === undefined ? null : options.assessed_at,
    // Contract format version only; model, prompt, and rubric versions are separate concerns.
    version: options.version === undefined ? 1 : options.version,
    error_code: options.error_code === undefined ? null : options.error_code,
    provenance: options.provenance === undefined ? {} : options.provenance
  };
  const validation = validateAssessmentContract(canonicalContract);
  if (!validation.valid) {
    throw Object.assign(new TypeError("Assessment contract is invalid"), {
      code: "ASSESSMENT_CONTRACT_INVALID",
      details: validation.errors
    });
  }
  return canonicalContract;
}

const ASSESSMENT_STATUSES = new Set([
  "pending",
  "processing",
  "completed",
  "failed",
  "not_assessed",
  "legacy_unverified"
]);
const RESULT_KINDS = new Set(["scored", "feedback_only"]);
const ERROR_CODES = new Set([
  "ASSESSMENT_CONVERSION_INVALID",
  "ASSESSMENT_RESULT_INVALID",
  "AI_ANALYSIS_INVALID_RESPONSE",
  "AI_RESPONSE_INVALID",
  "MENTOR_SCORE_INVALID",
  "SPEAKING_ASSESSMENT_INCOMPLETE",
  "TRANSCRIPT_UNAVAILABLE"
]);
const INPUT_TYPES = new Set([
  "transcript",
  "conversation",
  "human_review"
]);
const PROVIDERS = new Set(["openrouter", "groq", "deterministic", "mentor"]);
const REFERENCE_TYPES = new Set(["prompt", "challenge", "scenario"]);
const PROVENANCE_FIELDS = new Set([
  "input_type",
  "provider",
  "reference_type",
  "conversion"
]);
const ASSESSMENT_METHODS = new Map([
  ["content_matching", { method: "transcript_prompt_word_match", source: "deterministic", metric: "content_match", input_type: "transcript", reference_type: "prompt" }],
  ["transcript_language_analysis", { method: "llm_transcript_analysis", source: "ai", metric: "language_quality", input_type: "transcript", provider: "groq" }],
  ["scenario_task_alignment", { method: "transcript_and_interaction_analysis", source: "ai", metric: "final_score", input_type: "conversation", provider: "groq", reference_type: "scenario" }],
  ["mentor_review", { method: "human_review", source: "mentor", metric: "final_score", input_type: "human_review", reference_type: "challenge" }],
  ["mentor_feedback", { method: "human_comment", source: "mentor", metric: null, input_type: "human_review", reference_type: "challenge" }]
]);
const COMMON_UNASSESSED_METRICS = new Set(["pronunciation", "fluency"]);
const ASSESSMENT_METRICS = new Map([
  ["content_matching", new Set(["content_match"])],
  ["transcript_language_analysis", new Set(["language_quality"])],
  ["scenario_task_alignment", new Set([
    "final_score",
    "base_score",
    "hints_penalty",
    "reasonableness_score",
    "reflex_score",
    "task_completion_score",
    "independence_score"
  ])],
  ["mentor_review", new Set(["final_score"])],
  ["mentor_feedback", new Set()]
]);
const METRIC_SCALES = new Map([
  ["content_matching", { content_match: [0, 100] }],
  ["transcript_language_analysis", { language_quality: [0, 100] }],
  ["scenario_task_alignment", {
    final_score: [0, 100],
    base_score: [0, 100],
    hints_penalty: [0, 100],
    reasonableness_score: [0, 40],
    reflex_score: [0, 30],
    task_completion_score: [0, 20],
    independence_score: [0, 10]
  }],
  ["mentor_review", { final_score: [0, 100] }],
  ["mentor_feedback", {}]
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidTimestamp(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    return false;
  }
  const [, year, month, day, hour, minute, second] = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/
  );
  const calendarDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return calendarDate.getUTCFullYear() === Number(year) &&
    calendarDate.getUTCMonth() === Number(month) - 1 &&
    calendarDate.getUTCDate() === Number(day) &&
    Number(hour) <= 23 &&
    Number(minute) <= 59 &&
    Number(second) <= 59;
}

function isValidScale(min, max) {
  return typeof min === "number" &&
    Number.isFinite(min) &&
    typeof max === "number" &&
    Number.isFinite(max) &&
    min < max;
}

function validateProvenance(provenance, assessmentType, errors) {
  if (!isRecord(provenance)) {
    errors.push("provenance must be an object");
    return;
  }

  for (const key of Object.keys(provenance)) {
    addError(errors, PROVENANCE_FIELDS.has(key), `provenance.${key} is not allowed`);
  }

  const methodSpec = ASSESSMENT_METHODS.get(assessmentType);
  if (!methodSpec) {
    errors.push("assessment_type is not supported");
    return;
  }

  for (const field of ["input_type", "provider", "reference_type"]) {
    if (methodSpec[field] !== undefined && Object.hasOwn(provenance, field)) {
      const matches = field === "provider" && assessmentType === "transcript_language_analysis"
        ? ["openrouter", "groq"].includes(provenance[field]) : provenance[field] === methodSpec[field];
      addError(errors, matches, `provenance.${field} does not match the supported assessment method`);
    }
  }

  if (Object.hasOwn(provenance, "input_type")) {
    addError(errors, INPUT_TYPES.has(provenance.input_type), "provenance.input_type is not allowed");
  }
  if (Object.hasOwn(provenance, "provider")) {
    addError(errors, PROVIDERS.has(provenance.provider), "provenance.provider is not allowed");
  }
  if (Object.hasOwn(provenance, "reference_type")) {
    addError(errors, REFERENCE_TYPES.has(provenance.reference_type), "provenance.reference_type is not allowed");
  }
  if (Object.hasOwn(provenance, "conversion")) {
    validateConversion(provenance.conversion, errors);
  }
}

function addError(errors, condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function validateMetric(metricName, metric, errors, contract) {
  if (!isRecord(metric)) {
    errors.push(`metrics.${metricName} must be an object`);
    return;
  }

  for (const key of Object.keys(metric)) {
    addError(
      errors,
      ["value", "scale_min", "scale_max", "status"].includes(key),
      `metrics.${metricName}.${key} is not allowed`
    );
  }

  const supportedMetrics = ASSESSMENT_METRICS.get(contract.assessment_type);
  addError(
    errors,
    supportedMetrics?.has(metricName) === true || COMMON_UNASSESSED_METRICS.has(metricName),
    `metrics.${metricName} is not supported for this assessment type`
  );

  if (!["assessed", "not_assessed"].includes(metric.status)) {
    errors.push(`metrics.${metricName}.status is invalid`);
    return;
  }

  if (metric.status === "not_assessed") {
    addError(errors, metric.value === null, `metrics.${metricName}.value must be null when not assessed`);
    addError(errors, metric.scale_min === null, `metrics.${metricName}.scale_min must be null when not assessed`);
    addError(errors, metric.scale_max === null, `metrics.${metricName}.scale_max must be null when not assessed`);
    return;
  }

  addError(errors, contract.status === "completed", `metrics.${metricName} cannot be assessed unless the contract is completed`);
  addError(errors, contract.result_kind === "scored", `metrics.${metricName} cannot be assessed for feedback_only results`);
  if (COMMON_UNASSESSED_METRICS.has(metricName)) {
    errors.push(`metrics.${metricName} has no approved assessment method`);
  }
  addError(errors, typeof metric.value === "number" && Number.isFinite(metric.value), `metrics.${metricName}.value must be a finite number`);
  addError(errors, isValidScale(metric.scale_min, metric.scale_max), `metrics.${metricName} requires valid scale bounds`);
  const approvedScale = METRIC_SCALES.get(contract.assessment_type)?.[metricName];
  if (approvedScale) {
    addError(errors, metric.scale_min === approvedScale[0], `metrics.${metricName}.scale_min is not approved`);
    addError(errors, metric.scale_max === approvedScale[1], `metrics.${metricName}.scale_max is not approved`);
  }
  if (
    typeof metric.value === "number" &&
    Number.isFinite(metric.value) &&
    isValidScale(metric.scale_min, metric.scale_max)
  ) {
    addError(
      errors,
      metric.value >= metric.scale_min && metric.value <= metric.scale_max,
      `metrics.${metricName}.value is outside its scale`
    );
  }
}

function validateConversion(conversion, errors) {
  if (!isRecord(conversion)) {
    errors.push("provenance.conversion must be an object");
    return;
  }

  const sourceScaleValid = isValidScale(conversion.source_min, conversion.source_max);
  const targetScaleValid = isValidScale(conversion.target_min, conversion.target_max);
  addError(errors, sourceScaleValid, "conversion requires valid source scale bounds");
  addError(errors, targetScaleValid, "conversion requires valid target scale bounds");
  addError(
    errors,
    conversion.method === "linear_scale_conversion",
    "conversion method is not approved"
  );
  for (const key of Object.keys(conversion)) {
    addError(
      errors,
      ["source_min", "source_max", "target_min", "target_max", "method"].includes(key),
      `conversion.${key} is not allowed`
    );
  }
}

export function validateAssessmentContract(contract) {
  const errors = [];
  if (!isRecord(contract)) {
    return { valid: false, errors: ["assessment contract must be an object"] };
  }

  const requiredFields = [
    "assessment_type",
    "source",
    "method",
    "status",
    "result_kind",
    "score",
    "scale_min",
    "scale_max",
    "metrics",
    "assessed_at",
    "version",
    "error_code",
    "provenance"
  ];
  for (const field of requiredFields) {
    addError(errors, Object.hasOwn(contract, field), `${field} is required`);
  }
  for (const field of Object.keys(contract)) {
    addError(errors, requiredFields.includes(field), `${field} is not allowed`);
  }

  for (const field of ["assessment_type", "source", "method"]) {
    addError(errors, typeof contract[field] === "string" && contract[field].trim().length > 0, `${field} must be a non-empty string`);
  }
  addError(errors, ASSESSMENT_STATUSES.has(contract.status), "status is invalid");
  addError(errors, RESULT_KINDS.has(contract.result_kind), "result_kind is invalid");
  addError(errors, Number.isInteger(contract.version) && contract.version > 0, "version must be a positive integer");
  addError(errors, contract.error_code === null || ERROR_CODES.has(contract.error_code), "error_code is not an approved internal code");
  addError(errors, isRecord(contract.metrics), "metrics must be an object");
  addError(errors, isRecord(contract.provenance), "provenance must be an object");

  const methodSpec = ASSESSMENT_METHODS.get(contract.assessment_type);
  addError(errors, methodSpec !== undefined, "assessment_type is not supported");
  if (methodSpec) {
    addError(errors, contract.method === methodSpec.method, "method is not approved for assessment_type");
    addError(errors, contract.source === methodSpec.source, "source is not approved for assessment_type");
  }
  if (contract.status === "completed" && contract.result_kind === "scored") {
    addError(errors, typeof contract.score === "number" && Number.isFinite(contract.score), "completed scored assessment requires a finite numeric score");
    addError(errors, isValidScale(contract.scale_min, contract.scale_max), "completed scored assessment requires valid scale bounds");
    addError(errors, isValidTimestamp(contract.assessed_at), "completed assessment requires a valid assessed_at timestamp");
    if (
      typeof contract.score === "number" &&
      Number.isFinite(contract.score) &&
      isValidScale(contract.scale_min, contract.scale_max)
    ) {
      addError(
        errors,
        contract.score >= contract.scale_min && contract.score <= contract.scale_max,
        "score is outside its scale"
      );
    }
  } else if (contract.status === "completed" && contract.result_kind === "feedback_only") {
    addError(errors, contract.score === null, "completed feedback_only assessment must not have a score");
    addError(errors, contract.scale_min === null, "completed feedback_only assessment must not have scale_min");
    addError(errors, contract.scale_max === null, "completed feedback_only assessment must not have scale_max");
    addError(errors, isValidTimestamp(contract.assessed_at), "completed feedback_only assessment requires a valid assessed_at timestamp");
  } else {
    addError(errors, contract.score === null, `${contract.status} assessment must not have a verified score`);
    addError(errors, contract.scale_min === null, `${contract.status} assessment must not have scale_min`);
    addError(errors, contract.scale_max === null, `${contract.status} assessment must not have scale_max`);
  }
  if (!(contract.status === "completed" && contract.result_kind === "feedback_only")) {
    addError(errors, contract.assessed_at === null || isValidTimestamp(contract.assessed_at), "assessed_at must be null or a valid timestamp");
  }
  if (contract.status === "failed") {
    addError(errors, contract.error_code !== null && ERROR_CODES.has(contract.error_code), "failed assessment requires an approved error_code");
  } else {
    addError(errors, contract.error_code === null, "error_code is only allowed for failed assessments");
  }

  if (isRecord(contract.metrics)) {
    for (const [metricName, metric] of Object.entries(contract.metrics)) {
      validateMetric(metricName, metric, errors, contract);
    }
    if (contract.status === "completed" && contract.result_kind === "scored" && methodSpec?.metric) {
      const primaryMetric = contract.metrics[methodSpec.metric];
      addError(errors, isRecord(primaryMetric), `metrics.${methodSpec.metric} is required`);
      if (isRecord(primaryMetric)) {
        addError(errors, primaryMetric.status === "assessed", `metrics.${methodSpec.metric} must be assessed`);
        addError(errors, primaryMetric.value === contract.score, `metrics.${methodSpec.metric}.value must match score`);
        addError(errors, primaryMetric.scale_min === contract.scale_min, `metrics.${methodSpec.metric}.scale_min must match scale_min`);
        addError(errors, primaryMetric.scale_max === contract.scale_max, `metrics.${methodSpec.metric}.scale_max must match scale_max`);
      }
    }
    if (contract.result_kind === "feedback_only") {
      addError(errors, Object.keys(contract.metrics).length === 0, "feedback_only assessment must not contain score metrics");
    }
  }

  if (isRecord(contract.provenance)) {
    validateProvenance(contract.provenance, contract.assessment_type, errors);
    if (Object.hasOwn(contract.provenance, "conversion")) {
      addError(
        errors,
        contract.status === "completed" && contract.result_kind === "scored",
        "conversion metadata is only allowed for completed scored assessments"
      );
      if (contract.status === "completed" && contract.result_kind === "scored") {
        addError(errors, contract.provenance.conversion?.target_min === contract.scale_min, "conversion target_min must match scale_min");
        addError(errors, contract.provenance.conversion?.target_max === contract.scale_max, "conversion target_max must match scale_max");
      }
    }
    if (contract.status === "completed" && contract.result_kind === "scored") {
      const requiredEvidence = methodSpec
        ? ["input_type", ...(methodSpec.provider ? ["provider"] : []), ...(methodSpec.reference_type ? ["reference_type"] : [])]
        : [];
      for (const field of requiredEvidence) {
        addError(errors, Object.hasOwn(contract.provenance, field), `provenance.${field} is required`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function convertAssessmentScore(score, conversion) {
  const errors = [];
  validateConversion(conversion, errors);
  if (typeof score !== "number" || !Number.isFinite(score)) {
    errors.push("score must be a finite number");
  } else if (
    isValidScale(conversion?.source_min, conversion?.source_max) &&
    (score < conversion.source_min || score > conversion.source_max)
  ) {
    errors.push("score is outside the conversion source scale");
  }
  if (conversion?.method !== "linear_scale_conversion") {
    errors.push("conversion method is unsupported");
  }
  if (errors.length > 0) {
    throw Object.assign(new TypeError("Assessment score conversion is invalid"), {
      code: "ASSESSMENT_CONVERSION_INVALID",
      details: errors
    });
  }

  const sourceRange = conversion.source_max - conversion.source_min;
  const targetRange = conversion.target_max - conversion.target_min;
  const converted = conversion.target_min + ((score - conversion.source_min) / sourceRange) * targetRange;
  if (
    !Number.isFinite(converted) ||
    converted < conversion.target_min ||
    converted > conversion.target_max
  ) {
    throw Object.assign(new TypeError("Converted assessment score is outside the target scale"), {
      code: "ASSESSMENT_CONVERSION_INVALID",
      details: ["converted score is outside target scale"]
    });
  }
  return converted;
}

export function normalizeTranscriptAssessmentForPersistence(analysis) {
  if (analysis?.assessment_contract?.status !== "completed") {
    throw Object.assign(new Error("Transcript assessment is not marked completed"), {
      status: 502,
      code: "ASSESSMENT_RESULT_INVALID"
    });
  }
  const score = normalizeOptionalScore(analysis?.overall_score);
  if (score === null) {
    throw Object.assign(new Error("Transcript assessment has no valid language score"), {
      status: 502,
      code: "ASSESSMENT_RESULT_INVALID"
    });
  }

  return {
    ...analysis,
    overall_score: score,
    pronunciation_score: null,
    fluency_score: null,
    assessment_contract: createAssessmentContract({
      ...(analysis.assessment_contract ?? {}),
      type: "transcript_language_analysis",
      source: analysis.assessment_contract.source === "groq" ? "groq" : "openrouter",
      method: "llm_transcript_analysis",
      scale: "0-100",
      status: "completed",
      metrics: {
        ...(analysis.assessment_contract?.metrics ?? {}),
        language_quality: score,
        pronunciation: null,
        fluency: null
      },
      error: null
    })
  };
}

export function shouldSkipCompletedTranscriptAssessment(submission) {
  return submission?.ai_assessment_contract?.status === "completed" &&
    normalizeOptionalScore(submission?.overall_score, { allowNumericString: true }) !== null;
}

export function normalizeMentorReviewScores(scores) {
  const normalized = {};
  for (const field of ["final_score", "pronunciation_score", "fluency_score"]) {
    const value = scores[field];
    if (value === null || value === undefined || value === "") {
      normalized[field] = null;
      continue;
    }
    const score = normalizeOptionalScore(value, { allowNumericString: true });
    if (score === null) {
      throw Object.assign(new Error(`Mentor ${field} must be between 0 and 100`), {
        status: 400,
        code: "MENTOR_SCORE_INVALID"
      });
    }
    normalized[field] = score;
  }
  return normalized;
}
