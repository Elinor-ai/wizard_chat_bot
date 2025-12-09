import { z } from "zod";

// =============================================================================
// SUBSCRIPTION SCHEMAS
// =============================================================================

export const subscriptionPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  headline: z.string().optional().default(""),
  description: z.string().optional().default(""),
  credits: z.number(),
  bonusCredits: z.number().optional().default(0),
  totalCredits: z.number(),
  priceUsd: z.number(),
  currency: z.string().default("USD"),
  bestFor: z.string().optional().default(""),
  perks: z.array(z.string()).default([]),
  badge: z.string().optional().nullable(),
  effectiveUsdPerCredit: z.number().optional().nullable(),
  markupMultiplier: z.number().optional().nullable(),
});

export const subscriptionPlanListResponseSchema = z.object({
  plans: z.array(subscriptionPlanSchema).default([]),
  currency: z.string().default("USD"),
  usdPerCredit: z.number().optional().nullable(),
});

export const subscriptionPurchaseResponseSchema = z
  .object({
    purchase: z
      .object({
        id: z.string(),
        planId: z.string(),
        planName: z.string(),
        credits: z.number(),
        bonusCredits: z.number(),
        totalCredits: z.number(),
        priceUsd: z.number(),
        currency: z.string(),
        processedAt: z.union([z.string(), z.date()]).optional().nullable(),
        paymentMethod: z
          .object({
            brand: z.string().optional().nullable(),
            last4: z.string().optional().nullable(),
          })
          .optional(),
      })
      .nullable(),
    credits: z
      .object({
        balance: z.number(),
        reserved: z.number(),
        lifetimeUsed: z.number(),
      })
      .optional(),
    usage: z
      .object({
        remainingCredits: z.number().optional(),
      })
      .passthrough()
      .optional(),
    user: z
      .object({
        id: z.string(),
      })
      .passthrough()
      .optional(),
  })
  .transform((data) => ({
    ...data,
    purchase: data.purchase
      ? {
          ...data.purchase,
          processedAt: data.purchase.processedAt
            ? data.purchase.processedAt instanceof Date
              ? data.purchase.processedAt
              : new Date(data.purchase.processedAt)
            : null,
        }
      : null,
  }));
