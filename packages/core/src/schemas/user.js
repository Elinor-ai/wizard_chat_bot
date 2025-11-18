import { z } from "zod";
import { NonNegativeNumber, TimestampSchema } from "../common/zod.js";

export const UserRoleEnum = z.enum(["owner", "admin", "member"]);
export const AuthProviderEnum = z.enum(["password", "google"]);
export const PlanIdEnum = z.enum(["free", "starter", "pro", "enterprise"]);
export const PlanStatusEnum = z.enum(["trial", "active", "past_due", "canceled"]);

export const UserSchema = z.object({
  id: z.string(),
  orgId: z.string().nullable().optional(),
  auth: z.object({
    provider: AuthProviderEnum,
    providerUid: z.string(),
    email: z.string().email(),
    emailVerified: z.boolean(),
    roles: z.array(UserRoleEnum).min(1),
    passwordHash: z.string().optional() // Only for password provider
  }),
  profile: z.object({
    name: z.string(),
    companyName: z.string().optional(),
    companyDomain: z.string().nullable().optional(),
    mainCompanyId: z.string().nullable().optional(),
    companyIds: z.array(z.string()).default([]),
    timezone: z.string(),
    locale: z.string(),
    phone: z.string().optional()
  }),
  plan: z.object({
    planId: PlanIdEnum,
    status: PlanStatusEnum,
    seatCount: z.number().int().min(1),
    currency: z.string().length(3),
    trialEndsAt: TimestampSchema.nullable().optional(),
    entitlements: z.record(z.string(), z.union([z.boolean(), z.number()]))
  }),
  billing: z.object({
    billingAccountId: z.string(),
    taxId: z.string().optional(),
    invoiceEmail: z.string().email(),
    address: z.record(z.string(), z.unknown()).optional(),
    paymentMethodLast4: z.string().optional(),
    billingCycleAnchor: TimestampSchema
  }),
  credits: z.object({
    balance: NonNegativeNumber,
    reserved: NonNegativeNumber,
    lifetimeUsed: NonNegativeNumber,
    pricingVersion: z.string()
  }),
  limits: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])),
  preferences: z.object({
    emailNotifications: z.boolean(),
    marketingOptIn: z.boolean(),
    languagesPreferred: z.array(z.string()).optional()
  }),
  experiments: z.record(z.string(), z.string()),
  security: z.object({
    mfaEnabled: z.boolean(),
    lastLoginAt: TimestampSchema.nullable(),
    riskScore: z.number().min(0).max(100)
  }),
  attribution: z
    .object({
      signupUtm: z.record(z.string(), z.string()).optional(),
      referrer: z.string().optional(),
      source: z.string().optional()
    })
    .optional(),
  usage: z.object({
    jobsCreated: z.number().int().min(0),
    assetsGenerated: z.number().int().min(0),
    tokensMonth: z.number().int().min(0),
    lastActiveAt: TimestampSchema.nullable(),
    totalTokensUsed: z.number().int().min(0).default(0),
    remainingTokens: z.number().int().default(0),
    remainingCredits: z.number().default(0)
  }),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema
});
