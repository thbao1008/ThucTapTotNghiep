import { timingSafeEqual } from "node:crypto";

export function requireStrongSecret(value, name) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error(`${name} must be configured with at least 32 bytes`);
  }
  return value;
}

export function safeStringEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sendAuthError(res, status, message) {
  return res.status(status).json({ message });
}

function bearerToken(req) {
  const value = req.headers.authorization;
  const match = typeof value === "string" && value.match(/^Bearer ([^\s]+)$/i);
  return match?.[1] || null;
}

export function createJwtAuthGuard({ verifyToken, validateSession, getSecret }) {
  return async (req, res, next) => {
    const token = bearerToken(req);
    if (!token) return sendAuthError(res, 401, "Authentication required");

    let user;
    try {
      user = verifyToken(token, getSecret());
    } catch {
      return sendAuthError(res, 403, "Invalid authentication token");
    }

    try {
      const session = await validateSession(token, user.id);
      if (!session?.valid) return sendAuthError(res, 403, "Session is invalid or expired");
      req.user = user;
      req.session = session.session;
      return next();
    } catch {
      return sendAuthError(res, 503, "Authentication service unavailable");
    }
  };
}

export function createRoleGuard(allowedRoles) {
  const normalizedRoles = new Set(allowedRoles.map(role => role.toLowerCase()));
  return (req, res, next) => {
    const role = req.user?.role;
    if (typeof role !== "string" || !normalizedRoles.has(role.toLowerCase())) {
      return sendAuthError(res, 403, "Insufficient role");
    }
    return next();
  };
}

export function createServiceAuthGuard({ tokens, allowedServices }) {
  const allowed = new Set(allowedServices);
  return (req, res, next) => {
    const service = req.headers["x-aesp-service"];
    const token = req.headers["x-aesp-service-token"];
    const expected = typeof service === "string" && allowed.has(service) ? tokens[service] : null;

    if (!expected || !safeStringEqual(token, expected)) {
      return sendAuthError(res, 401, "Service authentication required");
    }

    req.service = service;
    return next();
  };
}

export function validateAIAuthEnvironment(env) {
  requireStrongSecret(env.JWT_SECRET, "JWT_SECRET");
  const learnerToken = requireStrongSecret(env.AESP_LEARNER_SERVICE_TOKEN, "AESP_LEARNER_SERVICE_TOKEN");
  const mentorToken = requireStrongSecret(env.AESP_MENTOR_SERVICE_TOKEN, "AESP_MENTOR_SERVICE_TOKEN");
  if (safeStringEqual(learnerToken, mentorToken) || safeStringEqual(learnerToken, env.JWT_SECRET) || safeStringEqual(mentorToken, env.JWT_SECRET)) {
    throw new Error("AI service credentials must be distinct");
  }
}
