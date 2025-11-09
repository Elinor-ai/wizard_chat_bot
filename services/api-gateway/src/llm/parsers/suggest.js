import { normaliseCandidates } from "../domain/job-fields.js";
import { parseJsonContent, safePreview } from "../utils/parsing.js";

export function parseSuggestionResult(response, _context) {
  const parsed =
    response?.json && typeof response.json === "object"
      ? response.json
      : parseJsonContent(response?.text);

  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        reason: "structured_missing",
        rawPreview: safePreview(response?.text),
        message: "LLM did not return valid autofill_candidates JSON",
      },
    };
  }

  const candidates = normaliseCandidates(
    parsed.autofill_candidates ??
      parsed.autofillCandidates ??
      parsed.candidates ??
      []
  );

  return {
    candidates,
    metadata: response?.metadata ?? null,
  };
}
