/**
 * Gemini Adapter (Google AI Studio API Key Authentication)
 *
 * Drop-in replacement for OpenAIAdapter using Google's Generative AI SDK.
 * Uses simple API key authentication (not Vertex AI).
 *
 * Library: @google/generative-ai
 * Install: npm install @google/generative-ai
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { llmLogger } from "../logger.js";
import { logRawTraffic } from "../raw-traffic-logger.js";

const DEFAULT_MODEL = "gemini-1.5-flash";
const API_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiAdapter {
  /**
   * @param {object} options
   * @param {string} options.apiKey - Gemini API key (from Google AI Studio)
   * @param {string} [options.apiUrl] - Optional API URL (for compatibility, not used)
   */
  constructor({ apiKey, apiUrl }) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || API_ENDPOINT;
  }

  ensureKey() {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY missing");
    }
  }

  /**
   * Invoke the Gemini model
   *
   * Matches OpenAIAdapter.invoke() signature exactly.
   *
   * @param {object} options
   * @param {string} [options.model] - Model name (default: gemini-1.5-flash)
   * @param {string} [options.system] - System prompt (becomes systemInstruction)
   * @param {string} options.user - User prompt (required)
   * @param {string} [options.mode] - "text" or "json"
   * @param {number} [options.temperature] - Temperature (0-2)
   * @param {number} [options.maxTokens] - Max output tokens
   * @param {string} [options.taskType] - Task type for logging
   * @param {string} [options.route] - Route for logging
   * @returns {Promise<{text: string, json: object|null, metadata: object}>}
   */
  async invoke({
    model,
    system,
    user,
    mode = "text",
    temperature = 0.2,
    maxTokens = 800,
    taskType = null,
    route = null,
  }) {
    this.ensureKey();

    const userText = (user || "").trim();
    const systemText = (system || "").trim();

    if (!userText) {
      throw new Error("Gemini adapter requires a user prompt");
    }

    const effectiveModel = model || DEFAULT_MODEL;
    const client = new GoogleGenerativeAI(this.apiKey);

    // Build generation config
    const generationConfig = {
      temperature,
      maxOutputTokens: maxTokens,
    };

    // Enable JSON mode if requested
    if (mode === "json") {
      generationConfig.responseMimeType = "application/json";
    }

    // Build model config
    const modelConfig = {
      model: effectiveModel,
      generationConfig,
    };

    // Add system instruction if provided
    if (systemText) {
      modelConfig.systemInstruction = systemText;
    }

    const genModel = client.getGenerativeModel(modelConfig);

    // Build request payload for logging
    const requestPayload = {
      model: effectiveModel,
      systemInstruction: systemText || undefined,
      contents: userText,
      generationConfig,
    };

    const providerEndpoint = `${API_ENDPOINT}/models/${effectiveModel}:generateContent`;

    await logRawTraffic({
      taskId: taskType ?? "gemini",
      direction: "REQUEST",
      endpoint: route ?? null,
      providerEndpoint,
      payload: requestPayload,
    });

    let response;
    try {
      response = await genModel.generateContent(userText);
    } catch (error) {
      llmLogger.error(
        {
          err: error,
          model: effectiveModel,
          taskType,
        },
        "Gemini API call failed"
      );
      throw error;
    }

    // Log response
    await logRawTraffic({
      taskId: taskType ?? "gemini",
      direction: "RESPONSE",
      endpoint: route ?? null,
      providerEndpoint,
      payload: {
        // Don't log full response object, just key info
        finishReason: response.response?.candidates?.[0]?.finishReason,
        usageMetadata: response.response?.usageMetadata,
      },
    });

    // Extract text from response
    let text = "";
    try {
      text = response.response?.text?.() || "";
    } catch (e) {
      // text() can throw if response is blocked
      const candidate = response.response?.candidates?.[0];
      const finishReason = candidate?.finishReason ?? "unknown";
      llmLogger.warn(
        {
          model: effectiveModel,
          finishReason,
          safetyRatings: candidate?.safetyRatings,
        },
        "Gemini response text extraction failed"
      );
      throw new Error(`Gemini response blocked or empty. Reason: ${finishReason}`);
    }

    if (!text) {
      const candidate = response.response?.candidates?.[0];
      const finishReason = candidate?.finishReason ?? "unknown";
      llmLogger.warn(
        {
          model: effectiveModel,
          finishReason,
          safetyRatings: candidate?.safetyRatings,
        },
        "Gemini response missing content"
      );
      throw new Error(`Gemini response missing content. Reason: ${finishReason}`);
    }

    // Parse JSON if mode is json
    let jsonPayload = null;
    if (mode === "json") {
      try {
        let jsonStr = text.trim();
        // Remove markdown code fences if present
        const fenceRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
        const match = jsonStr.match(fenceRegex);
        if (match && match[1]) {
          jsonStr = match[1].trim();
        }
        jsonPayload = JSON.parse(jsonStr);
      } catch (e) {
        llmLogger.warn(
          {
            model: effectiveModel,
            textPreview: text.slice(0, 300),
            error: e.message,
          },
          "Failed to parse JSON from Gemini response"
        );
      }
    }

    // Extract usage metadata
    const usage = response.response?.usageMetadata;
    const metadata = {
      promptTokens: usage?.promptTokenCount ?? null,
      responseTokens: usage?.candidatesTokenCount ?? null,
      totalTokens: usage?.totalTokenCount ?? null,
    };

    return {
      text: text.trim(),
      json: jsonPayload,
      metadata,
    };
  }
}
