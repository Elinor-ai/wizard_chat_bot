import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import bcrypt from "bcryptjs";
import { wrapAsync, httpError } from "@wizard/utils";
import { UserSchema } from "@wizard/core";

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
      balance: 100,
      reserved: 0,
      lifetimeUsed: 0,
      pricingVersion: "v1"
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
      lastActiveAt: now
    },
    createdAt: now,
    updatedAt: now
  };

  return UserSchema.parse(user);
}

export function authRouter({ firestore, logger }) {
  const router = Router();

  router.post(
    "/login",
    wrapAsync(async (req, res) => {
      const payload = loginSchema.parse(req.body ?? {});

      const existingUsers = await firestore.queryDocuments(
        "users",
        "auth.email",
        "==",
        payload.email
      );

      if (existingUsers.length === 0) {
        throw httpError(404, "Account not found. Please sign up.");
      }

      const existing = existingUsers[0];

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

      // Update last login
      const now = new Date();
      const updatedUsage = {
        ...(existing.usage ?? {}),
        lastActiveAt: now
      };
      const updatedSecurity = {
        ...(existing.security ?? {}),
        lastLoginAt: now
      };
      await firestore.saveDocument("users", existing.id, {
        usage: updatedUsage,
        security: updatedSecurity,
        updatedAt: now
      });

      // Don't return password hash to client
      const { passwordHash, ...authWithoutPassword } = existing.auth;

      res.json({
        user: {
          ...existing,
          auth: authWithoutPassword,
          usage: updatedUsage,
          security: updatedSecurity
        },
        isNew: false
      });
    })
  );

  router.post(
    "/signup",
    wrapAsync(async (req, res) => {
      const payload = signupSchema.parse(req.body ?? {});

      const existingUsers = await firestore.queryDocuments(
        "users",
        "auth.email",
        "==",
        payload.email
      );

      if (existingUsers.length > 0) {
        throw httpError(409, "Account already exists. Please log in.");
      }

      // Hash password
      const passwordHash = await bcrypt.hash(payload.password, 10);

      const newUser = buildNewUser(payload, passwordHash);
      const storedUser = await firestore.saveDocument("users", newUser.id, newUser);
      logger.info({ email: payload.email, userId: newUser.id }, "Created new user");

      // Don't return password hash to client
      const { passwordHash: _, ...authWithoutPassword } = storedUser.auth;

      res.json({
        user: {
          ...storedUser,
          auth: authWithoutPassword
        },
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

      // Check if user already exists
      const existingUsers = await firestore.queryDocuments(
        "users",
        "auth.email",
        "==",
        email
      );

      let user;
      let isNew = false;

      if (existingUsers.length > 0) {
        // User exists - update last login
        user = existingUsers[0];
        const now = new Date();
        const updatedUsage = {
          ...(user.usage ?? {}),
          lastActiveAt: now
        };
        const updatedSecurity = {
          ...(user.security ?? {}),
          lastLoginAt: now
        };
        await firestore.saveDocument("users", user.id, {
          usage: updatedUsage,
          security: updatedSecurity,
          updatedAt: now
        });

        user = {
          ...user,
          usage: updatedUsage,
          security: updatedSecurity
        };
      } else {
        // Create new user
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

        user = await firestore.saveDocument("users", newUser.id, newUser);
        logger.info({ email, userId: newUser.id }, "Created new user via Google OAuth");
      }

      // Remove password hash if exists
      const { passwordHash: _, ...authWithoutPassword } = user.auth;

      res.json({
        user: {
          ...user,
          auth: authWithoutPassword
        },
        isNew
      });
    })
  );

  return router;
}
