/**
 * @file llm.js
 * LLM API Router - thin dispatcher for LLM tasks.
 *
 * ARCHITECTURE:
 * - PROTECTED: This router is mounted behind requireAuth middleware in server.js.
 *   The router assumes req.user is already set and does NOT verify JWTs directly.
 * - This router does NOT access Firestore directly for data queries.
 * - All Firestore access goes through services/repositories/*.
 * - Router handles: Zod validation, auth, taskType validation, service delegation, usage logging, response building
 * - Services handle: context enrichment, llmClient calls
 * - Usage logging (recordLlmUsageFromResult) is called exactly once per LLM invocation here.
 */

import { Router } from "express";
import { z } from "zod";
import { wrapAsync, httpError, loadEnv } from "@wizard/utils";
import { recordLlmUsageFromResult } from "../services/llm-usage-ledger.js";
import {
  CORE_LLM_TASKS,
  ORCHESTRATOR_TASKS,
  LLM_CORE_TASK,
  LLM_ORCHESTRATOR_TASK,
  LLM_LOGGING_TASK,
} from "../config/task-types.js";
import { createAssetGenerationService } from "../services/wizard/wizard-asset-generation-service.js";
import {
  listCompaniesForUser,
  getJobRaw,
  getCompanyByIdParsed,
} from "../services/repositories/index.js";
import {
  renderVideo,
  updateVideoCaption,
  createVideoManifest,
  regenerateVideoManifest,
} from "../video/service.js";
import { VideoRendererError } from "../video/renderers/contracts.js";
import { generateHeroImage } from "../services/hero-image.js";
import { runCompanyEnrichmentOnce } from "../services/company-intel.js";

// Import task services
import {
  handleSuggestTask,
  handleRefineTask,
  handleChannelsTask,
  handleCopilotAgentTask,
} from "../services/llm-tasks/index.js";

const requestSchema = z.object({
  taskType: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional()
});

/**
 * Map of task types to llmClient method names.
 * This is the canonical source of truth for task routing.
 */
export const TASK_METHOD_MAP = {
  suggest: "askSuggestions",
  refine: "askRefineJob",
  channels: "askChannelRecommendations",
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
  image_caption: "askImageCaption",
  golden_interviewer: "askGoldenInterviewerTurn",
  golden_db_update: "askGoldenDbUpdate",
};

/**
 * Resolve the usage type for billing/logging based on task type.
 * @param {string} taskType
 * @returns {"text" | "image" | "video"}
 */
export function resolveUsageType(taskType) {
  if (taskType === LLM_CORE_TASK.IMAGE_GENERATION) return "image";
  if (taskType.startsWith("video_")) return "video";
  return "text";
}

export function llmRouter({ llmClient, firestore, bigQuery, logger }) {
  const router = Router();

  // Determine API base URL for internal HTTP calls (same pattern as golden-interview)
  const env = loadEnv();
  const port = Number(env.PORT ?? 4000);
  const apiBaseUrl = `http://127.0.0.1:${port}`;

  // Create asset generation service - NO llmClient
  // All LLM calls go through HTTP POST /api/llm
  const assetGenerationService = createAssetGenerationService({
    firestore,
    logger,
    apiBaseUrl,
  });

  router.post(
    "/",
    wrapAsync(async (req, res) => {
      const { taskType, context = {} } = requestSchema.parse(req.body ?? {});

      // Validate taskType against allowed values
      const allowedTaskTypes = [...CORE_LLM_TASKS, ...ORCHESTRATOR_TASKS];
      if (!allowedTaskTypes.includes(taskType)) {
        return res.status(400).json({
          error: "Invalid taskType",
          taskType,
          allowedTaskTypes,
        });
      }

      const userId = req.user?.id ?? null;

      // =======================================================================
      // ORCHESTRATOR TASKS - High-level pipelines
      // =======================================================================

      if (taskType === LLM_ORCHESTRATOR_TASK.GENERATE_CAMPAIGN_ASSETS) {
        if (!userId) {
          throw httpError(401, "Unauthorized");
        }
        // Get auth token for internal HTTP calls
        const authToken = req.user?.token;
        if (!authToken) {
          throw httpError(401, "Missing auth token");
        }
        const result = await assetGenerationService.generateAssets({
          authToken,
          userId,
          payload: context,
        });
        return res.json({ taskType, result });
      }

      if (taskType === LLM_ORCHESTRATOR_TASK.VIDEO_RENDER) {
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

      if (taskType === LLM_ORCHESTRATOR_TASK.VIDEO_CAPTION_UPDATE) {
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

      if (taskType === LLM_ORCHESTRATOR_TASK.VIDEO_CREATE_MANIFEST) {
        if (!userId) {
          throw httpError(401, "Unauthorized");
        }
        const jobId = context.jobId ?? context.job?.id;
        if (!jobId) {
          throw httpError(400, "jobId is required");
        }
        const job = await getJobRaw(firestore, jobId);
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

      if (taskType === LLM_ORCHESTRATOR_TASK.VIDEO_REGENERATE) {
        if (!userId) {
          throw httpError(401, "Unauthorized");
        }
        const jobId = context.jobId ?? context.job?.id;
        if (!jobId) {
          throw httpError(400, "jobId is required");
        }
        const job = await getJobRaw(firestore, jobId);
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

      if (taskType === LLM_ORCHESTRATOR_TASK.HERO_IMAGE) {
        if (!userId) {
          throw httpError(401, "Unauthorized");
        }
        logger?.info?.(
          {
            jobId: context.jobId,
            forceRefresh: context.forceRefresh,
            userId,
          },
          "llm.hero_image.request"
        );
        const result = await generateHeroImage({
          firestore,
          bigQuery,
          llmClient,
          logger,
          jobId: context.jobId,
          forceRefresh: context.forceRefresh,
          ownerUserId: userId,
          userId,
        });
        logger?.info?.(
          {
            jobId: context.jobId,
            status: result?.heroImage?.status ?? null,
            forceRefresh: context.forceRefresh,
          },
          "llm.hero_image.response"
        );
        return res.json({ taskType, result });
      }

      // =======================================================================
      // COMPANY INTEL - Standalone enrichment
      // =======================================================================

      if (taskType === LLM_CORE_TASK.COMPANY_INTEL) {
        if (!userId) {
          throw httpError(401, "Unauthorized");
        }
        const companyId = context.companyId ?? context.company?.id ?? null;
        if (!companyId) {
          throw httpError(400, "companyId is required");
        }

        const accessibleCompanies = await listCompaniesForUser({
          firestore,
          user: req.user,
          logger
        });
        const company = accessibleCompanies.find((item) => item.id === companyId);
        if (!company) {
          throw httpError(404, "Company not found");
        }

        let intelResult = null;
        let intelError = null;
        try {
          intelResult = await runCompanyEnrichmentOnce({
            firestore,
            bigQuery,
            logger,
            llmClient,
            company
          });
        } catch (err) {
          intelError = err;
          logger?.warn?.(
            { companyId, err },
            "company_intel.enrichment_failed"
          );
        }

        const refreshedCompany = await getCompanyByIdParsed(firestore, companyId);

        return res.json({
          taskType,
          result: {
            company: refreshedCompany,
            jobs: intelResult?.jobs ?? [],
            failure: intelError
              ? {
                  reason: "company_intel_failed",
                  message:
                    intelError?.message ??
                    "Company enrichment failed to produce a result",
                  rawPreview: intelError?.rawPreview ?? null
                }
              : null
          }
        });
      }

      // =======================================================================
      // CHANNELS - Channel recommendations via service
      // =======================================================================

      if (taskType === LLM_CORE_TASK.CHANNELS) {
        if (!userId) {
          throw httpError(401, "Unauthorized");
        }
        const jobId = context.jobId ?? context.job?.id ?? null;

        const serviceResult = await handleChannelsTask({
          llmClient,
          firestore,
          logger,
          userId,
          context
        });

        // Record usage (exactly once per LLM invocation)
        if (serviceResult.llmResult) {
          await recordLlmUsageFromResult({
            firestore,
            bigQuery,
            logger,
            usageContext: { userId, jobId, taskType },
            usageType: resolveUsageType(taskType),
            result: serviceResult.llmResult,
          });
        }

        return res.json({ taskType, result: serviceResult.result });
      }

      // =======================================================================
      // COPILOT AGENT - Complex agent orchestration via service
      // =======================================================================

      if (taskType === LLM_CORE_TASK.COPILOT_AGENT) {
        if (!userId) {
          throw httpError(401, "Unauthorized");
        }

        // Copilot agent tracks usage internally via callback
        const usageTracker = ({ result, usageContext }) =>
          recordLlmUsageFromResult({
            firestore,
            bigQuery,
            logger,
            usageContext,
            result,
          });

        const serviceResult = await handleCopilotAgentTask({
          llmClient,
          firestore,
          bigQuery,
          logger,
          userId,
          context,
          usageTracker
        });

        return res.json({ taskType, result: serviceResult.result });
      }

      // =======================================================================
      // SUGGEST - Job suggestions via service
      // =======================================================================

      if (taskType === LLM_CORE_TASK.SUGGEST) {
        const jobId = context.jobId ?? context.job?.id ?? context.refinedJob?.jobId ?? null;

        const serviceResult = await handleSuggestTask({
          llmClient,
          firestore,
          logger,
          userId,
          jobId,
          context
        });

        // Record usage if LLM was invoked (not skipped due to cache)
        if (!serviceResult.skipped && serviceResult.llmResult) {
          await recordLlmUsageFromResult({
            firestore,
            bigQuery,
            logger,
            usageContext: { userId, jobId, taskType: LLM_LOGGING_TASK.SUGGESTIONS },
            usageType: resolveUsageType(taskType),
            result: serviceResult.llmResult
          });
        }

        return res.json({ taskType, result: serviceResult.result });
      }

      // =======================================================================
      // REFINE - Job refinement via service
      // =======================================================================

      if (taskType === LLM_CORE_TASK.REFINE) {
        const jobId = context.jobId ?? context.job?.id ?? context.refinedJob?.jobId ?? null;

        const serviceResult = await handleRefineTask({
          llmClient,
          firestore,
          logger,
          userId,
          jobId,
          context
        });

        // Record usage if LLM was invoked (not skipped due to cache)
        if (!serviceResult.skipped && serviceResult.llmResult) {
          await recordLlmUsageFromResult({
            firestore,
            bigQuery,
            logger,
            usageContext: { userId, jobId, taskType: LLM_LOGGING_TASK.REFINEMENT },
            usageType: resolveUsageType(taskType),
            result: serviceResult.llmResult
          });
        }

        return res.json({ taskType, result: serviceResult.result });
      }

      // =======================================================================
      // GENERIC TASKS - Direct llmClient dispatch
      // =======================================================================

      const methodName = TASK_METHOD_MAP[taskType] ?? taskType;
      const dispatcher = llmClient?.[methodName];

      if (!dispatcher || typeof dispatcher !== "function") {
        return res.status(400).json({
          error: `Unsupported taskType "${taskType}".`
        });
      }

      const jobId = context.jobId ?? context.job?.id ?? context.refinedJob?.jobId ?? null;
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
