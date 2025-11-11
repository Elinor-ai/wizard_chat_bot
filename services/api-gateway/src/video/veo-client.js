import { setTimeout as delay } from "node:timers/promises";
import { loadEnv, createLogger } from "@wizard/utils";

loadEnv();

const DEFAULT_BASE_URL = (process.env.GEMINI_API_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
const DEFAULT_TIMEOUT_MS = Number(process.env.VEO_POLL_TIMEOUT_MS ?? 240000);
const DEFAULT_POLL_INTERVAL_MS = Number(process.env.VEO_POLL_INTERVAL_MS ?? 2000);
const DEFAULT_POLL_MAX_MS = Number(process.env.VEO_POLL_MAX_INTERVAL_MS ?? 10000);
const RETRIABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function cleanText(value) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function buildError(message, { code, retryAfterMs } = {}) {
  const error = new Error(message);
  if (code) error.code = code;
  if (retryAfterMs) error.retryAfterMs = retryAfterMs;
  return error;
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

export class VeoClient {
  constructor({
    apiKey = process.env.GEMINI_API_KEY ?? process.env.LLM_VIDEO_API_KEY,
    baseUrl = DEFAULT_BASE_URL,
    logger = createLogger("veo-client"),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    pollMaxIntervalMs = DEFAULT_POLL_MAX_MS
  } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.logger = logger;
    this.timeoutMs = timeoutMs;
    this.pollIntervalMs = pollIntervalMs;
    this.pollMaxIntervalMs = pollMaxIntervalMs;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  async generateVideo({ model, prompt, aspectRatio = "9:16", resolution = "1080x1920", textOverlays = "supers" }) {
    if (!model) {
      throw buildError("Veo model is required for generation", { code: "veo_missing_model" });
    }
    this.logger.info({ stage: "generate", model, aspectRatio, resolution }, "Submitting Veo generation request");
    const body = {
      prompt: cleanText(prompt),
      config: {
        aspectRatio,
        resolution,
        displayText: textOverlays,
        enableAudio: true
      }
    };
    const clip = await this.#postAndPoll({
      endpoint: `${this.baseUrl}/models/${model}:generateVideo`,
      body,
      stage: "generate"
    });
    this.logger.info({ stage: "generate", clipId: clip.clipId, duration: clip.durationSeconds }, "Veo generation complete");
    return clip;
  }

  async extendVideo({ model, videoId, prompt }) {
    if (!videoId) {
      throw buildError("videoId is required to extend clips", { code: "veo_missing_video_id" });
    }
    if (!model) {
      throw buildError("Extend model is required", { code: "veo_missing_model" });
    }
    this.logger.info({ stage: "extend", model, videoId }, "Submitting Veo extend request");
    const clip = await this.#postAndPoll({
      endpoint: `${this.baseUrl}/videos/${videoId}:extend`,
      body: {
        prompt: cleanText(prompt),
        model
      },
      stage: "extend"
    });
    this.logger.info({ stage: "extend", clipId: clip.clipId, duration: clip.durationSeconds }, "Veo extend hop complete");
    return clip;
  }

  async #postAndPoll({ endpoint, body, stage }) {
    const initial = await this.#request(endpoint, body, stage);

    if (initial?.done && (initial.response || initial.result)) {
      return this.#normaliseClip(initial);
    }

    const immediateClip = this.#normaliseClip(initial);
    if (immediateClip.videoUrl) {
      return immediateClip;
    }

    const operationName = this.#extractOperationName(initial);
    if (!operationName) {
      return immediateClip;
    }

    return this.#pollOperation(operationName, stage);
  }

  async #request(endpoint, body, stage) {
    const url = `${endpoint}?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: this.#headers(),
      body: JSON.stringify(body)
    });

    if (response.status === 429) {
      const retryAfterMs = this.#retryAfterMs(response);
      throw buildError(`Gemini rate limit hit during ${stage}`, {
        code: "veo_rate_limited",
        retryAfterMs
      });
    }

    if (!response.ok) {
      const text = await response.text();
      throw buildError(`Gemini ${stage} failed (${response.status}): ${text || response.statusText}`, {
        code: RETRIABLE_STATUS.has(response.status) ? "veo_retryable_error" : "veo_http_error"
      });
    }

    const payload = await response.json();
    if (payload?.error) {
      throw buildError(`Gemini ${stage} error: ${payload.error.message ?? payload.error.status ?? "unknown"}`, {
        code: payload.error?.code ?? payload.error?.status ?? "veo_error"
      });
    }
    return payload;
  }

  async #pollOperation(operationName, stage) {
    const url = `${this.baseUrl}/${operationName}?key=${this.apiKey}`;
    const expiresAt = Date.now() + this.timeoutMs;
    let waitMs = this.pollIntervalMs;

    while (Date.now() < expiresAt) {
      const response = await fetch(url, { headers: this.#headers() });

      if (response.status === 429) {
        const retryAfterMs = this.#retryAfterMs(response) ?? waitMs;
        throw buildError(`Gemini rate limit hit while polling ${operationName}`, {
          code: "veo_rate_limited",
          retryAfterMs
        });
      }

      if (!response.ok) {
        const text = await response.text();
        throw buildError(`Gemini ${stage} poll failed (${response.status}): ${text || response.statusText}`, {
          code: RETRIABLE_STATUS.has(response.status) ? "veo_retryable_error" : "veo_http_error"
        });
      }

      const payload = await response.json();
      if (payload?.error) {
        throw buildError(`Gemini ${stage} operation error: ${payload.error.message ?? payload.error.status ?? "unknown"}`, {
          code: payload.error?.code ?? payload.error?.status ?? "veo_error"
        });
      }

      if (payload?.done || payload?.state === "SUCCEEDED") {
        return this.#normaliseClip(payload.response ?? payload.result ?? payload);
      }

      const retryAfterHeader = this.#retryAfterMs(response);
      waitMs = Math.min(retryAfterHeader ?? waitMs * 1.5, this.pollMaxIntervalMs);
      await delay(waitMs);
    }

    throw buildError(`Gemini ${stage} timed out after ${this.timeoutMs}ms`, { code: "veo_timeout" });
  }

  #extractOperationName(payload) {
    if (!payload) return null;
    if (typeof payload.name === "string") return payload.name;
    if (typeof payload.operation?.name === "string") return payload.operation.name;
    if (typeof payload.operationName === "string") return payload.operationName;
    return null;
  }

  #headers() {
    return {
      "Content-Type": "application/json",
      "x-goog-api-key": this.apiKey
    };
  }

  #retryAfterMs(response) {
    const header = response.headers?.get?.("retry-after");
    if (!header) return null;
    const numeric = Number(header);
    if (Number.isFinite(numeric)) {
      return Math.max(numeric * 1000, 0);
    }
    const dateValue = Date.parse(header);
    if (!Number.isNaN(dateValue)) {
      return Math.max(dateValue - Date.now(), 0);
    }
    return null;
  }

  #normaliseClip(rawPayload) {
    if (!rawPayload) {
      return {
        clipId: null,
        durationSeconds: null,
        videoUrl: null,
        posterUrl: null,
        metadata: rawPayload
      };
    }

    const payload = rawPayload.response ?? rawPayload.result ?? rawPayload;
    const assets = [
      ...(payload.assets ?? []),
      ...(payload.files ?? []),
      ...(payload.outputFiles ?? []),
      ...(rawPayload.assets ?? [])
    ];

    const clipId = payload.videoId ??
      payload.id ??
      payload.name ??
      rawPayload.videoId ??
      rawPayload.id ??
      rawPayload.name ??
      null;

    const videoCandidates = [
      payload.videoUrl,
      payload.videoUri,
      payload.video?.uri,
      payload.video?.url,
      payload.video?.downloadUri,
      payload.output?.video?.uri,
      payload.outputVideo?.uri,
      ...assets
        .map((file) => file?.uri ?? file?.downloadUri ?? null)
        .filter((uri) => typeof uri === "string" && /\.(mp4|mov)$/i.test(uri))
    ].filter(isHttpUrl);

    const posterCandidates = [
      payload.posterUrl,
      payload.poster?.uri,
      payload.thumbnail?.uri,
      payload.coverImage?.uri,
      ...assets
        .map((file) => file?.uri ?? file?.downloadUri ?? null)
        .filter((uri) => typeof uri === "string" && /\.(png|jpe?g)$/i.test(uri))
    ].filter(isHttpUrl);

    const durationSecondsRaw =
      payload.durationSeconds ??
      payload.video?.durationSeconds ??
      payload.video?.duration ??
      rawPayload.durationSeconds ??
      null;

    const durationSeconds = Number(durationSecondsRaw);

    return {
      clipId,
      videoUrl: videoCandidates[0] ?? null,
      posterUrl: posterCandidates[0] ?? null,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
      metadata: rawPayload
    };
  }
}
