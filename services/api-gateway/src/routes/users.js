import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { wrapAsync, httpError } from "@wizard/utils";

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

      const user = await firestore.getDocument("users", userId);

      if (!user) {
        throw httpError(404, "User not found");
      }

      // Don't return password hash to client
      const { passwordHash, ...authWithoutPassword } = user.auth;

      res.json({
        ...user,
        auth: authWithoutPassword
      });
    })
  );

  // PATCH /users/me - Update current user profile
  router.patch(
    "/me",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);

      const payload = updateProfileSchema.parse(req.body ?? {});

      // Get existing user
      const existingUser = await firestore.getDocument("users", userId);

      if (!existingUser) {
        throw httpError(404, "User not found");
      }

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

      // Save updates
      await firestore.saveDocument("users", userId, updates);

      logger.info({ userId }, "User profile updated");

      // Fetch updated user
      const updatedUser = await firestore.getDocument("users", userId);

      // Don't return password hash to client
      const { passwordHash, ...authWithoutPassword } = updatedUser.auth;

      res.json({
        ...updatedUser,
        auth: authWithoutPassword
      });
    })
  );

  // POST /users/me/change-password - Change password
  router.post(
    "/me/change-password",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);

      const payload = changePasswordSchema.parse(req.body ?? {});

      // Get existing user
      const existingUser = await firestore.getDocument("users", userId);

      if (!existingUser) {
        throw httpError(404, "User not found");
      }

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

      // Hash new password
      const newPasswordHash = await bcrypt.hash(payload.newPassword, 10);

      // Update password
      await firestore.saveDocument("users", userId, {
        auth: {
          ...existingUser.auth,
          passwordHash: newPasswordHash
        },
        updatedAt: new Date()
      });

      logger.info({ userId }, "User password changed");

      res.json({
        success: true,
        message: "Password changed successfully"
      });
    })
  );

  router.patch(
    "/me/main-company",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = setMainCompanySchema.parse(req.body ?? {});
      const userDoc = await firestore.getDocument("users", userId);
      if (!userDoc) {
        throw httpError(404, "User not found");
      }
      const companyIds = Array.isArray(userDoc.profile?.companyIds)
        ? userDoc.profile.companyIds.filter((value) => typeof value === "string" && value.trim().length > 0)
        : [];
      if (!companyIds.includes(payload.companyId)) {
        throw httpError(400, "Company not linked to this user");
      }
      const nextProfile = {
        ...(userDoc.profile ?? {}),
        mainCompanyId: payload.companyId,
        companyIds
      };
      await firestore.saveDocument("users", userId, {
        profile: nextProfile,
        updatedAt: new Date()
      });
      res.json({ success: true, mainCompanyId: payload.companyId });
    })
  );

  return router;
}
