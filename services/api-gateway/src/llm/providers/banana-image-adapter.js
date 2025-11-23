export class BananaImageAdapter {
  constructor({ apiKey, apiUrl, modelKeyMap = {} } = {}) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl ?? "https://api.banana.dev/v4/";
    this.modelKeyMap = Object.entries(modelKeyMap ?? {}).reduce(
      (acc, [key, value]) => {
        if (value) {
          acc[key.trim().toLowerCase()] = value;
        }
        return acc;
      },
      {}
    );
  }

  resolveModelKey(model) {
    if (model && this.modelKeyMap[model.trim().toLowerCase()]) {
      return this.modelKeyMap[model.trim().toLowerCase()];
    }
    return model ?? null;
  }

  ensureConfig(modelKey) {
    if (!this.apiKey) {
      throw new Error("BANANA_API_KEY missing");
    }
    if (!modelKey) {
      throw new Error("Banana model key not provided");
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

  buildRequestBody({ modelKey, parsed }) {
    const input = {
      prompt: parsed.prompt,
      negative_prompt: parsed.negative_prompt ?? null,
      style: parsed.style ?? null,
      aspect_ratio: parsed.aspect_ratio ?? "1:1",
    };
    return {
      apiKey: this.apiKey,
      modelKey,
      input,
    };
  }

  async invoke({ user, model }) {
    const parsed = this.parsePayload(user);
    if (!parsed.prompt || typeof parsed.prompt !== "string") {
      throw new Error("Image generation payload missing prompt");
    }
    const modelKey = this.resolveModelKey(model);
    this.ensureConfig(modelKey);

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(this.buildRequestBody({ modelKey, parsed })),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Banana request failed: ${response.status} ${errorBody}`);
    }

    const data = await response.json();
    const outputs = data?.modelOutputs ?? data?.output ?? [];
    const first =
      Array.isArray(outputs) && outputs.length > 0 ? outputs[0] : null;
    if (!first) {
      throw new Error("Banana response missing model outputs");
    }

    return {
      json: {
        imageBase64:
          first.image_base64 ??
          first.imageBase64 ??
          first.base64 ??
          null,
        imageUrl: first.image_url ?? first.imageUrl ?? null,
        metadata: first.metadata ?? {
          version: data?.modelVersion ?? null,
          id: data?.id ?? null,
        },
      },
    };
  }
}
