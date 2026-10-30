export async function transcribeQueuedSubmission({
  submissionId,
  localPath,
  transcribeAudio,
  persistTranscript,
  updateStatus
}) {
  try {
    const { json: transcript } = await transcribeAudio(localPath, {
      model: "base",
      computeType: "float32",
      timeoutMs: 3 * 60 * 1000
    });

    if (transcript) {
      await persistTranscript(transcript);
      return transcript;
    }
    console.warn("Transcription returned no result for submission", submissionId);
  } catch (error) {
    console.error("Transcription failed for submission", submissionId, error?.code || error?.name || "UNKNOWN_ERROR");
  }
  // The analysis worker owns its final status write; standalone callers may supply one.
  if (updateStatus) await updateStatus(submissionId, "failed");
  return null;
}
