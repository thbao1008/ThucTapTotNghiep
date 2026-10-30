function record(value) {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return null; }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function score(value, max = 100) {
  if (typeof value !== "number" && !(typeof value === "string" && value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 && result <= max ? result : null;
}

export function getRoundAnalysis(round) {
  return record(round?.analysis ?? round?.analysis_data);
}

export function getContentMatchScore(round) {
  const analysis = getRoundAnalysis(round);
  const contract = record(analysis?.assessment_contract ?? round?.assessment_contract);
  const value = score(round?.score);
  const methods = ["transcript_prompt_word_match", "web_speech_word_highlights",
    "web_speech_transcript_word_match", "whisperx_transcript_word_match"];
  if (value === null || (round?.analysis_status && round.analysis_status !== "completed") ||
      (analysis?.status && analysis.status !== "completed") ||
      contract?.status !== "completed" || contract.type !== "content_matching" ||
      contract.source !== "deterministic" || !methods.includes(contract.method) ||
      contract.scale !== "0-100" || contract.error != null ||
      typeof contract.metrics?.content_match !== "number" || contract.metrics.content_match !== value ||
      contract.metrics.pronunciation != null || contract.metrics.fluency != null ||
      (analysis?.score != null && score(analysis.score) !== value)) return null;
  return value;
}

export function getSpeakingSummaryScore(sessionData, rounds) {
  const summary = record(sessionData?.summary);
  if (summary?.status !== "completed" || !Array.isArray(rounds) || rounds.length !== 10) return null;
  const numbers = rounds.map(round => Number(round.round_number)).sort((a, b) => a - b);
  if (numbers.some((value, index) => value !== index + 1)) return null;
  const values = rounds.map(getContentMatchScore);
  if (values.some(value => value === null)) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  const average = Math.round(total / 10);
  for (const candidate of [sessionData?.average_score, summary.average_score]) {
    if (candidate != null && score(candidate) !== average) return null;
  }
  for (const candidate of [sessionData?.total_score, summary.total_score]) {
    if (candidate != null && score(candidate, 1000) !== total) return null;
  }
  return average;
}

export function getScenarioScores(result) {
  const contract = record(result?.assessment_contract);
  const final = score(result?.final_score);
  if (final === null || contract?.status !== "completed" || contract.type !== "scenario_task_alignment" ||
      !['openrouter', 'groq'].includes(contract.source) || contract.method !== "transcript_and_interaction_analysis" ||
      contract.scale !== "0-100" || contract.error != null ||
      typeof contract.metrics?.final_score !== "number" || contract.metrics.final_score !== final ||
      contract.metrics.pronunciation != null || contract.metrics.fluency != null) return null;
  const verified = { final_score: final };
  for (const [field, max] of Object.entries({ reasonableness_score: 40, reflex_score: 30,
    task_completion_score: 20, independence_score: 10 })) {
    const value = contract.metrics[field];
    verified[field] = typeof value === "number" && contract.metric_scales?.[field] === `0-${max}` &&
      (result[field] == null || score(result[field], max) === value) ? score(value, max) : null;
  }
  return verified;
}
