import { Buffer } from "node:buffer";
import { llmLogger } from "../logger.js";

export class GeminiAdapter {
  constructor({ apiKey, apiUrl }) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl?.replace(/\/$/, "") ?? "";
  }

  ensureKey() {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY missing");
    }
  }

  buildPrompt(system, user) {
    if (system && user) {
      return `${system}\n\n${user}`;
    }
    return system || user || "";
  }

  async invoke({
    model,
    system,
    user,
    mode = "text",
    temperature = 0.2,
    maxTokens = 800,
  }) {
    this.ensureKey();

    const prompt = this.buildPrompt(system, user).trim();
    if (!prompt) {
      throw new Error("Gemini adapter requires a user prompt");
    }

    const endpoint = `${this.apiUrl}/models/${model}:generateContent?key=${this.apiKey}`;
    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        ...(mode === "json" ? { responseMimeType: "application/json" } : {}),
      },
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        `Gemini request failed: ${response.status} ${JSON.stringify(data)}`
      );
    }

    const candidate = data?.candidates?.[0] ?? null;
    const parts = candidate?.content?.parts ?? [];
    let jsonPayload = null;
    const text = parts
      .map((part) => {
        if (typeof part?.text === "string") {
          return part.text;
        }
        if (part?.inlineData?.data) {
          try {
            return Buffer.from(part.inlineData.data, "base64").toString("utf8");
          } catch (_error) {
            return "";
          }
        }
        if (part?.functionCall?.args) {
          try {
            return JSON.stringify(part.functionCall.args);
          } catch (_error) {
            return "";
          }
        }
        if (part?.jsonValue) {
          try {
            if (jsonPayload === null) {
              jsonPayload = part.jsonValue;
            }
            return JSON.stringify(part.jsonValue);
          } catch (_error) {
            return "";
          }
        }
        return "";
      })
      .join("")
      .trim();

    if (!text) {
      const finishReason = candidate?.finishReason ?? data?.finishReason ?? null;
      llmLogger.warn(
        {
          provider: "gemini",
          finishReason,
          candidateSummary: candidate ? Object.keys(candidate) : null,
        },
        "Gemini response missing textual content"
      );
      throw new Error("Gemini response missing content");
    }

    if (mode === "json" && jsonPayload === null) {
      try {
        jsonPayload = JSON.parse(text);
      } catch (_error) {
        // Parser will retry via parseJsonContent later.
      }
    }

    const metadata = data?.usageMetadata
      ? {
          promptTokens:
            data.usageMetadata.promptTokenCount ??
            data.usageMetadata.promptTokens ??
            null,
          responseTokens:
            data.usageMetadata.candidatesTokenCount ??
            data.usageMetadata.responseTokenCount ??
            null,
          totalTokens: data.usageMetadata.totalTokenCount ?? null,
          finishReason: data.finishReason ?? candidate?.finishReason ?? null,
        }
      : undefined;

    return { text, json: jsonPayload, metadata };
  }
}
