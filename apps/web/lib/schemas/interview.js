import { z } from "zod";

// =============================================================================
// GOLDEN INTERVIEW SCHEMAS
// =============================================================================

const goldenInterviewUiToolSchema = z
  .object({
    type: z.string(),
    props: z.record(z.string(), z.unknown()).optional(),
  })
  .optional()
  .nullable();

const goldenInterviewResponseDataSchema = z.object({
  message: z.string().optional(),
  ui_tool: goldenInterviewUiToolSchema,
  completion_percentage: z.number().optional(),
  interview_phase: z.string().optional(),
  context_explanation: z.string().optional(),
  extracted_fields: z.array(z.string()).optional(),
  next_priority_fields: z.array(z.string()).optional(),
});

const goldenInterviewStartResponseSchema = z
  .object({
    sessionId: z.string(),
    response: goldenInterviewResponseDataSchema.optional(),
    // Legacy flat structure support
    message: z.string().optional(),
    ui_tool: goldenInterviewUiToolSchema,
  })
  .transform((data) => {
    // Normalize: if response object exists, use it; otherwise use flat fields
    if (data.response) {
      return {
        sessionId: data.sessionId,
        message: data.response.message,
        ui_tool: data.response.ui_tool,
        completion_percentage: data.response.completion_percentage,
        interview_phase: data.response.interview_phase,
        context_explanation: data.response.context_explanation,
      };
    }
    return {
      sessionId: data.sessionId,
      message: data.message,
      ui_tool: data.ui_tool,
      completion_percentage: undefined,
      interview_phase: undefined,
      context_explanation: undefined,
    };
  });

const goldenInterviewChatResponseSchema = goldenInterviewResponseDataSchema;

// =============================================================================
// EXPORTS
// =============================================================================

export {
  goldenInterviewUiToolSchema,
  goldenInterviewResponseDataSchema,
  goldenInterviewStartResponseSchema,
  goldenInterviewChatResponseSchema,
};
