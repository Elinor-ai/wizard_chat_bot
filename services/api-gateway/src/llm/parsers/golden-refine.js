/**
 * Golden Refine Response Parser
 *
 * Parses and validates LLM responses for the golden_refine task.
 * This task validates and evaluates free-text user input.
 *
 * Expected response format:
 * {
 *   "can_proceed": boolean,
 *   "validation_issue": "string or null",
 *   "quality": "good" | "could_improve",
 *   "reasoning": "Brief explanation",
 *   "suggestions": [
 *     {
 *       "value": "Improved version",
 *       "improvement_type": "clarity" | "completeness" | "specificity" | "professionalism" | "attractiveness",
 *       "why_better": "Brief explanation"
 *     }
 *   ]
 * }
 */

import { parseJsonContent, safePreview } from "../utils/parsing.js";
import { llmLogger } from "../logger.js";

// Valid quality values
const VALID_QUALITIES = ["good", "could_improve"];

// Valid improvement types
const VALID_IMPROVEMENT_TYPES = ["clarity", "completeness", "specificity", "professionalism", "attractiveness"];

/**
 * Parses the LLM response for golden_refine.
 *
 * IMPORTANT: This function should NEVER throw.
 * On error, return { error: { reason, message, rawPreview } }
 *
 * @param {object} response - The raw response from the adapter
 * @param {string} [response.text] - Raw text response
 * @param {object} [response.json] - Pre-parsed JSON (if structured output)
 * @param {object} [response.metadata] - Token counts and metadata
 * @param {object} _context - The original context (usually unused)
 * @returns {object} Parsed result or error object
 */
export function parseGoldenRefineResult(response, _context) {
  // Try response.json first (from structured output)
  // Then fallback to parsing from text
  const parsed =
    response?.json && typeof response.json === "object"
      ? response.json
      : parseJsonContent(response?.text);

  // Basic validation
  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        reason: "structured_missing",
        rawPreview: safePreview(response?.text),
        message: "LLM did not return valid JSON for golden_refine",
      },
    };
  }

  // Validate can_proceed field (required)
  const canProceed = parsed.can_proceed;
  if (typeof canProceed !== "boolean") {
    // Try to infer from quality if missing
    if (parsed.quality === "good" || parsed.quality === "could_improve") {
      llmLogger.warn(
        { quality: parsed.quality },
        "golden_refine: can_proceed missing, inferring true from quality"
      );
    } else {
      return {
        error: {
          reason: "missing_can_proceed",
          rawPreview: safePreview(response?.text),
          message: "Response missing required 'can_proceed' boolean field",
        },
      };
    }
  }

  // Final can_proceed value (default to true if quality is present)
  const finalCanProceed = typeof canProceed === "boolean"
    ? canProceed
    : true;

  // Validate validation_issue (required when can_proceed=false)
  let validationIssue = parsed.validation_issue || null;
  if (!finalCanProceed && !validationIssue) {
    validationIssue = "The response is not valid for this field";
    llmLogger.warn(
      {},
      "golden_refine: can_proceed=false but no validation_issue provided, using default"
    );
  }

  // Validate quality field
  let quality = parsed.quality;
  if (!quality || !VALID_QUALITIES.includes(quality)) {
    // Default based on can_proceed
    quality = finalCanProceed ? "could_improve" : "could_improve";
    llmLogger.warn(
      { originalQuality: parsed.quality },
      "golden_refine: invalid quality, defaulting to 'could_improve'"
    );
  }

  // Validate reasoning field
  const reasoning = parsed.reasoning || parsed.reason || parsed.explanation || "";
  if (typeof reasoning !== "string" || reasoning.length === 0) {
    llmLogger.warn(
      {},
      "golden_refine: missing reasoning field"
    );
  }

  // Validate suggestions array
  let suggestions = parsed.suggestions;
  if (!Array.isArray(suggestions)) {
    // Try alternative field names
    suggestions = parsed.alternatives || parsed.improvements || [];
  }

  // If quality is "good", suggestions should be empty
  if (quality === "good" && suggestions.length > 0) {
    llmLogger.warn(
      { suggestionCount: suggestions.length },
      "golden_refine: quality is 'good' but suggestions were provided, ignoring them"
    );
    suggestions = [];
  }

  // Validate and normalize suggestions
  const validatedSuggestions = [];
  for (const suggestion of suggestions) {
    if (!suggestion || typeof suggestion !== "object") {
      continue;
    }

    const value = suggestion.value || suggestion.text || suggestion.improved;
    if (typeof value !== "string" || value.length === 0) {
      llmLogger.warn(
        { suggestion },
        "golden_refine: skipping suggestion without valid value"
      );
      continue;
    }

    // Normalize improvement type
    let improvementType = suggestion.improvement_type || suggestion.type || "clarity";
    if (!VALID_IMPROVEMENT_TYPES.includes(improvementType)) {
      improvementType = "clarity"; // Default to clarity
    }

    validatedSuggestions.push({
      value: value.trim(),
      improvement_type: improvementType,
      why_better: suggestion.why_better || suggestion.reason || suggestion.explanation || null,
    });
  }

  // Limit to max 3 suggestions
  const finalSuggestions = validatedSuggestions.slice(0, 3);

  llmLogger.info(
    {
      task: "golden_refine",
      canProceed: finalCanProceed,
      quality,
      suggestionCount: finalSuggestions.length,
      hasValidationIssue: Boolean(validationIssue),
    },
    "golden_refine parsed successfully"
  );

  // Return normalized result
  return {
    can_proceed: finalCanProceed,
    validation_issue: validationIssue,
    quality,
    reasoning: reasoning || "No explanation provided",
    suggestions: finalSuggestions,
    metadata: response?.metadata ?? null,
  };
}
