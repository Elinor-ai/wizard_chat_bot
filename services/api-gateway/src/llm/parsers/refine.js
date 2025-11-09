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

  const refinedJob = normaliseRefinedJob(
    parsed.refined_job ?? parsed.refinedJob ?? {},
    context.jobSnapshot ?? {}
  );
  const summary =
    typeof parsed.summary === "string" ? parsed.summary.trim() : null;

  return {
    refinedJob,
    summary,
    metadata: response?.metadata ?? null,
  };
}
