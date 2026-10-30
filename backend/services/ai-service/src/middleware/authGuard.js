import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import { requireJwtSecret } from "../../../shared/jwtConfig.js";
import { validateActiveSession } from "../../../shared/sessionValidation.js";
import {
  createJwtAuthGuard,
  createRoleGuard,
  createServiceAuthGuard
} from "./securityPrimitives.js";

export const authGuard = createJwtAuthGuard({
  verifyToken: (token, secret) => jwt.verify(token, secret, { algorithms: ["HS256"] }),
  validateSession: (token, userId) => validateActiveSession(pool, token, userId),
  getSecret: () => requireJwtSecret()
});

export const allowRoles = (...roles) => createRoleGuard(roles);

export const allowServices = (...services) => (req, res, next) => {
  const tokens = {
    learner: process.env.AESP_LEARNER_SERVICE_TOKEN,
    mentor: process.env.AESP_MENTOR_SERVICE_TOKEN
  };
  return createServiceAuthGuard({ tokens, allowedServices: services })(req, res, next);
};

