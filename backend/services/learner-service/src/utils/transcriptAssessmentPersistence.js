import {
  normalizeTranscriptAssessmentForPersistence,
  resolveTranscriptAssessmentRead,
  validateAssessmentContract
} from "@aesp/assessment-contract";
import { adaptTranscriptAiAssessmentToCanonical } from "./transcriptAiAssessmentAdapter.js";

export function getTranscriptAssessmentContracts(rawResponse, overallScore) {
  const result = resolveTranscriptAssessmentRead({
    rawResponse,
    overallScore
  });
  return {
    legacy: result.legacy,
    canonical: result.canonical
  };
}

export { resolveTranscriptAssessmentRead };

export function serializeLearnerTranscriptAssessment(row, rawResponse, contractField) {
  if (contractField !== "assessment_contract" && contractField !== "ai_assessment_contract") {
    throw new TypeError("Learner transcript contract field is invalid");
  }
  const assessment = resolveTranscriptAssessmentRead({
    rawResponse,
    overallScore: row.overall_score
  });
  return {
    ...row,
    overall_score: assessment.overallScore,
    raw_ai_response: assessment.rawResponse,
    [contractField]: assessment.legacy,
    canonical_assessment_contract: assessment.canonical
  };
}

export function serializeLearnerSubmissionListRow(row, rawResponse) {
  const assessment = resolveTranscriptAssessmentRead({
    rawResponse,
    overallScore: row.overall_score
  });
  const { ai_raw_response, ...submission } = row;
  return {
    ...submission,
    overall_score: assessment.overallScore
  };
}

export async function persistTranscriptAssessment(pool, submissionId, analysisObj, onCanonicalError) {
  if (typeof onCanonicalError !== "function") {
    throw new TypeError("A canonical assessment error handler is required");
  }
  const analysis = normalizeTranscriptAssessmentForPersistence(analysisObj);
  let canonicalAssessmentContract = null;

  try {
    canonicalAssessmentContract = adaptTranscriptAiAssessmentToCanonical(analysis, {
      assessedAt: analysis.assessed_at
    });
  } catch (error) {
    onCanonicalError(error);
  }

  const client = await pool.connect();
  try {
    const sql = `
      INSERT INTO ai_reports (
        submission_id,
        overall_score,
        pronunciation_score,
        fluency_score,
        grammar_issues,
        pronunciation_issues,
        suggestions,
        raw_ai_response,
        word_analysis,
        topic,
        topic_confidence,
        topic_alignment,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12::jsonb, NOW(), NOW()
      )
      ON CONFLICT (submission_id) DO UPDATE SET
        overall_score = EXCLUDED.overall_score,
        pronunciation_score = EXCLUDED.pronunciation_score,
        fluency_score = EXCLUDED.fluency_score,
        grammar_issues = EXCLUDED.grammar_issues,
        pronunciation_issues = EXCLUDED.pronunciation_issues,
        suggestions = EXCLUDED.suggestions,
        raw_ai_response = EXCLUDED.raw_ai_response,
        word_analysis = EXCLUDED.word_analysis,
        topic = EXCLUDED.topic,
        topic_confidence = EXCLUDED.topic_confidence,
        topic_alignment = EXCLUDED.topic_alignment,
        updated_at = NOW()
      WHERE NOT (
        COALESCE(ai_reports.raw_ai_response->'assessment_contract'->>'status', '') = 'completed'
        AND ai_reports.overall_score IS NOT NULL
        AND ai_reports.overall_score >= 0
        AND ai_reports.overall_score <= 100
      )
      RETURNING *;
    `;

    const preservedRawResponse = { ...(analysis.raw_ai_response ?? {}) };
    delete preservedRawResponse.canonical_assessment_contract;
    const rawResponse = {
      ...preservedRawResponse,
      topic_detection_raw: analysis.topic_detection_raw ?? null,
      assessment_contract: analysis.assessment_contract,
      ...(canonicalAssessmentContract
        ? { canonical_assessment_contract: canonicalAssessmentContract }
        : {})
    };

    const values = [
      submissionId,
      analysis.overall_score ?? null,
      analysis.pronunciation_score ?? null,
      analysis.fluency_score ?? null,
      JSON.stringify(analysis.grammar_issues ?? []),
      JSON.stringify(analysis.pronunciation_issues ?? []),
      JSON.stringify(analysis.suggestions ?? []),
      JSON.stringify(rawResponse),
      JSON.stringify(analysis.word_analysis ?? []),
      analysis.topic ?? null,
      analysis.topic_confidence ?? null,
      JSON.stringify(analysis.topic_alignment ?? null)
    ];

    const result = await client.query(sql, values);
    if (result.rows[0]) return result.rows[0];
    const existing = await client.query(
      "SELECT * FROM ai_reports WHERE submission_id = $1",
      [submissionId]
    );
    return existing.rows[0] ?? null;
  } finally {
    client.release();
  }
}
