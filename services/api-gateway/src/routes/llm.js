import { Router } from "express";
import { z } from "zod";
import { wrapAsync, httpError } from "@wizard/utils";
import { recordLlmUsageFromResult } from "../services/llm-usage-ledger.js";
import { generateCampaignAssets } from "./wizard.js";
import {
  renderVideo,
  updateVideoCaption,
  createVideoManifest,
  regenerateVideoManifest,
} from "../video/service.js";
import { VideoRendererError } from "../video/renderers/contracts.js";

const requestSchema = z.object({
  taskType: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional()
});

const TASK_METHOD_MAP = {
  suggest: "askSuggestions",
  refine: "askRefineJob",
  channels: "askChannelRecommendations",
  chat: "askChat",
  copilot_agent: "runCopilotAgent",
  company_intel: "askCompanyIntel",
  asset_master: "askAssetMaster",
  asset_channel_batch: "askAssetChannelBatch",
  asset_adapt: "askAssetAdapt",
  video_storyboard: "askVideoStoryboard",
  video_caption: "askVideoCaption",
  video_compliance: "askVideoCompliance",
  image_prompt_generation: "askHeroImagePrompt",
  image_generation: "runImageGeneration",
  image_caption: "askImageCaption"
};

function resolveUsageType(taskType) {
  if (taskType === "image_generation") return "image";
  if (taskType.startsWith("video_")) return "video";
  return "text";
}

export function llmRouter({ llmClient, firestore, bigQuery, logger }) {
  const router = Router();

  router.post(
    "/",
    wrapAsync(async (req, res) => {
      const { taskType, context = {} } = requestSchema.parse(req.body ?? {});

      // High-level pipelines that don't map directly to llmClient
      if (taskType === "generate_campaign_assets") {
        const userId = req.user?.id ?? null;
        if (!userId) {
          throw httpError(401, "Unauthorized");
        }
        const result = await generateCampaignAssets({
          firestore,
          bigQuery,
          llmClient,
          logger,
          payload: context,
          userId,
        });
        return res.json({ taskType, result });
      }

      if (taskType === "video_render") {
        const userId = req.user?.id ?? null;
        if (!userId) {
          throw httpError(401, "Unauthorized");
        }
        try {
          const result = await renderVideo({
            firestore,
            bigQuery,
            llmClient,
            logger,
            ownerUserId: userId,
            itemId: context.itemId,
          });
          if (!result) {
            throw httpError(404, "Video item not found");
          }
          return res.json({ taskType, result: { item: result } });
        } catch (error) {
          if (error instanceof VideoRendererError) {
            logger?.error?.(
              { err: error, itemId: context.itemId, userId },
              "video.render.failed"
            );
            throw httpError(502, error.message);
          }
          throw error;
        }
      }

      if (taskType === "video_caption_update") {
        const userId = req.user?.id ?? null;
        if (!userId) {
          throw httpError(401, "Unauthorized");
        }
        const item = await updateVideoCaption({
          firestore,
          bigQuery,
          llmClient,
          logger,
          ownerUserId: userId,
          itemId: context.itemId,
          caption: context.caption,
        });
        if (!item) {
          throw httpError(404, "Video item not found");
        }
        return res.json({ taskType, result: { item } });
      }

      if (taskType === "video_create_manifest") {
        const userId = req.user?.id ?? null;
        if (!userId) {
          throw httpError(401, "Unauthorized");
        }
        const jobId = context.jobId ?? context.job?.id;
        if (!jobId) {
          throw httpError(400, "jobId is required");
        }
        const job = await firestore.getDocument("jobs", jobId);
        if (!job || job.ownerUserId !== userId) {
          throw httpError(404, "Job not found");
        }
        const item = await createVideoManifest({
          firestore,
          bigQuery,
          llmClient,
          logger,
          job,
          channelId: context.channelId,
          recommendedMedium: context.recommendedMedium,
          ownerUserId: userId,
        });
        return res.status(201).json({ taskType, result: { item } });
      }

      if (taskType === "video_regenerate") {
        const userId = req.user?.id ?? null;
        if (!userId) {
          throw httpError(401, "Unauthorized");
        }
        const jobId = context.jobId ?? context.job?.id;
        if (!jobId) {
          throw httpError(400, "jobId is required");
        }
        const job = await firestore.getDocument("jobs", jobId);
        if (!job || job.ownerUserId !== userId) {
          throw httpError(404, "Job not found");
        }
        const item = await regenerateVideoManifest({
          firestore,
          bigQuery,
          llmClient,
          logger,
          ownerUserId: userId,
          itemId: context.itemId,
          job,
          recommendedMedium: context.recommendedMedium,
        });
        if (!item) {
          throw httpError(404, "Video item not found");
        }
        return res.json({ taskType, result: { item } });
      }

      const methodName = TASK_METHOD_MAP[taskType] ?? taskType;
      const dispatcher = llmClient?.[methodName];

      if (!dispatcher || typeof dispatcher !== "function") {
        return res.status(400).json({
          error: `Unsupported taskType "${taskType}".`
        });
      }

      const userId = req.user?.id ?? null;
      const jobId =
        context.jobId ??
        context.job?.id ??
        context.refinedJob?.jobId ??
        null;

      const result = await dispatcher(context);

      await recordLlmUsageFromResult({
        firestore,
        bigQuery,
        logger,
        usageContext: { userId, jobId, taskType },
        usageType: resolveUsageType(taskType),
        result
      });

      res.json({ taskType, result });
    })
  );

  return router;
}
