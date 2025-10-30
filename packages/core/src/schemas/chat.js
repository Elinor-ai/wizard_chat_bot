import { z } from "zod";
import { NonNegativeNumber, TimestampSchema } from "./common.js";

export const ChatMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
  createdAt: TimestampSchema,
  costCredits: z.number().optional()
});

export const ChatThreadSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().optional(),
  messages: z.array(ChatMessageSchema),
  totalCredits: NonNegativeNumber.default(0)
});
