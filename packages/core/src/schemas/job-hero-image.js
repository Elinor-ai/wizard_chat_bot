import { z } from "zod";
import { TimestampSchema } from "../common/zod.js";

export const HeroImageStatusEnum = z.enum([
  "PENDING",
  "PROMPTING",
 "GENERATING",
  "READY",
  "FAILED"
]);

export const HeroImageFailureSchema = z
  .object({
    reason: z.string(),
    message: z.string().nullable().optional(),
    rawPreview: z.string().nullable().optional(),
    occurredAt: TimestampSchema.nullable().optional()
  })
  .nullable()
  .optional();

export const JobHeroImageSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  ownerUserId: z.string(),
  status: HeroImageStatusEnum.default("PENDING"),
  prompt: z.string().nullable().optional(),
  promptProvider: z.string().nullable().optional(),
  promptModel: z.string().nullable().optional(),
  promptMetadata: z
    .object({
      promptTokens: z.number().nullable().optional(),
      responseTokens: z.number().nullable().optional(),
      totalTokens: z.number().nullable().optional(),
      finishReason: z.string().nullable().optional()
    })
    .optional(),
  imageUrl: z.string().nullable().optional(),
  imageBase64: z.string().max(950000, "imageBase64 is too large").nullable().optional(),
  imageMimeType: z.string().nullable().optional(),
  imageProvider: z.string().nullable().optional(),
  imageModel: z.string().nullable().optional(),
  imageMetadata: z
    .object({
      seed: z.string().nullable().optional(),
      aspectRatio: z.string().nullable().optional(),
      costCents: z.number().nullable().optional()
    })
    .optional(),
  failure: HeroImageFailureSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema
});
