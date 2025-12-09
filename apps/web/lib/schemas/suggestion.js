import { z } from "zod";
import { valueSchema } from "./base.js";

// =============================================================================
// SUGGESTION / COPILOT SUGGESTION SCHEMAS
// =============================================================================

export const suggestionSchema = z.object({
  fieldId: z.string(),
  value: valueSchema,
  rationale: z.string().optional(),
  confidence: z.number().optional(),
  source: z.string().optional(),
});

export const suggestionFailureSchema = z
  .object({
    reason: z.string(),
    rawPreview: z.string().optional().nullable(),
    error: z.string().optional().nullable(),
    occurredAt: z.union([z.string(), z.instanceof(Date)]).optional(),
  })
  .transform((data) => ({
    reason: data.reason,
    rawPreview: data.rawPreview ?? null,
    error: data.error ?? null,
    occurredAt:
      data.occurredAt instanceof Date
        ? data.occurredAt
        : data.occurredAt
          ? new Date(data.occurredAt)
          : null,
  }));

export const copilotSuggestionResponseSchema = z
  .object({
    jobId: z.string().optional(),
    suggestions: z.array(suggestionSchema).optional(),
    updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
    refreshed: z.boolean().optional(),
    failure: suggestionFailureSchema.optional().nullable(),
  })
  .transform((data) => ({
    jobId: data.jobId ?? null,
    suggestions: data.suggestions ?? [],
    updatedAt: data.updatedAt ? new Date(data.updatedAt) : null,
    refreshed: Boolean(data.refreshed),
    failure: data.failure ?? null,
  }));
