import { z } from "zod";

// =============================================================================
// GOLDEN INTERVIEW SCHEMAS
// =============================================================================

export const goldenInterviewStartResponseSchema = z.object({
  sessionId: z.string(),
  message: z.string().optional(),
  ui_tool: z
    .object({
      type: z.string(),
      props: z.record(z.string(), z.unknown()).optional(),
    })
    .optional()
    .nullable(),
});

export const goldenInterviewChatResponseSchema = z.object({
  message: z.string().optional(),
  ui_tool: z
    .object({
      type: z.string(),
      props: z.record(z.string(), z.unknown()).optional(),
    })
    .optional()
    .nullable(),
});
