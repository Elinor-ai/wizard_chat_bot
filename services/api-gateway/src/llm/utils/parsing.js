import { llmLogger } from "../logger.js";

export function parseJsonContent(content) {
  if (!content) return null;
  let jsonText = content.trim();
  const fencedMatch = jsonText.match(/```json([\s\S]*?)```/i);
  if (fencedMatch) {
    jsonText = fencedMatch[1];
  } else {
    const genericFence = jsonText.match(/```([\s\S]*?)```/);
    if (genericFence) {
      jsonText = genericFence[1];
    }
  }

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    llmLogger.warn(
      { message: error?.message, preview: jsonText.slice(0, 200) },
      "Failed to parse LLM JSON"
    );

    const lastBrace = Math.max(
      jsonText.lastIndexOf("}"),
      jsonText.lastIndexOf("]")
    );
    if (lastBrace > 0) {
      try {
        return JSON.parse(jsonText.slice(0, lastBrace + 1));
      } catch (innerError) {
        llmLogger.warn(
          { message: innerError?.message },
          "Second pass JSON parse failed"
        );
      }
    }
    const repaired = repairJsonString(jsonText);
    if (repaired) {
      try {
        const repairedObject = JSON.parse(repaired);
        llmLogger.warn(
          { preview: repaired.slice(0, 120) },
          "JSON repair succeeded"
        );
        return repairedObject;
      } catch (repairError) {
        llmLogger.warn(
          { message: repairError?.message },
          "Repaired JSON still invalid"
        );
      }
    }
    return null;
  }
}

export function repairJsonString(input) {
  if (!input) return null;
  let text = input.trim();

  text = text.replace(/,(?=\s*[}\]])/g, "");

  const quoteMatches = text.match(/"/g) ?? [];
  if (quoteMatches.length % 2 !== 0) {
    text += '"';
  }

  const braceDelta =
    (text.match(/\{/g) ?? []).length - (text.match(/\}/g) ?? []).length;
  if (braceDelta > 0) {
    text += "}".repeat(braceDelta);
  }
  const bracketDelta =
    (text.match(/\[/g) ?? []).length - (text.match(/\]/g) ?? []).length;
  if (bracketDelta > 0) {
    text += "]".repeat(bracketDelta);
  }

  if (!/[}\]]$/.test(text)) {
    text += "}";
  }

  return text;
}

export function safePreview(raw) {
  return typeof raw === "string" ? raw.slice(0, 400) : null;
}
