import { matchSpeakingWordOccurrences, matchSpeakingHighlightIndices, speakingWordTargets } from './speakingWordMatch.js';
import { createAssessmentContract } from "./assessmentContract.js";
import { normalizeOptionalScore } from "./assessmentContract.js";

export function getSpeakingPracticeAnalysisStatus(analysis) {
  if (!analysis) {
    return "processing";
  }

  let parsedAnalysis = analysis;
  if (typeof analysis === "string") {
    try {
      parsedAnalysis = JSON.parse(analysis);
    } catch {
      return "failed";
    }
  }

  if (!parsedAnalysis || typeof parsedAnalysis !== "object" || Array.isArray(parsedAnalysis)) {
    return "failed";
  }

  if (parsedAnalysis.status === "failed") {
    return "failed";
  }

  if (parsedAnalysis.status !== "processing" && parsedAnalysis.status !== "completed") {
    return "failed";
  }

  return parsedAnalysis.status === "processing" ? "processing" : "completed";
}

export function hasValidSpeakingPracticeResult(round) {
  const score = round?.score;
  if (
    getSpeakingPracticeAnalysisStatus(round?.analysis) !== "completed" ||
    score === null ||
    score === undefined ||
    score === ""
  ) {
    return false;
  }

  const numericScore = Number(score);
  return Number.isFinite(numericScore) && numericScore >= 0 && numericScore <= 100;
}

export function getSpeakingPracticeSummaryStatus(rounds) {
  if (!Array.isArray(rounds) || rounds.length !== 10) {
    return "failed";
  }

  const roundNumbers = rounds.map(round => Number(round.round_number)).sort((a, b) => a - b);
  if (roundNumbers.some((roundNumber, index) => roundNumber !== index + 1)) {
    return "failed";
  }

  const statuses = rounds.map(round => getSpeakingPracticeAnalysisStatus(round.analysis));
  if (statuses.includes("processing")) {
    return "processing";
  }
  if (statuses.includes("failed") || rounds.some(round => !hasValidSpeakingPracticeResult(round))) {
    return "failed";
  }

  return "completed";
}

export function deriveSpeakingPracticeSummaryScore(rounds) {
  if (getSpeakingPracticeSummaryStatus(rounds) !== "completed") {
    throw Object.assign(new Error("Speaking assessment is incomplete or invalid"), {
      status: 409,
      code: "SPEAKING_ASSESSMENT_INCOMPLETE"
    });
  }
  const totalScore = rounds.reduce((total, round) => total + Number(round.score), 0);
  return {
    total_score: totalScore,
    average_score: Math.round(totalScore / rounds.length)
  };
}

export function normalizeSpeakingPracticeAssessment(
  analysis,
  score = analysis?.score,
  method = "transcript_prompt_word_match"
) {
  const normalizedScore = normalizeOptionalScore(score);
  const status = analysis?.status === "completed" && normalizedScore !== null
    ? "completed"
    : "failed";
  const assessmentContract = {
    ...(analysis?.assessment_contract ?? {}),
    type: "content_matching",
    source: "deterministic",
    method,
    scale: "0-100",
    status,
    metrics: {
      ...(analysis?.assessment_contract?.metrics ?? {}),
      content_match: status === "completed" ? normalizedScore : null,
      pronunciation: null,
      fluency: null
    },
    error: status === "failed"
      ? analysis?.assessment_contract?.error ?? "assessment_result_invalid_or_unavailable"
      : null
  };

  return {
    ...(analysis ?? {}),
    status,
    score: status === "completed" ? normalizedScore : null,
    assessment_contract: assessmentContract,
    pronunciation_assessed: false,
    fluency_assessed: false
  };
}

function assessSpeakingWordMatch(match, expectedText, hasSpeech, method) {
  if (!match.expectedWords.length) throw new Error("Expected prompt is required for transcript matching");
  const score = hasSpeech ? Math.round(match.matchedWords.length / match.expectedWords.length * 100) : null;
  const status = hasSpeech ? "completed" : "failed";
  const feedback = hasSpeech
    ? `Matched ${match.matchedWords.length}/${match.expectedWords.length} prompt words. ${match.missingWords.length ? `Review: ${match.missingWords.slice(0, 5).join(", ")}.` : "All prompt words were matched."}`
    : "No speech content is available to compare with the prompt.";
  return {
    assessment_type: "transcript_match",
    assessment_scope: "content_match_only",
    assessment_contract: createAssessmentContract({
      type: "content_matching", source: "deterministic", method, scale: "0-100", status,
      metrics: { content_match: score, pronunciation: null },
      ...(hasSpeech ? {} : { error: "transcript_unavailable" })
    }),
    status, pronunciation_assessed: false, score, feedback,
    missing_words: match.missingWords, errors: [], corrected_text: expectedText
  };
}

export function evaluateTranscriptMatch(transcript, expectedText) {
  return assessSpeakingWordMatch(
    matchSpeakingWordOccurrences(expectedText, transcript), expectedText,
    speakingWordTargets(transcript).length > 0, "transcript_prompt_word_match"
  );
}

// Browser progress and server ASR are content comparisons, never acoustic scores.
// Keep the selected evidence source in the contract instead of relabeling server
// transcript matches as browser highlights.
export function evaluateSpeakingContent({ prompt, webSpeechHighlights, webSpeechTranscript, whisperTranscript }) {
  const highlights = matchSpeakingHighlightIndices(prompt, webSpeechHighlights);
  const whisper = matchSpeakingWordOccurrences(prompt, whisperTranscript);
  let match, hasSpeech, method;
  if (highlights.matchedIndices.length) {
    match = highlights; hasSpeech = true; method = "web_speech_word_highlights";
  } else if (whisper.matchedIndices.length) {
    match = whisper; hasSpeech = true; method = "whisperx_transcript_word_match";
  } else if (speakingWordTargets(webSpeechTranscript).length) {
    match = matchSpeakingWordOccurrences(prompt, webSpeechTranscript);
    hasSpeech = true; method = "web_speech_transcript_word_match";
  } else {
    match = whisper; hasSpeech = speakingWordTargets(whisperTranscript).length > 0;
    method = "whisperx_transcript_word_match";
  }
  const analysis = assessSpeakingWordMatch(match, prompt, hasSpeech, method);
  return normalizeSpeakingPracticeAssessment(analysis, analysis.score, method);
}

export function parseSpeakingPracticeSummary(content) {
  let jsonContent = content.trim();
  const codeBlockMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch?.[1]) {
    jsonContent = codeBlockMatch[1].trim();
  }

  const firstBrace = jsonContent.indexOf("{");
  const lastBrace = jsonContent.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    jsonContent = jsonContent.slice(firstBrace, lastBrace + 1);
  }

  const summary = JSON.parse(jsonContent);
  if (
    !summary ||
    typeof summary !== "object" ||
    Array.isArray(summary) ||
    typeof summary.overall_feedback !== "string" ||
    !summary.overall_feedback.trim()
  ) {
    throw new Error("AI summary response is missing overall_feedback");
  }

  return summary;
}
