import { z } from "zod";

// =============================================================================
// CHANNEL RECOMMENDATION SCHEMAS
// =============================================================================

export const channelRecommendationSchema = z.object({
  channel: z.string(),
  reason: z.string(),
  expectedCPA: z.number().optional(),
});

export const channelRecommendationFailureSchema = z
  .object({
    reason: z.string(),
    message: z.string().optional().nullable(),
    rawPreview: z.string().optional().nullable(),
    occurredAt: z.union([z.string(), z.instanceof(Date)]).optional(),
  })
  .transform((data) => ({
    reason: data.reason,
    message: data.message ?? null,
    rawPreview: data.rawPreview ?? null,
    occurredAt:
      data.occurredAt instanceof Date
        ? data.occurredAt
        : data.occurredAt
          ? new Date(data.occurredAt)
          : null,
  }));

export const channelRecommendationResponseSchema = z
  .object({
    jobId: z.string(),
    recommendations: z.array(channelRecommendationSchema).optional(),
    updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
    refreshed: z.boolean().optional(),
    failure: channelRecommendationFailureSchema.optional().nullable(),
  })
  .transform((data) => ({
    jobId: data.jobId,
    recommendations: data.recommendations ?? [],
    updatedAt: data.updatedAt ? new Date(data.updatedAt) : null,
    refreshed: Boolean(data.refreshed),
    failure: data.failure ?? null,
  }));
