import { transcribeQueuedSubmission } from "./transcribeQueuedSubmission.js";
import { shouldSkipCompletedTranscriptAssessment } from "./assessmentContract.js";

function getTranscriptText(transcript) {
  if (typeof transcript === "string") return transcript;
  if (!transcript || typeof transcript !== "object") return "";
  if (typeof transcript.text === "string") return transcript.text;
  if (!Array.isArray(transcript.segments)) return "";
  return transcript.segments
    .map(segment => typeof segment?.text === "string" ? segment.text : "")
    .join(" ");
}

function errorCode(error) {
  return error?.code || error?.name || "UNKNOWN_ERROR";
}

function createProcessingError(code) {
  return Object.assign(new Error("Submission analysis did not complete"), { code });
}

export function createAnalyzeSubmissionHandler({
  service,
  transcribeAudio,
  analyzeTranscript,
  resolveAudioPath,
  fileExists,
  logger = console,
  withSubmissionLock
}) {
  if (!service || typeof service.claimSubmissionForAnalysis !== "function" || typeof transcribeAudio !== "function" ||
      typeof analyzeTranscript !== "function" ||
      typeof resolveAudioPath !== "function" ||
      typeof fileExists !== "function") {
    throw new TypeError("Analyze submission handler dependencies are required");
  }

  const processSubmission = async (job, service) => {
    const { submissionId } = job.data;
    const submission = await service.getSubmissionById(submissionId);
    if (!submission) {
      logger.warn("Submission not found for analysis", submissionId);
      return;
    }
    if (shouldSkipCompletedTranscriptAssessment(submission)) {
      if (submission.status !== "completed" && submission.status !== "reviewed") {
        await service.updateSubmissionStatus(submissionId, "completed");
      }
      return;
    }

    if (!await service.claimSubmissionForAnalysis(submissionId)) return;
    try {
      let transcript = submission.transcript ?? null;
      if (!transcript) {
        if (!submission.audio_url) {
          throw createProcessingError("SUBMISSION_AUDIO_MISSING");
        }

        const localPath = resolveAudioPath(submission.audio_url);
        if (!localPath || !fileExists(localPath)) {
          logger.warn("Submission audio is unavailable for analysis", submissionId);
          throw createProcessingError("SUBMISSION_AUDIO_UNAVAILABLE");
        }

        transcript = await transcribeQueuedSubmission({
          submissionId,
          localPath,
          transcribeAudio,
          persistTranscript: async transcriptJson => {
            await service.updateSubmissionTranscript(submissionId, transcriptJson);
            if (Array.isArray(transcriptJson.segments)) {
              await service.updateSubmissionSegments(submissionId, transcriptJson.segments);
            }
          }
        });
        if (!transcript) throw createProcessingError("SUBMISSION_TRANSCRIPTION_FAILED");
      }

      const transcriptText = getTranscriptText(transcript);
      if (!transcriptText.trim()) {
        throw createProcessingError("SUBMISSION_TRANSCRIPT_EMPTY");
      }

      const challenge = await service.getChallengeById(submission.challenge_id);
      const analysis = await analyzeTranscript({ transcriptText, challenge });
      if (!analysis || typeof analysis !== "object") {
        throw createProcessingError("SUBMISSION_ANALYSIS_INVALID");
      }

      await service.updateSubmissionAnalysis(submissionId, { ...analysis, transcript });
      await service.updateSubmissionStatus(submissionId, "completed");
    } catch (error) {
      logger.error("Submission transcript analysis failed", submissionId, errorCode(error));
      // Releasing this claim is the final write: a retry may claim it immediately.
      await service.updateSubmissionStatus(submissionId, "failed");
      throw error;
    }
  };
  return job => withSubmissionLock
    ? withSubmissionLock(job.data.submissionId, lockedService => processSubmission(job, lockedService))
    : processSubmission(job, service);
}
