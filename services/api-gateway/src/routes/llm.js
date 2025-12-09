import { Router } from "express";
import { z } from "zod";
import { wrapAsync, httpError } from "@wizard/utils";
import { recordLlmUsageFromResult } from "../services/llm-usage-ledger.js";
import {
  CORE_LLM_TASKS,
  ORCHESTRATOR_TASKS,
  LLM_CORE_TASK,
  LLM_ORCHESTRATOR_TASK,
  LLM_LOGGING_TASK,
} from "../config/task-types.js";
import {
  generateCampaignAssets,
  overwriteChannelRecommendationDocument,
  persistChannelRecommendationFailure
} from "./wizard.js";
import { listCompaniesForUser } from "./companies.js";
import {
  renderVideo,
  updateVideoCaption,
  createVideoManifest,
  regenerateVideoManifest,
} from "../video/service.js";
import { VideoRendererError } from "../video/renderers/contracts.js";
import {
  mergeIntakeIntoJob,
  buildJobSnapshot,
  computeRequiredProgress
} from "../wizard/job-intake.js";
import { loadCompanyContext } from "../services/company-context.js";
import {
  JobSuggestionSchema,
  JobRefinementSchema,
  JobSchema,
  CampaignSchema,
  CompanySchema
} from "@wizard/core";
import { appendCopilotMessages } from "../copilot/chat-store.js";
import { loadCopilotHistory } from "../copilot/chat-store.js";
import {
  DEFAULT_COPILOT_STAGE,
  getToolsForStage,
  listSupportedStages,
  resolveStageConfig
} from "../copilot/stages.js";
import { WizardCopilotAgent } from "../copilot/agent.js";
import { COPILOT_TOOLS } from "../copilot/tools.js";
import { generateHeroImage } from "../services/hero-image.js";
import { runCompanyEnrichmentOnce } from "../services/company-intel.js";
import {
  loadSuggestionDocument,
  loadRefinementDocument,
  mapCandidatesByField,
  selectSuggestionsForFields,
  sanitizeCopilotReply,
  serializeMessages,
  buildCopilotMessage
} from "../wizard/job-helpers.js";

const requestSchema = z.object({
  taskType: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional()
});

const SUGGESTION_COLLECTION = "jobSuggestions";
const REFINEMENT_COLLECTION = "jobRefinements";
const SUPPORTED_CHANNELS = CampaignSchema.shape.channel.options;
const COPILOT_STAGE_ENUM = z.enum(listSupportedStages());

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

async function loadJobForUserLocal({ firestore, jobId, userId }) {
  const doc = await firestore.getDocument("jobs", jobId);
  if (!doc) {
    throw httpError(404, "Job not found");
  }
  if (doc.ownerUserId && doc.ownerUserId !== userId) {
    throw httpError(403, "You do not have access to this job");
  }
  const parsed = JobSchema.safeParse(doc);
  if (!parsed.success) {
    throw httpError(500, "Job document is invalid");
  }
  return parsed.data;
}

async function syncRefinedFieldsLocal({ firestore, job, jobId, updates }) {
  if (!updates || updates.length === 0 || !jobId) {
    return null;
  }
  const existing = await loadRefinementDocument(firestore, jobId);
  const refined = { ...(existing?.refinedJob ?? buildJobSnapshot(job)) };
  updates.forEach(({ fieldId, value }) => {
    refined[fieldId] = value === undefined || value === null ? "" : value;
  });
  const payload = {
    id: jobId,
    jobId,
    companyId: job?.companyId ?? existing?.companyId ?? null,
    schema_version: "1",
    refinedJob: refined,
    summary: existing?.summary ?? null,
    provider: existing?.provider,
    model: existing?.model,
    metadata: existing?.metadata,
    lastFailure: existing?.lastFailure,
    updatedAt: new Date(),
  };
  if (!payload.metadata) {
    delete payload.metadata;
  }
  if (!payload.lastFailure) {
    delete payload.lastFailure;
  }
  const parsed = JobRefinementSchema.parse(payload);
  await firestore.saveDocument(REFINEMENT_COLLECTION, jobId, payload);
  return parsed.refinedJob;
}

async function loadRefinedSnapshotLocal({ firestore, jobId }) {
  const existing = await loadRefinementDocument(firestore, jobId);
  if (!existing) return null;
  return existing.refinedJob ?? null;
}

async function overwriteSuggestionDocument({
  firestore,
  logger,
  jobId,
  companyId = null,
  candidates,
  provider,
  model,
  metadata,
  now,
}) {
  const telemetry =
    metadata && Object.keys(metadata).length > 0
      ? {
          promptTokens: metadata.promptTokens ?? metadata.promptTokenCount ?? null,
          candidateTokens: metadata.candidateTokens ?? metadata.candidatesTokenCount ?? null,
          totalTokens: metadata.totalTokens ?? metadata.totalTokenCount ?? null,
          finishReason: metadata.finishReason ?? null
        }
      : undefined;
  const payload = JobSuggestionSchema.parse({
    id: jobId,
    jobId,
    companyId: companyId ?? null,
    schema_version: "3",
    candidates: mapCandidatesByField(candidates),
    provider,
    model,
    metadata: telemetry,
    updatedAt: now
  });

  await firestore.saveDocument(SUGGESTION_COLLECTION, jobId, payload);
  logger.info(
    { jobId, suggestions: candidates.length, provider, model },
    "Persisted LLM suggestions"
  );
  return payload;
}

async function persistSuggestionFailure({
  firestore,
  logger,
  jobId,
  companyId = null,
  reason,
  rawPreview,
  error,
  now
}) {
  const existing = await loadSuggestionDocument(firestore, jobId);

  const payload = JobSuggestionSchema.parse({
    id: jobId,
    jobId,
    companyId: companyId ?? existing?.companyId ?? null,
    schema_version: "3",
    candidates: existing?.candidates ?? {},
    provider: existing?.provider,
    model: existing?.model,
    metadata: existing?.metadata,
    lastFailure: {
      reason,
      rawPreview,
      error,
      occurredAt: now
    },
    updatedAt: existing?.updatedAt ?? now
  });

  await firestore.saveDocument(SUGGESTION_COLLECTION, jobId, payload);
  logger.warn({ jobId, reason }, "Persisted suggestion failure");
  return payload;
}

async function overwriteRefinementDocument({
  firestore,
  logger,
  jobId,
  companyId = null,
  refinedJob,
  summary,
  provider,
  model,
  metadata,
  now
}) {
  const payload = JobRefinementSchema.parse({
    id: jobId,
    jobId,
    companyId: companyId ?? null,
    schema_version: "1",
    refinedJob,
    summary: summary ?? null,
    provider,
    model,
    metadata,
    updatedAt: now
  });

  await firestore.saveDocument(REFINEMENT_COLLECTION, jobId, payload);
  logger.info({ jobId, provider, model }, "Persisted job refinement");
  return payload;
}

async function persistRefinementFailure({
  firestore,
  logger,
  jobId,
  companyId = null,
  reason,
  message,
  rawPreview,
  now
}) {
  const existing = await loadRefinementDocument(firestore, jobId);
  const payload = JobRefinementSchema.parse({
    id: jobId,
    jobId,
    companyId,
    schema_version: "1",
    refinedJob: existing?.refinedJob ?? {},
    summary: existing?.summary ?? null,
    provider: existing?.provider,
    model: existing?.model,
    metadata: existing?.metadata,
    lastFailure: {
      reason,
      message: message ?? null,
      rawPreview: rawPreview ?? null,
      occurredAt: now
    },
    updatedAt: existing?.updatedAt ?? now
  });

  await firestore.saveDocument(REFINEMENT_COLLECTION, jobId, payload);
  logger.warn({ jobId, reason }, "Persisted refinement failure");
  return payload;
}

function normalizeSeniorityLevel(value) {
  if (!value || typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("entry")) return "entry";
  if (normalized.includes("mid")) return "mid";
  if (normalized.includes("senior")) return "senior";
  if (normalized.includes("lead")) return "lead";
  if (normalized.includes("executive")) return "executive";
  return null;
}

function normalizeRefinedJob(refinedJob = {}) {
  const normalized = { ...refinedJob };
  const seniority = normalizeSeniorityLevel(refinedJob.seniorityLevel);
  if (seniority) {
    normalized.seniorityLevel = seniority;
  }
  return normalized;
}

async function enrichContextForTask({
  taskType,
  context,
  firestore,
  logger,
  userId
}) {
  const needsJob =
    taskType === LLM_CORE_TASK.SUGGEST ||
    taskType === LLM_CORE_TASK.REFINE ||
    taskType === LLM_CORE_TASK.COPILOT_AGENT;
  const jobId =
    context.jobId ?? context.job?.id ?? context.refinedJob?.jobId ?? null;

  if (!needsJob || !jobId) {
    return context;
  }

  const job = await firestore.getDocument("jobs", jobId);
  if (!job) {
    throw httpError(404, "Job not found");
  }

  const companyContext =
    context.companyContext ??
    (await loadCompanyContext({
      firestore,
      companyId: job.companyId ?? null,
      taskType: taskType === LLM_CORE_TASK.REFINE ? "job_refinement" : LLM_LOGGING_TASK.SUGGESTIONS,
      logger
    }));

  if (taskType === LLM_CORE_TASK.REFINE) {
    if (!job.stateMachine?.requiredComplete) {
      throw httpError(
        409,
        "Complete required questions before running refinement."
      );
    }
    const refinementDoc = await loadRefinementDocument(firestore, jobId);
    const shouldRefresh =
      context.forceRefresh === true ||
      !refinementDoc ||
      Boolean(refinementDoc.lastFailure);
    if (!shouldRefresh && refinementDoc) {
      return {
        ...context,
        _skipLlm: {
          reason: "cached_refinement",
          jobId,
          payload: {
            provider: refinementDoc.provider ?? null,
            model: refinementDoc.model ?? null,
            refinedJob: refinementDoc.refinedJob ?? {},
            originalJob: refinementDoc.originalJob ?? {},
            summary: refinementDoc.summary ?? null,
            updatedAt: refinementDoc.updatedAt ?? null,
            refreshed: false,
            failure: refinementDoc.lastFailure ?? null,
            metadata: refinementDoc.metadata ?? null
          }
        }
      };
    }
    return {
      ...context,
      jobId,
      jobSnapshot: context.jobSnapshot ?? buildJobSnapshot(job),
      jobDraft: context.jobDraft ?? buildJobSnapshot(job),
      confirmed: context.confirmed ?? job.confirmed ?? {},
      companyContext
    };
  }

  if (taskType === LLM_CORE_TASK.SUGGEST) {
    const now = new Date();
    const mergedJob = mergeIntakeIntoJob(job, context.state ?? {}, { now });
    const progress = computeRequiredProgress(mergedJob);
    if (!progress.allComplete) {
      // Mirror legacy behavior: don't call LLM if required intake incomplete
      return {
        ...context,
        _skipLlm: {
          reason: "intake_incomplete",
          jobId
        }
      };
    }
    const suggestionDoc = await loadSuggestionDocument(firestore, jobId);
    const previousSuggestions =
      suggestionDoc?.candidates && typeof suggestionDoc.candidates === "object"
        ? suggestionDoc.candidates
        : null;
    const visibleFieldIds =
      Array.isArray(context.visibleFieldIds) && context.visibleFieldIds.length > 0
        ? context.visibleFieldIds
        : Array.isArray(context.emptyFieldIds) && context.emptyFieldIds.length > 0
          ? context.emptyFieldIds
          : [];
    const shouldRefresh =
      !suggestionDoc ||
      context.intent?.forceRefresh === true ||
      (context.updatedFieldId && context.updatedFieldValue !== undefined);

    if (!shouldRefresh && suggestionDoc) {
      const candidatesMap =
        suggestionDoc.candidates && typeof suggestionDoc.candidates === "object"
          ? suggestionDoc.candidates
          : {};
      const suggestions = selectSuggestionsForFields(candidatesMap, visibleFieldIds);
      return {
        ...context,
        _skipLlm: {
          reason: "cached_suggestions",
          jobId,
          payload: {
            jobId,
            suggestions,
            updatedAt: suggestionDoc.updatedAt ?? null,
            refreshed: false,
            failure: suggestionDoc.lastFailure ?? null
          }
        }
      };
    }

    return {
      ...context,
      jobId,
      jobSnapshot: context.jobSnapshot ?? buildJobSnapshot(mergedJob),
      previousSuggestions,
      companyContext
    };
  }

  if (taskType === LLM_CORE_TASK.COPILOT_AGENT) {
    if (job.ownerUserId && userId && job.ownerUserId !== userId) {
      throw httpError(403, "You do not have access to this job");
    }
    const conversation = await loadCopilotHistory({
      firestore,
      jobId,
      limit: 8
    });
    const suggestionDoc = await loadSuggestionDocument(firestore, jobId);
    const suggestionCandidates = suggestionDoc?.candidates
      ? Object.values(suggestionDoc.candidates)
      : [];
    const refinementDoc = await loadRefinementDocument(firestore, jobId);
    const stageId = context.stage ?? DEFAULT_COPILOT_STAGE;
    const stageConfig = resolveStageConfig(stageId);
    const tools = getToolsForStage(stageConfig);

    return {
      ...context,
      jobId,
      jobSnapshot: context.jobSnapshot ?? buildJobSnapshot(job),
      companyContext,
      conversation,
      suggestions: suggestionCandidates,
      refinedSnapshot: refinementDoc?.refinedJob ?? null,
      toolContext: { firestore, logger, cache: {} },
      userId,
      currentStepId: context.currentStepId ?? null,
      contextId: context.contextId ?? null,
      stage: stageId,
      stageConfig,
      tools
    };
  }

  return context;
}

export function llmRouter({ llmClient, firestore, bigQuery, logger }) {
  const router = Router();

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

      // High-level pipelines that don't map directly to llmClient
      if (taskType === LLM_ORCHESTRATOR_TASK.GENERATE_CAMPAIGN_ASSETS) {
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

      if (taskType === LLM_ORCHESTRATOR_TASK.VIDEO_RENDER) {
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

      if (taskType === LLM_ORCHESTRATOR_TASK.VIDEO_CAPTION_UPDATE) {
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

      if (taskType === LLM_ORCHESTRATOR_TASK.VIDEO_CREATE_MANIFEST) {
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

      if (taskType === LLM_ORCHESTRATOR_TASK.VIDEO_REGENERATE) {
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

      if (taskType === LLM_ORCHESTRATOR_TASK.HERO_IMAGE) {
        const userId = req.user?.id ?? null;
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

      if (taskType === LLM_CORE_TASK.COMPANY_INTEL) {
        const userId = req.user?.id ?? null;
        if (!userId) {
          throw httpError(401, "Unauthorized");
        }
        const companyId =
          context.companyId ??
          context.company?.id ??
          null;
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

        const refreshedRaw = await firestore.getDocument("companies", companyId);
        const refreshedCompany = refreshedRaw
          ? CompanySchema.parse(refreshedRaw)
          : null;

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

      if (taskType === LLM_CORE_TASK.CHANNELS) {
        const userId = req.user?.id ?? null;
        if (!userId) {
          throw httpError(401, "Unauthorized");
        }
        const jobId = context.jobId ?? context.job?.id ?? null;
        if (!jobId) {
          throw httpError(400, "jobId is required");
        }

        const job = await firestore.getDocument("jobs", jobId);
        if (!job) {
          throw httpError(404, "Job not found");
        }
        if (job.ownerUserId && job.ownerUserId !== userId) {
          throw httpError(403, "You do not have access to this job");
        }
        if (!job.stateMachine?.requiredComplete) {
          throw httpError(
            409,
            "Complete all required questions before generating channels."
          );
        }

        const companyContext = await loadCompanyContext({
          firestore,
          companyId: job.companyId ?? null,
          taskType: "channel_recommendations",
          logger,
        });

        const result = await llmClient.askChannelRecommendations({
          jobSnapshot: buildJobSnapshot(job),
          confirmed: job.confirmed ?? {},
          supportedChannels: SUPPORTED_CHANNELS,
          existingChannels: Array.isArray(job.campaigns)
            ? job.campaigns
                .map((campaign) => campaign?.channel)
                .filter((channel) => typeof channel === "string")
            : [],
          companyContext,
        });

        await recordLlmUsageFromResult({
          firestore,
          bigQuery,
          logger,
          usageContext: { userId, jobId, taskType },
          usageType: resolveUsageType(taskType),
          result,
        });

        const now = new Date();
        let channelDoc = null;

        if (result?.recommendations?.length > 0) {
          channelDoc = await overwriteChannelRecommendationDocument({
            firestore,
            logger,
            jobId,
            companyId: job.companyId ?? null,
            recommendations: result.recommendations,
            provider: result.provider,
            model: result.model,
            metadata: result.metadata,
            now,
          });
        } else if (result?.error) {
          channelDoc = await persistChannelRecommendationFailure({
            firestore,
            logger,
            jobId,
            companyId: job.companyId ?? null,
            reason: result.error.reason ?? "unknown_error",
            message: result.error.message ?? null,
            rawPreview: result.error.rawPreview ?? null,
            now,
          });
        } else {
          channelDoc = await persistChannelRecommendationFailure({
            firestore,
            logger,
            jobId,
            companyId: job.companyId ?? null,
            reason: "no_recommendations",
            message: "LLM returned no channel recommendations",
            rawPreview: null,
            now,
          });
        }

        return res.json({
          taskType,
          result: {
            jobId,
            recommendations: channelDoc?.recommendations ?? [],
            updatedAt: channelDoc?.updatedAt ?? null,
            refreshed: true,
            failure: channelDoc?.lastFailure ?? null,
          },
        });
      }

      if (taskType === LLM_CORE_TASK.COPILOT_AGENT) {
        const userId = req.user?.id ?? null;
        if (!userId) {
          throw httpError(401, "Unauthorized");
        }

        const copilotSchema = z.object({
          jobId: z.string(),
          userMessage: z.string().min(1),
          currentStepId: z.string().optional(),
          clientMessageId: z.string().optional(),
          stage: COPILOT_STAGE_ENUM.default(DEFAULT_COPILOT_STAGE),
          contextId: z.string().optional().nullable(),
        });

        const payload = copilotSchema.parse(context ?? {});
        const job = await loadJobForUserLocal({
          firestore,
          jobId: payload.jobId,
          userId,
        });

        const companyContext = await loadCompanyContext({
          firestore,
          companyId: job.companyId ?? null,
          taskType: LLM_CORE_TASK.COPILOT_AGENT,
          logger,
        });

        const [conversation, suggestionDoc] = await Promise.all([
          loadCopilotHistory({ firestore, jobId: payload.jobId, limit: 8 }),
          loadSuggestionDocument(firestore, payload.jobId),
        ]);

        const suggestions = suggestionDoc?.candidates
          ? Object.values(suggestionDoc.candidates)
          : [];

        const stageConfig = resolveStageConfig(payload.stage);
        const stageTools = getToolsForStage(stageConfig);

        const agent = new WizardCopilotAgent({
          llmClient,
          tools: COPILOT_TOOLS,
          logger,
          usageTracker: ({ result, usageContext }) =>
            recordLlmUsageFromResult({
              firestore,
              bigQuery,
              logger,
              usageContext,
              result,
            }),
        });

        const toolContext = {
          firestore,
          logger,
          cache: {},
        };

        const agentResult = await agent.run({
          jobId: payload.jobId,
          userId,
          userMessage: payload.userMessage,
          currentStepId: payload.currentStepId,
          stage: stageConfig.id,
          stageConfig,
          tools: stageTools,
          conversation,
          jobSnapshot: buildJobSnapshot(job),
          suggestions,
          toolContext,
          companyContext,
        });

        const assistantReply =
          sanitizeCopilotReply(agentResult.reply) ||
          "All set—let me know what you’d like to adjust next.";

        const history = await appendCopilotMessages({
          firestore,
          jobId: payload.jobId,
          messages: [
            buildCopilotMessage({
              role: "user",
              type: "user",
              content: payload.userMessage,
              metadata: payload.clientMessageId
                ? { clientMessageId: payload.clientMessageId }
                : null,
              stage: stageConfig.id,
              contextId: payload.contextId ?? null,
            }),
            buildCopilotMessage({
              role: "assistant",
              type: "assistant",
              content: assistantReply,
              metadata: { actions: agentResult.actions ?? [] },
              stage: stageConfig.id,
              contextId: payload.contextId ?? null,
            }),
          ],
          limit: 20,
          now: new Date(),
        });

        const actions = Array.isArray(agentResult.actions)
          ? agentResult.actions
          : [];

        let updatedJobSnapshot = null;
        let updatedRefinedSnapshot = null;
        let updatedAssets = null;

        if (actions.length > 0) {
          const latestJob = await loadJobForUserLocal({
            firestore,
            jobId: payload.jobId,
            userId,
          });
          updatedJobSnapshot = buildJobSnapshot(latestJob);

          const touchedRefinedFields = actions.some((action) =>
            typeof action?.type === "string"
              ? action.type.startsWith("refined_")
              : false
          );
          if (touchedRefinedFields) {
            updatedRefinedSnapshot = await loadRefinedSnapshotLocal({
              firestore,
              jobId: payload.jobId,
            });
          }

          const assetActions = actions.filter(
            (action) =>
              action?.type === "asset_update" ||
              action?.type === "asset_batch_update"
          );
          if (assetActions.length > 0) {
            const collected = [];
            assetActions.forEach((action) => {
              if (Array.isArray(action.assets)) {
                collected.push(...action.assets);
              } else if (action.asset) {
                collected.push(action.asset);
              }
            });
            updatedAssets = collected.length > 0 ? collected : null;
          }
        }

        if (payload.stage === "refine" && actions.length > 0) {
          const refinedUpdates = [];
          actions.forEach((action) => {
            if (action?.type === "field_update" && action.fieldId) {
              refinedUpdates.push({
                fieldId: action.fieldId,
                value: action.value,
              });
            } else if (
              action?.type === "field_batch_update" &&
              action.fields &&
              typeof action.fields === "object"
            ) {
              Object.entries(action.fields).forEach(([fieldId, value]) => {
                refinedUpdates.push({ fieldId, value });
              });
            }
          });
          if (refinedUpdates.length > 0) {
            await syncRefinedFieldsLocal({
              firestore,
              job,
              jobId: payload.jobId,
              updates: refinedUpdates,
            });
            updatedRefinedSnapshot = await loadRefinedSnapshotLocal({
              firestore,
              jobId: payload.jobId,
            });
          }
        }

        return res.json({
          taskType,
          result: {
            jobId: payload.jobId,
            messages: serializeMessages(history),
            actions,
            updatedJobSnapshot,
            updatedRefinedSnapshot,
            updatedAssets,
          },
        });
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

      const enrichedContext = await enrichContextForTask({
        taskType,
        context,
        firestore,
        logger,
        userId
      });

      if (enrichedContext?._skipLlm) {
        const skip = enrichedContext._skipLlm;
        if (skip.payload) {
          return res.json({
            taskType,
            result: {
              ...skip.payload,
              provider: skip.payload.provider ?? null,
              model: skip.payload.model ?? null
            }
          });
        }
        return res.json({
          taskType,
          result: {
            provider: null,
            model: null,
            candidates: [],
            metadata: null,
            error: {
              reason: skip.reason,
              message: "Required intake not complete; LLM not invoked."
            }
          }
        });
      }

      const result = await dispatcher(enrichedContext);

      // Normalize responses for legacy parity
      if (taskType === LLM_CORE_TASK.SUGGEST) {
        const now = new Date();
        const candidatesMap = mapCandidatesByField(result.candidates ?? []);
        const visibleFieldIds =
          Array.isArray(enrichedContext.visibleFieldIds) &&
          enrichedContext.visibleFieldIds.length > 0
            ? enrichedContext.visibleFieldIds
            : Array.isArray(enrichedContext.emptyFieldIds) &&
                enrichedContext.emptyFieldIds.length > 0
              ? enrichedContext.emptyFieldIds
              : [];
        const suggestions = selectSuggestionsForFields(
          candidatesMap,
          visibleFieldIds
        );
        const companyId =
          enrichedContext.jobSnapshot?.companyId ??
          enrichedContext.jobDraft?.companyId ??
          enrichedContext.companyContext?.companyId ??
          null;

        if (result?.candidates?.length > 0) {
          await overwriteSuggestionDocument({
            firestore,
            logger,
            jobId,
            companyId,
            candidates: result.candidates,
            provider: result.provider,
            model: result.model,
            metadata: result.metadata,
            now
          });
        } else {
          const failurePayload = result.error
            ? {
                reason: result.error.reason ?? "llm_error",
                rawPreview: result.error.rawPreview ?? null,
                error: result.error.message ?? null
              }
            : {
                reason: "no_suggestions",
                rawPreview: null,
                error: "LLM returned no candidates"
              };
          await persistSuggestionFailure({
            firestore,
            logger,
            jobId,
            companyId,
            reason: failurePayload.reason,
            rawPreview: failurePayload.rawPreview,
            error: failurePayload.error,
            now
          });
        }

        await recordLlmUsageFromResult({
          firestore,
          bigQuery,
          logger,
          usageContext: { userId, jobId, taskType: LLM_LOGGING_TASK.SUGGESTIONS },
          usageType: resolveUsageType(taskType),
          result
        });

        return res.json({
          taskType,
          result: {
            jobId,
            suggestions,
            updatedAt: now.toISOString(),
            refreshed: true,
            failure: result.error
              ? {
                  reason: result.error.reason ?? "llm_error",
                  rawPreview: result.error.rawPreview ?? null,
                  error: result.error.message ?? null
                }
              : null,
            provider: result.provider ?? null,
            model: result.model ?? null,
            metadata: result.metadata ?? null,
          },
        });
      }

      if (taskType === LLM_CORE_TASK.REFINE) {
      const now = new Date();
      const companyId =
        enrichedContext.jobSnapshot?.companyId ??
        enrichedContext.jobDraft?.companyId ??
        enrichedContext.companyContext?.companyId ??
        null;
      const sanitizedRefinedJob = normalizeRefinedJob(result.refinedJob ?? {});

        if (result?.refinedJob) {
          await overwriteRefinementDocument({
            firestore,
            logger,
            jobId,
            companyId,
            refinedJob: sanitizedRefinedJob,
            summary: result.summary ?? null,
            provider: result.provider,
            model: result.model,
            metadata: result.metadata,
            now
          });
        } else if (result?.error) {
          await persistRefinementFailure({
            firestore,
            logger,
            jobId,
            companyId,
            reason: result.error.reason ?? "llm_error",
            message: result.error.message ?? null,
            rawPreview: result.error.rawPreview ?? null,
            now
          });
        }

        await recordLlmUsageFromResult({
          firestore,
          bigQuery,
          logger,
          usageContext: { userId, jobId, taskType: LLM_LOGGING_TASK.REFINEMENT },
          usageType: resolveUsageType(taskType),
          result
        });

        return res.json({
          taskType,
          result: {
            jobId,
            refinedJob: sanitizedRefinedJob,
            originalJob: enrichedContext.jobSnapshot ?? {},
            summary: result.summary ?? null,
            provider: result.provider ?? null,
            model: result.model ?? null,
            updatedAt: now.toISOString(),
            refreshed: true,
            failure: result.error
              ? {
                  reason: result.error.reason ?? "llm_error",
                  message: result.error.message ?? null,
                  rawPreview: result.error.rawPreview ?? null,
                }
              : null,
          metadata: result.metadata ?? null,
        },
      });
    }

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
