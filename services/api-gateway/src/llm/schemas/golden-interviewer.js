/**
 * Golden Interviewer Output Schema
 *
 * Defines the Zod schema for structured outputs from the Golden Interviewer LLM task.
 * This schema is used by LLM providers (OpenAI/Gemini/Anthropic) to enforce response STRUCTURE.
 *
 * DESIGN PRINCIPLES:
 * 1. Structure-only: Defines shape + types, NOT content values
 * 2. No content restrictions: No enums, no hardcoded option ids/titles, no regex constraints
 * 3. Minimal optionality: Required fields where possible to guide the model
 * 4. Anthropic-compatible: < 24 optional parameters for Structured Outputs
 *
 * OPTIONAL PARAMETER BUDGET (Anthropic limit: 24):
 * - extraction (parent): 1
 * - extraction.updates: 1
 * - extraction.confidence: 1
 * - ui_tool (parent): 1
 * - context_explanation: 1
 * - next_priority_fields: 1
 * - completion_percentage: 1
 * - interview_phase: 1
 * Total: 8 optional params
 *
 * RUNTIME VALIDATION:
 * The parser (golden-interviewer.js) has validateUiToolProps() that enforces
 * tool-specific requirements (e.g., detailed_cards needs options array).
 * This allows the schema to remain simple while still catching invalid responses.
 */

import { z } from "zod";

// =============================================================================
// EXTRACTION SCHEMA
// =============================================================================

/**
 * Schema for data extracted from user responses.
 *
 * updates: Key-value pairs where keys are dot-notation paths in the Golden Schema
 * confidence: Confidence scores (0.0-1.0) for each extraction
 */
const ExtractionSchema = z.object({
  updates: z
    .record(z.string(), z.any())
    .optional()
    .describe("Key-value pairs where keys are dot-notation paths in the Golden Schema"),
  confidence: z
    .record(z.string(), z.number())
    .optional()
    .describe("Confidence scores (0.0-1.0) for each extracted field"),
});

// =============================================================================
// UI TOOL SCHEMA
// =============================================================================

/**
 * Schema for UI tool configuration.
 *
 * This schema is intentionally minimal to stay under Anthropic's optional parameter limit.
 * The props object accepts any keys - tool-specific validation is done at runtime.
 *
 * When ui_tool is present, both type and props are REQUIRED.
 * The props object MUST contain the required fields for the chosen tool type.
 */
const UIToolSchema = z.object({
  type: z
    .string()
    .describe("UI tool type name (e.g., detailed_cards, smart_textarea, icon_grid, chip_cloud, circular_gauge, toggle_list, etc.)"),
  props: z
    .record(z.string(), z.any())
    .describe(
      "Tool-specific configuration object. " +
      "MUST contain required props for the tool type. " +
      "See UI Tool Catalog in system prompt for each tool's requirements."
    ),
});

// =============================================================================
// MAIN OUTPUT SCHEMA
// =============================================================================

/**
 * Main output schema for Golden Interviewer responses.
 *
 * Required fields:
 * - tool_reasoning: Internal monologue explaining UI tool choice
 * - message: The interviewer's message to display
 * - currently_asking_field: The Golden Schema field being asked about
 *
 * Optional fields:
 * - extraction: Data extracted from user's previous response
 * - ui_tool: UI component configuration (omit for final/closing turns)
 * - next_priority_fields: Upcoming fields to ask about
 * - completion_percentage: Estimated interview progress
 * - interview_phase: Current phase of the interview
 */
export const GoldenInterviewerOutputSchema = z.object({
  // -------------------------------------------------------------------------
  // REQUIRED FIELDS
  // -------------------------------------------------------------------------

  tool_reasoning: z
    .string()
    .describe(
      "Internal monologue explaining WHY you chose this specific UI tool. " +
      "Mention the data type (number/text/array), the user's context, " +
      "and why this component is the most engaging choice."
    ),

  message: z
    .string()
    .describe(
      "Short, punchy response (MAX 1-2 sentences). " +
      "Acknowledge briefly, then ask the question. " +
      "Example: 'Got it. For the base rate, what is the competitive range in your market?'"
    ),

  currently_asking_field: z
    .string()
    .nullable()
    .describe(
      "The specific Golden Schema field path that THIS question is targeting. " +
      "Example: 'role_overview.job_title' or 'financial_reality.base_compensation.amount_or_range'. " +
      "Used to track which field was skipped if the user skips. " +
      "Can be null for closing/summary turns."
    ),

  // -------------------------------------------------------------------------
  // OPTIONAL FIELDS
  // -------------------------------------------------------------------------

  extraction: ExtractionSchema
    .optional()
    .describe("Data extracted from the user's previous response to update the Golden Schema"),

  context_explanation: z
    .string()
    .optional()
    .describe(
      "Educational context explaining WHY this question matters to the employer. " +
      "Shows how specific professional details help attract the right candidates. " +
      "Example: 'In specialized care, low patient ratios attract nurses who prioritize safety.'"
    ),

  ui_tool: UIToolSchema
    .nullable()
    .optional()
    .describe(
      "The UI component to display for the next question. " +
      "Set to null for closing/complete phase. " +
      "Omit when no UI component is needed."
    ),

  next_priority_fields: z
    .array(z.string())
    .optional()
    .describe("Top 3 Golden Schema fields to ask about next (after currently_asking_field)"),

  completion_percentage: z
    .number()
    .optional()
    .describe("Estimated interview completion progress (0-100)"),

  interview_phase: z
    .string()
    .optional()
    .describe(
      "Current phase of the interview. " +
      "Common phases: opening, compensation, time_flexibility, environment, culture, growth, stability, role_details, unique_value, closing"
    ),
});

// =============================================================================
// EXPORTS
// =============================================================================

export { UIToolSchema, ExtractionSchema };
