/**
 * Auth Token Utilities
 *
 * ARCHITECTURE:
 * - NextAuth is the SINGLE SOURCE OF TRUTH for token issuance
 * - This module ONLY verifies tokens - it NEVER issues them
 * - Backend verifies JWTs using NEXTAUTH_SECRET (the canonical secret name)
 * - AUTH_JWT_SECRET is supported as a backward-compatibility fallback
 *
 * Token verification is used by the requireAuth middleware to validate
 * incoming requests from the frontend.
 */

import jwt from "jsonwebtoken";
import { httpError } from "@wizard/utils";

/**
 * Get the JWT secret for token verification.
 *
 * Priority:
 * 1. NEXTAUTH_SECRET (canonical - same secret NextAuth uses to sign tokens)
 * 2. AUTH_JWT_SECRET (backward-compat fallback for existing deployments)
 *
 * New environments should only set NEXTAUTH_SECRET.
 *
 * Note: This reads env vars lazily at call time (not module load time)
 * to support test environments that set env vars after module import.
 */
function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT secret is not configured. " +
      "Set NEXTAUTH_SECRET (or AUTH_JWT_SECRET for backward compatibility). " +
      "This must match the secret used by NextAuth for token signing."
    );
  }
  return secret;
}

/**
 * Verify a JWT token issued by NextAuth.
 *
 * @param {string} token - The JWT token from Authorization header
 * @returns {object} Decoded token payload containing: sub, email, roles, orgId
 * @throws {HttpError} 401 if token is missing or invalid
 */
export function verifyAuthToken(token) {
  if (!token) {
    throw httpError(401, "Missing auth token");
  }
  try {
    return jwt.verify(token, getSecret());
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      throw httpError(401, "Token expired");
    }
    if (err.name === "JsonWebTokenError") {
      throw httpError(401, "Invalid token");
    }
    throw httpError(401, "Token verification failed");
  }
}
