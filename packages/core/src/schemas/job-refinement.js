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
      promptTokens: z.number().optional(),
      completionTokens: z.number().optional(),
      totalTokens: z.number().optional(),
      improvementScore: z
        .number()
        .optional()
        .describe("The optimization score calculated by the AI (0-100)"),
      originalScore: z
        .number()
        .optional()
        .describe("The baseline score before refinement (0-100)"),
      responseTokens: z.number().optional(),
      finishReason: z.string().nullable().optional(),
      changeDetails: z
        .object({
          titleChanges: z
            .array(z.string())
            .describe("List of improvements made to the title"),
          descriptionChanges: z
            .array(z.string())
            .describe("List of improvements made to the description"),
          requirementsChanges: z
            .array(z.string())
            .describe("List of improvements made to the requirements"),
          otherChanges: z.array(z.string()).optional()
        })
        .optional()
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
