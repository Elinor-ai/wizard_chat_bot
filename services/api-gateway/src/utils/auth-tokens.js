import jwt from "jsonwebtoken";
import { httpError } from "@wizard/utils";

const DEFAULT_EXPIRY = "7d";

function getSecret() {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error("AUTH_JWT_SECRET is not configured");
  }
  return secret;
}

export function issueAuthToken(user) {
  if (!user || !user.id) {
    throw httpError(500, "Unable to issue auth token without user context");
  }

  const payload = {
    sub: user.id,
    email: user.auth?.email ?? null,
    roles: user.auth?.roles ?? [],
    orgId: user.orgId ?? null
  };

  const expiresIn = process.env.AUTH_JWT_EXPIRES_IN ?? DEFAULT_EXPIRY;
  return jwt.sign(payload, getSecret(), { expiresIn });
}

export function verifyAuthToken(token) {
  if (!token) {
    throw httpError(401, "Missing auth token");
  }
  return jwt.verify(token, getSecret());
}
