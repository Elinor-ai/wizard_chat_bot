/**
 * @file channel-repository.js
 * Repository for channel recommendation document access.
 * Firestore access for the "jobChannelRecommendations" collection.
 */

import { JobChannelRecommendationSchema } from "@wizard/core";

const CHANNEL_RECOMMENDATION_COLLECTION = "jobChannelRecommendations";

/**
 * Load channel recommendation document from Firestore
 * @param {Object} firestore - Firestore instance
 * @param {string} jobId - Job ID
 * @returns {Promise<Object|null>} Parsed channel recommendation document or null
 */
export async function loadChannelRecommendation(firestore, jobId) {
  const existing = await firestore.getDocument(
    CHANNEL_RECOMMENDATION_COLLECTION,
    jobId
  );
  if (!existing) return null;
  const parsed = JobChannelRecommendationSchema.safeParse(existing);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

/**
 * Overwrite channel recommendation document in Firestore
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {string} params.jobId - Job ID
 * @param {string} [params.companyId] - Company ID
 * @param {Array} params.recommendations - Array of channel recommendations
 * @param {string} params.provider - LLM provider name
 * @param {string} params.model - LLM model name
 * @param {Object} [params.metadata] - LLM response metadata
 * @param {Date} params.now - Timestamp for update
 * @returns {Promise<Object>} Saved channel recommendation document
 */
export async function saveChannelRecommendation({
  firestore,
  logger,
  jobId,
  companyId = null,
  recommendations,
  provider,
  model,
  metadata,
  now,
}) {
  const payload = JobChannelRecommendationSchema.parse({
    id: jobId,
    jobId,
    companyId: companyId ?? null,
    schema_version: "1",
    recommendations,
    provider,
    model,
    metadata:
      metadata && Object.keys(metadata).length > 0
        ? {
            promptTokens: metadata.promptTokens ?? null,
            responseTokens: metadata.responseTokens ?? null,
            totalTokens: metadata.totalTokens ?? null,
            finishReason: metadata.finishReason ?? null,
          }
        : undefined,
    updatedAt: now,
  });

  await firestore.saveDocument(CHANNEL_RECOMMENDATION_COLLECTION, jobId, payload);
  logger?.info?.({ jobId, count: recommendations.length }, "Persisted channel recommendations");
  return payload;
}

/**
 * Persist channel recommendation failure to Firestore
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {string} params.jobId - Job ID
 * @param {string} [params.companyId] - Company ID
 * @param {string} params.reason - Failure reason
 * @param {string} [params.message] - Error message
 * @param {string} [params.rawPreview] - Raw response preview
 * @param {Date} params.now - Timestamp for update
 * @returns {Promise<Object>} Updated channel recommendation document
 */
export async function saveChannelRecommendationFailure({
  firestore,
  logger,
  jobId,
  companyId = null,
  reason,
  message,
  rawPreview,
  now,
}) {
  const existing = await loadChannelRecommendation(firestore, jobId);

  const payload = JobChannelRecommendationSchema.parse({
    id: jobId,
    jobId,
    companyId: companyId ?? existing?.companyId ?? null,
    schema_version: "1",
    recommendations: existing?.recommendations ?? [],
    provider: existing?.provider,
    model: existing?.model,
    metadata: existing?.metadata,
    lastFailure: {
      reason,
      message: message ?? null,
      rawPreview: rawPreview ?? null,
      occurredAt: now,
    },
    updatedAt: existing?.updatedAt ?? now,
  });

  await firestore.saveDocument(CHANNEL_RECOMMENDATION_COLLECTION, jobId, payload);
  logger?.warn?.({ jobId, reason }, "Persisted channel recommendation failure");
  return payload;
}
