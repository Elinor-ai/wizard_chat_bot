import { z } from "zod";
import { ConfirmedJobDetailsSchema } from "./job.js";
import { TimestampSchema } from "../common/zod.js";

export const JobRefinementSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  companyId: z.string().nullable().optional(),
  schema_version: z.literal("1"),
  summary: z.string().optional().nullable(),
  refinedJob: ConfirmedJobDetailsSchema,
  provider: z.string().optional(),
  model: z.string().optional(),
  metadata: z
    .object({
      promptTokens: z.number().nullable().optional(),
      responseTokens: z.number().nullable().optional(),
      totalTokens: z.number().nullable().optional(),
      finishReason: z.string().nullable().optional()
    })
    .optional(),
  lastFailure: z
    .object({
      reason: z.string(),
      message: z.string().nullable().optional(),
      rawPreview: z.string().nullable().optional(),
      occurredAt: TimestampSchema
    })
    .optional(),
  updatedAt: TimestampSchema
});
