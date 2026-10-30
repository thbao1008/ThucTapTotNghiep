function record(value) {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function getSubmissionAiFeedback(submission) {
  const raw = record(submission?.raw_ai_response ?? submission?.ai_raw_response);
  const analysis = record(submission?.analysis);
  const feedback = [raw.feedback, analysis.feedback].find(value => typeof value === "string" && value.trim());
  const suggestions = submission?.suggestions ?? analysis.suggestions ?? raw.suggestions;
  return {
    feedback: feedback?.trim() || "",
    suggestions: Array.isArray(suggestions)
      ? suggestions.filter(value => typeof value === "string" && value.trim()).map(value => value.trim())
      : typeof suggestions === "string" && suggestions.trim() ? [suggestions.trim()] : []
  };
}
