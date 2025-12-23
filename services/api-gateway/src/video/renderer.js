import { v4 as uuid } from "uuid";
import { loadEnv } from "@wizard/utils";
import { VideoRenderTaskSchema } from "@wizard/core";
import { UnifiedVideoRenderer } from "./renderers/unified-renderer.js";
import { VideoRendererError } from "./renderers/contracts.js";
import { VIDEO_RENDER_CONFIG } from "../config/llm-config.js";

loadEnv();

/**
 * Calculates the target duration from a manifest.
 * Priority:
 * 1. generator.renderPlan.finalPlannedSeconds (new planner output)
 * 2. generator.targetDurationSeconds (legacy fallback)
 * 3. Sum of storyboard shot durations (last resort)
 *
 * @param {Object} manifest
 * @returns {number | undefined}
 */
function calculateDuration(manifest) {
  // Prefer the new RenderPlan's finalPlannedSeconds
  const renderPlanDuration = manifest?.generator?.renderPlan?.finalPlannedSeconds;
  if (Number.isFinite(renderPlanDuration)) {
    return renderPlanDuration;
  }

  // Fallback to legacy targetDurationSeconds
  if (Number.isFinite(manifest?.generator?.targetDurationSeconds)) {
    return manifest.generator.targetDurationSeconds;
  }

  // Last resort: sum storyboard shots
  const storyboard = manifest?.storyboard ?? [];
  const total = storyboard.reduce(
    (sum, shot) => sum + Number(shot?.durationSeconds ?? 0),
    0
  );
  return total > 0 ? total : undefined;
}

/**
 * Builds a text prompt from the manifest for video generation.
 *
 * @param {Object} manifest
 * @returns {string}
 */
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

/**
 * Creates a video renderer instance with the unified render pipeline.
 *
 * @param {Object} options
 * @param {string} [options.veoApiKey]
 * @param {string} [options.soraApiToken]
 * @param {Object} [options.logger]
 * @returns {{ render: Function }}
 */
export function createRenderer(options = {}) {
  const unified = new UnifiedVideoRenderer({
    veoApiKey: options.veoApiKey,
    soraApiToken: options.soraApiToken,
    logger: options.logger,
  });

  // Use relative paths for video assets - works via Next.js proxy on any domain
  const basePath = "/backend-api/video-assets";

  function toAbsoluteUrl(rawUrl) {
    if (!rawUrl) {
      return rawUrl;
    }

    let candidatePath = rawUrl;
    if (/^https?:\/\//i.test(rawUrl)) {
      try {
        candidatePath = new URL(rawUrl).pathname || "/";
      } catch {
        candidatePath = "/";
      }
    }

    if (!candidatePath.startsWith("/")) {
      candidatePath = `/${candidatePath}`;
    }

    // If already a proper relative path, return as-is
    if (candidatePath.startsWith(basePath)) {
      return candidatePath;
    }

    // Extract filename and build relative path
    const segments = candidatePath.split("/").filter(Boolean);
    const fileSegment = segments.pop() ?? "";
    const normalizedPath = `${basePath}/${fileSegment}`.replace(/\/{2,}/g, "/");
    return normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  }

  return {
    /**
     * Renders a video from a manifest.
     *
     * @param {Object} params
     * @param {Object} params.manifest - The video manifest
     * @param {string} params.provider - The video provider ("veo" or "sora")
     * @param {string} [params.jobId]
     * @param {string} [params.itemId]
     * @param {string} [params.ownerUserId]
     * @param {import('./renderers/contracts.js').ProviderOptions} [params.providerOptions] - Provider-specific overrides
     * @returns {Promise<Object>}
     */
    async render({ manifest, provider, jobId, itemId, ownerUserId, providerOptions }) {
      const requestedAt = new Date().toISOString();

      // Model comes from centralized config (llm-config.js), not env vars
      const videoModel =
        provider === "sora"
          ? VIDEO_RENDER_CONFIG.providers.sora.model
          : VIDEO_RENDER_CONFIG.providers.veo.model;

      // Get RenderPlan from manifest (contains strategy and segments)
      const renderPlan = manifest?.generator?.renderPlan;

      // For duration: use the first segment's seconds for single-shot/fallback,
      // or legacy calculateDuration if no renderPlan exists
      // Multi-extend uses the full renderPlan and handles segments internally
      const requestedDuration = calculateDuration(manifest);

      // Merge providerOptions from multiple sources:
      // 1. Explicit providerOptions passed to render()
      // 2. providerOptions stored in manifest.generator.providerOptions
      const manifestProviderOptions = manifest?.generator?.providerOptions ?? {};
      const mergedProviderOptions = {
        sora: {
          ...(manifestProviderOptions.sora ?? {}),
          ...(providerOptions?.sora ?? {}),
        },
        veo: {
          ...(manifestProviderOptions.veo ?? {}),
          ...(providerOptions?.veo ?? {}),
        },
      };

      // Build the unified request that will be passed to the provider client
      /** @type {import('./renderers/contracts.js').VideoGenerationRequest} */
      const request = {
        prompt: buildPrompt(manifest),
        duration: requestedDuration,
        aspectRatio: manifest?.spec?.aspectRatio,
        providerOptions: mergedProviderOptions,
        // Segment contexts for multi-extend Veo: enables segment-specific prompting
        segmentContexts: manifest?.generator?.segmentContexts,
      };

      const renderContext = {
        jobId: jobId ?? manifest?.job?.id ?? manifest?.jobId ?? null,
        itemId: itemId ?? null,
        ownerUserId: ownerUserId ?? null,
      };

      try {
        // Pass renderPlan to unified renderer for multi-extend orchestration
        let renderResult = await unified.renderVideo(
          provider,
          request,
          renderContext,
          renderPlan
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
