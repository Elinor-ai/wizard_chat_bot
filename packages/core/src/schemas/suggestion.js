import { z } from "zod";
import { TimestampSchema } from "./common.js";

export const SuggestionSchema = z.object({
  id: z.string().uuid(),
  fieldId: z.string(),
  proposal: z.string(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  createdAt: TimestampSchema.optional(),
  source: z.string().optional()
});
