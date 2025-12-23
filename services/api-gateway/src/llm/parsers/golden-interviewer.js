/**
 * Golden Interviewer Response Parser
 *
 * Parses and validates LLM responses for the Golden Interviewer task.
 */

import { z } from "zod";
import { llmLogger } from "../logger.js";
import { safePreview } from "../utils/parsing.js";

/**
 * Decode JSON-encoded string fields back to objects.
 *
 * Anthropic Structured Outputs doesn't support record-type objects (z.record()),
 * so we convert them to JSON-encoded strings in the schema. This function
 * decodes them back to objects after receiving the response.
 *
 * @param {object} parsed - The parsed response from the LLM
 * @returns {object} - Response with decoded fields
 */
function decodeJsonEncodedFields(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return parsed;
  }

  const result = { ...parsed };

  // Decode extraction.updates if it's a string
  if (result.extraction) {
    result.extraction = { ...result.extraction };

    if (typeof result.extraction.updates === "string") {
      try {
        result.extraction.updates = JSON.parse(result.extraction.updates);
      } catch (e) {
        llmLogger.warn(
          { field: "extraction.updates", value: result.extraction.updates?.slice(0, 100) },
          "Failed to decode JSON-encoded extraction.updates"
        );
        result.extraction.updates = {};
      }
    }

    if (typeof result.extraction.confidence === "string") {
      try {
        result.extraction.confidence = JSON.parse(result.extraction.confidence);
      } catch (e) {
        llmLogger.warn(
          { field: "extraction.confidence", value: result.extraction.confidence?.slice(0, 100) },
          "Failed to decode JSON-encoded extraction.confidence"
        );
        result.extraction.confidence = {};
      }
    }
  }

  // Decode ui_tool.props if it's a string
  if (result.ui_tool && typeof result.ui_tool.props === "string") {
    try {
      result.ui_tool = { ...result.ui_tool };
      result.ui_tool.props = JSON.parse(result.ui_tool.props);
    } catch (e) {
      llmLogger.warn(
        { field: "ui_tool.props", value: result.ui_tool.props?.slice(0, 100) },
        "Failed to decode JSON-encoded ui_tool.props"
      );
      result.ui_tool.props = {};
    }
  }

  return result;
}

/**
 * Zod schema for validating LLM responses
 */
const LLMResponseSchema = z.object({
  tool_reasoning: z.string().optional(),
  message: z.string(),
  extraction: z
    .object({
      updates: z.record(z.any()).default({}),
      confidence: z.record(z.number()).optional(),
    })
    .default({ updates: {} }),
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
 * Validate that ui_tool has valid props for its type.
 * Returns an error message if invalid, null if valid.
 *
 * @param {object} uiTool - The ui_tool object from the response
 * @returns {string|null} - Error message if invalid, null if valid
 */
function validateUiToolProps(uiTool) {
  if (!uiTool || !uiTool.type) {
    return null; // No ui_tool is valid (optional field)
  }

  const { type, props } = uiTool;

  // Check for completely empty props
  if (!props || Object.keys(props).length === 0) {
    return `ui_tool.type="${type}" has empty props object`;
  }

  // Type-specific validation for common tools
  switch (type) {
    case "detailed_cards":
      if (!props.options || !Array.isArray(props.options) || props.options.length < 2) {
        return `detailed_cards requires options array with at least 2 items, got: ${JSON.stringify(props.options)}`;
      }
      // Validate each option has required fields
      for (let i = 0; i < props.options.length; i++) {
        const opt = props.options[i];
        if (!opt.id || !opt.title) {
          return `detailed_cards.options[${i}] missing required fields (id, title): ${JSON.stringify(opt)}`;
        }
      }
      break;

    case "icon_grid":
      if (!props.options || !Array.isArray(props.options) || props.options.length < 2) {
        return `icon_grid requires options array with at least 2 items`;
      }
      break;

    case "smart_textarea":
      if (!props.prompts || !Array.isArray(props.prompts) || props.prompts.length < 1) {
        return `smart_textarea requires prompts array with at least 1 item`;
      }
      break;

    case "toggle_list":
      if (!props.items || !Array.isArray(props.items) || props.items.length < 1) {
        return `toggle_list requires items array with at least 1 item`;
      }
      break;

    case "chip_cloud":
      if (!props.groups || !Array.isArray(props.groups) || props.groups.length < 1) {
        return `chip_cloud requires groups array with at least 1 group`;
      }
      break;

    case "gradient_cards":
      if (!props.options || !Array.isArray(props.options) || props.options.length < 2) {
        return `gradient_cards requires options array with at least 2 items`;
      }
      break;

    case "segmented_rows":
      if (!props.rows || !Array.isArray(props.rows) || props.rows.length < 1) {
        return `segmented_rows requires rows array with at least 1 row`;
      }
      break;

    case "circular_gauge":
    case "linear_slider":
      if (!props.label) {
        return `${type} requires label prop`;
      }
      break;

    case "bipolar_scale":
      if (!props.items || !Array.isArray(props.items) || props.items.length < 1) {
        return `bipolar_scale requires items array with at least 1 item`;
      }
      break;

    case "stacked_bar":
      if (!props.segments || !Array.isArray(props.segments) || props.segments.length < 2) {
        return `stacked_bar requires segments array with at least 2 segments`;
      }
      break;

    case "comparison_duel":
      if (!props.optionA || !props.optionB) {
        return `comparison_duel requires optionA and optionB`;
      }
      break;

    case "tag_input":
      // tag_input has all optional props, just needs non-empty props object (already checked above)
      break;

    default:
      // Unknown type - just ensure props isn't empty (already checked above)
      break;
  }

  return null; // Valid
}

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

    // Decode JSON-encoded string fields (Anthropic Structured Outputs workaround)
    // Record-type fields (updates, confidence, props) may be JSON-encoded strings
    parsed = decodeJsonEncodedFields(parsed);

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

    // Runtime guard: Validate ui_tool props are not empty/invalid
    // This catches cases where Claude returns minimal valid schema (e.g., { type: "detailed_cards", props: {} })
    const uiToolError = validateUiToolProps(validationResult.data.ui_tool);
    if (uiToolError) {
      llmLogger.error(
        {
          uiToolError,
          parsedResponse: JSON.stringify(validationResult.data, null, 2),
          uiTool: validationResult.data.ui_tool,
        },
        "golden_interviewer.parse.invalid_ui_tool_props"
      );

      // Return error to trigger retry
      return {
        error: {
          reason: "invalid_ui_tool_props",
          message: uiToolError,
          rawPreview: safePreview(JSON.stringify(validationResult.data.ui_tool)),
        },
      };
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
