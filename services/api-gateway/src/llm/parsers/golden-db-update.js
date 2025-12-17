/**
 * Golden DB Update Response Parser
 *
 * Parses and validates LLM responses for the golden_db_update task.
 */

import { parseJsonContent, safePreview } from "../utils/parsing.js";

/**
 * Parses the LLM response for golden_db_update.
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

  // TODO: Add specific field validation based on expected response structure

  // Return normalized result
  return {
    updates: parsed.updates ?? parsed.extraction?.updates ?? {},
    metadata: response?.metadata ?? null,
  };
}
