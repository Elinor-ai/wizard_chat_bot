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

// Refine result schema - when LLM suggests improvements
const goldenRefineSuggestionSchema = z.object({
  value: z.string(),
  improvement_type: z.enum(["clarity", "completeness", "specificity", "professionalism", "attractiveness"]).optional(),
  why_better: z.string().optional(),
});

const goldenRefineResultSchema = z.object({
  can_proceed: z.boolean(),
  quality: z.enum(["good", "could_improve"]).optional(),
  field: z.string().optional(),
  original_value: z.string().optional(),
  suggestions: z.array(goldenRefineSuggestionSchema).optional(),
  reasoning: z.string().optional(),
}).optional().nullable();

// Navigation state schema - tracks position in interview history
const goldenNavigationSchema = z.object({
  currentIndex: z.number(),
  maxIndex: z.number(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  isEditing: z.boolean(),
}).optional().nullable();

// Previous response schema - for editing flow
const goldenPreviousResponseSchema = z.object({
  message: z.string().optional(),
  uiResponse: z.unknown().optional(),
}).optional().nullable();

// Friction state schema - for skip tracking
const goldenFrictionStateSchema = z.object({
  consecutive_skips: z.number().optional(),
  total_skips: z.number().optional(),
  current_strategy: z.string().optional(),
}).optional().nullable();

const goldenInterviewResponseDataSchema = z.object({
  message: z.string().optional(),
  ui_tool: goldenInterviewUiToolSchema,
  completion_percentage: z.number().optional(),
  interview_phase: z.string().optional(),
  context_explanation: z.string().optional(),
  extracted_fields: z.array(z.string()).optional(),
  next_priority_fields: z.array(z.string()).optional(),
  refine_result: goldenRefineResultSchema,
  // Current field being asked (for frontend to control skip button visibility)
  currently_asking_field: z.string().optional().nullable(),
  // Navigation state - tracks position in interview history
  navigation: goldenNavigationSchema,
  // Previous response - for editing flow (pre-fill user's old answer)
  previous_response: goldenPreviousResponseSchema,
  // Friction state - for skip tracking
  friction_state: goldenFrictionStateSchema,
  // Flag for frontend to show completion UI
  is_complete: z.boolean().optional(),
  // Flag indicating this was an edit of a previous turn
  was_edit: z.boolean().optional(),
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
        currently_asking_field: data.response.currently_asking_field,
        navigation: data.response.navigation,
      };
    }
    return {
      sessionId: data.sessionId,
      message: data.message,
      ui_tool: data.ui_tool,
      completion_percentage: undefined,
      interview_phase: undefined,
      context_explanation: undefined,
      currently_asking_field: undefined,
      navigation: undefined,
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
