// /**
//  * Gemini Adapter (Vertex AI - Service Account Authentication)
//  *
//  * Drop-in replacement for OpenAIAdapter using Google's Vertex AI.
//  * Uses service account authentication via Application Default Credentials (ADC).
//  *
//  * Library: google-auth-library
//  * Install: npm install google-auth-library
//  *
//  * Authentication: Uses GOOGLE_APPLICATION_CREDENTIALS or service-account.json
//  */

// import { GoogleAuth } from "google-auth-library";
// import { llmLogger } from "../logger.js";
// import { logRawTraffic } from "../raw-traffic-logger.js";

// const DEFAULT_MODEL = "gemini-2.0-flash";
// const DEFAULT_LOCATION = "us-central1";

// export class GeminiAdapter {
//   /**
//    * @param {object} options
//    * @param {string} [options.location] - GCP region (default: us-central1)
//    * @param {string} [options.projectId] - GCP project ID (from env if not provided)
//    * @param {string} [options.apiKey] - Ignored (for backwards compatibility)
//    * @param {string} [options.apiUrl] - Ignored (for backwards compatibility)
//    */
//   constructor({
//     location = process.env.GOOGLE_CLOUD_LOCATION ?? DEFAULT_LOCATION,
//     projectId = process.env.FIRESTORE_PROJECT_ID,
//     apiKey,
//     apiUrl,
//   } = {}) {
//     this.location = location;
//     this.projectId = projectId;
//     this.auth = new GoogleAuth({
//       scopes: ["https://www.googleapis.com/auth/cloud-platform"],
//     });
//     this.baseUrl = `https://${this.location}-aiplatform.googleapis.com/v1`;
//   }

//   /**
//    * Get authorization headers with bearer token
//    * @returns {Promise<object>}
//    */
//   async _getAuthHeaders() {
//     const client = await this.auth.getClient();
//     const accessToken = await client.getAccessToken();
//     return {
//       Authorization: `Bearer ${accessToken.token}`,
//       "Content-Type": "application/json",
//     };
//   }

//   /**
//    * Build the Vertex AI generateContent endpoint URL
//    * @param {string} model - Model name
//    * @returns {string}
//    */
//   _buildEndpointUrl(model) {
//     return `${this.baseUrl}/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${model}:generateContent`;
//   }

//   /**
//    * Invoke the Gemini model via Vertex AI
//    *
//    * Matches OpenAIAdapter.invoke() signature exactly.
//    *
//    * @param {object} options
//    * @param {string} [options.model] - Model name (default: gemini-2.0-flash)
//    * @param {string} [options.system] - System prompt (becomes systemInstruction)
//    * @param {string} options.user - User prompt (required)
//    * @param {string} [options.mode] - "text" or "json"
//    * @param {number} [options.temperature] - Temperature (0-2)
//    * @param {number} [options.maxTokens] - Max output tokens
//    * @param {string} [options.taskType] - Task type for logging
//    * @param {string} [options.route] - Route for logging
//    * @returns {Promise<{text: string, json: object|null, metadata: object}>}
//    */
//   async invoke({
//     model,
//     system,
//     user,
//     mode = "text",
//     temperature = 0.2,
//     maxTokens = 800,
//     taskType = null,
//     route = null,
//   }) {
//     const userText = (user || "").trim();
//     const systemText = (system || "").trim();

//     if (!userText) {
//       throw new Error("Gemini adapter requires a user prompt");
//     }

//     if (!this.projectId) {
//       throw new Error("FIRESTORE_PROJECT_ID not set for Vertex AI");
//     }

//     const effectiveModel = model || DEFAULT_MODEL;
//     const endpointUrl = this._buildEndpointUrl(effectiveModel);

//     // Build request payload for Vertex AI
//     const payload = {
//       contents: [
//         {
//           role: "user",
//           parts: [{ text: userText }],
//         },
//       ],
//       generationConfig: {
//         temperature,
//         maxOutputTokens: maxTokens,
//       },
//     };

//     // Add system instruction if provided
//     if (systemText) {
//       payload.systemInstruction = {
//         parts: [{ text: systemText }],
//       };
//     }

//     // Enable JSON mode if requested
//     if (mode === "json") {
//       payload.generationConfig.responseMimeType = "application/json";
//     }

//     await logRawTraffic({
//       taskId: taskType ?? "gemini-vertex",
//       direction: "REQUEST",
//       endpoint: route ?? null,
//       providerEndpoint: endpointUrl,
//       payload,
//     });

//     let response;
//     try {
//       const headers = await this._getAuthHeaders();
//       response = await fetch(endpointUrl, {
//         method: "POST",
//         headers,
//         body: JSON.stringify(payload),
//       });

//       if (!response.ok) {
//         const errorBody = await response.text();
//         throw new Error(`Vertex AI request failed: ${response.status} ${errorBody}`);
//       }

//       response = await response.json();
//     } catch (error) {
//       llmLogger.error(
//         {
//           err: error,
//           model: effectiveModel,
//           taskType,
//         },
//         "Vertex AI Gemini call failed"
//       );
//       throw error;
//     }

//     // Log response
//     await logRawTraffic({
//       taskId: taskType ?? "gemini-vertex",
//       direction: "RESPONSE",
//       endpoint: route ?? null,
//       providerEndpoint: endpointUrl,
//       payload: {
//         finishReason: response?.candidates?.[0]?.finishReason,
//         usageMetadata: response?.usageMetadata,
//       },
//     });

//     // Extract text from response
//     const candidate = response?.candidates?.[0];
//     const text = candidate?.content?.parts?.[0]?.text || "";

//     if (!text) {
//       const finishReason = candidate?.finishReason ?? "unknown";
//       llmLogger.warn(
//         {
//           model: effectiveModel,
//           finishReason,
//           safetyRatings: candidate?.safetyRatings,
//         },
//         "Vertex AI Gemini response missing content"
//       );
//       throw new Error(`Gemini response missing content. Reason: ${finishReason}`);
//     }

//     // Parse JSON if mode is json
//     let jsonPayload = null;
//     if (mode === "json") {
//       try {
//         let jsonStr = text.trim();
//         // Remove markdown code fences if present
//         const fenceRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
//         const match = jsonStr.match(fenceRegex);
//         if (match && match[1]) {
//           jsonStr = match[1].trim();
//         }
//         jsonPayload = JSON.parse(jsonStr);
//       } catch (e) {
//         llmLogger.warn(
//           {
//             model: effectiveModel,
//             textPreview: text.slice(0, 300),
//             error: e.message,
//           },
//           "Failed to parse JSON from Gemini response"
//         );
//       }
//     }

//     // Extract usage metadata
//     const usage = response?.usageMetadata;
//     const metadata = {
//       promptTokens: usage?.promptTokenCount ?? null,
//       responseTokens: usage?.candidatesTokenCount ?? null,
//       totalTokens: usage?.totalTokenCount ?? null,
//     };

//     return {
//       text: text.trim(),
//       json: jsonPayload,
//       metadata,
//     };
//   }
// }
// services/api-gateway/src/llm/providers/gemini-adapter.js

import path from "node:path";
import { createRequire } from "node:module";
import { GoogleGenAI } from "@google/genai";
import { llmLogger } from "../logger.js";
import { logRawTraffic } from "../raw-traffic-logger.js";
import { LLM_CORE_TASK } from "../../config/task-types.js";
import { formatForGemini } from "../utils/schema-converter.js";

const require = createRequire(import.meta.url);

// Tasks where we want detailed token usage logging
const TOKEN_DEBUG_TASKS = new Set([
  LLM_CORE_TASK.IMAGE_GENERATION,
  LLM_CORE_TASK.IMAGE_PROMPT_GENERATION,
  LLM_CORE_TASK.IMAGE_CAPTION,
]);

// Tasks that benefit from Google Search grounding
const SEARCH_GROUNDING_TASKS = new Set([
  LLM_CORE_TASK.SUGGEST,
  LLM_CORE_TASK.COPILOT_AGENT,
  LLM_CORE_TASK.COMPANY_INTEL,
  LLM_CORE_TASK.VIDEO_STORYBOARD,
  LLM_CORE_TASK.IMAGE_PROMPT_GENERATION,
  LLM_CORE_TASK.IMAGE_CAPTION,
  LLM_CORE_TASK.REFINE,
]);

// Tasks that benefit from Google Maps grounding
const MAPS_GROUNDING_TASKS = new Set([
  LLM_CORE_TASK.SUGGEST,
  LLM_CORE_TASK.COPILOT_AGENT,
  LLM_CORE_TASK.REFINE,
]);

export class GeminiAdapter {
  constructor({ location = "global" } = {}) {
    const keyFilename = path.resolve(
      process.cwd(),
      "../../config/service-account.json"
    );

    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFilename;
    }

    let projectId = null;
    try {
      const keyFile = require(keyFilename);
      projectId = keyFile.project_id;
      if (!projectId) {
        throw new Error("Missing project_id in service-account.json");
      }
    } catch (error) {
      throw new Error(
        `Failed to load service account JSON from ${keyFilename}: ${error.message}`
      );
    }

    this.defaultLocation = location || "global";
    this.projectId = projectId;

    this.clientsByLocation = new Map();
  }

  logUsageTokens({ taskType, model, usage }) {
    if (!taskType || !TOKEN_DEBUG_TASKS.has(taskType)) {
      return;
    }
    const usageMeta = usage ?? {};
    llmLogger.info(
      {
        provider: "vertex-ai-genai",
        taskType,
        model,
        promptTokens: usageMeta.promptTokenCount ?? null,
        responseTokens: usageMeta.candidatesTokenCount ?? null,
        totalTokens: usageMeta.totalTokenCount ?? null,
        hasUsageMetadata: Boolean(usage),
      },
      "GeminiAdapter usage tokens (raw response metadata)"
    );
  }

  getClientForModel(model) {
    let effectiveLocation = this.defaultLocation || "global";

    if (
      model &&
      model.startsWith("gemini-3-") &&
      effectiveLocation !== "global"
    ) {
      llmLogger.warn(
        {
          requestedLocation: this.defaultLocation,
          forcedLocation: "global",
          model,
        },
        "GeminiAdapter: Overriding location to 'global' for Gemini 3 model"
      );
      effectiveLocation = "global";
    }

    if (this.clientsByLocation.has(effectiveLocation)) {
      return {
        client: this.clientsByLocation.get(effectiveLocation),
        location: effectiveLocation,
      };
    }

    const client = new GoogleGenAI({
      vertexai: true,
      project: this.projectId,
      location: effectiveLocation,
      apiVersion: "v1",
    });

    this.clientsByLocation.set(effectiveLocation, client);
    return { client, location: effectiveLocation };
  }

  buildEndpoint({ model, location, taskType }) {
    if (!model || !this.projectId) return null;
    const effectiveLocation = location || this.defaultLocation || "global";
    const host = `${effectiveLocation}-aiplatform.googleapis.com`;
    const base = `https://${host}/v1/projects/${this.projectId}/locations/${effectiveLocation}/publishers/google/models/${model}`;
    const action =
      taskType === LLM_CORE_TASK.IMAGE_GENERATION
        ? "generateImage"
        : "generateContent";
    return `${base}:${action}`;
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
    taskType = null,
    route = null,
    outputSchema = null,
    outputSchemaName = null,
  }) {
    const userText = (user || "").trim();
    const systemText = (system || "").trim();

    if (!userText && !systemText) {
      throw new Error(
        "Gemini adapter requires at least a user or system prompt"
      );
    }

    const { client, location } = this.getClientForModel(model);
    const requestEndpoint = this.buildEndpoint({
      model,
      location,
      taskType,
    });

    let contents = userText || systemText;
    let imagePayload = null;
    if (taskType === LLM_CORE_TASK.IMAGE_GENERATION) {
      try {
        imagePayload = JSON.parse(userText);
        const promptParts = [];
        if (imagePayload.prompt) promptParts.push(imagePayload.prompt);
        if (imagePayload.style)
          promptParts.push(`Style: ${imagePayload.style}`);
        if (imagePayload.negative_prompt || imagePayload.negativePrompt) {
          const neg =
            imagePayload.negative_prompt ?? imagePayload.negativePrompt;
          promptParts.push(`Avoid: ${neg}`);
        }
        contents = promptParts.join("\n");
      } catch (error) {
        // Fall back to raw text if parsing fails
        imagePayload = null;
        contents = userText || systemText;
      }
    }

    const config = {
      temperature,
      maxOutputTokens: maxTokens,
    };
    let hasGroundingTools = false;
    if (taskType) {
      const wantsSearch = SEARCH_GROUNDING_TASKS.has(taskType);
      const wantsMaps = MAPS_GROUNDING_TASKS.has(taskType);
      const tools = [];
      if (wantsSearch) {
        tools.push({ googleSearch: {} });
      }
      if (wantsMaps) {
        tools.push({ googleMaps: {} });
      }
      if (tools.length > 0) {
        config.tools = tools;
        hasGroundingTools = true;
      }
    }

    if (taskType === LLM_CORE_TASK.IMAGE_GENERATION) {
      // Request only image outputs to avoid billed "thought" text
      config.responseModalities = ["IMAGE"];
    }

    if (systemText) {
      config.systemInstruction = systemText;
    }

    // JSON mode configuration
    // Gemini API limitation: "Controlled generation" (responseMimeType AND responseJsonSchema)
    // is NOT supported with Google Search/Maps grounding tools.
    // When grounding is enabled, we skip both and rely on the prompt to request JSON output.
    if (mode === "json" && taskType !== LLM_CORE_TASK.IMAGE_GENERATION) {
      if (hasGroundingTools) {
        // Grounding enabled: skip ALL controlled generation (Gemini API limitation)
        // The prompt should request JSON output, and the parser will extract it from text
        llmLogger.info(
          {
            taskType,
            schemaName: outputSchemaName,
            hasGroundingTools,
            hasResponseMimeType: false,
            hasResponseSchema: false,
            reason: "grounding_blocks_controlled_generation",
          },
          "GeminiAdapter skipping JSON mode (incompatible with Search/Maps tools)"
        );
      } else {
        // No grounding: safe to use controlled generation
        config.responseMimeType = "application/json";

        if (outputSchema) {
          try {
            const jsonSchema = formatForGemini(outputSchema);
            if (jsonSchema) {
              config.responseJsonSchema = jsonSchema;
              llmLogger.info(
                {
                  taskType,
                  schemaName: outputSchemaName,
                  hasGroundingTools,
                  hasResponseSchema: true,
                },
                "GeminiAdapter using native responseJsonSchema"
              );
            }
          } catch (schemaError) {
            llmLogger.warn(
              {
                taskType,
                err: schemaError?.message,
              },
              "GeminiAdapter failed to convert outputSchema, falling back to JSON mode"
            );
          }
        }
      }
    }

    let response;
    const requestContext = {
      task: taskType ?? "unknown",
      provider: "vertex-ai-genai",
      model,
    };
    try {
      if (
        taskType === LLM_CORE_TASK.IMAGE_GENERATION &&
        typeof client?.images?.generate === "function"
      ) {
        const imageRequest = {
          model,
          prompt: contents,
          ...(imagePayload?.size ? { size: imagePayload.size } : {}),
          ...(imagePayload?.aspect_ratio
            ? { aspectRatio: imagePayload.aspect_ratio }
            : {}),
        };
        await logRawTraffic({
          taskId: taskType ?? LLM_CORE_TASK.IMAGE_GENERATION,
          direction: "REQUEST",
          endpoint: route ?? null,
          providerEndpoint: requestEndpoint,
          payload: imageRequest,
        });
        llmLogger.info(
          {
            provider: "vertex-ai-genai",
            model,
            promptLength: (contents ?? "").length,
            promptPreview: (contents ?? "").slice(0, 120),
            size: imagePayload?.size ?? null,
            aspectRatio: imagePayload?.aspect_ratio ?? null,
          },
          "GeminiAdapter image_generation using images.generate"
        );
        response = await client.images.generate(imageRequest);
      } else {
        const textRequest = {
          model,
          contents,
          config,
        };
        await logRawTraffic({
          taskId: taskType ?? "text",
          direction: "REQUEST",
          endpoint: route ?? null,
          providerEndpoint: requestEndpoint,
          payload: textRequest,
        });
        response = await client.models.generateContent(textRequest);
      }
    } catch (error) {
      llmLogger.error(
        {
          err: error,
          model,
          project: this.projectId,
          location: this.defaultLocation,
        },
        "Google GenAI SDK execution failed"
      );
      throw error;
    }

    // Handle image generation separately
    if (taskType === LLM_CORE_TASK.IMAGE_GENERATION) {
      await logRawTraffic({
        taskId: taskType ?? LLM_CORE_TASK.IMAGE_GENERATION,
        direction: "RESPONSE",
        endpoint: route ?? null,
        providerEndpoint: requestEndpoint,
        payload: response,
      });
      const sanitizeBase64 = (payload) => {
        if (!payload || typeof payload !== "object") return payload;
        const clone = Array.isArray(payload) ? [...payload] : { ...payload };
        if (clone.inlineData?.data) {
          clone.inlineData = {
            ...clone.inlineData,
            data: "<BASE64_IMAGE_DATA_OMITTED>",
          };
        }
        if (clone.bytesBase64Encoded) {
          clone.bytesBase64Encoded = "<BASE64_IMAGE_DATA_OMITTED>";
        }
        if (clone.b64_json) {
          clone.b64_json = "<BASE64_IMAGE_DATA_OMITTED>";
        }
        return clone;
      };
      const sanitizedResponse = (() => {
        if (!response || typeof response === "object") return response;
        const clone = Array.isArray(response) ? [...response] : { ...response };
        if (Array.isArray(clone.predictions)) {
          clone.predictions = clone.predictions.map((pred) =>
            sanitizeBase64(pred)
          );
        }
        if (Array.isArray(clone.data)) {
          clone.data = clone.data.map((entry) => sanitizeBase64(entry));
        }
        if (Array.isArray(clone.images)) {
          clone.images = clone.images.map((entry) => sanitizeBase64(entry));
        }
        if (Array.isArray(clone.candidates)) {
          clone.candidates = clone.candidates.map((cand) => {
            if (!cand || typeof cand !== "object") return cand;
            const candClone = { ...cand };
            if (candClone.content?.parts) {
              candClone.content = {
                ...candClone.content,
                parts: candClone.content.parts.map((part) =>
                  sanitizeBase64(part)
                ),
              };
            }
            return candClone;
          });
        }
        return clone;
      })();

      // Log the raw response for debugging differences between Vertex AI and hosted APIs
      llmLogger.info(
        {
          provider: "vertex-ai-genai",
          model,
          responseKeys:
            sanitizedResponse && typeof sanitizedResponse === "object"
              ? Object.keys(sanitizedResponse)
              : [],
        },
        "GeminiAdapter image_generation raw response"
      );

      const candidate = response?.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const inlinePart = parts.find((part) => part?.inlineData?.data);
      // Fallbacks for Vertex AI predictions payloads
      const prediction =
        Array.isArray(response?.predictions) && response.predictions.length > 0
          ? response.predictions[0]
          : null;
      const vertexBase64 =
        (prediction && typeof prediction === "object"
          ? prediction.bytesBase64Encoded
          : null) || (typeof prediction === "string" ? prediction : null);
      // images.generate responses may use data array or images array
      const dataBase64 =
        (Array.isArray(response?.data) && response.data[0]?.b64_json) ||
        (Array.isArray(response?.images) && response.images[0]?.base64);
      const imageBase64 =
        inlinePart?.inlineData?.data ?? vertexBase64 ?? dataBase64 ?? null;
      if (!imageBase64) {
        const finishReason = candidate?.finishReason ?? null;
        const responseKeys =
          response && typeof response === "object" ? Object.keys(response) : [];
        const candidateKeys =
          candidate && typeof candidate === "object"
            ? Object.keys(candidate)
            : [];
        const partKeys = Array.isArray(parts)
          ? parts.map((p) => (p && typeof p === "object" ? Object.keys(p) : []))
          : [];
        llmLogger.info(
          {
            provider: "vertex-ai-genai",
            model,
            responseKeys,
            candidateKeys,
            partKeys,
          },
          "GeminiAdapter image_generation response structure (no image found)"
        );
        llmLogger.warn(
          {
            provider: "vertex-ai-genai",
            model,
            finishReason,
            safetyRatings: candidate?.safetyRatings,
            predictionsPreview: sanitizeBase64(prediction),
            responseKeys,
            candidateKeys,
            partKeys,
          },
          "Vertex AI image response missing inlineData"
        );
        throw new Error("Image provider payload missing image data");
      }
      const usage = response?.usageMetadata;
      const metadata = usage
        ? {
            promptTokens: usage.promptTokenCount ?? null,
            responseTokens: usage.candidatesTokenCount ?? null,
            thoughtsTokens: usage.thoughtsTokenCount ?? null,
            totalTokens: usage.totalTokenCount ?? null,
            finishReason: candidate?.finishReason ?? null,
          }
        : undefined;
      this.logUsageTokens({ taskType, model, usage });
      return {
        text: null,
        json: { imageBase64 },
        metadata,
      };
    }

    await logRawTraffic({
      taskId: taskType ?? "text",
      direction: "RESPONSE",
      endpoint: route ?? null,
      providerEndpoint: requestEndpoint,
      payload: response,
    });

    const text = (response?.text || "").trim();

    if (!text) {
      const finishReason = response?.candidates?.[0]?.finishReason ?? null;
      llmLogger.warn(
        {
          provider: "vertex-ai-genai",
          model,
          finishReason,
          safetyRatings: response?.candidates?.[0]?.safetyRatings,
        },
        "Vertex AI (GenAI SDK) response missing textual content"
      );
      throw new Error(
        `Vertex AI response missing content. Reason: ${finishReason}`
      );
    }

    let jsonPayload = null;
    if (mode === "json") {
      try {
        let jsonStr = text.trim();
        const fenceRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
        const match = jsonStr.match(fenceRegex);
        if (match && match[1]) {
          jsonStr = match[1].trim();
        }
        jsonPayload = JSON.parse(jsonStr);
      } catch (e) {
        llmLogger.warn(
          { model, textPreview: text.slice(0, 200) },
          "Failed to parse JSON from Gemini response"
        );
      }
    }

    const usage = response?.usageMetadata;
    const thoughtTokens = usage?.thoughtsTokenCount ?? 0;
    const candidateTokens = usage?.candidatesTokenCount ?? null;
    const responseTokenSum =
      (typeof candidateTokens === "number" ? candidateTokens : 0) +
      (typeof thoughtTokens === "number" ? thoughtTokens : 0);
    const searchQueries =
      response?.groundingMetadata?.webSearchQueries ??
      response?.candidates?.[0]?.groundingMetadata?.webSearchQueries ??
      null;
    const searchQueryCount = Array.isArray(searchQueries)
      ? searchQueries.length
      : null;

    const metadata = usage
      ? {
          promptTokens: usage.promptTokenCount ?? null,
          responseTokens: Number.isFinite(responseTokenSum)
            ? responseTokenSum
            : (candidateTokens ?? null),
          thoughtsTokens: thoughtTokens || null,
          totalTokens: usage.totalTokenCount ?? null,
          finishReason: response?.candidates?.[0]?.finishReason ?? null,
          searchQueries: searchQueryCount,
        }
      : searchQueryCount !== null
        ? {
            searchQueries: searchQueryCount ?? undefined,
          }
        : undefined;
    this.logUsageTokens({ taskType, model, usage });

    return { text, json: jsonPayload, metadata };
  }
}
