import { normaliseRefinedJob } from "../domain/job-fields.js";
import { parseJsonContent, safePreview } from "../utils/parsing.js";

function normalizeChangeList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }
  return [];
}

function normalizeChangeDetails(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const normalized = {
    titleChanges: normalizeChangeList(raw.titleChanges ?? raw.title_changes),
    descriptionChanges: normalizeChangeList(
      raw.descriptionChanges ?? raw.description_changes
    ),
    requirementsChanges: normalizeChangeList(
      raw.requirementsChanges ?? raw.requirements_changes
    )
  };

  const otherChangesList = normalizeChangeList(
    raw.otherChanges ?? raw.other_changes
  );
  const hasOtherKey =
    Object.prototype.hasOwnProperty.call(raw, "otherChanges") ||
    Object.prototype.hasOwnProperty.call(raw, "other_changes");
  if (otherChangesList.length > 0 || hasOtherKey) {
    normalized.otherChanges = otherChangesList;
  }

  const hasRelevantKey = [
    "titleChanges",
    "title_changes",
    "descriptionChanges",
    "description_changes",
    "requirementsChanges",
    "requirements_changes",
    "otherChanges",
    "other_changes"
  ].some((key) => Object.prototype.hasOwnProperty.call(raw, key));

  const hasContent =
    normalized.titleChanges.length > 0 ||
    normalized.descriptionChanges.length > 0 ||
    normalized.requirementsChanges.length > 0 ||
    (normalized.otherChanges?.length ?? 0) > 0;

  if (!hasRelevantKey && !hasContent) {
    return null;
  }

  return normalized;
}

export function parseRefinementResult(response, context) {
  const parsed =
    response?.json && typeof response.json === "object"
      ? response.json
      : parseJsonContent(response?.text);

  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        reason: "structured_missing",
        rawPreview: safePreview(response?.text),
        message: "LLM did not return valid refinement JSON",
      },
    };
  }

  // Handle both new and legacy structure (fallback if LLM ignores new schema)
  const refinedJobData = parsed.refined_job ?? parsed.refinedJob ?? parsed;

  // Normalise the job fields
  const finalJob = normaliseRefinedJob(refinedJobData, context.jobDraft);

  // Extract analysis metrics or generate defaults if missing
  const analysis = parsed.analysis ?? {};
  const changeDetails = normalizeChangeDetails(
    parsed.changeDetails ??
      parsed.change_details ??
      analysis.changeDetails ??
      analysis.change_details ??
      null
  );

  const metadata = {
    improvementScore: analysis.improvement_score ?? 85,
    originalScore: analysis.original_score ?? 50,
    ctrPrediction: analysis.ctr_prediction ?? "+15%",
    impactSummary:
      analysis.impact_summary ?? "Optimized for clarity and engagement.",
    keyImprovements: Array.isArray(analysis.key_improvements)
      ? analysis.key_improvements
      : ["Polished tone", "Fixed formatting", "Enhanced SEO"],
    model: response?.model,
    usage: response?.usage,
  };

  if (changeDetails) {
    metadata.changeDetails = changeDetails;
  }

  return {
    refinedJob: finalJob,
    metadata,
    // Keep legacy summary for backward compatibility if needed
    summary: analysis.impact_summary || "Refinement complete.",
  };
}
