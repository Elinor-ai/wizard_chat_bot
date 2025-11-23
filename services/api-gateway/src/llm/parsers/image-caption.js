import { llmLogger } from "../logger.js";
import { parseJsonContent, safePreview } from "../utils/parsing.js";

export function parseImageCaptionResult(response, context = {}) {
  const rawText = response?.text ?? response?.raw ?? null;
  const directJson = response?.json && typeof response.json === "object"
    ? response.json
    : null;
  const parsed = directJson ?? parseJsonContent(rawText);

  if (!parsed || typeof parsed !== "object") {
    llmLogger.warn(
      {
        provider: context.provider,
        model: context.model,
        raw: safePreview(rawText),
      },
      "hero caption parser invalid response"
    );
    return {
      error: {
        reason: "invalid_response",
        message: "Caption response missing",
        rawPreview: safePreview(rawText),
      },
    };
  }

  if (parsed.error) {
    return { error: parsed.error };
  }

  const caption =
    typeof parsed.caption === "string" && parsed.caption.trim().length > 0
      ? parsed.caption.trim()
      : null;
  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags
        .map((tag) =>
          typeof tag === "string" && tag.trim().length > 0
            ? tag.trim()
            : null
        )
        .filter(Boolean)
    : [];

  if (!caption) {
    llmLogger.warn(
      {
        provider: context.provider,
        model: context.model,
        raw: JSON.stringify(parsed).slice(0, 400),
      },
      "hero caption parser missing caption"
    );
    return {
      error: {
        reason: "invalid_caption",
        message: "Caption missing in response",
        rawPreview: JSON.stringify(parsed).slice(0, 400),
      },
    };
  }

  return {
    caption,
    hashtags,
    metadata: response?.metadata ?? null,
  };
}
