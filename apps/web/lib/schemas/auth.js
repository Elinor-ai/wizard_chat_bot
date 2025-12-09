import { z } from "zod";
import { UserSchema } from "@wizard/core";

// =============================================================================
// AUTHENTICATION & USER SCHEMAS
// =============================================================================

export const userResponseSchema = UserSchema;

export const authResponseSchema = z.object({
  user: UserSchema,
  token: z.string(),
});

export const userUpdateResponseSchema = UserSchema;

export const changePasswordResponseSchema = z
  .object({
    success: z.boolean().optional(),
    message: z.string().optional(),
  })
  .passthrough();
