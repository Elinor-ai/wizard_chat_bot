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
    this.apiKey = apiKey ?? process.env.IMAGEN_API_KEY ?? process.env.GEMINI_API_KEY ?? null;
    this.apiUrl = apiUrl ?? "https://generativelanguage.googleapis.com/v1beta/models";
    this.modelAliases = normalizeAliases(modelAliases);
  }

  ensureKey() {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY (or IMAGEN_API_KEY) missing");
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

  resolveModel(model) {
    if (model && this.modelAliases[model.trim().toLowerCase()]) {
      return this.modelAliases[model.trim().toLowerCase()];
    }
    return model ?? this.modelAliases.nano ?? "imagen-4.0-generate-preview-06-06";
  }

  async invoke({ user, model }) {
    this.ensureKey();
    const payload = this.parsePayload(user);
    const prompt = payload.prompt;
    if (!prompt || typeof prompt !== "string") {
      throw new Error("Image generation payload missing prompt");
    }

    const resolvedModel = this.resolveModel(model);
    const url = `${this.apiUrl}/${encodeURIComponent(resolvedModel)}:predict?key=${this.apiKey}`;

    const body = {
      instances: [
        {
          prompt
        }
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: String(payload.aspect_ratio ?? "1:1")
      }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Imagen request failed: ${response.status} ${errorBody}`);
    }

    const data = await response.json();
    const prediction = data?.predictions?.[0] ?? {};
    const base64 =
      prediction.bytesBase64Encoded ??
      prediction.image?.base64 ??
      prediction?.images?.[0]?.base64 ??
      null;

    if (!base64) {
      throw new Error("Imagen response missing image data");
    }

    return {
      json: {
        imageBase64: base64,
        imageUrl: null,
        metadata: {
          model: resolvedModel
        }
      }
    };
  }
}
