/**
 * @file users.js
 * User API Router - handles user profile and settings.
 *
 * ARCHITECTURE:
 * - PROTECTED: This router is mounted behind requireAuth middleware in server.js.
 *   The router assumes req.user is already set and does NOT verify JWTs directly.
 * - All Firestore access goes through user-repository.js
 * - This router does NOT access firestore directly
 */

import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { wrapAsync, httpError } from "@wizard/utils";
import {
  getUserByIdOrThrow,
  updateUser,
  updateUserPassword,
  setUserMainCompany,
  sanitizeUserForResponse
} from "../services/repositories/index.js";

function getAuthenticatedUserId(req) {
  const userId = req.user?.id;
  if (!userId) {
    throw httpError(401, "Unauthorized");
  }
  return userId;
}

// Schema for updating user profile
const updateProfileSchema = z.object({
  profile: z
    .object({
      name: z.string().min(1).optional(),
      companyName: z.string().optional(),
      phone: z.string().optional(),
      timezone: z.string().optional(),
      locale: z.string().optional()
    })
    .optional(),
  preferences: z
    .object({
      emailNotifications: z.boolean().optional(),
      marketingOptIn: z.boolean().optional(),
      languagesPreferred: z.array(z.string()).optional()
    })
    .optional(),
  experiments: z.record(z.string()).optional()
});

// Schema for changing password
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters")
});

const setMainCompanySchema = z.object({
  companyId: z.string().min(1)
});

export function usersRouter({ firestore, logger }) {
  const router = Router();

  // GET /users/me - Get current user
  router.get(
    "/me",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const user = await getUserByIdOrThrow(firestore, userId);
      res.json(sanitizeUserForResponse(user));
    })
  );

  // PATCH /users/me - Update current user profile
  router.patch(
    "/me",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = updateProfileSchema.parse(req.body ?? {});
      const existingUser = await getUserByIdOrThrow(firestore, userId);

      // Build update object
      const updates = {
        updatedAt: new Date()
      };

      if (payload.profile) {
        updates.profile = {
          ...existingUser.profile,
          ...payload.profile
        };
      }

      if (payload.preferences) {
        updates.preferences = {
          ...existingUser.preferences,
          ...payload.preferences
        };
      }

      if (payload.experiments) {
        updates.experiments = {
          ...existingUser.experiments,
          ...payload.experiments
        };
      }

      // Save updates via repository
      await updateUser(firestore, userId, updates);
      logger.info({ userId }, "User profile updated");

      // Fetch and return updated user
      const updatedUser = await getUserByIdOrThrow(firestore, userId);
      res.json(sanitizeUserForResponse(updatedUser));
    })
  );

  // POST /users/me/change-password - Change password
  router.post(
    "/me/change-password",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = changePasswordSchema.parse(req.body ?? {});
      const existingUser = await getUserByIdOrThrow(firestore, userId);

      // Only allow password change for password provider
      if (existingUser.auth.provider !== "password") {
        throw httpError(400, "Password change is only available for password-based accounts");
      }

      // Verify current password
      if (!existingUser.auth.passwordHash) {
        throw httpError(500, "Account configuration error");
      }

      const passwordMatch = await bcrypt.compare(
        payload.currentPassword,
        existingUser.auth.passwordHash
      );

      if (!passwordMatch) {
        throw httpError(401, "Current password is incorrect");
      }

      // Hash new password and update via repository
      const newPasswordHash = await bcrypt.hash(payload.newPassword, 10);
      await updateUserPassword(firestore, userId, existingUser.auth, newPasswordHash);

      logger.info({ userId }, "User password changed");

      res.json({
        success: true,
        message: "Password changed successfully"
      });
    })
  );

  // PATCH /users/me/main-company - Set main company
  router.patch(
    "/me/main-company",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = setMainCompanySchema.parse(req.body ?? {});
      const userDoc = await getUserByIdOrThrow(firestore, userId);

      // Set main company via repository (includes validation)
      await setUserMainCompany(firestore, userId, userDoc.profile, payload.companyId);

      res.json({ success: true, mainCompanyId: payload.companyId });
    })
  );

  return router;
}
