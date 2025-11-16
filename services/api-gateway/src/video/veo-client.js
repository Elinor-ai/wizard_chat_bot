import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import { loadEnv, createLogger } from "@wizard/utils";
import { VERTEX_DEFAULTS } from "../vertex/constants.js";
import { QuotaMeter } from "../vertex/quota-meter.js";

loadEnv();

const PREDICT_BACKOFF_SEQUENCE_MS = [10000, 30000];
const FETCH_BACKOFF_SEQUENCE_MS = [10000, 20000, 30000];
const MAX_OPERATION_CACHE = 100;
const MAX_PREDICT_ATTEMPTS = PREDICT_BACKOFF_SEQUENCE_MS.length;
const TOKEN_EARLY_REFRESH_MS = 30000;
const CLOUD_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"];

const vertexOperationState = new Map();

function trackOperation(operationName, state) {
  if (!operationName) return;
  vertexOperationState.set(operationName, {
    ...state,
    updatedAt: new Date().toISOString(),
  });
  if (vertexOperationState.size > MAX_OPERATION_CACHE) {
    const [firstKey] = vertexOperationState.keys();
    vertexOperationState.delete(firstKey);
  }
}

export function getVertexOperationsSnapshot() {
  return Array.from(vertexOperationState.entries()).map(
    ([operationName, state]) => ({
      operationName,
      ...state,
    })
  );
}

function cleanText(value) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function buildError(message, { code, cause } = {}) {
  const error = new Error(message);
  if (code) error.code = code;
  if (cause) error.cause = cause;
  return error;
}

export const vertexQuotaMeter = new QuotaMeter();

export class VeoClient {
  constructor({
    logger = createLogger("veo-client"),
    auth = new GoogleAuth({ scopes: CLOUD_SCOPES }),
    quotaMeter = vertexQuotaMeter,
    fetchFn = fetch,
    minSpacingMs = VERTEX_DEFAULTS.MIN_DELAY_BETWEEN_REQUESTS_MS,
  } = {}) {
    this.logger = logger;
    this.auth = auth;
    this.quota = quotaMeter;
    this.fetch = fetchFn;
    this.requestCounter = 0;
    this.maxParallel = Math.max(1, Number(VERTEX_DEFAULTS.MAX_PARALLEL) || 1);
    this.currentParallel = 0;
    this.waitQueue = [];
    this.projectId = null;
    this.projectIdPromise = null;
    this.configured = true;
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    this.minSpacingMs = Number(minSpacingMs) || 0;
    this.lastRequestAt = 0;
    this.#warmProjectId();
  }

  isConfigured() {
    return this.configured !== false;
  }

  async generateVideo({
    prompt,
    aspectRatio,
    resolution,
    durationSeconds,
    sampleCount,
  } = {}) {
    const cleanedPrompt = cleanText(prompt);
    if (!cleanedPrompt) {
      throw buildError("Prompt is required for Veo generation", {
        code: "veo_missing_prompt",
      });
    }

    const normalized = {
      aspectRatio: aspectRatio || VERTEX_DEFAULTS.ASPECT_RATIO,
      resolution: resolution || VERTEX_DEFAULTS.RESOLUTION,
      durationSeconds: this.#normalizeNumber(
        durationSeconds,
        VERTEX_DEFAULTS.DURATION_SECONDS
      ),
      sampleCount: this.#normalizeNumber(
        sampleCount,
        VERTEX_DEFAULTS.SAMPLE_COUNT
      ),
    };

    const body = this.#buildPredictBody({
      prompt: cleanedPrompt,
      params: normalized,
    });
    const payload = await this.#withSemaphore(async () =>
      this.#predictWithRetry({
        body,
        context: {
          aspectRatio: normalized.aspectRatio,
          resolution: normalized.resolution,
          durationSeconds: normalized.durationSeconds,
          sampleCount: normalized.sampleCount,
        },
      })
    );

    const clip = this.#normaliseClip(payload, normalized.durationSeconds);
    if (clip) {
      const assetType = clip.videoUrl ? "uri" : "inline";
      this.logger.info(
        {
          assetType,
          model: VERTEX_DEFAULTS.VEO_MODEL_ID,
          aspectRatio: normalized.aspectRatio,
          resolution: normalized.resolution,
        },
        `veo.predict.success ${assetType}=${assetType === "uri" ? clip.videoUrl : "inline"}`
      );
      return { clip };
    }

    console.log("operationName", operationName);

    const operationName = this.#extractOperationName(payload);
    if (operationName) {
      this.logger.info(
        { operationName, model: VERTEX_DEFAULTS.VEO_MODEL_ID },
        "veo.predict.accepted operation"
      );
      trackOperation(operationName, { status: "predicting" });
      return { operationName };
    }

    throw buildError(
      "Vertex predict returned no predictions or operation name",
      {
        code: "veo_empty_response",
      }
    );
  }

  async fetchPredictOperation(operationName) {
    if (!operationName) {
      throw buildError("operationName is required to resume Vertex fetch", {
        code: "veo_missing_operation",
      });
    }
    const payload = await this.#withSemaphore(async () =>
      this.#fetchWithRetry(operationName)
    );
    const status = this.#extractStatus(payload);
    const clip = this.#normaliseClip(payload, null, { status });

    if (!clip) {
      this.logger.info(
        { operationName, status: status ?? "pending" },
        "veo.fetch.pending status"
      );
      trackOperation(operationName, { status: status ?? "pending" });
      return { done: false, status: status ?? "pending" };
    }

    const assetType = clip.videoUrl ? "uri" : "inline";
    this.logger.info(
      { operationName, assetType },
      `veo.fetch.done ${assetType}=${assetType === "uri" ? clip.videoUrl : "inline"}`
    );
    trackOperation(operationName, { status: "done" });
    return { done: true, clip };
  }

  async extendVideo() {
    this.logger.info("veo.extend.unavailable vertex_preview_no_extend");
    return {
      available: false,
      reason: "vertex_preview_no_extend",
    };
  }

  async #predictWithRetry({ body, context = {} }) {
    let attempt = 0;
    let lastError = null;

    while (attempt < MAX_PREDICT_ATTEMPTS) {
      attempt += 1;
      await this.#enforceMinSpacing();
      const reqId = this.#nextRequestId();
      let settled = false;

      const snapshot = this.quota.noteAttempt();
      this.logger.info(
        {
          requestId: reqId,
          attempt,
          perMin: snapshot.perMinCount,
          model: VERTEX_DEFAULTS.VEO_MODEL_ID,
          aspectRatio: context.aspectRatio,
          resolution: context.resolution,
          durationSeconds: context.durationSeconds,
        },
        `veo.predict.start req#${reqId} window=${snapshot.perMinCount}/min`
      );

      try {
        const response = await this.#sendPredictRequest(body);

        if (response.status === 429) {
          const backoffMs = this.#computeBackoff(attempt);
          const quotaSnapshot = this.quota.note429();
          settled = true;
          this.logger.warn(
            {
              requestId: reqId,
              attempt,
              perMin: quotaSnapshot.perMinCount,
              backoffMs,
            },
            `veo.predict.quota_exceeded req#${reqId} 429 backoff=${backoffMs}ms`
          );
          lastError = buildError("Vertex Veo quota exceeded", {
            code: "veo_rate_limited",
          });
          await delay(backoffMs);
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw buildError(
            `Vertex predict failed (${response.status}): ${errorText || response.statusText}`,
            {
              code: "veo_http_error",
            }
          );
        }

        let payload;
        try {
          payload = await response.json();
        } catch (parseError) {
          throw buildError("Vertex predict returned invalid JSON payload", {
            code: "veo_invalid_response",
            cause: parseError,
          });
        }

        this.quota.noteSuccess();
        settled = true;
        return payload;
      } catch (error) {
        if (!settled) {
          this.quota.noteFailure();
          settled = true;
        }
        if (
          error.code === "veo_rate_limited" &&
          attempt < MAX_PREDICT_ATTEMPTS
        ) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    throw (
      lastError ??
      buildError("Vertex Veo prediction failed after retries", {
        code: "veo_retry_exhausted",
      })
    );
  }

  async #fetchWithRetry(operationName) {
    let attempt = 0;
    let lastError = null;

    while (attempt < FETCH_BACKOFF_SEQUENCE_MS.length) {
      attempt += 1;
      await this.#enforceMinSpacing();
      const requestId = this.#nextRequestId();
      this.logger.info(
        { operationName, attempt, requestId },
        "veo.fetch.start operation"
      );
      try {
        const response = await this.#sendFetchRequest(operationName);
        if (response.status === 429) {
          const backoffMs = this.#fetchBackoff(attempt);
          this.logger.warn(
            { operationName, attempt, backoffMs },
            "veo.fetch.quota_exceeded 429"
          );
          lastError = buildError("Vertex Veo fetch rate limited", {
            code: "veo_rate_limited",
          });
          await delay(backoffMs);
          continue;
        }
        if (!response.ok) {
          const errorText = await response.text();
          throw buildError(
            `Vertex fetch failed (${response.status}): ${errorText || response.statusText}`,
            {
              code: "veo_fetch_http_error",
            }
          );
        }
        let payload;
        try {
          payload = await response.json();
        } catch (parseError) {
          throw buildError("Vertex fetch returned invalid JSON payload", {
            code: "veo_invalid_fetch_response",
            cause: parseError,
          });
        }
        return payload;
      } catch (error) {
        if (
          error.code === "veo_rate_limited" &&
          attempt < FETCH_BACKOFF_SEQUENCE_MS.length
        ) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw (
      lastError ??
      buildError("Vertex fetch failed after retries", {
        code: "veo_fetch_retry_exhausted",
      })
    );
  }

  async #sendPredictRequest(body) {
    const projectId = await this.#getProjectId();
    const accessToken = await this.#getAccessToken();
    const url = this.#buildPredictUrl(projectId);
    return this.fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
  }

  async #getProjectId() {
    if (this.projectId) {
      return this.projectId;
    }
    const envProjectId = this.#readProjectFromEnv();
    if (envProjectId) {
      this.projectId = envProjectId;
      return envProjectId;
    }
    if (!this.projectIdPromise) {
      this.projectIdPromise = this.auth
        .getProjectId()
        .then((projectId) => {
          if (!projectId) {
            throw buildError(
              "Google Cloud project ID is required for Vertex Veo",
              {
                code: "veo_missing_project",
              }
            );
          }
          this.projectId = projectId;
          this.configured = true;
          return projectId;
        })
        .catch((error) => {
          this.configured = false;
          throw error;
        })
        .finally(() => {
          this.projectIdPromise = null;
        });
    }
    return this.projectIdPromise;
  }

  async #getAccessToken() {
    const now = Date.now();
    if (
      this.accessToken &&
      now < this.accessTokenExpiresAt - TOKEN_EARLY_REFRESH_MS
    ) {
      return this.accessToken;
    }
    const client = await this.auth.getClient();
    const rawToken = await client.getAccessToken();
    const token = typeof rawToken === "string" ? rawToken : rawToken?.token;
    if (!token) {
      throw buildError("Unable to obtain Vertex access token via ADC", {
        code: "veo_missing_token",
      });
    }
    const expiry =
      typeof client?.credentials?.expiry_date === "number"
        ? client.credentials.expiry_date
        : now + 3600000;
    this.accessToken = token;
    this.accessTokenExpiresAt = expiry;
    return token;
  }

  #buildPredictUrl(projectId) {
    const location = VERTEX_DEFAULTS.LOCATION_ID;
    const model = VERTEX_DEFAULTS.VEO_MODEL_ID;
    return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;
  }

  #buildPredictBody({ prompt, params }) {
    return {
      instances: [{ prompt }],
      parameters: {
        aspectRatio: params.aspectRatio,
        sampleCount: params.sampleCount,
        durationSeconds: params.durationSeconds,
        personGeneration: VERTEX_DEFAULTS.PERSON_GENERATION,
        addWatermark: VERTEX_DEFAULTS.ADD_WATERMARK,
        includeBadReasons: VERTEX_DEFAULTS.INCLUDE_BAD_REASONS,
        generateAudio: VERTEX_DEFAULTS.GENERATE_AUDIO,
        resolution: params.resolution,
      },
    };
  }

  async #sendFetchRequest(operationName) {
    const projectId = await this.#getProjectId();
    const accessToken = await this.#getAccessToken();
    const url = this.#buildFetchUrl(projectId);
    return this.fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ operationName }),
    });
  }

  #buildFetchUrl(projectId) {
    const location = VERTEX_DEFAULTS.LOCATION_ID;
    const model = VERTEX_DEFAULTS.VEO_MODEL_ID;
    return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:fetchPredictOperation`;
  }

  #normaliseClip(rawResponse, durationSeconds, { status } = {}) {
    const container = rawResponse?.response ?? rawResponse ?? {};
    const prediction =
      container.predictions?.[0] ?? rawResponse?.predictions?.[0] ?? {};
    const uriCandidate =
      prediction.uri ??
      prediction.videoUri ??
      prediction.videoUrl ??
      prediction.outputUri ??
      null;
    const clipId =
      prediction.clipId ??
      prediction.videoId ??
      prediction.id ??
      container.id ??
      container.name ??
      rawResponse?.id ??
      rawResponse?.name ??
      null;

    const inlineBase64 = this.#extractInlineVideos(rawResponse);
    const inlineVideos =
      inlineBase64.length > 0 ? this.#toInlineVideoBuffers(inlineBase64) : [];

    if (!uriCandidate && inlineVideos.length === 0) {
      return null;
    }

    return {
      clipId,
      videoUrl: isHttpUrl(uriCandidate) ? uriCandidate : null,
      posterUrl: null,
      durationSeconds:
        Number(
          prediction.durationSeconds ??
            container.durationSeconds ??
            durationSeconds
        ) || null,
      inlineVideos,
      metadata: {
        source: "vertex",
        status: status ?? null,
        assetTokens: inlineVideos.map((video) => video.token),
        uriAvailable: Boolean(uriCandidate),
      },
    };
  }

  #computeBackoff(attempt) {
    const index = Math.min(attempt - 1, PREDICT_BACKOFF_SEQUENCE_MS.length - 1);
    const base = PREDICT_BACKOFF_SEQUENCE_MS[index];
    const jitter = Math.floor(Math.random() * Math.min(2500, base / 2));
    return base + jitter;
  }

  #fetchBackoff(attempt) {
    const index = Math.min(attempt - 1, FETCH_BACKOFF_SEQUENCE_MS.length - 1);
    return FETCH_BACKOFF_SEQUENCE_MS[index];
  }

  #normalizeNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  }

  #nextRequestId() {
    this.requestCounter += 1;
    return this.requestCounter;
  }

  async #withSemaphore(task) {
    if (this.currentParallel >= this.maxParallel) {
      await new Promise((resolve) => this.waitQueue.push(resolve));
    }
    this.currentParallel += 1;
    try {
      return await task();
    } finally {
      await delay(2000);
      this.currentParallel -= 1;
      const next = this.waitQueue.shift();
      if (next) next();
    }
  }

  #readProjectFromEnv() {
    const candidates = [
      process.env.GOOGLE_CLOUD_PROJECT,
      process.env.GCLOUD_PROJECT,
      process.env.GOOGLE_PROJECT_ID,
      process.env.GCP_PROJECT,
    ];
    return (
      candidates
        .find((value) => typeof value === "string" && value.trim().length > 0)
        ?.trim() ?? null
    );
  }

  #warmProjectId() {
    this.#getProjectId().catch((error) => {
      this.logger.warn(
        { err: error },
        "Unable to warm Vertex project id; will retry lazily"
      );
    });
  }

  async #enforceMinSpacing() {
    if (this.minSpacingMs <= 0) {
      this.lastRequestAt = Date.now();
      return;
    }
    const now = Date.now();
    if (!this.lastRequestAt) {
      this.lastRequestAt = now;
      return;
    }
    const waitMs = this.lastRequestAt + this.minSpacingMs - now;
    if (waitMs > 0) {
      this.logger.info({ waitMs }, `veo.predict.wait spacing=${waitMs}ms`);
      await delay(waitMs);
    }
    this.lastRequestAt = Date.now();
  }

  #extractOperationName(payload) {
    if (!payload) return null;
    if (typeof payload.name === "string") return payload.name;
    if (typeof payload.operation?.name === "string")
      return payload.operation.name;
    if (typeof payload.operationName === "string") return payload.operationName;
    return null;
  }

  #extractPredictions(payload) {
    if (!payload) return [];
    if (Array.isArray(payload.predictions)) return payload.predictions;
    if (Array.isArray(payload.response?.predictions))
      return payload.response.predictions;
    return [];
  }

  #extractInlineVideos(payload) {
    if (!payload) return [];
    const videos = [];
    const collect = (value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach((candidate) => {
          if (typeof candidate === "string") {
            videos.push(candidate);
          } else if (typeof candidate?.videoBase64 === "string") {
            videos.push(candidate.videoBase64);
          } else if (typeof candidate?.bytesBase64Encoded === "string") {
            videos.push(candidate.bytesBase64Encoded);
          }
        });
      }
    };
    collect(payload.videos);
    collect(payload.response?.videos);
    this.#extractPredictions(payload).forEach((prediction) => {
      if (typeof prediction?.bytesBase64Encoded === "string") {
        videos.push(prediction.bytesBase64Encoded);
      } else if (typeof prediction?.videoBytesBase64 === "string") {
        videos.push(prediction.videoBytesBase64);
      }
    });
    return videos.filter(
      (value) => typeof value === "string" && value.trim().length > 0
    );
  }

  #toInlineVideoBuffers(base64List) {
    return base64List.map((value, index) => {
      const buffer = Buffer.from(
        value.replace(/^data:video\/mp4;base64,/, ""),
        "base64"
      );
      const token = createHash("sha1")
        .update(buffer)
        .digest("hex")
        .slice(0, 16);
      return { buffer, token, index };
    });
  }

  #extractStatus(payload) {
    return (
      payload?.status ??
      payload?.state ??
      payload?.metadata?.status ??
      payload?.metadata?.state ??
      null
    );
  }
}
