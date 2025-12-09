/**
 * @file suggestion-service.js
 * Service for handling LLM suggestion tasks.
 * Extracted from routes/llm.js to support the thin-router architecture.
 */

import { JobSuggestionSchema } from "@wizard/core";
import {
  loadSuggestionDocument,
  mapCandidatesByField,
  selectSuggestionsForFields
} from "../../wizard/job-helpers.js";
import { enrichContextForTask } from "./context-enrichment.js";
import { LLM_CORE_TASK } from "../../config/task-types.js";

const SUGGESTION_COLLECTION = "jobSuggestions";

/**
 * Overwrite suggestion document in Firestore with new candidates
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {string} params.jobId - Job ID
 * @param {string} [params.companyId] - Company ID
 * @param {Array} params.candidates - Array of suggestion candidates
 * @param {string} params.provider - LLM provider name
 * @param {string} params.model - LLM model name
 * @param {Object} [params.metadata] - LLM response metadata
 * @param {Date} params.now - Timestamp for update
 * @returns {Promise<Object>} Saved suggestion document
 */
export async function overwriteSuggestionDocument({
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

/**
 * Persist suggestion failure to Firestore
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {string} params.jobId - Job ID
 * @param {string} [params.companyId] - Company ID
 * @param {string} params.reason - Failure reason
 * @param {string} [params.rawPreview] - Raw response preview
 * @param {string} [params.error] - Error message
 * @param {Date} params.now - Timestamp for update
 * @returns {Promise<Object>} Updated suggestion document
 */
export async function persistSuggestionFailure({
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

/**
 * Handle the suggest task - orchestrates context enrichment, LLM call, and persistence.
 * This is called by the router after validation.
 *
 * @param {Object} params
 * @param {Object} params.llmClient - LLM client instance
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {string} params.userId - User ID
 * @param {string} params.jobId - Job ID
 * @param {Object} params.context - Request context
 * @returns {Promise<Object>} Result object with suggestions and metadata
 */
export async function handleSuggestTask({
  llmClient,
  firestore,
  logger,
  userId,
  jobId,
  context
}) {
  const enrichedContext = await enrichContextForTask({
    taskType: LLM_CORE_TASK.SUGGEST,
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
        candidates: [],
        metadata: null,
        error: {
          reason: skip.reason,
          message: "Required intake not complete; LLM not invoked."
        }
      }
    };
  }

  // Call LLM
  const result = await llmClient.askSuggestions(enrichedContext);

  // Post-process and persist
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
  const suggestions = selectSuggestionsForFields(candidatesMap, visibleFieldIds);
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

  return {
    skipped: false,
    llmResult: result,
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
  };
}
