import { z } from "zod";
import { NonNegativeNumber } from "./common.js";

export const LlmSuggestionBucketSchema = z.object({
  salaryRanges: z
    .array(
      z.object({
        min: z.number().optional(),
        max: z.number().optional(),
        confidence: z.number().min(0).max(1),
        source: z.string().optional()
      })
    )
    .default([]),
  benefitIdeas: z
    .array(z.object({ text: z.string(), source: z.string().optional() }))
    .default([]),
  titleVariants: z
    .array(
      z.object({
        text: z.string(),
        score: z.number().optional(),
        goal: z.enum(["CTR", "SEO", "ApplyRate"]).optional()
      })
    )
    .default([]),
  descriptionDrafts: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        promptVersion: z.string(),
        model: z.string(),
        score: z.number().optional()
      })
    )
    .default([]),
  channelRecommendations: z
    .array(
      z.object({
        channel: z.string(),
        reason: z.string(),
        expectedCPA: z.number().optional()
      })
    )
    .default([])
});

export const EMPTY_SUGGESTIONS = LlmSuggestionBucketSchema.parse({});
