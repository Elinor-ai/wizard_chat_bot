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

const LLM_ENABLED = process.env.VIDEO_LLM_ENABLED !== "false";

export async function buildVideoManifest({
  job,
  channelId,
  channelName,
  recommendedMedium,
  llmClient,
  logger,
  version = 1,
  usageTracker
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

  if (LLM_ENABLED && llmClient?.askVideoStoryboard) {
    try {
      const storyboardResult = await llmClient.askVideoStoryboard({
        jobSnapshot,
        spec,
        channelId,
        channelName,
        recommendedMedium: recommendedMedium ?? spec.medium
      });
      await trackUsage(storyboardResult, "video_storyboard");
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

  if (!thumbnail) {
    thumbnail = buildFallbackThumbnail({ jobSnapshot });
  }

  if (LLM_ENABLED && llmClient?.askVideoCaption) {
    try {
      const captionResult = await llmClient.askVideoCaption({
        jobSnapshot,
        spec,
        channelId
      });
      await trackUsage(captionResult, "video_caption");
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
        channelId
      });
      await trackUsage(complianceResult, "video_compliance");
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
      plannedExtends: durationPlan.extendsNeeded
    }
  };

  return VideoAssetManifestSchema.parse(manifest);
}
