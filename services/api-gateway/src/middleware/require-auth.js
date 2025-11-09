import { httpError } from "@wizard/utils";
import { verifyAuthToken } from "../utils/auth-tokens.js";

export function requireAuth({ logger }) {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.toLowerCase().startsWith("bearer ")) {
      return next(httpError(401, "Missing Authorization header"));
    }
    const token = header.slice(7).trim();
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
