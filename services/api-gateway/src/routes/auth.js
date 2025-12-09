/**
 * @file auth.js
 * Authentication API Router - handles login, signup, and OAuth.
 *
 * ARCHITECTURE:
 * - All Firestore access goes through user-repository.js
 * - This router does NOT access firestore directly
 */

import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import bcrypt from "bcryptjs";
import { wrapAsync, httpError } from "@wizard/utils";
import { UserSchema } from "@wizard/core";
import { issueAuthToken } from "../utils/auth-tokens.js";
import { ensureCompanyForEmail } from "../services/company-intel.js";
import {
  getUserByEmail,
  userExistsByEmail,
  createUser,
  updateUser,
  updateUserLoginInfo,
  sanitizeUserForResponse
} from "../services/repositories/index.js";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1),
  companyName: z.string().optional(),
  timezone: z.string().default("UTC"),
  locale: z.string().default("en-US")
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  provider: z.enum(["password", "google"]).default("password")
});

function buildNewUser(payload, passwordHash = null) {
  const now = new Date();
  const userId = uuid();

  const user = {
    id: userId,
    orgId: null,
    auth: {
      provider: payload.provider || "password",
      providerUid: `provider:${payload.provider || "password"}:${userId}`,
      email: payload.email,
      emailVerified: payload.provider === "google" ? true : false,
      roles: ["owner"],
      passwordHash: passwordHash || undefined
    },
    profile: {
      name: payload.name,
      companyName: payload.companyName ?? "",
      companyDomain: payload.companyDomain ?? null,
      mainCompanyId: null,
      companyIds: [],
      timezone: payload.timezone,
      locale: payload.locale,
      phone: ""
    },
    plan: {
      planId: "starter",
      status: "active",
      seatCount: 1,
      currency: "USD",
      trialEndsAt: null,
      entitlements: {
        maxJobs: 10,
        maxCampaigns: 5,
        videoEnabled: true
      }
    },
    billing: {
      billingAccountId: `acct_${userId}`,
      taxId: "",
      invoiceEmail: payload.email,
      address: {},
      paymentMethodLast4: "",
      billingCycleAnchor: now
    },
    credits: {
      balance: 0,
      reserved: 0,
      lifetimeUsed: 0
    },
    limits: {
      monthTokensCap: 2_000_000,
      monthAssetCap: 500
    },
    preferences: {
      emailNotifications: true,
      marketingOptIn: false,
      languagesPreferred: ["en"]
    },
    experiments: {},
    security: {
      mfaEnabled: false,
      lastLoginAt: now,
      riskScore: 0
    },
    usage: {
      jobsCreated: 0,
      assetsGenerated: 0,
      tokensMonth: 0,
      lastActiveAt: now,
      totalTokensUsed: 0,
      remainingCredits: 0
    },
    createdAt: now,
    updatedAt: now
  };

  return UserSchema.parse(user);
}

async function linkUserToCompany({ firestore, logger, user }) {
  const email = user?.auth?.email;
  if (!email) {
    return user;
  }
  const result = await ensureCompanyForEmail({
    firestore,
    logger,
    email,
    createdByUserId: user.id,
    nameHint: user.profile?.companyName
  });
  if (!result?.domain) {
    return user;
  }

  const companyId = result.company?.id ?? null;
  const existingProfile = user.profile ?? {};
  const normalizedExistingDomain = existingProfile.companyDomain?.toLowerCase?.() ?? null;
  const nextProfile = {
    ...existingProfile
  };
  let changed = false;
  if (result.domain && normalizedExistingDomain !== result.domain) {
    nextProfile.companyDomain = result.domain;
    changed = true;
  }
  const existingCompanyIds = Array.isArray(existingProfile.companyIds)
    ? [...existingProfile.companyIds]
    : [];
  if (companyId && !existingCompanyIds.includes(companyId)) {
    existingCompanyIds.push(companyId);
    changed = true;
  }
  if (existingCompanyIds.length > 0) {
    nextProfile.companyIds = existingCompanyIds;
  }
  if (!nextProfile.mainCompanyId && companyId) {
    nextProfile.mainCompanyId = companyId;
    changed = true;
  }

  if (changed) {
    // Use repository function for user update
    await updateUser(firestore, user.id, {
      profile: nextProfile,
      updatedAt: new Date()
    });
  }

  logger?.info?.(
    { userId: user.id, domain: result.domain },
    "Linked user profile to company domain"
  );

  return {
    ...user,
    profile: nextProfile
  };
}

export function authRouter({ firestore, logger }) {
  const router = Router();

  router.post(
    "/login",
    wrapAsync(async (req, res) => {
      const payload = loginSchema.parse(req.body ?? {});

      // Get user by email via repository
      const existing = await getUserByEmail(firestore, payload.email);

      if (!existing) {
        throw httpError(404, "Account not found. Please sign up.");
      }

      // Check if user is using password provider
      if (existing.auth.provider === "password") {
        if (!existing.auth.passwordHash) {
          throw httpError(500, "Account configuration error");
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(payload.password, existing.auth.passwordHash);
        if (!passwordMatch) {
          throw httpError(401, "Invalid password");
        }
      }

      // Update last login via repository
      await updateUserLoginInfo(firestore, existing.id, existing.usage, existing.security);

      // Build updated user with new login info
      const now = new Date();
      const updatedUsage = { ...(existing.usage ?? {}), lastActiveAt: now };
      const updatedSecurity = { ...(existing.security ?? {}), lastLoginAt: now };

      let sanitizedUser = {
        ...sanitizeUserForResponse(existing),
        usage: updatedUsage,
        security: updatedSecurity
      };
      sanitizedUser = await linkUserToCompany({ firestore, logger, user: sanitizedUser });

      const token = issueAuthToken(sanitizedUser);

      res.json({
        user: sanitizedUser,
        token,
        isNew: false
      });
    })
  );

  router.post(
    "/signup",
    wrapAsync(async (req, res) => {
      const payload = signupSchema.parse(req.body ?? {});

      // Check if user exists via repository
      const exists = await userExistsByEmail(firestore, payload.email);
      if (exists) {
        throw httpError(409, "Account already exists. Please log in.");
      }

      // Hash password and create user via repository
      const passwordHash = await bcrypt.hash(payload.password, 10);
      const newUser = buildNewUser(payload, passwordHash);
      const storedUser = await createUser(firestore, newUser);
      logger.info({ email: payload.email, userId: newUser.id }, "Created new user");

      let sanitizedUser = sanitizeUserForResponse(storedUser);
      sanitizedUser = await linkUserToCompany({ firestore, logger, user: sanitizedUser });
      const token = issueAuthToken(sanitizedUser);

      res.json({
        user: sanitizedUser,
        token,
        isNew: true
      });
    })
  );

  // Google OAuth callback - called from NextAuth
  router.post(
    "/oauth/google",
    wrapAsync(async (req, res) => {
      const { email, name, googleId } = req.body;

      if (!email || !name || !googleId) {
        throw httpError(400, "Missing required OAuth fields");
      }

      // Check if user already exists via repository
      const existingUser = await getUserByEmail(firestore, email);

      let user;
      let isNew = false;

      if (existingUser) {
        // User exists - update last login via repository
        user = existingUser;
        await updateUserLoginInfo(firestore, user.id, user.usage, user.security);

        const now = new Date();
        user = {
          ...user,
          usage: { ...(user.usage ?? {}), lastActiveAt: now },
          security: { ...(user.security ?? {}), lastLoginAt: now }
        };
      } else {
        // Create new user via repository
        isNew = true;
        const payload = {
          email,
          name,
          provider: "google",
          timezone: "UTC",
          locale: "en-US"
        };
        const newUser = buildNewUser(payload);
        // Update providerUid to use Google ID
        newUser.auth.providerUid = `google:${googleId}`;

        user = await createUser(firestore, newUser);
        logger.info({ email, userId: newUser.id }, "Created new user via Google OAuth");
      }

      let sanitizedUser = sanitizeUserForResponse(user);
      sanitizedUser = await linkUserToCompany({ firestore, logger, user: sanitizedUser });
      const token = issueAuthToken(sanitizedUser);

      res.json({
        user: sanitizedUser,
        token,
        isNew
      });
    })
  );

  return router;
}
