import { v4 as uuid } from "uuid";
import { mkdtemp } from "node:fs/promises";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { VideoRenderTaskSchema } from "@wizard/core";
import { loadEnv } from "@wizard/utils";
import { createVeoRenderer } from "./veo-renderer.js";

loadEnv();

const OUTPUT_DIR = resolve(process.env.VIDEO_RENDER_OUTPUT_DIR ?? "./tmp/video-renders");
const PUBLIC_BASE_URL = (process.env.VIDEO_RENDER_PUBLIC_BASE_URL ?? "http://localhost:4000/video-assets").replace(/\/$/, "");
const FFMPEG_PATH = process.env.FFMPEG_PATH ?? "ffmpeg";
const FONT_PATH = process.env.VIDEO_RENDER_FONT_PATH ?? null;
const VIDEO_WIDTH = Number(process.env.VIDEO_RENDER_WIDTH ?? 720);
const VIDEO_HEIGHT = Number(process.env.VIDEO_RENDER_HEIGHT ?? 1280);
const COLOR_BY_PHASE = {
  HOOK: "0x111827",
  PROOF: "0x0f172a",
  OFFER: "0x1e3a8a",
  ACTION: "0x065f46",
  BRIDGE: "0x7c3aed"
};

const SELECTED_RENDERER = (process.env.VIDEO_RENDERER ?? "ffmpeg").toLowerCase();

export function createRenderer(options) {
  if (SELECTED_RENDERER === "veo") {
    return createVeoRenderer(options);
  }
  return createFfmpegRenderer(options);
}

export function createFfmpegRenderer({ logger }) {
  const renderingEnabled = process.env.VIDEO_RENDERING_ENABLED === "true";

  async function render({ manifest }) {
    const taskId = uuid();
    const requestedAt = new Date().toISOString();

    if (!renderingEnabled) {
      return VideoRenderTaskSchema.parse(buildDryRunPayload({ manifest, taskId, requestedAt }));
    }

    try {
      const paths = await renderVideoWithFfmpeg({ manifest, logger });
      const payload = {
        id: taskId,
        manifestVersion: manifest.version,
        mode: "file",
        status: "completed",
        renderer: "ffmpeg",
        requestedAt,
        metrics: {
          secondsGenerated: paths?.secondsGenerated ?? manifest?.generator?.targetDurationSeconds ?? null,
          extendsRequested: manifest?.generator?.plannedExtends ?? 0,
          extendsCompleted: manifest?.generator?.plannedExtends ?? 0,
          costEstimateUsd: null,
          tier: null,
          model: "ffmpeg",
          synthIdWatermark: false
        },
        completedAt: new Date().toISOString(),
        result: paths
      };
      return VideoRenderTaskSchema.parse(payload);
    } catch (error) {
      logger.error({ err: error }, "Video renderer failed");
      return VideoRenderTaskSchema.parse({
        id: taskId,
        manifestVersion: manifest.version,
        mode: "file",
        status: "failed",
        renderer: "ffmpeg",
        requestedAt,
        completedAt: new Date().toISOString(),
        error: {
          reason: "render_failed",
          message: error?.message ?? "Renderer failed"
        }
      });
    }
  }

  return {
    render
  };
}

function buildDryRunPayload({ manifest, taskId, requestedAt }) {
  return {
    id: taskId,
    manifestVersion: manifest.version,
    mode: "dry_run",
    status: "completed",
    renderer: SELECTED_RENDERER === "veo" ? "veo-storyboard" : "storyboard-dry-run",
    requestedAt,
    completedAt: requestedAt,
    result: {
      dryRunBundle: {
        storyboard: manifest.storyboard,
        caption: manifest.caption,
        thumbnail: manifest.thumbnail,
        checklist: manifest.compliance?.qaChecklist ?? []
      }
    }
  };
}

async function renderVideoWithFfmpeg({ manifest, logger }) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const tmpDir = await mkdtemp(join(tmpdir(), "wizard-video-"));
  try {
    const segments = await generateSegments({ manifest, tmpDir, logger });
    const videoPath = await concatSegments({ segments, tmpDir, manifest, logger });
    const posterPath = await createPosterFrame({ videoPath, tmpDir, manifest, logger });
    const captionPath = await createCaptionFile({ manifest, tmpDir });

    const videoFile = join(OUTPUT_DIR, `${manifest.manifestId}.mp4`);
    const captionFile = join(OUTPUT_DIR, `${manifest.manifestId}.srt`);
    const posterFile = join(OUTPUT_DIR, `${manifest.manifestId}.jpg`);

    await fs.copyFile(videoPath, videoFile);
    await fs.copyFile(posterPath, posterFile);
    await fs.copyFile(captionPath, captionFile);

    return {
      videoUrl: `${PUBLIC_BASE_URL}/${manifest.manifestId}.mp4`,
      captionFileUrl: `${PUBLIC_BASE_URL}/${manifest.manifestId}.srt`,
      posterUrl: `${PUBLIC_BASE_URL}/${manifest.manifestId}.jpg`,
      secondsGenerated: segments.reduce((sum, segment) => sum + Number(segment.duration ?? 0), 0)
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function generateSegments({ manifest, tmpDir, logger }) {
  const segments = [];
  const rawShots = Array.isArray(manifest.storyboard) ? manifest.storyboard : [];
  const shots = rawShots.length > 0
    ? rawShots
    : [
        {
          phase: "HOOK",
          durationSeconds: 4,
          onScreenText: manifest.job?.title ?? "Now hiring",
          voiceOver: manifest.caption?.text ?? "Tap to apply"
        }
      ];
  for (let index = 0; index < shots.length; index += 1) {
    const shot = shots[index];
    const duration = clamp(Number(shot.durationSeconds ?? 4), 2, 8);
    const background = COLOR_BY_PHASE[shot.phase] ?? "0x111827";
    const headerText = (shot.onScreenText || manifest.job?.title || shot.phase || "")
      .toString()
      .toUpperCase();
    const bodyText = [shot.voiceOver, shot.visual]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .join(" ");
    const filter = buildDrawTextFilter({ headerText, bodyText });
    const segmentPath = join(tmpDir, `segment-${index}.mp4`);
    const args = [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${background}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=${duration.toFixed(2)}`,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-shortest",
      "-vf",
      filter,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-t",
      duration.toFixed(2),
      segmentPath
    ];
    await runFfmpeg(args, logger);
    segments.push({ path: segmentPath, duration });
  }
  return segments;
}

async function concatSegments({ segments, tmpDir, manifest, logger }) {
  const concatFile = join(tmpDir, "concat.txt");
  const list = segments
    .map((segment) => `file '${segment.path.replace(/'/g, "'\\''")}'`)
    .join("\n");
  await fs.writeFile(concatFile, list, "utf8");
  const stitchedPath = join(tmpDir, `${manifest.manifestId}-stitched.mp4`);
  await runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatFile,
    "-c",
    "copy",
    stitchedPath
  ], logger);
  return stitchedPath;
}

async function createPosterFrame({ videoPath, tmpDir, manifest, logger }) {
  const posterPath = join(tmpDir, `${manifest.manifestId}-poster.jpg`);
  await runFfmpeg(["-y", "-i", videoPath, "-vframes", "1", posterPath], logger);
  return posterPath;
}

async function createCaptionFile({ manifest, tmpDir }) {
  const captions = [];
  let cursor = 0;
  const shots = Array.isArray(manifest.storyboard) ? manifest.storyboard : [];
  shots.forEach((shot, index) => {
    const duration = clamp(Number(shot.durationSeconds ?? 4), 2, 8);
    const startTime = formatTimestamp(cursor);
    const endTime = formatTimestamp(cursor + duration);
    cursor += duration;
    const lines = [shot.onScreenText, shot.voiceOver].filter((value) => value && value.trim().length > 0);
    captions.push(`${index + 1}\n${startTime} --> ${endTime}\n${lines.join("\n")}\n`);
  });
  const captionPath = join(tmpDir, `${manifest.manifestId}.srt`);
  await fs.writeFile(captionPath, captions.join("\n"), "utf8");
  return captionPath;
}

function buildDrawTextFilter({ headerText, bodyText }) {
  const safeHeader = normalizeOverlayText(headerText ?? "");
  const safeBody = normalizeOverlayText(bodyText ?? "Tap to apply");

  const headerOptions = [
    FONT_PATH ? `fontfile=${escapeFilterPath(FONT_PATH)}` : null,
    "fontcolor=white",
    "fontsize=64",
    "line_spacing=12",
    "box=1",
    "boxcolor=0x000000AA",
    "boxborderw=32",
    "text='" + escapeDrawText(safeHeader) + "'",
    "x=(w-text_w)/2",
    "y=h*0.18"
  ]
    .filter(Boolean)
    .join(":");

  const bodyOptions = [
    FONT_PATH ? `fontfile=${escapeFilterPath(FONT_PATH)}` : null,
    "fontcolor=white",
    "fontsize=48",
    "line_spacing=16",
    "box=1",
    "boxcolor=0x00000077",
    "boxborderw=28",
    "text='" + escapeDrawText(safeBody) + "'",
    "x=(w-text_w)/2",
    "y=h*0.55"
  ]
    .filter(Boolean)
    .join(":");

  const headerFilter = `drawtext=${headerOptions}`;
  const bodyFilter = `drawtext=${bodyOptions}`;

  return `${headerFilter},${bodyFilter}`;
}

function escapeDrawText(value) {
  return (value ?? "")
    .toString()
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n");
}

function normalizeOverlayText(value) {
  return (value ?? "")
    .toString()
    .replace(/[\r\n]+/g, " ")
    .replace(/[^\p{L}\p{N}\s£€$%&@\-.,!]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function escapeFilterPath(value) {
  return (value ?? "").replace(/ /g, "\\ ").replace(/:/g, "\\:");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function runFfmpeg(args, logger) {
  await new Promise((resolve, reject) => {
    const process = spawn(FFMPEG_PATH, args, { stdio: "inherit" });
    process.on("error", (error) => reject(error));
    process.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });
}

function formatTimestamp(totalSeconds) {
  const milliseconds = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 1000);
  const seconds = Math.floor(totalSeconds) % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(milliseconds, 3)}`;
}
