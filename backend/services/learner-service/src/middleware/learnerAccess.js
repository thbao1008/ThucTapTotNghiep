import { unlink } from "node:fs/promises";

const ownerQueries = {
  learner: `SELECT user_id FROM learners WHERE id = $1`,
  practiceSession: `SELECT l.user_id
    FROM speaking_practice_sessions s
    JOIN learners l ON l.id = s.learner_id
    WHERE s.id = $1`,
  practiceRound: `SELECT l.user_id
    FROM speaking_practice_rounds r
    JOIN speaking_practice_sessions s ON s.id = r.session_id
    JOIN learners l ON l.id = s.learner_id
    WHERE r.id = $1`,
  scenarioSession: `SELECT l.user_id
    FROM scenario_sessions s
    JOIN learners l ON l.id = s.learner_id
    WHERE s.id = $1`,
  storySession: `SELECT l.user_id
    FROM story_sessions s
    JOIN learners l ON l.id = s.learner_id
    WHERE s.id = $1`,
  submission: `SELECT l.user_id
    FROM submissions s
    JOIN learners l ON l.id = s.learner_id
    WHERE s.id = $1`,
  schedule: `SELECT l.user_id
    FROM schedules s
    JOIN learners l ON l.id = s.learner_id
    WHERE s.id = $1`
};

function normalizeId(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? String(number) : null;
}

function deny(res, status, message) {
  return res.status(status).json({ message });
}

async function denyOwnedUpload(req, res, status, message) {
  if (req.file?.path) await unlink(req.file.path).catch(() => {});
  return deny(res, status, message);
}

function suppliedIdentityValues(req) {
  return [
    [req.params?.userId, req.user?.id],
    [req.query?.user_id, req.user?.id],
    [req.query?.userId, req.user?.id],
    [req.body?.user_id, req.user?.id],
    [req.body?.userId, req.user?.id],
    [req.params?.learnerId, req.learnerId],
    [req.query?.learner_id, req.learnerId],
    [req.query?.learnerId, req.learnerId],
    [req.body?.learner_id, req.learnerId],
    [req.body?.learnerId, req.learnerId]
  ];
}

export function createLearnerAccessGuards({ pool }) {
  function selfLearner({ learnerParam, userParam, allowAdmin = false } = {}) {
    return (req, res, next) => {
      const role = req.user?.role?.toLowerCase();
      if (role === "admin" && allowAdmin) return next();
      if (role !== "learner" || !req.learnerId || !req.user?.id) {
        return deny(res, 403, "Learner access required");
      }

      const requestedLearnerId = learnerParam ? req.params?.[learnerParam] : null;
      const requestedUserId = userParam ? req.params?.[userParam] : null;
      const supplied = [
        ...suppliedIdentityValues(req),
        [requestedLearnerId, req.learnerId],
        [requestedUserId, req.user.id]
      ];
      if (supplied.some(([actual, expected]) => actual !== undefined && actual !== null && normalizeId(actual) !== normalizeId(expected))) {
        return deny(res, 403, "Learner data access denied");
      }
      return next();
    };
  }

  function adminOnly(req, res, next) {
    if (req.user?.role?.toLowerCase() !== "admin") {
      return deny(res, 403, "Admin role required");
    }
    return next();
  }

  function ownRecord(kind, getResourceId) {
    const query = ownerQueries[kind];
    if (!query) throw new Error(`Unsupported learner-owned resource: ${kind}`);

    return async (req, res, next) => {
      if (req.user?.role?.toLowerCase() !== "learner" || !req.learnerId || !req.user?.id) {
        return denyOwnedUpload(req, res, 403, "Learner access required");
      }

      const resourceId = normalizeId(getResourceId(req));
      if (!resourceId) return denyOwnedUpload(req, res, 400, "Invalid resource id");

      try {
        const result = await pool.query(query, [resourceId]);
        const ownerUserId = result.rows[0]?.user_id;
        if (ownerUserId === undefined) return denyOwnedUpload(req, res, 404, "Resource not found");
        if (normalizeId(ownerUserId) !== normalizeId(req.user.id)) {
          return denyOwnedUpload(req, res, 403, "Learner data access denied");
        }
        return next();
      } catch {
        return denyOwnedUpload(req, res, 503, "Unable to verify learner data ownership");
      }
    };
  }

  return { selfLearner, adminOnly, ownRecord };
}
