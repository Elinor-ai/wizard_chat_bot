function normalizeAliases(map = {}) {
  return Object.entries(map).reduce((acc, [key, value]) => {
    if (key && value) {
      acc[key.trim().toLowerCase()] = value;
    }
    return acc;
  }, {});
}

export class ImagenImageAdapter {
  constructor({ apiKey, apiUrl, modelAliases = {} } = {}) {
    this.apiKey = apiKey;
    this.apiUrl =
      apiUrl ??
      "https://generativelanguage.googleapis.com/v1beta/models/imagegeneration:generate";
    this.modelAliases = normalizeAliases(modelAliases);
  }

  ensureKey() {
    if (!this.apiKey) {
      throw new Error("IMAGEN_API_KEY missing");
    }
  }

  resolveModel(model) {
    if (model && this.modelAliases[model.trim().toLowerCase()]) {
      return this.modelAliases[model.trim().toLowerCase()];
    }
    return model ?? this.modelAliases.nano ?? "imagen-3.0-fast-generate-001";
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

    const resolvedModel = this.resolveModel(model);
    const url = `${this.apiUrl}?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: resolvedModel,
        prompt: {
          text: prompt
        },
        negative_prompt: payload.negative_prompt ?? undefined,
        aspect_ratio: payload.aspect_ratio ?? "1:1"
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Imagen request failed: ${response.status} ${errorBody}`);
    }

    const data = await response.json();
    const firstImage = data?.candidates?.[0]?.image;
    if (!firstImage) {
      throw new Error("Imagen response missing candidates");
    }

    return {
      json: {
        imageBase64: firstImage.base64 ?? null,
        imageUrl: null,
        metadata: {
          finishReason: data?.candidates?.[0]?.finishReason ?? null
        }
      }
    };
  }
}
