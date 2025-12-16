/**
 * Golden Interviewer Response Parser
 *
 * Parses and validates LLM responses for the Golden Interviewer task.
 */

import { z } from "zod";
import { llmLogger } from "../logger.js";
import { safePreview } from "../utils/parsing.js";

/**
 * Zod schema for validating LLM responses
 */
const LLMResponseSchema = z.object({
  tool_reasoning: z.string().optional(),
  message: z.string(),
  extraction: z
    .object({
      updates: z.record(z.any()).optional(),
      confidence: z.record(z.number()).optional(),
    })
    .optional(),
  ui_tool: z
    .object({
      type: z.string(),
      props: z.record(z.any()),
    })
    .optional(),
  currently_asking_field: z.string().optional(),
  next_priority_fields: z.array(z.string()).optional(),
  completion_percentage: z.number().optional(),
  interview_phase: z.string().optional(),
});

/**
 * Default fallback response when parsing fails
 */
const FALLBACK_RESPONSE = {
  message: "I had trouble processing that. Let me try asking differently...",
  extraction: {},
  uiTool: {
    type: "smart_textarea",
    props: {
      title: "Tell me more",
      prompts: [
        "What else would you like to share about this role?",
        "Is there anything specific you'd like to add?",
      ],
    },
  },
  completionPercentage: 0,
  interviewPhase: "opening",
  nextPriorityFields: [],
};

/**
 * Parse and validate the Golden Interviewer LLM response.
 *
 * @param {object} raw - The raw response from the LLM adapter
 * @param {string} [raw.text] - Raw text response
 * @param {object} [raw.json] - Parsed JSON response (if adapter provided it)
 * @param {object} [raw.metadata] - Token usage metadata
 * @param {object} context - The context used for the request
 * @returns {object} - Parsed result with normalized field names
 */
export function parseGoldenInterviewerResult(raw, context = {}) {
  if (!raw || typeof raw !== "object") {
    llmLogger.warn(
      { raw: typeof raw },
      "golden_interviewer.parse.invalid_response_type"
    );
    return {
      error: {
        reason: "invalid_response",
        message: "Response is not an object",
        rawPreview: safePreview(String(raw)),
      },
    };
  }

  let parsed;

  try {
    // Handle both direct JSON and text response
    if (raw.json && typeof raw.json === "object") {
      parsed = raw.json;
    } else if (raw.text) {
      // Try to extract JSON from text
      const jsonMatch = raw.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response text");
      }
    } else {
      throw new Error("Response has neither json nor text field");
    }

    // Validate against schema
    const validationResult = LLMResponseSchema.safeParse(parsed);

    if (!validationResult.success) {
      llmLogger.warn(
        {
          errors: validationResult.error.errors,
          rawPreview: safePreview(raw.text || JSON.stringify(parsed)),
        },
        "golden_interviewer.parse.validation_warning"
      );

      // Return what we have with defaults for missing fields
      return normalizeResponse(parsed, raw.metadata);
    }

    return normalizeResponse(validationResult.data, raw.metadata);
  } catch (error) {
    llmLogger.error(
      {
        err: error,
        rawPreview: safePreview(raw.text),
      },
      "golden_interviewer.parse.error"
    );

    return {
      error: {
        reason: "parse_error",
        message: error?.message ?? "Failed to parse LLM response",
        rawPreview: safePreview(raw.text),
      },
    };
  }
}

/**
 * Normalize the parsed response to use consistent field names.
 * Converts snake_case from LLM to camelCase for JS conventions.
 *
 * @param {object} parsed - The parsed response
 * @param {object} metadata - Token usage metadata
 * @returns {object} - Normalized response
 */
function normalizeResponse(parsed, metadata) {
  return {
    // Tool selection reasoning (for debugging)
    toolReasoning: parsed.tool_reasoning || null,

    // Main message content
    message: parsed.message || FALLBACK_RESPONSE.message,

    // Schema extraction data
    extraction: parsed.extraction || {},

    // UI tool for next interaction (convert to camelCase)
    uiTool: parsed.ui_tool || null,

    // The field being asked in THIS turn (for skip tracking)
    currentlyAskingField: parsed.currently_asking_field || null,

    // Next priority fields to fill
    nextPriorityFields: parsed.next_priority_fields || [],

    // Progress tracking
    completionPercentage: parsed.completion_percentage ?? 0,
    interviewPhase: parsed.interview_phase || "opening",

    // Include metadata for usage tracking
    metadata: metadata || null,
  };
}
