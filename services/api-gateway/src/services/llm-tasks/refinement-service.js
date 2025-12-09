/**
 * @file refinement-service.js
 * Service for handling LLM job refinement tasks.
 * Extracted from routes/llm.js to support the thin-router architecture.
 */

import { JobRefinementSchema } from "@wizard/core";
import { loadRefinementDocument } from "../../wizard/job-helpers.js";
import { enrichContextForTask } from "./context-enrichment.js";
import { LLM_CORE_TASK } from "../../config/task-types.js";

const REFINEMENT_COLLECTION = "jobRefinements";

/**
 * Normalize seniority level value to canonical form
 * @param {string} value - Raw seniority level value
 * @returns {string|null} Normalized value or null
 */
export function normalizeSeniorityLevel(value) {
  if (!value || typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("entry")) return "entry";
  if (normalized.includes("mid")) return "mid";
  if (normalized.includes("senior")) return "senior";
  if (normalized.includes("lead")) return "lead";
  if (normalized.includes("executive")) return "executive";
  return null;
}

/**
 * Normalize refined job object, standardizing field values
 * @param {Object} refinedJob - Raw refined job object
 * @returns {Object} Normalized refined job
 */
export function normalizeRefinedJob(refinedJob = {}) {
  const normalized = { ...refinedJob };
  const seniority = normalizeSeniorityLevel(refinedJob.seniorityLevel);
  if (seniority) {
    normalized.seniorityLevel = seniority;
  }
  return normalized;
}

/**
 * Overwrite refinement document in Firestore
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {string} params.jobId - Job ID
 * @param {string} [params.companyId] - Company ID
 * @param {Object} params.refinedJob - Refined job data
 * @param {string} [params.summary] - Refinement summary
 * @param {string} params.provider - LLM provider name
 * @param {string} params.model - LLM model name
 * @param {Object} [params.metadata] - LLM response metadata
 * @param {Date} params.now - Timestamp for update
 * @returns {Promise<Object>} Saved refinement document
 */
export async function overwriteRefinementDocument({
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

/**
 * Persist refinement failure to Firestore
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {string} params.jobId - Job ID
 * @param {string} [params.companyId] - Company ID
 * @param {string} params.reason - Failure reason
 * @param {string} [params.message] - Error message
 * @param {string} [params.rawPreview] - Raw response preview
 * @param {Date} params.now - Timestamp for update
 * @returns {Promise<Object>} Updated refinement document
 */
export async function persistRefinementFailure({
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

/**
 * Handle the refine task - orchestrates context enrichment, LLM call, and persistence.
 * This is called by the router after validation.
 *
 * @param {Object} params
 * @param {Object} params.llmClient - LLM client instance
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {string} params.userId - User ID
 * @param {string} params.jobId - Job ID
 * @param {Object} params.context - Request context
 * @returns {Promise<Object>} Result object with refined job and metadata
 */
export async function handleRefineTask({
  llmClient,
  firestore,
  logger,
  userId,
  jobId,
  context
}) {
  const enrichedContext = await enrichContextForTask({
    taskType: LLM_CORE_TASK.REFINE,
    context,
    firestore,
    logger,
    userId
  });

  // Check for cache hit (skip LLM)
  if (enrichedContext?._skipLlm) {
    const skip = enrichedContext._skipLlm;
    if (skip.payload) {
      return {
        skipped: true,
        result: {
          ...skip.payload,
          provider: skip.payload.provider ?? null,
          model: skip.payload.model ?? null
        }
      };
    }
    return {
      skipped: true,
      result: {
        provider: null,
        model: null,
        refinedJob: {},
        originalJob: {},
        summary: null,
        metadata: null,
        error: {
          reason: skip.reason,
          message: "Refinement skipped."
        }
      }
    };
  }

  // Call LLM
  const result = await llmClient.askRefineJob(enrichedContext);

  // Post-process and persist
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

  return {
    skipped: false,
    llmResult: result,
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
  };
}
