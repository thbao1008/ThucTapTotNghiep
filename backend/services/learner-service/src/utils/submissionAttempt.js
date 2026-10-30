import { withSessionCreationLock } from "./sessionCreationLock.js";

export function positiveSubmissionId(value, label) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) {
    throw Object.assign(new Error(`Invalid ${label}`), { status: 400, discardUploadSafe: true });
  }
  return Number(value);
}

export async function withSubmissionAttempt({ pool, learnerId, challengeId, expectedAttempt }, work) {
  if (expectedAttempt === undefined) throw Object.assign(new Error("Reload submission form before uploading"), { status: 428, discardUploadSafe: true });
  const expected = positiveSubmissionId(expectedAttempt, "expected_attempt_number");
  let workFinished = false;
  try {
    return await withSessionCreationLock(pool, `submission-${challengeId}`, learnerId, async client => {
      const { rows } = await client.query(`SELECT COALESCE(MAX(attempt_number),0) + 1 AS next
        FROM submissions WHERE learner_id = $1 AND challenge_id = $2`, [learnerId, challengeId]);
      if (Number(rows[0].next) !== expected) {
        throw Object.assign(new Error("A submission was already saved. Check submission history before submitting again."), {
          status: 409, code: "SUBMISSION_ATTEMPT_CHANGED"
        });
      }
      const result = await work(client, expected);
      workFinished = true;
      return result;
    });
  } catch (error) {
    // Preserve the upload if COMMIT may have succeeded despite a connection failure.
    error.discardUploadSafe = !workFinished;
    throw error;
  }
}
