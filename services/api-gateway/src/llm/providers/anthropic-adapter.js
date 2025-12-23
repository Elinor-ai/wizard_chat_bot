// services/api-gateway/src/llm/providers/anthropic-adapter.js

import { llmLogger } from "../logger.js";
import { logRawTraffic } from "../raw-traffic-logger.js";
import { formatForAnthropic } from "../utils/schema-converter.js";

/**
 * Models that support Structured Outputs (constrained decoding).
 * As of November 2025: Claude Sonnet 4.5, Opus 4.1, Opus 4.5
 * See: https://docs.anthropic.com/en/docs/build-with-claude/structured-outputs
 *
 * NOTE: Temporarily disabled for all models because our schemas use
 * permissive types like z.record(z.any()) which allow empty objects.
 * This causes Claude to return valid-but-empty responses.
 * TODO: Fix schemas to be more specific, then re-enable.
 */
const STRUCTURED_OUTPUT_MODELS = new Set([
  // Temporarily disabled - using prefill mode instead
  // "claude-sonnet-4-5-20250929",
  // "claude-opus-4-1-20250929",
  // "claude-opus-4-5-20251101",
]);

/**
 * Beta header required for Structured Outputs feature.
 */
const STRUCTURED_OUTPUTS_BETA = "structured-outputs-2025-11-13";

/**
 * Adapter for Anthropic Claude API.
 *
 * Claude API Documentation: https://docs.anthropic.com/en/api/messages
 *
 * Key differences from OpenAI:
 * - System prompt is a separate `system` field (not in messages array)
 * - Uses x-api-key header (not Authorization: Bearer)
 * - Requires anthropic-version header
 * - Structured Outputs: Native JSON schema enforcement (with beta header)
 * - Prefill fallback: For older models without Structured Outputs support
 */
export class AnthropicAdapter {
  constructor({ apiKey, apiUrl }) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || "https://api.anthropic.com/v1/messages";
    this.anthropicVersion = "2023-06-01";
  }

  /**
   * Check if a model supports Structured Outputs.
   * @param {string} model - Model ID
   * @returns {boolean}
   */
  supportsStructuredOutputs(model) {
    return STRUCTURED_OUTPUT_MODELS.has(model);
  }

  ensureKey() {
    if (!this.apiKey) {
      throw new Error("ANTHROPIC_API_KEY missing");
    }
  }

  /**
   * Invoke Claude with the given options.
   *
   * @param {object} options
   * @param {string} options.model - Claude model ID (e.g., "claude-sonnet-4-5-20250929")
   * @param {string} [options.system] - System prompt
   * @param {string} options.user - User message
   * @param {string} [options.mode="text"] - Response mode: "text" or "json"
   * @param {number} [options.temperature=0.2] - Temperature (0-1)
   * @param {number} [options.maxTokens=800] - Maximum output tokens
   * @param {string} [options.taskType] - Task type for logging
   * @param {string} [options.route] - Route for logging
   * @param {object} [options.outputSchema] - Zod schema for Structured Outputs (native enforcement)
   * @param {string} [options.outputSchemaName] - Schema name for logging
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
    outputSchema = null,
    outputSchemaName = null,
  }) {
    this.ensureKey();

    if (typeof user !== "string" || user.trim().length === 0) {
      throw new Error("Anthropic adapter requires a user prompt");
    }

    // Determine if we can use Structured Outputs (native JSON schema enforcement)
    const canUseStructuredOutputs =
      mode === "json" &&
      outputSchema &&
      this.supportsStructuredOutputs(model);

    // Build messages array
    const messages = [{ role: "user", content: user }];

    // Use prefill technique ONLY if:
    // 1. JSON mode is requested AND
    // 2. We cannot use Structured Outputs (no schema or unsupported model)
    // Note: Prefill is NOT compatible with Structured Outputs
    const usePrefill = mode === "json" && !canUseStructuredOutputs;

    if (usePrefill) {
      messages.push({ role: "assistant", content: "{" });
      llmLogger.info(
        {
          taskType,
          schemaName: outputSchemaName,
          model,
          mode: "json_prefill",
        },
        "AnthropicAdapter using prefill technique (Structured Outputs not available)"
      );
    }

    const payload = {
      model,
      max_tokens: maxTokens,
      messages,
    };

    // Add Structured Outputs if available
    if (canUseStructuredOutputs) {
      const outputFormat = formatForAnthropic(outputSchema, outputSchemaName ?? "response");
      if (outputFormat) {
        payload.output_format = outputFormat;
        llmLogger.info(
          {
            taskType,
            schemaName: outputSchemaName,
            model,
            mode: "structured_outputs",
          },
          "AnthropicAdapter using Structured Outputs (native schema enforcement)"
        );
      }
    }

    // Add system prompt if provided (Claude uses separate field, not in messages)
    if (system && system.trim().length > 0) {
      payload.system = system;
    }

    // Add temperature (Claude accepts 0-1)
    if (typeof temperature === "number" && temperature >= 0 && temperature <= 1) {
      payload.temperature = temperature;
    }

    // Log raw traffic for debugging
    await logRawTraffic({
      taskId: taskType ?? "text",
      direction: "REQUEST",
      endpoint: route ?? null,
      providerEndpoint: this.apiUrl,
      payload,
    });

    // Build headers - add beta header if using Structured Outputs
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": this.anthropicVersion,
    };

    if (canUseStructuredOutputs) {
      headers["anthropic-beta"] = STRUCTURED_OUTPUTS_BETA;
    }

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const statusCode = response.status;

      // Parse error for better messaging
      let errorMessage = `Anthropic request failed: ${statusCode}`;
      try {
        const errorJson = JSON.parse(errorBody);
        if (errorJson.error?.message) {
          errorMessage = `Anthropic API error: ${errorJson.error.message}`;
        }
      } catch {
        errorMessage = `Anthropic request failed: ${statusCode} ${errorBody}`;
      }

      // Check for rate limiting
      if (statusCode === 429) {
        llmLogger.warn({ statusCode, taskType }, "Anthropic rate limit hit");
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();

    // Log raw response
    await logRawTraffic({
      taskId: taskType ?? "text",
      direction: "RESPONSE",
      endpoint: route ?? null,
      providerEndpoint: this.apiUrl,
      payload: data,
    });

    // Extract text content from response
    // Claude returns: { content: [{ type: "text", text: "..." }] }
    const textContent = data?.content?.find((block) => block.type === "text");
    let content = textContent?.text ?? "";

    if (!content && data?.content?.length === 0) {
      const stopReason = data?.stop_reason;
      llmLogger.warn(
        {
          taskType,
          stopReason,
          model,
        },
        "Anthropic response missing content"
      );
      throw new Error(`Anthropic response missing content. Stop reason: ${stopReason}`);
    }

    // If we used prefill, prepend the "{" back to the response
    // Note: Don't prepend for Structured Outputs - response is already complete JSON
    if (usePrefill) {
      content = "{" + content;
    }

    // Parse JSON if in json mode
    let parsedJson = null;
    if (mode === "json") {
      try {
        // Strip markdown code fences if present
        let jsonStr = content.trim();
        const fenceRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
        const match = jsonStr.match(fenceRegex);
        if (match && match[1]) {
          jsonStr = match[1].trim();
        }
        parsedJson = JSON.parse(jsonStr);
      } catch (error) {
        llmLogger.warn(
          { err: error?.message, textPreview: content.slice(0, 200) },
          "Anthropic JSON response parse failed"
        );
      }
    }

    // Extract usage metadata
    const metadata = data?.usage
      ? {
          promptTokens: data.usage.input_tokens ?? null,
          responseTokens: data.usage.output_tokens ?? null,
          totalTokens:
            (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0) || null,
          stopReason: data.stop_reason ?? null,
          // Include cache tokens if present (for prompt caching)
          cacheCreationTokens: data.usage.cache_creation_input_tokens ?? null,
          cacheReadTokens: data.usage.cache_read_input_tokens ?? null,
        }
      : undefined;

    return {
      text: content.trim(),
      json: parsedJson,
      metadata,
    };
  }
}
