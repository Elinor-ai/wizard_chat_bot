import { z } from "zod";
import { TimestampSchema } from "../common/zod.js";

export const CopilotMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "tool", "system"]),
  type: z.string().optional().nullable(),
  content: z.string(),
  createdAt: TimestampSchema,
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  stage: z.string().optional().nullable(),
  contextId: z.string().optional().nullable()
});

export const WizardCopilotChatSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  messages: z.array(CopilotMessageSchema).default([]),
  updatedAt: TimestampSchema
});
