import { parseJsonContent, safePreview } from "../utils/parsing.js";

export function parseImagePromptResult(response) {
  const parsed =
    response?.json && typeof response.json === "object"
      ? response.json
      : parseJsonContent(response?.text);

  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        reason: "structured_missing",
        message: "LLM did not return valid image prompt JSON",
        rawPreview: safePreview(response?.text)
      }
    };
  }

  const prompt = typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
  if (!prompt) {
    return {
      error: {
        reason: "invalid_prompt",
        message: "Image prompt JSON missing prompt field",
        rawPreview: safePreview(response?.text)
      }
    };
  }

  const negativePrompt =
    typeof parsed.negative_prompt === "string"
      ? parsed.negative_prompt.trim()
      : typeof parsed.negativePrompt === "string"
        ? parsed.negativePrompt.trim()
        : null;
  const style =
    typeof parsed.style === "string" ? parsed.style.trim() : null;

  return {
    prompt,
    negativePrompt: negativePrompt || null,
    style: style || null,
    metadata: response?.metadata ?? null
  };
}

export function parseImageGenerationResult(response) {
  const data =
    response?.json && typeof response.json === "object"
      ? response.json
      : parseJsonContent(response?.text);

  if (!data || typeof data !== "object") {
    return {
      error: {
        reason: "structured_missing",
        message: "Image provider did not return JSON payload",
        rawPreview: safePreview(response?.text)
      }
    };
  }

  if (!data.imageBase64 && !data.imageUrl) {
    return {
      error: {
        reason: "image_missing",
        message: "Image provider payload missing image data",
        rawPreview: safePreview(JSON.stringify(data))
      }
    };
  }

  return {
    imageBase64: data.imageBase64 ?? null,
    imageUrl: data.imageUrl ?? null,
    metadata: response?.metadata ?? data.metadata ?? null
  };
}
