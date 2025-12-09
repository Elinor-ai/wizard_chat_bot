import { z } from "zod";

// =============================================================================
// JOB ASSET SCHEMAS
// =============================================================================

export const jobAssetFailureSchema = z
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
    occurredAt: data.occurredAt
      ? data.occurredAt instanceof Date
        ? data.occurredAt
        : new Date(data.occurredAt)
      : null,
  }));

export const jobAssetSchema = z
  .object({
    id: z.string(),
    jobId: z.string(),
    channelId: z.string(),
    formatId: z.string(),
    artifactType: z.string(),
    status: z.string(),
    provider: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    llmRationale: z.string().nullable().optional(),
    content: z.record(z.string(), z.unknown()).optional().nullable(),
    failure: jobAssetFailureSchema.optional().nullable(),
    updatedAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
  })
  .transform((data) => ({
    ...data,
    updatedAt: data.updatedAt
      ? data.updatedAt instanceof Date
        ? data.updatedAt
        : new Date(data.updatedAt)
      : null,
  }));

export const jobAssetRunSchema = z
  .object({
    id: z.string(),
    jobId: z.string(),
    status: z.string(),
    channelIds: z.array(z.string()).optional(),
    formatIds: z.array(z.string()).optional(),
    stats: z
      .object({
        assetsPlanned: z.number().optional().nullable(),
        assetsCompleted: z.number().optional().nullable(),
        promptTokens: z.number().optional().nullable(),
        responseTokens: z.number().optional().nullable(),
      })
      .optional(),
    startedAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
    completedAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
    error: z
      .object({
        reason: z.string(),
        message: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .transform((data) => ({
    ...data,
    channelIds: data.channelIds ?? [],
    formatIds: data.formatIds ?? [],
    startedAt: data.startedAt
      ? data.startedAt instanceof Date
        ? data.startedAt
        : new Date(data.startedAt)
      : null,
    completedAt: data.completedAt
      ? data.completedAt instanceof Date
        ? data.completedAt
        : new Date(data.completedAt)
      : null,
  }));

export const jobAssetResponseSchema = z.object({
  jobId: z.string(),
  assets: z.array(jobAssetSchema).default([]),
  run: jobAssetRunSchema.nullable().optional(),
});
