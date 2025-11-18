import { v4 as uuid } from "uuid";
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import { VideoRenderTaskSchema } from "@wizard/core";
import { buildFallbackThumbnail } from "./fallbacks.js";
import { calculateStoryboardDuration } from "./utils.js";
import { VeoClient } from "./veo-client.js";
import { VERTEX_DEFAULTS } from "../vertex/constants.js";

const OUTPUT_DIR = resolve(
  process.env.VIDEO_RENDER_OUTPUT_DIR ?? "./tmp/video-renders"
);
const PUBLIC_BASE_URL = (
  process.env.VIDEO_RENDER_PUBLIC_BASE_URL ??
  "http://localhost:4000/video-assets"
).replace(/\/$/, "");
const FAST_PRICE = Number(process.env.VEO_FAST_PRICE_PER_SECOND ?? 0.15);
const STANDARD_PRICE = Number(process.env.VEO_STANDARD_PRICE_PER_SECOND ?? 0.4);
const USE_FAST_FOR_DRAFTS = process.env.VIDEO_USE_FAST_FOR_DRAFTS !== "false";
const DOWNLOAD_TIMEOUT_MS = Number(
  process.env.VEO_DOWNLOAD_TIMEOUT_MS ?? 45000
);
const DOWNLOAD_RETRIES = Number(process.env.VEO_DOWNLOAD_RETRIES ?? 3);
const FETCH_INTERVAL_SEQUENCE_MS = [30000, 30000, 30000];
const RATE_LIMIT_POLL_DELAY_MS = Number(
  process.env.VEO_RATE_LIMIT_POLL_DELAY_MS ?? 90000
);
const QA_RATE_LIMIT_NOTE = "vertex-429: backoff recommended";

const DEFAULT_VEO_STATE = Object.freeze({
  operationName: null,
  status: "none",
  attempts: 0,
  lastFetchAt: null,
  hash: null,
});

function normalizeVeoState(state = {}) {
  if (!state) return { ...DEFAULT_VEO_STATE };
  return {
    operationName: state.operationName ?? null,
    status: state.status ?? "none",
    attempts: Number.isFinite(Number(state.attempts))
      ? Number(state.attempts)
      : 0,
    lastFetchAt: state.lastFetchAt ?? null,
    hash: state.hash ?? null,
  };
}

function hashVeoRequest(input) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function fetchDelayForAttempt(attempts = 0) {
  const index = Math.min(attempts, FETCH_INTERVAL_SEQUENCE_MS.length - 1);
  return FETCH_INTERVAL_SEQUENCE_MS[index];
}

function canFetchNow({ attempts, lastFetchAt }) {
  if (!lastFetchAt) return true;
  const lastMs = Date.parse(lastFetchAt);
  if (Number.isNaN(lastMs)) return true;
  const elapsed = Date.now() - lastMs;
  return elapsed >= fetchDelayForAttempt(attempts);
}

export function createVeoRenderer({ logger }) {
  const client = new VeoClient({ logger });

  async function render({ manifest, tier, item }) {
    const requestedAt = new Date().toISOString();
    const qa = { notes: [], flags: [] };
    const veoState = normalizeVeoState(item?.veo);

    if (!client.isConfigured()) {
      logger.warn(
        "Vertex/Veo credentials missing – falling back to storyboard render"
      );
      const renderTask = buildDryRunTask({
        manifest,
        requestedAt,
        renderer: "veo-missing-creds",
        status: "completed",
        reason: "missing_credentials",
        message: "Vertex ADC credentials are required for Veo rendering",
      });
      return { renderTask, veo: veoState, httpStatus: 200 };
    }

    const plannedExtendsRaw = Number(manifest.generator?.plannedExtends ?? 0);
    const plannedExtends = Number.isFinite(plannedExtendsRaw)
      ? Math.max(plannedExtendsRaw, 0)
      : 0;
    const targetSecondsRaw = Number(
      manifest.generator?.targetDurationSeconds ?? NaN
    );
    const targetSeconds = Number.isFinite(targetSecondsRaw)
      ? targetSecondsRaw
      : null;
    const tierNormalized = (
      tier ?? (USE_FAST_FOR_DRAFTS ? "fast" : "standard")
    ).toLowerCase();

    const requestContext = {
      prompt: buildDirectorPrompt({ manifest }),
      aspectRatio: manifest.spec?.aspectRatio ?? VERTEX_DEFAULTS.ASPECT_RATIO,
      resolution: normalizeVertexResolution(manifest.spec?.resolution),
      durationSeconds:
        Number.isFinite(targetSeconds) && targetSeconds > 0
          ? targetSeconds
          : VERTEX_DEFAULTS.DURATION_SECONDS,
      sampleCount: VERTEX_DEFAULTS.SAMPLE_COUNT,
    };

    logger.info(
      { directorPrompt: requestContext.prompt },
      "Veo director prompt"
    );
    const requestHash = hashVeoRequest({
      prompt: requestContext.prompt,
      aspectRatio: requestContext.aspectRatio,
      resolution: requestContext.resolution,
      durationSeconds: requestContext.durationSeconds,
      sampleCount: requestContext.sampleCount,
    });

    const cacheHit = reuseCachedAsset({ item, veoState, requestHash });
    if (cacheHit) {
      return cacheHit;
    }

    try {
      if (veoState.operationName) {
        return await resumeOperation({
          client,
          manifest,
          requestContext,
          veoState,
          qa,
          requestHash,
          plannedExtends,
          tierNormalized,
          logger,
        });
      }
      return await startPredict({
        client,
        manifest,
        requestContext,
        veoState,
        qa,
        requestHash,
        plannedExtends,
        tierNormalized,
        logger,
      });
    } catch (error) {
      return handleRendererError({
        error,
        manifest,
        qa,
        veoState,
        requestedAt,
        logger,
      });
    }
  }

  return {
    render,
  };
}

function resolveDurationSeconds({ clip, targetSeconds, manifest }) {
  const clipSeconds = Number(clip?.durationSeconds);
  if (Number.isFinite(clipSeconds) && clipSeconds > 0) {
    return clipSeconds;
  }
  if (Number.isFinite(targetSeconds) && targetSeconds > 0) {
    return targetSeconds;
  }
  return calculateStoryboardDuration(manifest?.storyboard ?? []) || 0;
}

function buildDirectorPrompt({ manifest }) {
  const beats = manifest.storyboard
    ?.map(
      (shot) =>
        `- ${shot.phase}: ${shot.visual}. On-screen text: ${shot.onScreenText}. VO: ${shot.voiceOver}`
    )
    .join("\n");
  return `Create a single cohesive recruiting clip for ${manifest.job?.title ?? "the role"} in ${manifest.job?.geo ?? "the target city"}.
Tone: energetic, inclusive, people-first.
Channel: ${manifest.channelName}. Aspect ${manifest.spec?.aspectRatio ?? "9:16"}. Duration target ${manifest.generator?.targetDurationSeconds ?? "~30"} seconds.
Beats:
${beats}
Include pay ${manifest.job?.payRange ?? "as provided"} and CTA ${manifest.caption?.text ?? "Apply now"}.`;
}

function reuseCachedAsset({ item, veoState, requestHash }) {
  if (!item?.renderTask) return null;
  const hasCompletedVideo =
    item.renderTask?.status === "completed" &&
    Boolean(item.renderTask?.result?.videoUrl);
  if (!hasCompletedVideo) return null;
  if (veoState.status !== "ready") return null;
  if (!veoState.hash || veoState.hash !== requestHash) return null;
  return {
    renderTask: item.renderTask,
    veo: veoState,
    httpStatus: 200,
  };
}

async function startPredict({
  client,
  manifest,
  requestContext,
  veoState,
  qa,
  requestHash,
  plannedExtends,
  tierNormalized,
  logger,
}) {
  const result = await client.generateVideo({
    prompt: requestContext.prompt,
    aspectRatio: requestContext.aspectRatio,
    resolution: requestContext.resolution,
    durationSeconds: requestContext.durationSeconds,
    sampleCount: requestContext.sampleCount,
  });

  if (result?.clip) {
    return finalizeClip({
      clip: result.clip,
      manifest,
      qa,
      requestContext,
      requestHash,
      plannedExtends,
      tierNormalized,
      logger,
    });
  }

  if (result?.operationName) {
    const nextVeo = {
      operationName: result.operationName,
      status: "predicting",
      attempts: 0,
      lastFetchAt: null,
      hash: requestHash,
    };
    return buildPendingResponse({
      manifest,
      veo: nextVeo,
      qa,
      httpStatus: 202,
    });
  }

  throw new Error("Vertex prediction returned neither clip nor operation");
}

async function resumeOperation({
  client,
  manifest,
  requestContext,
  veoState,
  qa,
  requestHash,
  plannedExtends,
  tierNormalized,
  logger,
}) {
  if (!veoState.operationName) {
    logger.warn(
      { hash: veoState.hash },
      "Veo state missing operationName; restarting prediction"
    );
    return startPredict({
      client,
      manifest,
      requestContext,
      veoState: normalizeVeoState(),
      qa,
      requestHash,
      plannedExtends,
      tierNormalized,
      logger,
    });
  }

  if (!canFetchNow(veoState)) {
    const nextVeo = { ...veoState, status: "fetching" };
    return buildPendingResponse({
      manifest,
      veo: nextVeo,
      qa,
      httpStatus: 202,
    });
  }

  const fetchResult = await client.fetchPredictOperation(
    veoState.operationName
  );
  if (!fetchResult.done) {
    const nextVeo = {
      ...veoState,
      status: fetchResult.status ?? "fetching",
      attempts: veoState.attempts + 1,
      lastFetchAt: new Date().toISOString(),
    };
    return buildPendingResponse({
      manifest,
      veo: nextVeo,
      qa,
      httpStatus: 202,
    });
  }

  const finalVeo = {
    operationName: null,
    status: "ready",
    attempts: 0,
    lastFetchAt: new Date().toISOString(),
    hash: requestHash,
  };

  return finalizeClip({
    clip: fetchResult.clip,
    manifest,
    qa,
    requestContext,
    requestHash,
    plannedExtends,
    tierNormalized,
    logger,
    overrideVeo: finalVeo,
  });
}

async function finalizeClip({
  clip,
  manifest,
  qa,
  requestContext,
  requestHash,
  plannedExtends,
  tierNormalized,
  logger,
  overrideVeo,
}) {
  const secondsGenerated = resolveDurationSeconds({
    clip,
    targetSeconds: requestContext.durationSeconds,
    manifest,
  });

  if (
    Number.isFinite(requestContext.durationSeconds) &&
    requestContext.durationSeconds > VERTEX_DEFAULTS.DURATION_SECONDS
  ) {
    qa.notes.push(
      `vertex-preview: generated ${VERTEX_DEFAULTS.DURATION_SECONDS}s; planned ${requestContext.durationSeconds}s`
    );
  }

  if (plannedExtends > 0 && !qa.flags.includes("extend-unavailable")) {
    qa.flags.push("extend-unavailable");
  }

  const assets = await materializeClip({
    clip,
    manifest,
    durationSeconds: secondsGenerated,
    logger,
  });
  const costEstimate =
    secondsGenerated *
    (tierNormalized === "fast" ? FAST_PRICE : STANDARD_PRICE);

  const payload = {
    id: uuid(),
    manifestVersion: manifest.version,
    mode: "file",
    status: "completed",
    renderer: "veo",
    requestedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    metrics: {
      secondsGenerated,
      extendsRequested: plannedExtends,
      extendsCompleted: 0,
      model: VERTEX_DEFAULTS.VEO_MODEL_ID,
      tier: tierNormalized,
      costEstimateUsd: Number(costEstimate.toFixed(2)),
      synthIdWatermark: true,
    },
    result: {
      videoUrl: assets.videoUrl,
      captionFileUrl: assets.captionFileUrl,
      posterUrl: assets.posterUrl,
      synthesis: {
        clipId: clip.clipId,
        extends: [],
      },
      qa,
    },
  };

  const renderTask = VideoRenderTaskSchema.parse(payload);
  if (renderTask.result) {
    renderTask.result.qa = qa;
  }
  const veo = overrideVeo ?? {
    operationName: null,
    status: "ready",
    attempts: 0,
    lastFetchAt: new Date().toISOString(),
    hash: requestHash,
  };
  return { renderTask, veo, httpStatus: 200 };
}

function buildPendingResponse({ manifest, veo, qa, httpStatus = 202 }) {
  const renderTask = buildPendingRenderTask({ manifest });
  renderTask.result = renderTask.result ?? {};
  renderTask.result.qa = qa;
  return { renderTask, veo, httpStatus };
}

function handleRendererError({
  error,
  manifest,
  qa,
  veoState,
  requestedAt,
  logger,
}) {
  logger?.error({ err: error }, "Veo renderer failed");
  if (
    error?.code === "veo_rate_limited" &&
    !qa.notes.includes(QA_RATE_LIMIT_NOTE)
  ) {
    qa.notes.push(QA_RATE_LIMIT_NOTE);
  }

  if (error?.code === "veo_rate_limited") {
    const renderTask = buildPendingRenderTask({ manifest });
    renderTask.result = renderTask.result ?? {};
    renderTask.result.qa = qa;
    renderTask.error = {
      reason: error.code,
      message: error?.message ?? "Veo renderer rate limited; retrying shortly",
    };
    const nextVeo = {
      ...veoState,
      status: "rate_limited",
      lastFetchAt: new Date().toISOString(),
    };
    return {
      renderTask,
      veo: nextVeo,
      httpStatus: 202,
      pollDelayMs: RATE_LIMIT_POLL_DELAY_MS,
    };
  }

  const renderTask = buildDryRunTask({
    manifest,
    requestedAt,
    renderer: "veo",
    status: "failed",
    reason: error?.code ?? "veo_renderer_failed",
    message: error?.message ?? "Veo renderer failed",
  });
  if (renderTask.result) {
    renderTask.result.qa = qa;
  }
  const nextVeo = {
    ...veoState,
    status: "failed",
  };
  return { renderTask, veo: nextVeo, httpStatus: 500 };
}

function buildPendingRenderTask({ manifest }) {
  return VideoRenderTaskSchema.parse({
    id: uuid(),
    manifestVersion: manifest.version,
    mode: "dry_run",
    status: "rendering",
    renderer: "veo",
    requestedAt: new Date().toISOString(),
    result: null,
  });
}

async function materializeClip({ clip, manifest, durationSeconds, logger }) {
  const inlineBuffer = extractInlineVideoBuffer(clip);
  if (!clip?.videoUrl && !inlineBuffer) {
    const error = new Error("Vertex preview response missing video payload");
    error.code = "veo_missing_video_payload";
    throw error;
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const timestamp = Date.now();
  const fileBase = `${manifest.manifestId}-${timestamp}`;
  const videoPath = join(OUTPUT_DIR, `${fileBase}.mp4`);
  const captionPath = join(OUTPUT_DIR, `${fileBase}.srt`);
  const posterPath = clip.posterUrl
    ? join(OUTPUT_DIR, `${fileBase}.jpg`)
    : null;

  if (clip.videoUrl) {
    await downloadAsset(clip.videoUrl, videoPath, { logger });
  } else if (inlineBuffer) {
    await fs.writeFile(videoPath, inlineBuffer);
  }

  let posterSaved = false;
  if (clip.posterUrl && posterPath) {
    try {
      await downloadAsset(clip.posterUrl, posterPath, { logger });
      posterSaved = true;
    } catch (error) {
      logger?.warn(
        { err: error },
        "Poster download failed; continuing without poster"
      );
    }
  }

  const captionContents = buildCaptionFile(manifest.caption, durationSeconds);
  await fs.writeFile(captionPath, captionContents, "utf8");

  return {
    videoUrl: `${PUBLIC_BASE_URL}/${fileBase}.mp4`,
    captionFileUrl: `${PUBLIC_BASE_URL}/${fileBase}.srt`,
    posterUrl: posterSaved ? `${PUBLIC_BASE_URL}/${fileBase}.jpg` : null,
  };
}

function buildCaptionFile(caption, durationSeconds) {
  const text = caption?.text?.trim() ?? "Apply now to join the team.";
  const hashtags = Array.isArray(caption?.hashtags) ? caption.hashtags : [];
  const hashtagsLine = hashtags
    .map((tag) => `#${tag.replace(/^#/, "")}`)
    .join(" ");
  const combined = hashtagsLine ? `${text}\n${hashtagsLine}` : text;
  const safeDuration = Math.max(2, Math.round(Number(durationSeconds) || 30));
  const endTimestamp = formatSrtTimestamp(safeDuration);
  return `1
00:00:00,000 --> ${endTimestamp}
${combined}
`;
}

function formatSrtTimestamp(seconds) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hrs = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
}

async function downloadAsset(
  url,
  destination,
  { logger, timeoutMs = DOWNLOAD_TIMEOUT_MS, retries = DOWNLOAD_RETRIES } = {}
) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(destination, buffer);
      return true;
    } catch (error) {
      if (attempt === retries - 1) {
        throw error;
      }
      logger?.warn(
        {
          err: error,
          attempt: attempt + 1,
          retries,
          url,
        },
        "Retrying Veo asset download"
      );
      await delay(Math.min(2000 * (attempt + 1), 8000));
    }
  }
  return false;
}

function extractInlineVideoBuffer(clip) {
  if (clip?.inlineVideos?.length > 0) {
    return clip.inlineVideos[0].buffer;
  }
  const prediction = clip?.metadata?.predictions?.[0];
  const raw =
    prediction?.bytesBase64Encoded ?? prediction?.videoBytesBase64 ?? null;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }
  const parts = raw.split(",");
  const base64 = parts.length > 1 ? parts[1] : parts[0];
  return Buffer.from(base64.trim(), "base64");
}

function normalizeVertexResolution(specResolution) {
  if (typeof specResolution !== "string") {
    return VERTEX_DEFAULTS.RESOLUTION;
  }
  const normalized = specResolution.trim().toLowerCase();
  if (
    normalized === "1080x1920" ||
    normalized === "1920x1080" ||
    normalized === "1080p"
  ) {
    return "1080p";
  }
  if (
    normalized === "720x1280" ||
    normalized === "1280x720" ||
    normalized === "720p"
  ) {
    return "720p";
  }
  return VERTEX_DEFAULTS.RESOLUTION;
}

function buildDryRunTask({
  manifest,
  requestedAt,
  renderer,
  status,
  reason,
  message,
}) {
  const payload = {
    id: uuid(),
    manifestVersion: manifest.version,
    mode: "dry_run",
    status,
    renderer,
    requestedAt,
    completedAt: new Date().toISOString(),
    result: {
      dryRunBundle: {
        storyboard: manifest.storyboard,
        caption: manifest.caption,
        thumbnail:
          manifest.thumbnail ??
          buildFallbackThumbnail({ jobSnapshot: manifest.job }),
        checklist: manifest.compliance?.qaChecklist ?? [],
      },
    },
  };

  if (reason) {
    payload.error = {
      reason,
      message,
    };
  }

  return VideoRenderTaskSchema.parse(payload);
}
