// Learner Service - Queue Handlers
import { registerProcessor } from "./utils/queue.js";
import * as learnerService from "./services/learnerService.js";
// TODO: Replace with API calls to AI Service
// import * as learnerAiService from "./services/learnerAiService.js";
import { runWhisperX } from "./utils/whisperxRunner.js";
import { analyzeLearnerTranscript } from "./utils/aiServiceClient.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import pool from "./config/db.js";
import {
  hasValidSpeakingPracticeResult,
  evaluateSpeakingContent
} from "./utils/speakingPracticeAnalysis.js";
import { createAnalyzeSubmissionHandler } from "./utils/analyzeSubmissionJob.js";
import { createSubmissionWorkerLock } from "./utils/submissionWorkerLock.js";
import {claimSpeakingRound,acquirePracticeWorkerLease} from './utils/practiceSessionEnd.js';
import {practiceRetention} from './utils/practiceRetentionRuntime.js';

/**
 * Tìm project root (đi lên từ learner-service/src đến backend)
 */
function getProjectRoot() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // __dirname = backend/services/learner-service/src
  // Go up 3 levels: src -> learner-service -> services -> backend
  return path.resolve(__dirname, "..", "..", "..");
}

function audioUrlToLocalPath(audioUrl) {
  const m = String(audioUrl || "").match(/\/uploads\/(.+)$/);
  if (!m) return null;
  const filename = m[1];
  // Tìm file ở backend/uploads/
  const backendDir = getProjectRoot();
  return path.resolve(backendDir, "uploads", filename);
}

// Queue handler để xử lý submission analysis
registerProcessor("analyzeSubmission", createAnalyzeSubmissionHandler({
  service: learnerService,
  withSubmissionLock: createSubmissionWorkerLock({ pool, service: learnerService }),
  transcribeAudio: runWhisperX,
  resolveAudioPath: audioUrlToLocalPath,
  fileExists: fs.existsSync,
  logger: console,
  analyzeTranscript: async ({ transcriptText, challenge }) => {
    return analyzeLearnerTranscript(transcriptText, { challenge }, { timeoutMs: 120_000 });
  }
}));

// Queue handler để xử lý speaking round (transcription + AI analysis)
registerProcessor("processSpeakingRound", async (job) => {
  console.log("🚀 QUEUE HANDLER STARTED for speaking round");
  const { roundId, sessionId, audioUrl, prompt, level, time_taken, webSpeechTranscript, webSpeechHighlights: originalWebSpeechHighlights } = job.data;
  const webSpeechHighlights = originalWebSpeechHighlights;
  let analysisStatus = "completed";
  let retryableError = null;
  let claimToken=null;
  const releaseMediaLease=await acquirePracticeWorkerLease(pool,roundId);
  if(!releaseMediaLease)return;
  console.log("🔄 Processing speaking round:", roundId);
  console.log("🎤 Web Speech data received:", {
    hasTranscript: !!webSpeechTranscript,
    highlightsLength: Array.isArray(webSpeechHighlights) ? webSpeechHighlights.length : 0
  });

  // Processing timeout policy: 10 minutes
  // Rounds stuck in 'processing' longer than this may be claimed for recovery
  const PROCESSING_TIMEOUT_SECONDS = 10 * 60;

  try {
    // ATOMIC CLAIM with fenced ownership and stale processing recovery
    // A round is claimable if:
    // 1. Not completed
    // 2. Not currently processing by another worker (status != 'processing')
    // 3. OR stuck in 'processing' for longer than timeout (stale)
    //
    // Each claim generates a unique claim_token that fences previous workers.
    // Only the worker with the current claim_token can persist final results.
    const claimResult = await claimSpeakingRound({database:pool,roundId,timeoutSeconds:PROCESSING_TIMEOUT_SECONDS});

    if (claimResult.rowCount === 0) {
      // Failed to claim: either already completed or another worker is processing
      const currentRound = await pool.query(
        "SELECT analysis, score, updated_at FROM speaking_practice_rounds WHERE id = $1",
        [roundId]
      );
      if (!currentRound.rows[0]) {
        throw new Error("Speaking round not found");
      }
      if (hasValidSpeakingPracticeResult(currentRound.rows[0])) {
        console.log(`✅ Round ${roundId} already completed, skipping`);
        return;
      }
      console.log(`⏭️  Round ${roundId} is being processed by another worker, skipping`);
      return;
    }

    claimToken = claimResult.rows[0].analysis.claim_token;
    console.log(`🔒 Claimed exclusive lock on round ${roundId} with token ${claimToken}`);

    // Transcribe audio
    const backendDir = getProjectRoot();
    const localPath = audioUrl.startsWith("/uploads/")
      ? path.join(backendDir, audioUrl)
      : audioUrl;

    let transcript = null;
    if (fs.existsSync(localPath)) {
      console.log(`📁 Audio file exists: ${localPath}`);
      try {
        console.log(`🎙️ Starting WhisperX transcription with model medium...`);
        const { json: transcriptJson } = await runWhisperX(localPath, {
          model: "medium",
          language: "en",
          computeType: "float32"
        });
        transcript = transcriptJson;
        console.log("✅ WhisperX transcription completed");
      } catch (err) {
        console.error("❌ Transcription error:", err.message);
        console.error("❌ Error stack:", err.stack);
        console.error("❌ Trying with base model...");
        // Fallback to base model
        try {
          const { json: transcriptJson } = await runWhisperX(localPath, {
            model: "base",
            computeType: "float32"
          });
          transcript = transcriptJson;
          console.log(`✅ WhisperX base model transcription completed: ${transcript?.text?.substring(0, 100)}...`);
        } catch (err2) {
          console.error("❌ Base model also failed:", err2.message);
          if (!webSpeechTranscript && (!webSpeechHighlights || webSpeechHighlights.length === 0)) {
            analysisStatus = "failed";
            retryableError = err2;
          }
        }
      }
    } else {
      console.error(`❌ Audio file not found: ${localPath}`);
      if (!webSpeechTranscript && (!webSpeechHighlights || webSpeechHighlights.length === 0)) {
        analysisStatus = "failed";
      }
    }

    const analysis = evaluateSpeakingContent({
      prompt, webSpeechHighlights, webSpeechTranscript,
      whisperTranscript: transcript?.text || (transcript?.segments || []).map(segment => segment.text || "").join(" ")
    });
    const score = analysis.score;
    analysisStatus = analysis.status;
    const feedback = analysis.feedback || "";
    const errors = analysis.errors || [];
    const correctedText = analysis.corrected_text || prompt;

    // Build word_analysis từ transcript
    let wordAnalysis = [];
    if (transcript && transcript.words && Array.isArray(transcript.words)) {
      wordAnalysis = transcript.words.map((w, idx) => ({
        word: w.text ?? w.word ?? "",
        start: typeof w.start === "number" ? w.start : null,
        end: typeof w.end === "number" ? w.end : null,
        confidence: typeof w.score === "number" ? w.score : w.confidence ?? null,
        wordIndex: idx
      }));
    }

    // Cập nhật database với kết quả (bao gồm missing_words để highlight từ sai)
    // Only persist if this worker still holds the current claim_token (fencing)
    console.log(`📊 Final score before DB update: ${score}, analysis score: ${analysis?.score}`);
    try {
      const persistResult = await pool.query(
        `UPDATE speaking_practice_rounds 
         SET transcript = $1, score = $2, analysis = $3, updated_at = NOW()
         WHERE id = $4
           AND analysis->>'claim_token' = $5
         RETURNING id`,
        [
          transcript ? JSON.stringify(transcript) : null,
          score,
          JSON.stringify({
            status: analysisStatus,
            assessment_type: "transcript_match",
            assessment_scope: "content_match_only",
            assessment_contract: analysis.assessment_contract,
            pronunciation_assessed: false,
            feedback,
            errors,
            corrected_text: correctedText || prompt,
            score,
            missing_words: analysis?.missing_words || [], // Các từ sai để highlight
            word_analysis: wordAnalysis.length > 0 ? wordAnalysis : [],
            claim_token: claimToken // Preserve token to prevent future invalid updates
          }),
          roundId,
          claimToken
        ]
      );

      if (persistResult.rowCount === 0) {
        console.log(`⚠️  Round ${roundId} was reclaimed by another worker, discarding stale results`);
        console.log(`    This worker's claim token ${claimToken} is no longer valid.`);
        return; // Silently exit without throwing; this is expected behavior after reclaim
      }

      console.log(`✅ Queue handler: Updated round ${roundId} with score ${score}, missing_words=${analysis?.missing_words?.length || 0}`);
    } catch (dbErr) {
      console.error(`❌ Database update error in queue handler for round ${roundId}:`, dbErr);
      throw dbErr;
    }

    console.log("✅ Speaking round processed:", roundId);
    if (retryableError) {
      throw retryableError;
    }
  } catch (err) {
    console.error("❌ Process speaking round error:", err);
    try {
      await pool.query(
        `UPDATE speaking_practice_rounds
         SET score = NULL, analysis = $1, updated_at = NOW()
         WHERE id = $2
           AND analysis->>'status' IS DISTINCT FROM 'completed'
           AND $3::text IS NOT NULL AND analysis->>'claim_token'=$3`,
        [
          JSON.stringify({
            status: "failed",
            score: null,
            feedback: "Không thể hoàn tất phân tích. Vui lòng thử lại.",
            errors: [{ type: "processing_error" }],
            missing_words: []
          }),
          roundId,
          claimToken
        ]
      );
    } catch (updateErr) {
      console.error("❌ Could not persist speaking-round failure:", updateErr.message);
    }
    throw err;
  } finally {
    await releaseMediaLease();
    await practiceRetention.cleanup(sessionId).catch(error=>console.warn('Practice cleanup will retry',error.code||error.name));
  }
});
