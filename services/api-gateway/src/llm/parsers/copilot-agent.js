import { safePreview } from "../utils/parsing.js";

export function parseCopilotAgentResult(response) {
  const raw = typeof response?.text === "string" ? response.text.trim() : "";
  if (!raw) {
    return {
      error: {
        reason: "empty_response",
        rawPreview: safePreview(response?.text),
        message: "Copilot agent returned no content"
      }
    };
  }

  let parsed;
  try {
    let normalized = raw.trim();
    if (normalized.startsWith("```")) {
      normalized = normalized.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
      normalized = normalized.replace(/```$/i, "").trim();
    }
    parsed = JSON.parse(normalized);
  } catch (error) {
    return {
      error: {
        reason: "invalid_json",
        rawPreview: safePreview(raw),
        message: "Copilot agent response was not valid JSON"
      }
    };
  }

  if (parsed.type === "tool_call") {
    return {
      type: "tool_call",
      tool: parsed.tool,
      input: parsed.input ?? {},
      metadata: response?.metadata ?? null
    };
  }

  if (parsed.type === "final") {
    return {
      type: "final",
      message: typeof parsed.message === "string" ? parsed.message : "",
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      metadata: response?.metadata ?? null
    };
  }

  return {
    error: {
      reason: "unknown_response",
      rawPreview: safePreview(parsed),
      message: "Copilot agent response missing type field"
    }
  };
}
