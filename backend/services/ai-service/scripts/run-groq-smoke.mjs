// Synthetic-only live check. No DB imports, training capture or paid fallback.
import assert from "node:assert/strict";
import { callGroqWithDependencies } from "../src/services/aiService.js";
import { analyzeWithGroq, scaleTranscriptAnalysisForApi } from "../src/services/learnerAiService.js";

if (process.env.AESP_RUN_GROQ_SMOKE !== "1") {
  console.error("Opt in with AESP_RUN_GROQ_SMOKE=1 for a bounded synthetic Groq Free Plan test.");
  process.exitCode = 1;
} else {
  await import("../src/config/loadEnv.js");
  let requests = 0;
  const env = { AI_PROVIDER: "groq", GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_MODEL: "openai/gpt-oss-20b", GROQ_MAX_OUTPUT_TOKENS: "1200", GROQ_TIMEOUT_MS: "45000" };
  try {
    const analysis = await analyzeWithGroq(
      "Last weekend I visited a library with my sister. We borrowed two books. Next week I will read a short story in English.",
      null,
      (messages, options) => callGroqWithDependencies(messages, options, {
        env, fetchImpl: async (url, request) => {
          assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
          if (requests >= 2) throw Object.assign(new Error("Smoke request budget reached"), { code: "SMOKE_BUDGET_REACHED" });
          requests++;
          return fetch(url, request);
        }
      })
    );
    const result = scaleTranscriptAnalysisForApi(analysis);
    assert.equal(result.assessment_contract.source, "groq");
    assert.ok(Number.isFinite(result.overall_score) && result.overall_score >= 0 && result.overall_score <= 100);
    assert.equal(result.pronunciation_score, null);
    assert.equal(result.fluency_score, null);
    console.log(JSON.stringify({ passed: true, provider: "groq", model: env.GROQ_MODEL, requests,
      syntheticInputOnly: true, databaseWrites: false, languageScore: result.overall_score,
      feedbackPresent: Boolean(result.feedback?.trim()), paidFallback: false }));
  } catch (error) {
    console.error(JSON.stringify({ passed: false, provider: "groq", requests, code: error.code || error.name }));
    process.exitCode = 1;
  }
}
