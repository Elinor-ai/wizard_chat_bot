import { ComplianceFlagSchema } from "@wizard/core";
import { parseJsonContent, safePreview } from "../utils/parsing.js";

export function parseVideoComplianceResult(response) {
  const parsed = parseJsonContent(response?.text) ?? response?.json;
  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        reason: "structured_missing",
        message: "LLM did not return compliance JSON",
        rawPreview: safePreview(response?.text)
      }
    };
  }

  const flagsInput = Array.isArray(parsed.flags) ? parsed.flags : [];
  const flags = flagsInput
    .map((flag, index) => {
      try {
        return ComplianceFlagSchema.parse({
          id: flag.id ?? `flag_${index}`,
          label: flag.label ?? flag.message ?? "Review guidance",
          severity: flag.severity ?? "info",
          details: flag.details ?? flag.note ?? null
        });
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);

  return {
    flags,
    metadata: response?.metadata ?? null
  };
}
