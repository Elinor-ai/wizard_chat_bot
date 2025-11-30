import axios from "axios";
import { IVideoClient, VideoRendererError } from "../contracts.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

const SUPPORTED_SIZES = new Set(["720x1280", "1280x720", "1024x1792", "1792x1024"]);

function mapAspectRatio(aspectRatio) {
  if (!aspectRatio || typeof aspectRatio !== "string") {
    return undefined;
  }
  const normalized = aspectRatio.trim().toLowerCase();
  const mapping = {
    "9:16": "720x1280",
    "16:9": "1280x720",
    "1:1": null,
    "4:5": "1024x1792",
    "5:4": "1792x1024",
  };
  const mapped = mapping[normalized] ?? normalized.replace(/:/g, "x");
  return SUPPORTED_SIZES.has(mapped) ? mapped : undefined;
}

export class SoraClient extends IVideoClient {
  constructor({ apiToken, baseUrl = DEFAULT_BASE_URL } = {}) {
    super();
    this.apiToken = apiToken;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  get headers() {
    if (!this.apiToken) {
      throw new VideoRendererError("Missing Sora API token", {
        code: "CONFIGURATION_ERROR",
      });
    }
    return {
      Authorization: `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
    };
  }

  async startGeneration(request) {
    try {
      const payload = {
        model: request?.model ?? "sora-2-pro",
        prompt: request.prompt,
      };
      const size = mapAspectRatio(request.aspectRatio);
      if (size) {
        payload.size = size;
      }
      // Note: keeping payload small in logs to avoid leaking prompt
      console.debug("[Sora] startGeneration request", {
        model: payload.model,
        size: payload.size,
      });
      const response = await axios.post(`${this.baseUrl}/videos`, payload, {
        headers: this.headers,
      });
      console.debug("[Sora] startGeneration response", response.data);
      return {
        id: response.data?.id,
        status: "pending",
      };
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  async checkStatus(id) {
    if (!id) {
      throw new VideoRendererError("Job id is required", {
        code: "INVALID_REQUEST",
      });
    }
    try {
      const response = await axios.get(`${this.baseUrl}/videos/${id}`, {
        headers: this.headers,
      });
      const data = response.data ?? {};
      console.debug("[Sora] checkStatus response", data);
      if (data.status === "succeeded") {
        return {
          id,
          status: "completed",
          videoUrl: data.output?.video_url ?? null,
        };
      }
      if (data.status === "failed") {
        return {
          id,
          status: "failed",
          videoUrl: null,
          error: new Error(data.error?.message ?? "Sora generation failed"),
        };
      }
      return {
        id,
        status: "pending",
        videoUrl: null,
      };
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  handleAxiosError(error) {
    const serverMessage =
      error?.response?.data?.error?.message ??
      error?.response?.data?.message ??
      null;
    const baseMessage = serverMessage
      ? `Sora error: ${serverMessage}`
      : error.message;

    if (error.response?.status === 429) {
      throw new VideoRendererError("Sora rate limited", {
        code: "RATE_LIMITED",
        context: { provider: "sora" },
      });
    }
    if (error.code === "ECONNABORTED") {
      throw new VideoRendererError("Sora request timed out", {
        code: "TIMEOUT",
        context: { provider: "sora" },
      });
    }
    throw new VideoRendererError(baseMessage, {
      code: "PROVIDER_ERROR",
      context: { provider: "sora", details: error.response?.data },
    });
  }
}
