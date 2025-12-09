import axios from "axios";
import {
  IVideoClient,
  VideoRendererError,
  SORA_ALLOWED_SECONDS,
  SORA_ALLOWED_SIZES,
  SORA_ALLOWED_MODELS,
} from "../contracts.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

// Note: Sora API defaults (per OpenAI docs):
// - seconds: "4"
// - size: "720x1280"
// We omit these fields when not specified to let the API use its defaults.

/**
 * Maps aspect ratio strings to Sora-compatible size values.
 * Returns undefined if the aspect ratio cannot be mapped to a valid size.
 *
 * @param {string} [aspectRatio] - Aspect ratio like "9:16", "16:9", etc.
 * @returns {string | undefined} - Sora size like "720x1280" or undefined
 */
function mapAspectRatioToSize(aspectRatio) {
  if (!aspectRatio || typeof aspectRatio !== "string") {
    return undefined;
  }
  const normalized = aspectRatio.trim().toLowerCase();
  const mapping = {
    "9:16": "720x1280",
    "16:9": "1280x720",
    "1:1": null, // Not supported by Sora
    "4:5": "1024x1792",
    "5:4": "1792x1024",
  };
  const mapped = mapping[normalized] ?? normalized.replace(/:/g, "x");
  return SORA_ALLOWED_SIZES.includes(mapped) ? mapped : undefined;
}

/**
 * Maps a numeric duration to the closest valid Sora seconds value.
 * Sora only accepts "4", "8", or "12" seconds.
 *
 * @param {number | string | undefined} duration - Duration in seconds
 * @returns {string | undefined} - Valid Sora seconds value or undefined
 */
function mapDurationToSeconds(duration) {
  if (duration === undefined || duration === null) {
    return undefined;
  }
  const numDuration = Number(duration);
  if (!Number.isFinite(numDuration) || numDuration <= 0) {
    return undefined;
  }
  // Find the closest allowed value
  const allowed = SORA_ALLOWED_SECONDS.map(Number);
  let closest = allowed[0];
  let minDiff = Math.abs(numDuration - closest);
  for (const val of allowed) {
    const diff = Math.abs(numDuration - val);
    if (diff < minDiff) {
      minDiff = diff;
      closest = val;
    }
  }
  return String(closest);
}

/**
 * SoraClient - OpenAI Sora Video Generation API Client
 *
 * API Reference: POST https://api.openai.com/v1/videos
 *
 * Request body fields (per OpenAI docs):
 * - prompt: string (required) - Text prompt describing the video
 * - input_reference: file (optional) - Image reference for guidance
 * - model: string (optional) - "sora-2" or "sora-2-pro", defaults to "sora-2"
 * - seconds: string (optional) - "4", "8", or "12", defaults to "4"
 * - size: string (optional) - Output resolution, defaults to "720x1280"
 *
 * @extends IVideoClient
 */
export class SoraClient extends IVideoClient {
  /**
   * @param {Object} options
   * @param {string} [options.apiToken] - OpenAI API key for Sora
   * @param {string} [options.baseUrl] - OpenAI API base URL
   * @param {string} [options.defaultModel] - Default Sora model (from VIDEO_RENDER_CONFIG)
   */
  constructor({ apiToken, baseUrl = DEFAULT_BASE_URL, defaultModel = "sora-2-pro" } = {}) {
    super();
    this.apiToken = apiToken;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.defaultModel = defaultModel;
  }

  get headers() {
    if (!this.apiToken) {
      throw new VideoRendererError(
        "Missing OpenAI API key for Sora video generation. Set OPENAI_API_KEY.",
        { code: "CONFIGURATION_ERROR" }
      );
    }
    return {
      Authorization: `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Builds the Sora API request payload from the unified request and provider options.
   *
   * Priority order for each field:
   * 1. Explicit providerOptions.sora.* override
   * 2. Mapped value from unified request (aspectRatio → size, duration → seconds)
   * 3. Client default (for model)
   * 4. API default (omit field to use provider default)
   *
   * @param {import('../contracts.js').VideoGenerationRequest} request
   * @returns {Object} - Sora API request payload
   */
  buildPayload(request) {
    const soraOptions = request.providerOptions?.sora ?? {};

    // Required: prompt
    if (!request.prompt || typeof request.prompt !== "string") {
      throw new VideoRendererError("Prompt is required for Sora video generation", {
        code: "INVALID_REQUEST",
      });
    }

    const payload = {
      prompt: request.prompt,
    };

    // Model: explicit override → client default
    const model = soraOptions.model ?? this.defaultModel;
    if (model) {
      if (!SORA_ALLOWED_MODELS.includes(model)) {
        console.warn(`[Sora] Invalid model "${model}", using default "${this.defaultModel}"`);
        payload.model = this.defaultModel;
      } else {
        payload.model = model;
      }
    }

    // Size: explicit override → mapped from aspectRatio → omit for API default
    if (soraOptions.size) {
      if (SORA_ALLOWED_SIZES.includes(soraOptions.size)) {
        payload.size = soraOptions.size;
      } else {
        console.warn(`[Sora] Invalid size "${soraOptions.size}", ignoring`);
      }
    } else if (request.aspectRatio) {
      const mappedSize = mapAspectRatioToSize(request.aspectRatio);
      if (mappedSize) {
        payload.size = mappedSize;
      }
      // If mapping fails (e.g., "1:1"), omit size and let API use default
    }

    // Seconds: explicit override → mapped from duration → omit for API default
    if (soraOptions.seconds) {
      if (SORA_ALLOWED_SECONDS.includes(soraOptions.seconds)) {
        payload.seconds = soraOptions.seconds;
      } else {
        console.warn(`[Sora] Invalid seconds "${soraOptions.seconds}", ignoring`);
      }
    } else if (request.duration !== undefined && request.duration !== null) {
      const mappedSeconds = mapDurationToSeconds(request.duration);
      if (mappedSeconds) {
        payload.seconds = mappedSeconds;
      }
    }
    // If no seconds specified, API defaults to "4"

    // TODO: input_reference - Not implemented yet
    // When we add image upload support, wire it here:
    // if (soraOptions.inputReferenceFileId) {
    //   payload.input_reference = soraOptions.inputReferenceFileId;
    // }

    return payload;
  }

  /**
   * Starts a Sora video generation job.
   *
   * @param {import('../contracts.js').VideoGenerationRequest} request
   * @returns {Promise<import('../contracts.js').VideoGenerationResult>}
   */
  async startGeneration(request) {
    try {
      const payload = this.buildPayload(request);

      // Log request details (excluding prompt for privacy)
      console.debug("[Sora] startGeneration request", {
        model: payload.model,
        size: payload.size,
        seconds: payload.seconds,
        hasInputReference: !!payload.input_reference,
      });

      const response = await axios.post(`${this.baseUrl}/videos`, payload, {
        headers: this.headers,
      });

      console.debug("[Sora] startGeneration response", {
        id: response.data?.id,
        status: response.data?.status,
        model: response.data?.model,
      });

      return {
        id: response.data?.id,
        status: "pending",
      };
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  /**
   * Checks the status of a Sora video generation job.
   *
   * @param {string} id - The video job ID
   * @returns {Promise<import('../contracts.js').VideoGenerationResult>}
   */
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

      console.debug("[Sora] checkStatus response", {
        id: data.id,
        status: data.status,
        progress: data.progress,
        seconds: data.seconds,
      });

      // OpenAI Sora API returns "completed" (not "succeeded")
      if (data.status === "succeeded" || data.status === "completed") {
        // OpenAI Sora requires a separate endpoint to download the video content
        // The content URL is: /videos/{id}/content
        const contentUrl = `${this.baseUrl}/videos/${id}/content`;
        return {
          id,
          status: "completed",
          videoUrl: contentUrl,
          seconds: data.seconds ? Number(data.seconds) : null,
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

  /**
   * Handles Axios errors and converts them to VideoRendererError.
   *
   * @param {Error} error
   * @throws {VideoRendererError}
   */
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
