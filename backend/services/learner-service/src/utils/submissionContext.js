import { positiveSubmissionId } from "./submissionAttempt.js";

export function validateSubmissionContext(body, authenticatedLearnerId) {
  for (const key of ["learner_id", "learnerId"]) {
    if (body[key] !== undefined && body[key] !== null &&
        positiveSubmissionId(body[key], key) !== authenticatedLearnerId) {
      throw Object.assign(new Error("Learner data access denied"), { status: 403 });
    }
  }
  // No assignment ownership model exists in the current source/schema. Do not
  // invent one or persist unverified client IDs into legacy assignment columns.
  for (const key of ["assignment_id", "assignmentId"]) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
      throw Object.assign(new Error("Assignment submissions are not supported. Omit assignment_id."), {
        status: 400, code: "UNSUPPORTED_ASSIGNMENT"
      });
    }
  }
}
