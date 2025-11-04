import { z } from "zod";
import { TimestampSchema } from "../common/zod.js";

const CandidateSchema = z.object({
  fieldId: z.string(),
  value: z.unknown(),
  rationale: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.string().optional()
});

export const JobSuggestionSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  schema_version: z.literal("3"),
  candidates: z.record(CandidateSchema).default({}),
  provider: z.string().optional(),
  model: z.string().optional(),
  metadata: z
    .object({
      promptTokens: z.number().nullable().optional(),
      candidateTokens: z.number().nullable().optional(),
      totalTokens: z.number().nullable().optional(),
      finishReason: z.string().nullable().optional()
    })
    .optional(),
  lastFailure: z
    .object({
      reason: z.string(),
      rawPreview: z.string().optional().nullable(),
      error: z.string().optional().nullable(),
      occurredAt: TimestampSchema
    })
    .optional(),
  updatedAt: TimestampSchema
});
