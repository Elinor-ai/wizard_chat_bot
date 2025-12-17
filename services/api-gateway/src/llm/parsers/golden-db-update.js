/**
 * Golden DB Update Response Parser (Saver Agent)
 *
 * Parses and validates LLM responses for the golden_db_update task.
 * The Saver Agent returns a simple JSON with updates and reasoning.
 */

import { parseJsonContent, safePreview } from "../utils/parsing.js";
import { llmLogger } from "../logger.js";

/**
 * Parses the LLM response for golden_db_update.
 *
 * IMPORTANT: This function should NEVER throw.
 * On error, return { error: { reason, message, rawPreview } }
 *
 * Expected response format:
 * {
 *   "updates": { "path.to.field": value, ... },
 *   "reasoning": "Brief explanation"
 * }
 *
 * @param {object} response - The raw response from the adapter
 * @param {string} [response.text] - Raw text response
 * @param {object} [response.json] - Pre-parsed JSON (if structured output)
 * @param {object} [response.metadata] - Token counts and metadata
 * @param {object} _context - The original context (usually unused)
 * @returns {object} Parsed result or error object
 */
export function parseGoldenDbUpdateResult(response, _context) {
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
        message: "LLM did not return valid JSON for golden_db_update",
      },
    };
  }

  // Validate updates field exists (can be empty object)
  if (typeof parsed.updates !== "object" || parsed.updates === null) {
    // Try alternative field names
    const updates = parsed.extraction?.updates || parsed.fields || {};

    if (typeof updates !== "object") {
      return {
        error: {
          reason: "missing_updates",
          rawPreview: safePreview(response?.text),
          message: "Response missing required 'updates' field",
        },
      };
    }

    parsed.updates = updates;
  }

  // Validate that update keys use dot notation and are strings
  const validatedUpdates = {};
  for (const [key, value] of Object.entries(parsed.updates)) {
    // Skip null/undefined values
    if (value === null || value === undefined) {
      continue;
    }

    // Validate key format (should be dot notation like "path.to.field")
    if (typeof key !== "string" || key.length === 0) {
      llmLogger.warn(
        { key, value },
        "golden_db_update: skipping invalid key"
      );
      continue;
    }

    validatedUpdates[key] = value;
  }

  const updateCount = Object.keys(validatedUpdates).length;

  llmLogger.info(
    {
      task: "golden_db_update",
      updateCount,
      fields: Object.keys(validatedUpdates),
      reasoning: parsed.reasoning?.slice(0, 100),
    },
    "golden_db_update parsed successfully"
  );

  // Return normalized result
  return {
    updates: validatedUpdates,
    reasoning: parsed.reasoning || null,
    metadata: response?.metadata ?? null,
  };
}
