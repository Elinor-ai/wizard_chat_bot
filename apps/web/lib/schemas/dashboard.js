import { z } from "zod";

// =============================================================================
// DASHBOARD SCHEMAS
// =============================================================================

export const dashboardSummarySchema = z.object({
  jobs: z.object({
    total: z.number(),
    active: z.number(),
    awaitingApproval: z.number(),
    draft: z.number(),
    states: z.record(z.string(), z.number()),
  }),
  assets: z.object({
    total: z.number(),
    approved: z.number(),
    queued: z.number(),
  }),
  campaigns: z.object({
    total: z.number(),
    live: z.number(),
    planned: z.number(),
  }),
  credits: z.object({
    balance: z.number(),
    reserved: z.number(),
    lifetimeUsed: z.number(),
  }),
  usage: z.object({
    tokens: z.number(),
    applies: z.number(),
    interviews: z.number(),
    hires: z.number(),
    remainingCredits: z.number().optional().default(0),
  }),
  updatedAt: z.string(),
});

export const dashboardSummaryResponseSchema = z.object({
  summary: dashboardSummarySchema,
});

export const dashboardCampaignSchema = z.object({
  campaignId: z.string(),
  jobId: z.string(),
  jobTitle: z.string(),
  logoUrl: z.string().optional().nullable(),
  channel: z.string(),
  status: z.string(),
  budget: z.number(),
  objective: z.string(),
  createdAt: z
    .union([z.string(), z.instanceof(Date)])
    .transform((value) =>
      value instanceof Date ? value.toISOString() : value
    ),
});

export const dashboardCampaignResponseSchema = z.object({
  campaigns: z.array(dashboardCampaignSchema),
});

export const dashboardLedgerEntrySchema = z.object({
  id: z.string(),
  jobId: z.string(),
  type: z.string(),
  workflow: z.string(),
  amount: z.number(),
  status: z.string(),
  purchaseAmountUsd: z.number().optional().nullable(),
  currency: z.string().optional().nullable(),
  occurredAt: z
    .union([z.string(), z.instanceof(Date)])
    .transform((value) =>
      value instanceof Date ? value.toISOString() : value
    ),
});

export const dashboardLedgerResponseSchema = z.object({
  entries: z.array(dashboardLedgerEntrySchema),
});

export const dashboardActivityEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  detail: z.string(),
  occurredAt: z
    .union([z.string(), z.instanceof(Date)])
    .transform((value) =>
      value instanceof Date ? value.toISOString() : value
    ),
});

export const dashboardActivityResponseSchema = z.object({
  events: z.array(dashboardActivityEventSchema),
});
