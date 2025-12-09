/**
 * @file context-enrichment.js
 * Shared helper functions for LLM task context enrichment.
 * Extracted from routes/llm.js to support the thin-router architecture.
 */

import { httpError } from "@wizard/utils";
import { loadCompanyContext } from "../company-context.js";
import {
  loadSuggestionDocument,
  loadRefinementDocument,
  selectSuggestionsForFields
} from "../../wizard/job-helpers.js";
import {
  mergeIntakeIntoJob,
  buildJobSnapshot,
  computeRequiredProgress
} from "../../wizard/job-intake.js";
import { loadCopilotHistory } from "../../copilot/chat-store.js";
import {
  DEFAULT_COPILOT_STAGE,
  getToolsForStage,
  resolveStageConfig
} from "../../copilot/stages.js";
import { LLM_CORE_TASK, LLM_LOGGING_TASK } from "../../config/task-types.js";
import { loadJobForUser } from "../repositories/job-repository.js";
import {
  loadRefinedSnapshot,
  syncRefinedFields
} from "../repositories/refinement-repository.js";

// Re-export repository functions for backwards compatibility
export { loadJobForUser, loadRefinedSnapshot, syncRefinedFields };

/**
 * Enrich context for a specific task type.
 * Handles job loading, company context, caching logic, etc.
 *
 * @param {Object} params
 * @param {string} params.taskType - LLM task type
 * @param {Object} params.context - Original request context
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {string} params.userId - User ID
 * @returns {Promise<Object>} Enriched context (may include _skipLlm flag)
 */
export async function enrichContextForTask({
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
