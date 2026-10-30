import { unlink } from "node:fs/promises";

const mentorOwnedQueries = {
  challenge: `SELECT id FROM challenges WHERE id = $1 AND mentor_id = $2`,
  resource: `SELECT id FROM mentor_resources WHERE id = $1 AND mentor_id = $2`,
  schedule: `SELECT id FROM schedules WHERE id = $1 AND mentor_id = $2`,
  submission: `SELECT l.id
    FROM submissions s
    JOIN learners l ON l.id = s.learner_id
    WHERE s.id = $1 AND l.mentor_id = $2`,
  topic: `SELECT id FROM topics WHERE id = $1 AND mentor_id = $2`
};

function normalizeId(value) {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function deny(res, status, message) {
  return res.status(status).json({ message });
}

async function removeUploadedFiles(req) {
  const files = [
    ...(req.file ? [req.file] : []),
    ...Object.values(req.files || {}).flat()
  ];
  await Promise.all(files.map(async file => {
    if (!file?.path) return;
    try {
      await unlink(file.path);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error("Unable to remove unauthorized Mentor upload:", error);
      }
    }
  }));
}

export function createMentorAccessGuards({ pool }) {
  async function resolveMentor(req, res) {
    if (req.user?.role?.toLowerCase() !== "mentor" || !normalizeId(req.user?.id)) {
      deny(res, 403, "Mentor access required");
      return null;
    }
    const result = await pool.query(
      "SELECT id FROM mentors WHERE user_id = $1",
      [req.user.id]
    );
    const mentorId = normalizeId(result.rows[0]?.id);
    if (!mentorId) {
      deny(res, 403, "Mentor profile not found");
      return null;
    }
    req.mentorId = mentorId;
    return mentorId;
  }

  function mentorScope(param = "mentorId") {
    return async (req, res, next) => {
      try {
        const mentorId = await resolveMentor(req, res);
        if (!mentorId) return;
        const requestedId = normalizeId(req.params?.[param]);
        if (!requestedId) return deny(res, 400, "Invalid mentor id");
        if (requestedId !== mentorId) {
          return deny(res, 403, "Mentor data access denied");
        }
        return next();
      } catch (error) {
        console.error("Unable to verify Mentor scope:", error);
        return deny(res, 503, "Unable to verify Mentor access");
      }
    };
  }

  function assignedLearner(param = "learnerId") {
    return async (req, res, next) => {
      try {
        const mentorId = await resolveMentor(req, res);
        if (!mentorId) return;
        const learnerId = normalizeId(req.params?.[param]);
        if (!learnerId) return deny(res, 400, "Invalid learner id");
        const result = await pool.query(
          "SELECT id FROM learners WHERE id = $1 AND mentor_id = $2",
          [learnerId, mentorId]
        );
        if (!result.rows[0]) return deny(res, 404, "Learner not found");
        req.assignedLearnerId = learnerId;
        return next();
      } catch (error) {
        console.error("Unable to verify Mentor learner assignment:", error);
        return deny(res, 503, "Unable to verify learner access");
      }
    };
  }

  function assignedLearnerByUser(param = "target_id") {
    return async (req, res, next) => {
      try {
        const mentorId = await resolveMentor(req, res);
        if (!mentorId) {
          await removeUploadedFiles(req);
          return;
        }
        const userId = normalizeId(req.body?.[param]);
        if (!userId) {
          await removeUploadedFiles(req);
          return deny(res, 400, "Invalid learner id");
        }
        const result = await pool.query(
          `SELECT l.id
           FROM learners l
           WHERE l.user_id = $1 AND l.mentor_id = $2`,
          [userId, mentorId]
        );
        if (!result.rows[0]) {
          await removeUploadedFiles(req);
          return deny(res, 404, "Learner not found");
        }
        req.assignedLearnerId = normalizeId(result.rows[0].id);
        return next();
      } catch (error) {
        await removeUploadedFiles(req);
        console.error("Unable to verify Mentor learner assignment:", error);
        return deny(res, 503, "Unable to verify learner access");
      }
    };
  }

  function assignedToMentor(param = "id") {
    return async (req, res, next) => {
      try {
        if (req.user?.role?.toLowerCase() !== "learner" || !normalizeId(req.user?.id)) {
          return deny(res, 403, "Assigned Learner access required");
        }
        const mentorId = normalizeId(req.params?.[param]);
        if (!mentorId) return deny(res, 400, "Invalid mentor id");
        const result = await pool.query(
          `SELECT id FROM learners
           WHERE user_id = $1 AND mentor_id = $2`,
          [req.user.id, mentorId]
        );
        if (!result.rows[0]) return deny(res, 404, "Mentor not found");
        return next();
      } catch (error) {
        console.error("Unable to verify Learner mentor assignment:", error);
        return deny(res, 503, "Unable to verify mentor access");
      }
    };
  }

  function ownsRecord(kind, param = "id") {
    const query = mentorOwnedQueries[kind];
    if (!query) throw new Error(`Unsupported Mentor-owned resource: ${kind}`);

    return async (req, res, next) => {
      try {
        const mentorId = await resolveMentor(req, res);
        if (!mentorId) return;
        const recordId = normalizeId(req.params?.[param]);
        if (!recordId) return deny(res, 400, "Invalid resource id");
        const result = await pool.query(query, [recordId, mentorId]);
        if (!result.rows[0]) return deny(res, 404, "Resource not found");
        return next();
      } catch (error) {
        console.error(`Unable to verify Mentor-owned ${kind}:`, error);
        return deny(res, 503, "Unable to verify resource access");
      }
    };
  }

  function selfOrAdminUser(param = "userId") {
    return (req, res, next) => {
      if (req.user?.role?.toLowerCase() === "admin") return next();
      if (
        req.user?.role?.toLowerCase() !== "mentor" ||
        normalizeId(req.params?.[param]) !== normalizeId(req.user?.id)
      ) {
        return deny(res, 403, "Mentor profile access denied");
      }
      return next();
    };
  }

  return {
    assignedLearner,
    assignedLearnerByUser,
    assignedToMentor,
    mentorScope,
    ownsRecord,
    selfOrAdminUser
  };
}
