import { safePreview } from "../utils/parsing.js";

export function parseChatResult(response) {
  const text = typeof response?.text === "string" ? response.text.trim() : "";
  if (!text) {
    return {
      error: {
        reason: "empty_response",
        rawPreview: safePreview(response?.text),
        message: "LLM did not return a chat response",
      },
    };
  }
  return {
    message: text,
    metadata: response?.metadata ?? null
  };
}
