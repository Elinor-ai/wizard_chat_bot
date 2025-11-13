import { llmLogger } from "../logger.js";

export class StableDiffusionAdapter {
  constructor({ apiKey, apiUrl }) {
    this.apiKey = apiKey;
    this.apiUrl =
      apiUrl ??
      "https://api.stability.ai/v2beta/stable-image/generate/core";
  }

  normalizeModel(model) {
    if (!model) {
      return "sd3";
    }
    const normalized = model.toLowerCase();
    if (normalized.includes("sd3")) {
      return "sd3";
    }
    if (normalized.includes("turbo")) {
      return "sd3-turbo";
    }
    if (normalized.includes("xl")) {
      return "sd3";
    }
    return model;
  }

  ensureKey() {
    if (!this.apiKey) {
      throw new Error("STABLE_DIFFUSION_API_KEY missing");
    }
  }

  parsePayload(payload) {
    if (!payload) {
      throw new Error("Image generation payload missing");
    }
    try {
      return JSON.parse(payload);
    } catch (error) {
      throw new Error(`Invalid image generation payload: ${error.message}`);
    }
  }

  async invoke({ user, model }) {
    this.ensureKey();
    const payload = this.parsePayload(user);
    const prompt = payload.prompt;
    if (!prompt || typeof prompt !== "string") {
      throw new Error("Image generation payload missing prompt");
    }

    const aspectRatio = payload.aspect_ratio ?? "1:1";
    const selectedModel = this.normalizeModel(model);
    const formData = new FormData();
    formData.append("prompt", prompt);
    const negativePrompt = payload.negative_prompt ?? payload.negativePrompt;
    if (negativePrompt) {
      formData.append("negative_prompt", negativePrompt);
    }
    formData.append("aspect_ratio", aspectRatio);
    if (payload.seed !== undefined && payload.seed !== null) {
      formData.append("seed", String(payload.seed));
    }
    formData.append("output_format", payload.output_format ?? "png");
    formData.append("width", payload.width ?? "512");
    formData.append("height", payload.height ?? "512");
    formData.append("model", selectedModel);

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        Accept: "image/*,application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorBody = await response.text();
      llmLogger.error(
        {
          provider: "stable_diffusion",
          status: response.status,
          body: errorBody
        },
        "Stable Diffusion request failed"
      );
      throw new Error(
        `Stable Diffusion request failed: ${response.status} ${errorBody}`
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      if (data?.error) {
        llmLogger.error(
          {
            provider: "stable_diffusion",
            error: data.error
          },
          "Stable Diffusion returned error payload"
        );
        throw new Error(
          `Stable Diffusion error: ${data.error.message ?? JSON.stringify(data.error)}`
        );
      }
      const image =
        data?.images?.[0] ??
        (Array.isArray(data?.artifacts) ? data.artifacts[0] : null);
      if (!image) {
        throw new Error("Stable Diffusion response missing images");
      }

      const base64Payload = image?.base64 ?? image?.base64_data ?? null;
      const imageUrl = image?.url ?? null;

      return {
        json: {
          imageBase64: base64Payload,
          imageUrl,
          metadata: {
            seed: image?.seed ?? null,
            aspectRatio,
            finishReason: image?.finishReason ?? image?.finish_reason ?? null
          }
        }
      };
    }

    if (contentType.includes("image/")) {
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      llmLogger.info(
        {
          provider: "stable_diffusion",
          model: selectedModel,
          aspect_ratio: aspectRatio
        },
        "Stable Diffusion image generated (binary)"
      );
      return {
        json: {
          imageBase64: base64,
          imageUrl: null,
          metadata: {
            aspectRatio
          }
        }
      };
    }

    const text = await response.text();
    llmLogger.error(
      {
        provider: "stable_diffusion",
        contentType,
        snippet: text.slice(0, 200)
      },
      "Stable Diffusion returned unsupported content type"
    );
    throw new Error(
      `Stable Diffusion returned unsupported content-type: ${contentType} ${text}`
    );
  }
}
