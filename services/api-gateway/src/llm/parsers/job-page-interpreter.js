/**
 * @file job-page-interpreter.js
 * Parser for job page interpreter LLM responses.
 *
 * Parses the new output structure with normalizedJobs, confidence scores,
 * and DOM hints for retry parsing.
 */

import { parseJsonContent, safePreview } from "../utils/parsing.js";

/**
 * Parse a single normalized job from LLM response.
 *
 * @param {Object} job - Raw job object from LLM
 * @param {string} sourceHint - Default source if not provided
 * @returns {Object} Normalized job object
 */
function parseNormalizedJob(job, sourceHint = "careers-site") {
  if (!job || typeof job !== "object") {
    return null;
  }

  // Normalize confidence to 0-1 range
  let overallConfidence = job.overallConfidence ?? 0.5;
  if (typeof overallConfidence !== "number") {
    overallConfidence = parseFloat(overallConfidence) || 0.5;
  }
  overallConfidence = Math.min(Math.max(overallConfidence, 0), 1);

  // Parse field confidence object
  const fieldConfidence = {};
  if (job.fieldConfidence && typeof job.fieldConfidence === "object") {
    for (const [field, conf] of Object.entries(job.fieldConfidence)) {
      let val = conf;
      if (typeof val !== "number") {
        val = parseFloat(val) || 0;
      }
      fieldConfidence[field] = Math.min(Math.max(val, 0), 1);
    }
  }

  return {
    title: job.title ?? null,
    url: job.url ?? job.externalUrl ?? null,
    location: job.location ?? null,
    city: job.city ?? null,
    country: job.country ?? null,
    isPrimaryMarket: job.isPrimaryMarket ?? null,
    description: job.description ?? null,
    source: job.source ?? sourceHint,
    postedAt: job.postedAt ?? null,
    isActive: job.isActive ?? true,
    employmentType: job.employmentType ?? null,
    workModel: job.workModel ?? null,
    seniorityLevel: job.seniorityLevel ?? null,
    industry: job.industry ?? null,
    salary: job.salary ?? null,
    salaryPeriod: job.salaryPeriod ?? null,
    currency: job.currency ?? null,
    coreDuties: Array.isArray(job.coreDuties) ? job.coreDuties : [],
    mustHaves: Array.isArray(job.mustHaves) ? job.mustHaves : [],
    benefits: Array.isArray(job.benefits) ? job.benefits : [],
    overallConfidence,
    fieldConfidence:
      Object.keys(fieldConfidence).length > 0 ? fieldConfidence : null,
  };
}

/**
 * Parse the result from job page interpreter task.
 *
 * @param {Object} response - Raw LLM response
 * @param {Object} context - Original context (contains sourceHint)
 * @returns {Object} Parsed result with isJobListingPage, normalizedJobs, and metadata
 */
export function parseJobPageInterpreterResult(response, context = {}) {
  const parsed =
    response?.json && typeof response.json === "object"
      ? response.json
      : parseJsonContent(response?.text);

  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        reason: "structured_missing",
        rawPreview: safePreview(response?.text),
        message: "LLM did not return valid JSON for job_page_interpreter",
      },
    };
  }

  const sourceHint = context?.sourceHint ?? "careers-site";

  // Parse normalizedJobs array
  const normalizedJobs = Array.isArray(parsed.normalizedJobs)
    ? parsed.normalizedJobs
        .map((job) => parseNormalizedJob(job, sourceHint))
        .filter((job) => job !== null && job.title)
    : [];

  // Parse estimatedJobCount
  let estimatedJobCount = parsed.estimatedJobCount ?? normalizedJobs.length;
  if (typeof estimatedJobCount !== "number") {
    estimatedJobCount = parseInt(estimatedJobCount, 10) || normalizedJobs.length;
  }

  // Parse suggestedDomHints
  const suggestedDomHints = Array.isArray(parsed.suggestedDomHints)
    ? parsed.suggestedDomHints.filter((h) => typeof h === "string" && h.trim())
    : [];

  return {
    isJobListingPage: Boolean(parsed.isJobListingPage),
    normalizedJobs,
    estimatedJobCount,
    wereWeMissingJobs: Boolean(parsed.wereWeMissingJobs),
    reasonsIfNotJobPage: parsed.reasonsIfNotJobPage ?? null,
    suggestedDomHints,
    metadata: response?.metadata ?? null,
  };
}
