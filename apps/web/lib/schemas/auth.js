import { z } from "zod";
import { UserSchema } from "@wizard/core";

// =============================================================================
// AUTHENTICATION & USER SCHEMAS
// =============================================================================

export const userResponseSchema = UserSchema;

/**
 * Auth response schema for backend auth endpoints.
 *
 * ARCHITECTURE NOTE:
 * - Backend auth endpoints (/auth/login, /auth/signup, /auth/oauth/google) return
 *   user data only - they do NOT return tokens anymore.
 * - NextAuth is the SINGLE SOURCE OF TRUTH for JWT issuance.
 * - The token field is kept optional for backwards compatibility during migration.
 */
export const authResponseSchema = z.object({
  user: UserSchema,
  token: z.string().optional(),
  isNew: z.boolean().optional(),
});

export const userUpdateResponseSchema = UserSchema;

export const changePasswordResponseSchema = z
  .object({
    success: z.boolean().optional(),
    message: z.string().optional(),
  })
  .passthrough();
