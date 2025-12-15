/**
 * @file job-coverage-critic.js
 * Parser for job coverage critic LLM responses.
 *
 * Parses the new output structure with isCoverageLikelyComplete,
 * suspiciousLowCoverage, estimatedJobCountRange, and retry hints.
 */

import { parseJsonContent, safePreview } from "../utils/parsing.js";

/**
 * Parse the result from job coverage critic task.
 *
 * @param {Object} response - Raw LLM response
 * @param {Object} _context - Original context (unused)
 * @returns {Object} Parsed result with coverage assessment
 */
export function parseJobCoverageCriticResult(response, _context) {
  const parsed =
    response?.json && typeof response.json === "object"
      ? response.json
      : parseJsonContent(response?.text);

  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        reason: "structured_missing",
        rawPreview: safePreview(response?.text),
        message: "LLM did not return valid JSON for job_coverage_critic",
      },
    };
  }

  // Parse estimatedJobCountRange
  const estimatedJobCountRange = {
    min: 0,
    max: 0,
  };
  if (parsed.estimatedJobCountRange && typeof parsed.estimatedJobCountRange === "object") {
    estimatedJobCountRange.min = typeof parsed.estimatedJobCountRange.min === "number"
      ? parsed.estimatedJobCountRange.min
      : parseInt(parsed.estimatedJobCountRange.min, 10) || 0;
    estimatedJobCountRange.max = typeof parsed.estimatedJobCountRange.max === "number"
      ? parsed.estimatedJobCountRange.max
      : parseInt(parsed.estimatedJobCountRange.max, 10) || 0;
  }

  // Ensure min <= max
  if (estimatedJobCountRange.min > estimatedJobCountRange.max) {
    const temp = estimatedJobCountRange.min;
    estimatedJobCountRange.min = estimatedJobCountRange.max;
    estimatedJobCountRange.max = temp;
  }

  // Parse suggestedNextActions
  const suggestedNextActions = Array.isArray(parsed.suggestedNextActions)
    ? parsed.suggestedNextActions.filter((a) => typeof a === "string" && a.trim())
    : [];

  // Parse suggestedDomHints
  const suggestedDomHints = Array.isArray(parsed.suggestedDomHints)
    ? parsed.suggestedDomHints.filter((h) => typeof h === "string" && h.trim())
    : [];

  return {
    isCoverageLikelyComplete: Boolean(parsed.isCoverageLikelyComplete),
    suspiciousLowCoverage: Boolean(parsed.suspiciousLowCoverage),
    estimatedJobCountRange,
    shouldRetryParsing: Boolean(parsed.shouldRetryParsing),
    explanation: parsed.explanation ?? null,
    suggestedNextActions,
    suggestedDomHints,
    metadata: response?.metadata ?? null,
  };
}
