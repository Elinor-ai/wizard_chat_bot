/**
 * @file wizard-asset-generation-service.js
 * Service layer for asset generation pipeline in the wizard.
 *
 * ARCHITECTURE:
 * - All LLM calls go through HTTP POST /api/llm.
 * - The service does NOT import or call llmClient directly.
 * - Follows the same pattern as golden-interviewer/service.js.
 */

import { v4 as uuid } from "uuid";
import { httpError } from "@wizard/utils";
import {
  CampaignSchema,
  JobAssetStatusEnum,
  JobAssetRunStatusEnum,
} from "@wizard/core";
import { createAssetPlan } from "../../llm/domain/asset-plan.js";
import { LLM_CORE_TASK } from "../../config/task-types.js";
import {
  loadCompanyProfile,
  buildTailoredCompanyContext,
} from "../company-context.js";
import { buildJobSnapshot } from "../../wizard/job-intake.js";
import {
  loadFinalJob,
  saveAssetRecord,
  saveAssetRun,
  serializeJobAsset,
  serializeAssetRun,
} from "../repositories/index.js";

// =============================================================================
// CONSTANTS
// =============================================================================

const JOB_COLLECTION = "jobs";
const ASSET_STATUS = JobAssetStatusEnum.enum;
const RUN_STATUS = JobAssetRunStatusEnum.enum;

// =============================================================================
// HELPERS
// =============================================================================

function buildPlanKey(channelId, formatId) {
  return `${channelId}:${formatId}`;
}

function buildAssetId(jobId, channelId, formatId) {
  return `${jobId}:${buildPlanKey(channelId, formatId)}`;
}

function incrementRunStats(stats, metadata, succeeded) {
  if (!stats) return stats;
  if (succeeded) {
    stats.assetsCompleted = (stats.assetsCompleted ?? 0) + 1;
  }
  if (metadata) {
    const promptTokens = Number(
      metadata.promptTokens ?? metadata.prompt_tokens
    );
    const responseTokens = Number(
      metadata.responseTokens ?? metadata.response_tokens
    );
    if (!Number.isNaN(promptTokens)) {
      stats.promptTokens = (stats.promptTokens ?? 0) + promptTokens;
    }
    if (!Number.isNaN(responseTokens)) {
      stats.responseTokens = (stats.responseTokens ?? 0) + responseTokens;
    }
  }
  return stats;
}

function createAssetRecordsFromPlan({
  jobId,
  ownerUserId,
  companyId = null,
  plan,
  sourceJobVersion,
  now,
}) {
  const records = new Map();
  plan.items.forEach((item) => {
    const record = {
      id: buildAssetId(jobId, item.channelId, item.formatId),
      jobId,
      companyId,
      ownerUserId,
      channelId: item.channelId,
      formatId: item.formatId,
      artifactType: item.artifactType,
      blueprintVersion: plan.version,
      status: ASSET_STATUS.PENDING,
      planId: item.planId,
      batchKey: item.batchKey,
      requiresMaster: item.requiresMaster,
      derivedFromAssetId: item.derivedFromFormatId
        ? buildAssetId(jobId, item.channelId, item.derivedFromFormatId)
        : null,
      derivedFromFormatId: item.derivedFromFormatId ?? null,
      sourceJobVersion,
      createdAt: now,
      updatedAt: now,
    };
    records.set(item.planId, record);
  });
  return records;
}

function buildChannelMetaMap(channelMeta = []) {
  const map = {};
  channelMeta.forEach((meta) => {
    if (!meta?.id) return;
    map[meta.id] = meta;
  });
  return map;
}

function buildMasterContext(record) {
  if (!record) return null;
  return {
    plan_id: record.planId ?? buildPlanKey(record.channelId, record.formatId),
    rationale: record.llmRationale ?? null,
    content: record.content ?? {},
  };
}

const SOCIAL_POST_FORMAT_IDS = new Set(["LINKEDIN_FEED_POST"]);
const SOCIAL_BATCH_KEYS = new Set(["linkedin_feed"]);

function resolvePlanItemTask(planItem) {
  if (!planItem) return null;
  if (planItem.artifactType === "image_prompt") {
    return LLM_CORE_TASK.IMAGE_PROMPT_GENERATION;
  }
  if (
    planItem.artifactType === "video_script" ||
    planItem.artifactType === "script"
  ) {
    return "video_script";
  }
  if (
    SOCIAL_POST_FORMAT_IDS.has(planItem.formatId) ||
    (planItem.batchKey && SOCIAL_BATCH_KEYS.has(planItem.batchKey))
  ) {
    return "social_posts";
  }
  return null;
}

// =============================================================================
// ASSET GENERATION SERVICE CLASS
// =============================================================================

export class AssetGenerationService {
  /**
   * @param {object} options
   * @param {object} options.firestore - Firestore adapter
   * @param {object} options.logger - Logger instance
   * @param {string} options.apiBaseUrl - Base URL for internal API calls (e.g., "http://127.0.0.1:4000")
   */
  constructor({ firestore, logger, apiBaseUrl }) {
    this.firestore = firestore;
    this.logger = logger;
    this.apiBaseUrl = apiBaseUrl;
  }

  // ===========================================================================
  // INTERNAL: HTTP call to /api/llm
  // ===========================================================================

  /**
   * Call the LLM via HTTP POST /api/llm
   * This is the ONLY way this service invokes LLM models.
   *
   * @param {object} options
   * @param {string} options.authToken - Bearer token for authentication
   * @param {string} options.taskType - LLM task type
   * @param {object} options.context - Context to pass to the LLM
   * @returns {Promise<object>} - The LLM result
   */
  async callLlmApi({ authToken, taskType, context }) {
    const url = `${this.apiBaseUrl}/api/llm`;

    this.logger.info(
      {
        taskType,
        jobId: context.jobId,
        planId: context.planItem?.planId ?? context.planItems?.[0]?.planId,
      },
      "asset-generation.llm_api.request"
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        taskType,
        context,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      this.logger.error(
        {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          taskType,
        },
        "asset-generation.llm_api.http_error"
      );
      throw new Error(`LLM API call failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    this.logger.info(
      {
        taskType,
        hasResult: !!data?.result,
      },
      "asset-generation.llm_api.response"
    );

    return data?.result ?? null;
  }

  // ===========================================================================
  // ASSET GENERATION PIPELINE
  // ===========================================================================

  /**
   * Run the asset generation pipeline.
   * Makes internal HTTP calls to /api/llm for each asset type.
   *
   * @param {object} options
   * @param {string} options.authToken - Bearer token for authentication
   * @param {object} options.plan - Asset plan
   * @param {Map} options.assetRecords - Asset records map
   * @param {object} options.jobSnapshot - Job snapshot for context
   * @param {object} options.channelMetaMap - Channel metadata map
   * @param {object|null} options.companyProfile - Company profile for context
   * @param {string} options.jobId - Job ID
   * @returns {Promise<object>} - Pipeline result with stats, hasFailures, records
   */
  async runPipeline({
    authToken,
    plan,
    assetRecords,
    jobSnapshot,
    channelMetaMap,
    companyProfile,
    jobId,
  }) {
    const stats = {
      assetsPlanned: plan.items.length,
      assetsCompleted: 0,
      promptTokens: 0,
      responseTokens: 0,
    };
    let hasFailures = false;

    const companyContextCache = new Map();
    const getCompanyContext = (taskType) => {
      if (!companyProfile || !taskType) {
        return "";
      }
      if (!companyContextCache.has(taskType)) {
        const context = buildTailoredCompanyContext(companyProfile, taskType);
        companyContextCache.set(taskType, context);
      }
      return companyContextCache.get(taskType) ?? "";
    };

    const markFailure = async (record, reason, message, rawPreview, metadata) => {
      const now = new Date();
      record.status = ASSET_STATUS.FAILED;
      record.failure = {
        reason: reason ?? "asset_generation_failed",
        message: message ?? null,
        rawPreview: rawPreview ?? null,
        occurredAt: now,
      };
      record.updatedAt = now;
      incrementRunStats(stats, metadata, false);
      await saveAssetRecord({ firestore: this.firestore, record });
      hasFailures = true;
    };

    const markSuccess = async (record, assetPayload, provider, model, metadata) => {
      const now = new Date();
      record.status = ASSET_STATUS.READY;
      record.provider = provider ?? null;
      record.model = model ?? null;
      record.llmRationale = assetPayload?.rationale ?? null;
      record.content = assetPayload?.content ?? null;
      record.failure = undefined;
      record.updatedAt = now;
      incrementRunStats(stats, metadata, true);
      await saveAssetRecord({ firestore: this.firestore, record });
    };

    const markGenerating = async (record) => {
      if (!record) return;
      record.status = ASSET_STATUS.GENERATING;
      record.updatedAt = new Date();
      await saveAssetRecord({ firestore: this.firestore, record });
    };

    // Process master assets
    const masters = plan.masters ?? [];
    for (const item of masters) {
      const record = assetRecords.get(item.planId);
      if (!record) continue;

      await markGenerating(record);
      const taskType = resolvePlanItemTask(item);
      const companyContext = getCompanyContext(taskType);

      try {
        const result = await this.callLlmApi({
          authToken,
          taskType: LLM_CORE_TASK.ASSET_MASTER,
          context: {
            planItem: item,
            channelMeta: channelMetaMap[item.channelId],
            jobSnapshot,
            companyContext,
            jobId,
          },
        });

        if (result?.asset) {
          await markSuccess(
            record,
            result.asset,
            result.provider,
            result.model,
            result.metadata
          );
        } else {
          const error = result?.error ?? {};
          await markFailure(
            record,
            error.reason ?? "asset_master_failed",
            error.message ?? null,
            error.rawPreview ?? null,
            result?.metadata
          );
        }
      } catch (error) {
        await markFailure(
          record,
          "asset_master_http_failed",
          error.message ?? "HTTP call to /api/llm failed",
          null,
          null
        );
      }
    }

    // Process standalone assets by channel batch
    const standalone = plan.standalone ?? [];
    const standaloneByChannel = new Map();
    standalone.forEach((item) => {
      const list = standaloneByChannel.get(item.channelId) ?? [];
      list.push(item);
      standaloneByChannel.set(item.channelId, list);
    });

    for (const [channelId, items] of standaloneByChannel.entries()) {
      const records = items
        .map((item) => assetRecords.get(item.planId))
        .filter(Boolean);

      for (const record of records) {
        await markGenerating(record);
      }

      const batchTaskType =
        items
          .map((planItem) => resolvePlanItemTask(planItem))
          .find((type) => Boolean(type)) ?? null;
      const batchCompanyContext = getCompanyContext(batchTaskType);

      try {
        const result = await this.callLlmApi({
          authToken,
          taskType: LLM_CORE_TASK.ASSET_CHANNEL_BATCH,
          context: {
            planItems: items,
            jobSnapshot,
            channelMetaMap,
            companyContext: batchCompanyContext,
            jobId,
          },
        });

        if (result?.error) {
          for (const record of records) {
            await markFailure(
              record,
              result.error.reason ?? "asset_channel_batch_failed",
              result.error.message ?? null,
              result.error.rawPreview ?? null,
              result.metadata
            );
          }
          continue;
        }

        const assetMap = new Map();
        (result.assets ?? []).forEach((asset) => {
          const planId = asset.planId ?? asset.plan_id ?? null;
          if (!planId) return;
          assetMap.set(planId, asset);
        });

        for (const item of items) {
          const record = assetRecords.get(item.planId);
          if (!record) continue;
          const assetPayload = assetMap.get(item.planId);
          if (!assetPayload) {
            await markFailure(
              record,
              "asset_missing",
              `LLM batch missing payload for ${item.planId}`,
              null,
              result.metadata
            );
            continue;
          }
          await markSuccess(
            record,
            assetPayload,
            result.provider,
            result.model,
            result.metadata
          );
        }
      } catch (error) {
        for (const record of records) {
          await markFailure(
            record,
            "asset_channel_batch_http_failed",
            error.message ?? "HTTP call to /api/llm failed",
            null,
            null
          );
        }
      }
    }

    // Process adaptations
    const adaptations = plan.adaptations ?? [];
    for (const item of adaptations) {
      const record = assetRecords.get(item.planId);
      if (!record) continue;

      const masterPlanId = buildPlanKey(item.channelId, item.derivedFromFormatId);
      const masterRecord = assetRecords.get(masterPlanId);
      if (!masterRecord || masterRecord.status !== ASSET_STATUS.READY) {
        await markFailure(
          record,
          "missing_master_asset",
          "Master asset missing or not ready",
          null,
          null
        );
        continue;
      }

      await markGenerating(record);
      const taskType = resolvePlanItemTask(item);
      const companyContext = getCompanyContext(taskType);

      try {
        const result = await this.callLlmApi({
          authToken,
          taskType: LLM_CORE_TASK.ASSET_ADAPT,
          context: {
            planItem: item,
            masterAsset: buildMasterContext(masterRecord),
            jobSnapshot,
            channelMeta: channelMetaMap[item.channelId],
            companyContext,
            jobId,
          },
        });

        if (result?.asset) {
          await markSuccess(
            record,
            result.asset,
            result.provider,
            result.model,
            result.metadata
          );
        } else {
          const error = result?.error ?? {};
          await markFailure(
            record,
            error.reason ?? "asset_adapt_failed",
            error.message ?? null,
            error.rawPreview ?? null,
            result?.metadata
          );
        }
      } catch (error) {
        await markFailure(
          record,
          "asset_adapt_http_failed",
          error.message ?? "HTTP call to /api/llm failed",
          null,
          null
        );
      }
    }

    return {
      stats,
      hasFailures,
      records: Array.from(assetRecords.values()),
    };
  }

  // ===========================================================================
  // MAIN ENTRY POINT
  // ===========================================================================

  /**
   * Generate campaign assets for a job.
   *
   * @param {object} options
   * @param {string} options.authToken - Bearer token for authentication
   * @param {string} options.userId - User ID
   * @param {object} options.payload - Request payload (jobId, channelIds, source)
   * @returns {Promise<object>} - Generation result
   */
  async generateAssets({ authToken, userId, payload }) {
    const job = await this.firestore.getDocument(JOB_COLLECTION, payload.jobId);
    if (!job) {
      throw httpError(404, "Job not found");
    }
    if (job.ownerUserId && job.ownerUserId !== userId) {
      throw httpError(403, "You do not have access to this job");
    }

    const finalJob = await loadFinalJob(this.firestore, payload.jobId);
    if (!finalJob?.job) {
      throw httpError(409, "Finalize the job before generating assets.");
    }

    const channelIds = Array.from(new Set(payload.channelIds));
    const plan = createAssetPlan({ channelIds });
    if (!plan.items || plan.items.length === 0) {
      throw httpError(
        400,
        "No asset formats available for the selected channels."
      );
    }

    const now = new Date();
    const sourceJobVersion = payload.source ?? finalJob.source ?? "refined";
    const jobSnapshot = finalJob.job ?? buildJobSnapshot(job);
    const companyProfile =
      job.companyId && job.companyId.trim().length > 0
        ? await loadCompanyProfile({
            firestore: this.firestore,
            companyId: job.companyId,
            logger: this.logger,
          })
        : null;

    const assetRecords = createAssetRecordsFromPlan({
      jobId: payload.jobId,
      ownerUserId: job.ownerUserId ?? userId,
      companyId: job.companyId ?? null,
      plan,
      sourceJobVersion,
      now,
    });

    // Save initial asset records
    for (const record of assetRecords.values()) {
      await saveAssetRecord({ firestore: this.firestore, record });
    }

    // Create run record
    let run = {
      id: `run_${uuid()}`,
      jobId: payload.jobId,
      companyId: job.companyId ?? null,
      ownerUserId: job.ownerUserId ?? userId,
      blueprintVersion: plan.version,
      channelIds,
      formatIds: plan.items.map((item) => item.formatId),
      status: RUN_STATUS.RUNNING,
      stats: {
        assetsPlanned: plan.items.length,
        assetsCompleted: 0,
        promptTokens: 0,
        responseTokens: 0,
      },
      startedAt: now,
      completedAt: null,
    };

    run = await saveAssetRun({ firestore: this.firestore, run });

    // Run the pipeline
    const { stats, hasFailures, records } = await this.runPipeline({
      authToken,
      plan,
      assetRecords,
      jobSnapshot,
      channelMetaMap: buildChannelMetaMap(plan.channelMeta),
      companyProfile,
      jobId: payload.jobId,
    });

    // Update run with final stats
    run.stats = stats;
    run.status = hasFailures ? RUN_STATUS.FAILED : RUN_STATUS.COMPLETED;
    run.completedAt = new Date();
    if (!hasFailures) {
      run.error = undefined;
    } else {
      run.error = {
        reason: "partial_failure",
        message: "One or more assets failed to generate",
      };
    }
    run = await saveAssetRun({ firestore: this.firestore, run });

    return {
      jobId: payload.jobId,
      run: serializeAssetRun(run),
      assets: records.map(serializeJobAsset),
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create an AssetGenerationService instance.
 *
 * @param {object} options
 * @param {object} options.firestore - Firestore adapter
 * @param {object} options.logger - Logger instance
 * @param {string} options.apiBaseUrl - Base URL for internal API calls
 * @returns {AssetGenerationService}
 */
export function createAssetGenerationService({ firestore, logger, apiBaseUrl }) {
  return new AssetGenerationService({ firestore, logger, apiBaseUrl });
}
