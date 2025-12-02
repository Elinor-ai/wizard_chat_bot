import { llmLogger } from "../logger.js";
import { logRawTraffic } from "../raw-traffic-logger.js";
import { LLM_CORE_TASK } from "../../config/task-types.js";

export class DalleImageAdapter {
  constructor({ apiKey, apiUrl }) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl ?? "https://api.openai.com/v1/images/generations";
  }

  ensureKey() {
    if (!this.apiKey) {
      throw new Error("DALL-E adapter missing DALL_E_API_KEY");
    }
  }

  parsePayload(userPayload) {
    if (!userPayload) {
      throw new Error("Image generation payload missing");
    }
    try {
      return JSON.parse(userPayload);
    } catch (error) {
      throw new Error(`Invalid image generation payload: ${error.message}`);
    }
  }

  async invoke({ user, model, route = null }) {
    this.ensureKey();
    const payload = this.parsePayload(user);
    const prompt = payload.prompt;
    if (!prompt || typeof prompt !== "string") {
      throw new Error("Image generation payload missing prompt");
    }

    const requestBody = {
      model: model || "gpt-image-1",
      prompt,
      size: payload.size ?? "1024x1024",
      response_format: "b64_json"
    };

    if (payload.negative_prompt) {
      requestBody.negative_prompt = payload.negative_prompt;
    }
    if (payload.style) {
      requestBody.style = payload.style;
    }

    await logRawTraffic({
      taskId: LLM_CORE_TASK.IMAGE_GENERATION,
      direction: "REQUEST",
      endpoint: route ?? null,
      providerEndpoint: this.apiUrl,
      payload: requestBody
    });

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`DALL-E request failed: ${response.status} ${errorBody}`);
    }

    const data = await response.json();
    await logRawTraffic({
      taskId: LLM_CORE_TASK.IMAGE_GENERATION,
      direction: "RESPONSE",
      endpoint: route ?? null,
      providerEndpoint: this.apiUrl,
      payload: data
    });
    const first = Array.isArray(data?.data) ? data.data[0] : null;
    if (!first) {
      throw new Error("DALL-E response missing data");
    }

    const imageBase64 = first.b64_json ?? null;
    const imageUrl = first.url ?? null;
    if (!imageBase64 && !imageUrl) {
      throw new Error("DALL-E response missing image payload");
    }

    const metadata = data?.usage
      ? {
          promptTokens: data.usage?.prompt_tokens ?? null,
          responseTokens: data.usage?.completion_tokens ?? null,
          totalTokens: data.usage?.total_tokens ?? null
        }
      : undefined;

    llmLogger.info(
      {
        provider: "dall-e",
        model: requestBody.model,
        size: requestBody.size
      },
      "DALL-E image generation completed"
    );

    return {
      json: {
        imageBase64,
        imageUrl,
        metadata
      }
    };
  }
}
