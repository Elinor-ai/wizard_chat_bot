import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { wrapAsync, httpError } from "@wizard/utils";
import { UserSchema } from "@wizard/core";

const loginSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  companyName: z.string().optional(),
  provider: z.enum(["password", "google"]).default("password"),
  timezone: z.string().default("UTC"),
  locale: z.string().default("en-US")
});

function buildNewUser(payload) {
  const now = new Date();
  const userId = uuid();

  const user = {
    id: userId,
    orgId: null,
    auth: {
      provider: payload.provider,
      providerUid: `provider:${payload.provider}:${userId}`,
      email: payload.email,
      emailVerified: true,
      roles: ["owner"]
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

      if (existingUsers.length > 0) {
        const existing = existingUsers[0];
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

        res.json({
          user: {
            ...existing,
            usage: updatedUsage,
            security: updatedSecurity
          },
          isNew: false
        });
        return;
      }

      throw httpError(404, "Account not found. Please sign up.");
    })
  );

  router.post(
    "/signup",
    wrapAsync(async (req, res) => {
      const payload = loginSchema.parse(req.body ?? {});

      const existingUsers = await firestore.queryDocuments(
        "users",
        "auth.email",
        "==",
        payload.email
      );

      if (existingUsers.length > 0) {
        throw httpError(409, "Account already exists. Please log in.");
      }

      const newUser = buildNewUser(payload);
      const storedUser = await firestore.saveDocument("users", newUser.id, newUser);
      logger.info({ email: payload.email, userId: newUser.id }, "Created new user");

      res.json({
        user: storedUser,
        isNew: true
      });
    })
  );

  return router;
}
