import { llmLogger } from "../logger.js";
import { logRawTraffic } from "../raw-traffic-logger.js";

export class OpenAIAdapter {
  constructor({ apiKey, apiUrl }) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
  }

  ensureKey() {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY missing");
    }
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
  }) {
    this.ensureKey();

    if (typeof user !== "string" || user.trim().length === 0) {
      throw new Error("OpenAI adapter requires a user prompt");
    }

    const messages = [];
    if (system) {
      messages.push({ role: "system", content: system });
    }
    messages.push({ role: "user", content: user });

    const payload = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    if (mode === "json") {
      payload.response_format = { type: "json_object" };
    }

    await logRawTraffic({
      taskId: taskType ?? "text",
      direction: "REQUEST",
      endpoint: route ?? null,
      providerEndpoint: this.apiUrl,
      payload,
    });

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI request failed: ${response.status} ${errorBody}`);
    }

    const data = await response.json();
    await logRawTraffic({
      taskId: taskType ?? "text",
      direction: "RESPONSE",
      endpoint: route ?? null,
      providerEndpoint: this.apiUrl,
      payload: data,
    });
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI response missing content");
    }

    let parsedJson = null;
    if (mode === "json") {
      try {
        parsedJson = JSON.parse(content);
      } catch (error) {
        llmLogger.warn(
          { err: error?.message },
          "OpenAI JSON response parse failed"
        );
      }
    }

    const metadata = data?.usage
      ? {
          promptTokens: data.usage.prompt_tokens ?? null,
          responseTokens: data.usage.completion_tokens ?? null,
          totalTokens: data.usage.total_tokens ?? null,
        }
      : undefined;

    return { text: content.trim(), json: parsedJson, metadata };
  }
}
