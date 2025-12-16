/**
 * Golden Interviewer Output Schema
 *
 * Defines the Zod schema for structured outputs from the Golden Interviewer LLM task.
 * This schema is used by the LLM providers (OpenAI/Gemini) to enforce response structure.
 */

import { z } from "zod";

/**
 * Schema for the extraction object containing updates and confidence scores.
 */
const ExtractionSchema = z.object({
  updates: z
    .record(z.any())
    .optional()
    .describe(
      "Key-value pairs where keys are dot-notation paths in the Golden Schema"
    ),
  confidence: z
    .record(z.number())
    .optional()
    .describe("Confidence scores (0.0-1.0) for each extraction"),
});

/**
 * Schema for the UI tool to display for the next interaction.
 */
const UIToolSchema = z.object({
  type: z.string().describe("One of the 32 available UI tool names"),
  props: z
    .record(z.any())
    .describe("Props for the UI tool, must match tool schema"),
});

/**
 * Main output schema for Golden Interviewer responses.
 *
 * This schema enforces the exact structure expected from the LLM.
 */
export const GoldenInterviewerOutputSchema = z.object({
  tool_reasoning: z
    .string()
    .describe(
      "Internal monologue explaining WHY you chose this specific UI tool. " +
        "Mention the data type (number/text/array), the user's context, " +
        "and why this component is the most engaging choice."
    ),
  message: z
    .string()
    .describe("Conversational response to the user (1-3 sentences)"),
  extraction: ExtractionSchema.optional().describe(
    "Data extracted from user's input"
  ),
  ui_tool: UIToolSchema.optional().describe(
    "The UI component to display for the next question"
  ),
  next_priority_fields: z
    .array(z.string())
    .optional()
    .describe("Top 3 fields to fill next"),
  completion_percentage: z
    .number()
    .optional()
    .describe("Estimated schema completion (0-100)"),
  interview_phase: z
    .string()
    .optional()
    .describe(
      "Current phase: opening|compensation|time_flexibility|environment|culture|growth|stability|role_details|unique_value|closing"
    ),
});
