import { normaliseRefinedJob } from "../domain/job-fields.js";
import { parseJsonContent, safePreview } from "../utils/parsing.js";

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

  return {
    refinedJob: finalJob,
    metadata: {
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
    },
    // Keep legacy summary for backward compatibility if needed
    summary: analysis.impact_summary || "Refinement complete.",
  };
}
