import { z } from "zod";
import { NonNegativeNumber, TimestampSchema } from "./common.js";

export const AssetVersionSchema = z.object({
  version: z.number().int().min(1),
  promptVersion: z.string(),
  model: z.string(),
  summary: z.string().optional(),
  payload: z.unknown(),
  createdAt: TimestampSchema,
  createdBy: z.string().nullable().optional(),
  tokensUsed: NonNegativeNumber.optional(),
  creditsCharged: NonNegativeNumber.optional(),
  suggestionIds: z.array(z.string()).default([])
});
