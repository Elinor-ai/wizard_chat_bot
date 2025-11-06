import { z } from "zod";
import { ChannelRecommendationSchema } from "../common/llm-suggestions.js";
import { TimestampSchema } from "../common/zod.js";

export const JobChannelRecommendationSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  schema_version: z.literal("1"),
  recommendations: z.array(ChannelRecommendationSchema).default([]),
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

