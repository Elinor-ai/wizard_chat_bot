import { v4 as uuid } from "uuid";
import { loadEnv } from "@wizard/utils";
import { VideoRenderTaskSchema } from "@wizard/core";
import { UnifiedVideoRenderer } from "./renderers/unified-renderer.js";
import { VideoRendererError } from "./renderers/contracts.js";
import { VERTEX_DEFAULTS } from "../vertex/constants.js";

loadEnv();

function calculateDuration(manifest) {
  if (Number.isFinite(manifest?.generator?.targetDurationSeconds)) {
    return manifest.generator.targetDurationSeconds;
  }
  const storyboard = manifest?.storyboard ?? [];
  const total = storyboard.reduce(
    (sum, shot) => sum + Number(shot?.durationSeconds ?? 0),
    0
  );
  return total > 0 ? total : undefined;
}

function buildPrompt(manifest) {
  const job = manifest?.job ?? {};
  const shots = (manifest?.storyboard ?? [])
    .map(
      (shot) =>
        `${shot.phase}: ${shot.visual} | Text: ${shot.onScreenText} | VO: ${shot.voiceOver}`
    )
    .join("\n");
  const caption = manifest?.caption?.text ?? "";
  return `Create a recruiting short-form video for ${job.title ?? "this role"} at ${
    job.company ?? "our company"
  } targeting ${job.geo ?? "global"} talent.
Channel: ${manifest?.channelName ?? manifest?.channelId}.
Storyboard:
${shots || "Use energetic shots that highlight the role, proof, offer, and action."}
Caption guidance: ${caption}`;
}

export function createRenderer(options = {}) {
  const unified = new UnifiedVideoRenderer({
    veoApiKey: options.veoApiKey,
    soraApiToken: options.soraApiToken,
    logger: options.logger,
  });

  const assetBaseSetting = "http://localhost:4000/video-assets";
  const assetBaseUrl = new URL(assetBaseSetting, "http://localhost");
  const basePath =
    assetBaseUrl.pathname === "/"
      ? ""
      : assetBaseUrl.pathname.replace(/\/$/, "");

  function toAbsoluteUrl(rawUrl) {
    if (!rawUrl) {
      return rawUrl;
    }

    let candidatePath = rawUrl;
    if (/^https?:\/\//i.test(rawUrl)) {
      try {
        candidatePath = new URL(rawUrl).pathname || "/";
      } catch (_error) {
        candidatePath = "/";
      }
    }

    if (!candidatePath.startsWith("/")) {
      candidatePath = `/${candidatePath}`;
    }

    if (basePath && candidatePath.startsWith(basePath)) {
      return `${assetBaseUrl.origin}${candidatePath}`;
    }
    if (!basePath && candidatePath.startsWith("/")) {
      return `${assetBaseUrl.origin}${candidatePath}`;
    }

    const segments = candidatePath.split("/").filter(Boolean);
    const fileSegment = segments.pop() ?? "";
    const normalizedPath = `${basePath}/${fileSegment}`.replace(/\/{2,}/g, "/");
    return `${assetBaseUrl.origin}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
  }

  return {
    async render({ manifest, provider, jobId, itemId, ownerUserId }) {
      const requestedAt = new Date().toISOString();
      const videoModel = process.env.VIDEO_MODEL ?? VERTEX_DEFAULTS.VEO_MODEL_ID;
      const requestedDuration = calculateDuration(manifest);
      const cappedDuration =
        provider === "veo" && Number.isFinite(requestedDuration)
          ? Math.min(requestedDuration, 8)
          : requestedDuration;
      const request = {
        prompt: buildPrompt(manifest),
        duration: cappedDuration,
        aspectRatio: manifest?.spec?.aspectRatio,
      };
      const renderContext = {
        jobId: jobId ?? manifest?.job?.id ?? manifest?.jobId ?? null,
        itemId: itemId ?? null,
        ownerUserId: ownerUserId ?? null,
      };
      try {
        let renderResult = await unified.renderVideo(
          provider,
          request,
          renderContext
        );
        let videoUrl = renderResult?.videoUrl ?? renderResult;
        if (!/^https?:\/\//i.test(String(videoUrl ?? ""))) {
          videoUrl = toAbsoluteUrl(videoUrl);
        }

        const renderMetrics = {
          secondsGenerated:
            Number(renderResult?.seconds) ||
            Number(request.duration ?? 0),
          model: videoModel,
          tier: "standard"
        };

        return VideoRenderTaskSchema.parse({
          id: uuid(),
          manifestVersion: manifest.version,
          mode: "file",
          status: "completed",
          renderer: provider,
          requestedAt,
          completedAt: new Date().toISOString(),
          metrics: renderMetrics,
          result: {
            videoUrl,
          },
        });
      } catch (error) {
        if (error instanceof VideoRendererError) {
          throw error;
        }
        throw new VideoRendererError(
          error?.message ?? "Video generation pipeline failed",
          {
            code: "PROVIDER_ERROR",
            context: { provider, originalError: error.message },
          }
        );
      }
    },
  };
}
