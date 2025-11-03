import { z } from "zod";
import { TimestampSchema } from "../common/zod.js";

const SuggestionVariantSchema = z.object({
  id: z.string(),
  value: z.unknown(),
  confidence: z.number().min(0).max(1).optional(),
  rationale: z.string().optional(),
  source: z.string().optional()
});

const SuggestionLeafSchema = z.object({
  variants: z.array(SuggestionVariantSchema),
  updatedAt: TimestampSchema
});

const SuggestionTreeSchema = z.lazy(() =>
  z.record(z.string(), z.union([SuggestionLeafSchema, SuggestionTreeSchema]))
);

export const JobSuggestionSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  schema_version: z.literal("2"),
  fields: SuggestionTreeSchema.default({}),
  followUpToUser: z.array(z.string()).default([]),
  skip: z
    .array(
      z.object({
        fieldId: z.string(),
        reason: z.string().optional()
      })
    )
    .default([]),
  nextStepTeaser: z.string().optional(),
  updatedAt: TimestampSchema
});
