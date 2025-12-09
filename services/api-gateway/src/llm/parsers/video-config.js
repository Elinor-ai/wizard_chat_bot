/**
 * @file video-config.js
 * Parser for the VideoConfig LLM task response.
 */

import { llmLogger } from "../logger.js";
import { parseJsonContent, safePreview } from "../utils/parsing.js";

/**
 * Parses the LLM response into a VideoConfig-like structure.
 * Note: This parser does minimal validation - normalizeVideoConfig handles the rest.
 *
 * @param {Object} response - LLM response object with text, json, and metadata fields
 * @returns {Object} - Parsed result with videoConfig field
 */
export function parseVideoConfigResult(response) {
  // Handle both pre-parsed JSON (Gemini) and text that needs parsing (other providers)
  const parsed = parseJsonContent(response?.text) ?? response?.json;

  if (!parsed || typeof parsed !== "object") {
    llmLogger.warn(
      { rawPreview: safePreview(response?.text) },
      "parseVideoConfigResult: no valid JSON found"
    );
    return {
      error: {
        reason: "empty_response",
        message: "LLM returned empty or invalid response",
        rawPreview: safePreview(response?.text)
      }
    };
  }

  // Return the raw parsed object - normalizeVideoConfig will handle validation
  return {
    videoConfig: parsed,
    metadata: response?.metadata ?? null
  };
}
