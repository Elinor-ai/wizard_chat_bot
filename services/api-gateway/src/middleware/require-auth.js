/**
 * Authentication Middleware
 *
 * ARCHITECTURE:
 * - NextAuth is the SINGLE SOURCE OF TRUTH for token issuance
 * - This middleware verifies tokens issued by NextAuth
 * - Backend uses NEXTAUTH_SECRET for verification (canonical secret name)
 * - AUTH_JWT_SECRET is supported as a backward-compat fallback
 *
 * Expected token payload (set by NextAuth jwt callback):
 * - sub: user ID
 * - email: user email
 * - roles: array of roles
 * - orgId: organization ID (nullable)
 */

import { httpError } from "@wizard/utils";
import { verifyAuthToken } from "../utils/auth-tokens.js";

export function requireAuth({ logger }) {
  return (req, _res, next) => {
    // Try Authorization header first
    const header = req.headers.authorization;
    let token = null;

    if (header && header.toLowerCase().startsWith("bearer ")) {
      token = header.slice(7).trim();
    } else if (req.query.token) {
      // Fallback to query parameter for EventSource/SSE endpoints
      token = req.query.token;
    }

    if (!token) {
      return next(httpError(401, "Missing Authorization header or token parameter"));
    }

    try {
      const payload = verifyAuthToken(token);
      req.user = {
        id: payload.sub,
        email: payload.email ?? null,
        roles: payload.roles ?? [],
        orgId: payload.orgId ?? null,
        token
      };
      return next();
    } catch (error) {
      logger?.warn?.(
        {
          err: error?.message,
          path: req.path
        },
        "Auth token verification failed"
      );
      return next(httpError(401, "Invalid or expired auth token"));
    }
  };
}