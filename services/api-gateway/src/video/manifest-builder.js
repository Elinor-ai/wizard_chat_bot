import { v4 as uuid } from "uuid";
import {
  VideoAssetManifestSchema,
  resolveVideoSpec
} from "@wizard/core";
import {
  deriveJobSnapshot,
  normaliseShots,
  buildQaChecklist,
  buildComplianceFlags,
  slugify
} from "./utils.js";
import {
  buildFallbackStoryboard,
  buildFallbackCaption,
  buildFallbackThumbnail
} from "./fallbacks.js";
import { computeDurationPlan } from "./duration-planner.js";
import { getVideoModelCapabilities } from "./video-capabilities.js";
import { planRenderForVideo } from "./render-planner.js";
import { LLM_CORE_TASK } from "../config/task-types.js";
import { VIDEO_BEHAVIOR_CONFIG, VIDEO_RENDER_CONFIG } from "../config/llm-config.js";
import { VIDEO_LENGTH_PRESETS } from "./renderers/contracts.js";
import {
  normalizeStoryboardPhases,
  buildSegmentContextsFromStoryboard
} from "./storyboard-segmentation.js";

// LLM usage is now configured in code (VIDEO_BEHAVIOR_CONFIG), not via .env
const LLM_ENABLED = VIDEO_BEHAVIOR_CONFIG.llmEnabled;

/**
 * Derives length preset from target duration.
 * @param {number} seconds
 * @returns {"short" | "medium" | "long"}
 */
function deriveLengthPreset(seconds) {
  if (seconds <= 15) return "short";
  if (seconds <= 30) return "medium";
  return "long";
}

/**
 * Builds the default VideoConfig with system defaults.
 * Used as fallback when LLM is disabled or fails.
 *
 * @param {Object} params
 * @param {number} params.targetSeconds - Target duration in seconds
 * @param {string} params.channelId - Target channel ID
 * @param {string} [params.tone] - Tone from company branding
 * @returns {import('./renderers/contracts.js').VideoConfig}
 */
function buildDefaultVideoConfig({ targetSeconds, channelId, tone }) {
  return {
    lengthPreset: deriveLengthPreset(targetSeconds),
    targetSeconds,
    primaryChannelFocus: channelId,
    tone: tone ?? "energetic",
    hasVoiceOver: true,
    audioStyle: "voiceover_with_music",
    visualStyle: "native_tiktok",
    notesForStoryboard: null
  };
}

/**
 * Normalizes raw LLM output into a safe VideoConfig object.
 * Validates and clamps values to sensible ranges, falling back to defaults for invalid data.
 *
 * @param {any} raw - Raw LLM output (may be malformed)
 * @param {import('./video-capabilities.js').VideoModelCapabilities} capabilities - Video model capabilities
 * @param {Object} defaults - Default values to use as fallback
 * @returns {import('./renderers/contracts.js').VideoConfig}
 */
function normalizeVideoConfig(raw, capabilities, defaults) {
  // Start from safe defaults
  const result = { ...defaults };

  // If raw is not an object, return defaults
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return result;
  }

  // Validate lengthPreset
  if (raw.lengthPreset && VIDEO_LENGTH_PRESETS.includes(raw.lengthPreset)) {
    result.lengthPreset = raw.lengthPreset;
  }

  // Validate targetSeconds - clamp to [4, maxTotalSeconds]
  if (typeof raw.targetSeconds === "number" && Number.isFinite(raw.targetSeconds)) {
    const clamped = Math.max(4, Math.min(raw.targetSeconds, capabilities.maxTotalSeconds));
    result.targetSeconds = Math.round(clamped);
    // Update lengthPreset to match the actual duration
    result.lengthPreset = deriveLengthPreset(result.targetSeconds);
  }

  // Validate primaryChannelFocus - accept string or null
  if (raw.primaryChannelFocus === null || typeof raw.primaryChannelFocus === "string") {
    result.primaryChannelFocus = raw.primaryChannelFocus || null;
  }

  // Validate tone - accept any string, normalize to lowercase
  if (typeof raw.tone === "string" && raw.tone.trim().length > 0) {
    result.tone = raw.tone.trim().toLowerCase();
  }

  // Validate hasVoiceOver - must be strictly boolean
  if (typeof raw.hasVoiceOver === "boolean") {
    result.hasVoiceOver = raw.hasVoiceOver;
  }

  // Validate audioStyle - accept any non-empty string
  if (typeof raw.audioStyle === "string" && raw.audioStyle.trim().length > 0) {
    result.audioStyle = raw.audioStyle.trim().toLowerCase();
  }

  // Validate visualStyle - accept any non-empty string
  if (typeof raw.visualStyle === "string" && raw.visualStyle.trim().length > 0) {
    result.visualStyle = raw.visualStyle.trim().toLowerCase();
  }

  // Validate notesForStoryboard - accept non-empty string or null
  if (typeof raw.notesForStoryboard === "string" && raw.notesForStoryboard.trim().length > 0) {
    result.notesForStoryboard = raw.notesForStoryboard.trim();
  } else {
    result.notesForStoryboard = null;
  }

  return result;
}

/**
 * Builds a video asset manifest for a job posting.
 *
 * @param {Object} params
 * @param {Object} params.job - The job posting data
 * @param {Object} [params.company] - Company data including branding
 * @param {string} params.channelId - Target channel ID (e.g., "TIKTOK_LEAD")
 * @param {string} params.channelName - Human-readable channel name
 * @param {string} [params.recommendedMedium] - Preferred video medium
 * @param {Object} [params.llmClient] - LLM client for storyboard/caption generation
 * @param {Object} params.logger - Logger instance
 * @param {number} [params.version=1] - Manifest version number
 * @param {Function} [params.usageTracker] - Function to track LLM usage
 * @param {import('./renderers/contracts.js').ProviderOptions} [params.providerOptions] - Provider-specific overrides for video generation
 * @returns {Promise<Object>} - The built video manifest
 */
export async function buildVideoManifest({
  job,
  company,
  channelId,
  channelName,
  recommendedMedium,
  llmClient,
  logger,
  version = 1,
  usageTracker,
  providerOptions,
}) {
  const durationPlan = computeDurationPlan({ channelId });
  const spec = durationPlan.spec ?? resolveVideoSpec(channelId);
  const jobSnapshot = deriveJobSnapshot(job);
  const warnings = [];
  const manifestId = uuid();
  const usageContext = {
    userId: job?.ownerUserId ?? null,
    jobId: job?.id ?? null
  };
  const trackUsage = async (result, taskType) => {
    if (!usageTracker || !result) {
      return;
    }
    await usageTracker({
      result,
      usageContext: { ...usageContext, taskType }
    });
  };

  let storyboard;
  let thumbnail;
  let caption;
  let complianceFlags = [];
  let llmProvider = null;
  let llmModel = null;
  let generatorMode = "fallback";
  const branding = {
    colors: company?.brand?.colors ?? {},
    fonts: company?.brand?.fonts ?? {},
    tone:
      company?.toneOfVoice ??
      company?.brand?.toneOfVoiceHint ??
      "professional and energetic",
    logoUrl: company?.logoUrl ?? company?.brand?.logoUrl
  };
  console.log("[video-manifest-builder] Branding context", {
    companyId: company?.id ?? company?._id ?? null,
    colors: branding.colors,
    hasFonts: Boolean(branding.fonts && Object.keys(branding.fonts).length),
    tone: branding.tone,
    hasLogo: Boolean(branding.logoUrl)
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Build VideoConfig and RenderPlan FIRST
  // These inform downstream LLMs (storyboard, caption, compliance) about
  // creative intent (tone, duration, style) and execution constraints.
  // ═══════════════════════════════════════════════════════════════════════════
  const provider = VIDEO_RENDER_CONFIG.defaultProvider;
  const modelId = VIDEO_RENDER_CONFIG.providers[provider]?.model ?? "unknown";
  const capabilities = getVideoModelCapabilities(provider, modelId);

  // Build default VideoConfig as fallback
  const defaultVideoConfig = buildDefaultVideoConfig({
    targetSeconds: durationPlan.targetSeconds,
    channelId,
    tone: branding.tone
  });

  // Try to get LLM-generated VideoConfig, fall back to defaults on error
  let videoConfig = defaultVideoConfig;
  if (LLM_ENABLED && llmClient?.askVideoConfig) {
    try {
      const configResult = await llmClient.askVideoConfig({
        jobSnapshot,
        selectedChannels: [channelId],
        capabilities,
        branding
      });
      await trackUsage(configResult, LLM_CORE_TASK.VIDEO_CONFIG);

      if (!configResult.error && configResult.videoConfig) {
        videoConfig = normalizeVideoConfig(configResult.videoConfig, capabilities, defaultVideoConfig);
        llmProvider = configResult.provider ?? llmProvider;
        llmModel = configResult.model ?? llmModel;
        generatorMode = "llm";
        logger.info(
          { videoConfig, raw: configResult.videoConfig },
          "VideoConfig LLM succeeded"
        );
      } else if (configResult.error) {
        warnings.push(`VideoConfig fallback: ${configResult.error.message ?? configResult.error.reason}`);
        logger.warn({ err: configResult.error }, "VideoConfig LLM returned error");
      }
    } catch (error) {
      logger.warn({ err: error }, "VideoConfig LLM call failed");
      warnings.push("VideoConfig fallback engaged after exception");
    }
  }

  // Build RenderPlan using the new planner (deterministic execution plan)
  const renderPlan = planRenderForVideo(
    videoConfig,
    capabilities,
    provider,
    modelId,
    spec?.aspectRatio ?? "9:16",
    spec?.resolution
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Call downstream LLMs with VideoConfig and RenderPlan context
  // ═══════════════════════════════════════════════════════════════════════════
  if (LLM_ENABLED && llmClient?.askVideoStoryboard) {
    try {
      const storyboardResult = await llmClient.askVideoStoryboard({
        jobSnapshot,
        spec,
        channelId,
        channelName,
        recommendedMedium: recommendedMedium ?? spec.medium,
        branding,
        // Pass VideoConfig and RenderPlan for creative guidance
        videoConfig,
        renderPlanSummary: {
          finalPlannedSeconds: renderPlan.finalPlannedSeconds,
          aspectRatio: renderPlan.aspectRatio,
          provider: renderPlan.provider
        }
      });
      await trackUsage(storyboardResult, LLM_CORE_TASK.VIDEO_STORYBOARD);
      if (!storyboardResult.error && Array.isArray(storyboardResult.shots) && storyboardResult.shots.length >= 4) {
        storyboard = normaliseShots(storyboardResult.shots, spec);
        thumbnail = storyboardResult.thumbnail ?? null;
        llmProvider = storyboardResult.provider ?? llmProvider;
        llmModel = storyboardResult.model ?? llmModel;
        generatorMode = "llm";
      } else if (storyboardResult.error) {
        warnings.push(`LLM storyboard fallback: ${storyboardResult.error.message ?? storyboardResult.error.reason}`);
      }
    } catch (error) {
      logger.warn({ err: error }, "LLM storyboard generation failed");
      warnings.push("Storyboard fallback engaged after exception");
    }
  }

  if (!storyboard) {
    storyboard = buildFallbackStoryboard({ jobSnapshot, spec });
    thumbnail = null;
  }

  // Normalize storyboard phases for segment mapping
  // This adds normalizedPhase ("hook", "middle", "cta") to each shot
  storyboard = normalizeStoryboardPhases(storyboard);

  if (!thumbnail) {
    thumbnail = buildFallbackThumbnail({ jobSnapshot });
  }

  // Build segment contexts for multi-extend Veo videos
  // This maps storyboard shots to RenderPlan segments so each
  // Veo API call receives only the shots for that segment
  const segmentContexts = buildSegmentContextsFromStoryboard(storyboard, renderPlan);
  if (segmentContexts.length > 0) {
    logger.info(
      {
        segmentCount: segmentContexts.length,
        phases: segmentContexts.map(s => s.phase),
        shotsPerSegment: segmentContexts.map(s => s.shots.length)
      },
      "Built segment contexts for multi-extend"
    );
  }

  if (LLM_ENABLED && llmClient?.askVideoCaption) {
    try {
      const captionResult = await llmClient.askVideoCaption({
        jobSnapshot,
        spec,
        channelId,
        // Pass VideoConfig for tone and style guidance
        videoConfig,
        // Pass storyboard summary if available (for caption coherence)
        storyboardSummary: storyboard ? {
          shotCount: storyboard.length,
          phases: storyboard.map(s => s.phase).join(" → ")
        } : undefined
      });
      await trackUsage(captionResult, LLM_CORE_TASK.VIDEO_CAPTION);
      if (!captionResult.error && captionResult.caption) {
        caption = captionResult.caption;
        llmProvider = captionResult.provider ?? llmProvider;
        llmModel = captionResult.model ?? llmModel;
        generatorMode = "llm";
      } else if (captionResult.error) {
        warnings.push(`Caption fallback: ${captionResult.error.message ?? captionResult.error.reason}`);
      }
    } catch (error) {
      logger.warn({ err: error }, "LLM caption generation failed");
      warnings.push("Caption fallback engaged after exception");
    }
  }

  if (!caption) {
    caption = buildFallbackCaption({ jobSnapshot, spec });
  }

  if (LLM_ENABLED && llmClient?.askVideoCompliance) {
    try {
      const complianceResult = await llmClient.askVideoCompliance({
        jobSnapshot,
        spec,
        channelId,
        // Pass VideoConfig and RenderPlan context for compliance assessment
        videoConfig,
        renderPlanSummary: {
          finalPlannedSeconds: renderPlan.finalPlannedSeconds,
          aspectRatio: renderPlan.aspectRatio,
          provider: renderPlan.provider
        }
      });
      await trackUsage(complianceResult, LLM_CORE_TASK.VIDEO_COMPLIANCE);
      if (!complianceResult.error && Array.isArray(complianceResult.flags)) {
        complianceFlags = complianceResult.flags;
        llmProvider = complianceResult.provider ?? llmProvider;
        llmModel = complianceResult.model ?? llmModel;
        generatorMode = "llm";
      } else if (complianceResult.error) {
        warnings.push(
          `Compliance fallback: ${complianceResult.error.message ?? complianceResult.error.reason}`
        );
      }
    } catch (error) {
      logger.warn({ err: error }, "LLM compliance generation failed");
      warnings.push("Compliance fallback engaged after exception");
    }
  }

  const qaChecklist = buildQaChecklist({
    spec,
    storyboard,
    caption,
    jobSnapshot
  });
  const combinedCompliance = buildComplianceFlags({
    baseFlags: complianceFlags,
    jobSnapshot,
    spec
  });

  const tracking = {
    utmSource: channelId,
    utmMedium: "video",
    utmCampaign: "jobs",
    utmContent: slugify(jobSnapshot.title)
  };

  const manifest = {
    manifestId,
    version,
    createdAt: new Date().toISOString(),
    channelId,
    channelName,
    placementName: spec.placementName,
    medium: spec.medium,
    spec,
    job: jobSnapshot,
    storyboard,
    caption,
    thumbnail,
    compliance: {
      flags: combinedCompliance,
      qaChecklist
    },
    tracking,
    generator: {
      mode: generatorMode,
      provider: llmProvider,
      model: llmModel,
      promptVersion: "2024.12-video",
      warnings,
      targetDurationSeconds: durationPlan.targetSeconds,
      plannedExtends: durationPlan.extendsNeeded,
      // Provider-specific options for video generation (Sora/Veo)
      // These are passed through to the video client during rendering
      providerOptions: providerOptions ?? undefined,
      // New VideoConfig LLM architecture fields (Step 1: system defaults)
      videoConfig,
      renderPlan,
      // Segment contexts for multi-extend Veo: maps storyboard shots to segments
      // Each segment gets specific shots and a focused prompt
      segmentContexts: segmentContexts.length > 0 ? segmentContexts : undefined,
    }
  };

  return VideoAssetManifestSchema.parse(manifest);
}
