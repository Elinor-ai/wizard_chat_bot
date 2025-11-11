import { createLogger } from "@wizard/utils";

export const llmLogger = createLogger("llm-client");

function logPreview(provider, rawContent, event) {
  if (typeof rawContent !== "string") return;
  const trimmed = rawContent.trim();
  if (!trimmed) return;
  llmLogger.info({ provider, content: trimmed, length: trimmed.length }, event);
}

export function logSuggestionPreview(provider, rawContent) {
  logPreview(provider, rawContent, "LLM suggestion raw response");
}

export function logChannelPreview(provider, rawContent) {
  logPreview(provider, rawContent, "LLM channel recommendation raw response");
}

export function logRefinementPreview(provider, rawContent) {
  logPreview(provider, rawContent, "LLM job refinement raw response");
}

export function logAssetPreview(provider, rawContent) {
  logPreview(provider, rawContent, "LLM asset generation raw response");
}

export function logVideoPreview(provider, rawContent) {
  logPreview(provider, rawContent, "LLM video generation raw response");
}
