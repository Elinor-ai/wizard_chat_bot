import { CaptionSchema } from "@wizard/core";
import { parseJsonContent, safePreview } from "../utils/parsing.js";

export function parseVideoCaptionResult(response) {
  const parsed = parseJsonContent(response?.text) ?? response?.json;
  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        reason: "structured_missing",
        message: "LLM did not return caption JSON",
        rawPreview: safePreview(response?.text)
      }
    };
  }
  const captionText =
    typeof parsed.caption_text === "string"
      ? parsed.caption_text.trim()
      : typeof parsed.caption === "string"
      ? parsed.caption.trim()
      : null;
  if (!captionText) {
    return {
      error: {
        reason: "caption_missing",
        message: "Caption text missing",
        rawPreview: safePreview(response?.text)
      }
    };
  }

  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags
        .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
        .filter((tag) => tag.length > 0)
    : [];

  return {
    caption: CaptionSchema.parse({ text: captionText, hashtags }),
    metadata: response?.metadata ?? null
  };
}
