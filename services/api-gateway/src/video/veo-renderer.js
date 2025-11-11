import { v4 as uuid } from "uuid";
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { VideoRenderTaskSchema } from "@wizard/core";
import { buildFallbackThumbnail } from "./fallbacks.js";
import { calculateStoryboardDuration } from "./utils.js";
import { VeoClient } from "./veo-client.js";

const OUTPUT_DIR = resolve(
  process.env.VIDEO_RENDER_OUTPUT_DIR ?? "./tmp/video-renders"
);
const PUBLIC_BASE_URL = (
  process.env.VIDEO_RENDER_PUBLIC_BASE_URL ??
  "http://localhost:4000/video-assets"
).replace(/\/$/, "");
const DEFAULT_STANDARD_MODEL = process.env.VIDEO_MODEL ?? "veo-3";
const DEFAULT_FAST_MODEL = process.env.VIDEO_FAST_MODEL ?? "veo-3-fast";
const EXTEND_MODEL = process.env.VIDEO_EXTEND_MODEL ?? "veo-3.1";
const FAST_PRICE = Number(process.env.VEO_FAST_PRICE_PER_SECOND ?? 0.15);
const STANDARD_PRICE = Number(process.env.VEO_STANDARD_PRICE_PER_SECOND ?? 0.4);
const USE_FAST_FOR_DRAFTS = process.env.VIDEO_USE_FAST_FOR_DRAFTS !== "false";
const DOWNLOAD_TIMEOUT_MS = Number(
  process.env.VEO_DOWNLOAD_TIMEOUT_MS ?? 45000
);
const DOWNLOAD_RETRIES = Number(process.env.VEO_DOWNLOAD_RETRIES ?? 3);

export function createVeoRenderer({ logger }) {
  const client = new VeoClient({ logger });

  async function render({ manifest, tier }) {
    const requestedAt = new Date().toISOString();

    if (!client.isConfigured()) {
      logger.warn(
        "Gemini/Veo credentials missing – falling back to storyboard render"
      );
      return buildDryRunTask({
        manifest,
        requestedAt,
        renderer: "veo-missing-creds",
        status: "completed",
        reason: "missing_credentials",
        message: "GEMINI_API_KEY is required for Veo rendering",
      });
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
    const model =
      tierNormalized === "fast" ? DEFAULT_FAST_MODEL : DEFAULT_STANDARD_MODEL;

    const directorPrompt = buildDirectorPrompt({ manifest });
    const aspectRatio = manifest.spec?.aspectRatio ?? "9:16";
    const resolution = manifest.spec?.resolution ?? "1080x1920";
    const displayText = manifest.spec?.displayTextStrategy ?? "supers";
    logger.info({ directorPrompt }, "Veo director prompt");
    try {
      let clip = await client.generateVideo({
        model,
        prompt: directorPrompt,
        aspectRatio,
        resolution,
        textOverlays: displayText,
      });

      const extendNotes = [];
      for (let hop = 0; hop < plannedExtends; hop += 1) {
        if (!clip.clipId) {
          const error = new Error("Veo clipId missing; unable to extend");
          error.code = "veo_missing_clip_id";
          throw error;
        }
        clip = await client.extendVideo({
          model: EXTEND_MODEL,
          videoId: clip.clipId,
          prompt: buildExtendPrompt({ manifest, hop }),
        });
        extendNotes.push({ hop: hop + 1, clipId: clip.clipId });
      }

      const secondsGenerated = resolveDurationSeconds({
        clip,
        targetSeconds,
        manifest,
      });
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
        requestedAt,
        completedAt: new Date().toISOString(),
        metrics: {
          secondsGenerated,
          extendsRequested: plannedExtends,
          extendsCompleted: extendNotes.length,
          model,
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
            extends: extendNotes,
          },
        },
      };

      return VideoRenderTaskSchema.parse(payload);
    } catch (error) {
      logger.error({ err: error }, "Veo renderer failed");
      return buildDryRunTask({
        manifest,
        requestedAt,
        renderer: "veo",
        status: "failed",
        reason: error?.code ?? "veo_renderer_failed",
        message: error?.message ?? "Veo renderer failed",
      });
    }
  }

  return { render };
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

function buildExtendPrompt({ manifest, hop }) {
  const shot =
    manifest.storyboard?.[hop + 1] ??
    manifest.storyboard?.[manifest.storyboard.length - 1];
  if (!shot) return "Extend scene with smooth motion.";
  return `Extend the current shot into ${shot.phase}. Update visuals to ${shot.visual}. Keep consistent subjects and maintain camera continuity.`;
}

async function materializeClip({ clip, manifest, durationSeconds, logger }) {
  if (!clip?.videoUrl) {
    const error = new Error("Veo response missing downloadable videoUrl");
    error.code = "veo_missing_video_url";
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

  await downloadAsset(clip.videoUrl, videoPath, { logger });

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
