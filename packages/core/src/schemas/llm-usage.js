import { z } from "zod";
import { TimestampSchema } from "../common/zod.js";

export const LlmUsageStatusEnum = z.enum(["success", "error"]);

export const LlmUsageEntrySchema = z.object({
  id: z.string().optional(),
  userId: z.string().nullable().optional(),
  jobId: z.string().nullable().optional(),
  taskType: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  inputTokens: z.number().int().min(0).default(0),
  outputTokens: z.number().int().min(0).default(0),
  totalTokens: z.number().int().min(0).default(0),
  creditsUsed: z.number().min(0).default(0),
  status: LlmUsageStatusEnum,
  errorReason: z.string().optional(),
  timestamp: TimestampSchema,
  metadata: z
    .object({
      finishReason: z.string().optional()
    })
    .optional()
});
