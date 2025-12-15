/**
 * @file job-snippet-classifier.js
 * Parser for job snippet classifier LLM responses.
 */

import { parseJsonContent, safePreview } from "../utils/parsing.js";

/**
 * Parse the result from job snippet classifier task.
 *
 * @param {Object} response - Raw LLM response
 * @param {Object} _context - Original context (unused)
 * @returns {Object} Parsed result with classification data and metadata
 */
export function parseJobSnippetClassifierResult(response, _context) {
  const parsed =
    response?.json && typeof response.json === "object"
      ? response.json
      : parseJsonContent(response?.text);

  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        reason: "structured_missing",
        rawPreview: safePreview(response?.text),
        message: "LLM did not return valid JSON for job_snippet_classifier",
      },
    };
  }

  return {
    isLikelyJob: Boolean(parsed.isLikelyJob),
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
    employerMatchesCompany: Boolean(parsed.employerMatchesCompany),
    inferredTitle: parsed.inferredTitle ?? null,
    inferredLocation: parsed.inferredLocation ?? null,
    inferredEmploymentType: parsed.inferredEmploymentType ?? null,
    metadata: response?.metadata ?? null,
  };
}
