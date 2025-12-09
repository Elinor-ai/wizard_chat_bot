/**
 * @file asset-repository.js
 * Repository for job asset and asset run persistence.
 */

import {
  JobAssetRecordSchema,
  JobAssetRunSchema,
} from "@wizard/core";

const JOB_ASSET_COLLECTION = "jobAssets";
const JOB_ASSET_RUN_COLLECTION = "jobAssetRuns";

/**
 * Normalize a raw asset record.
 * @param {Object} raw - Raw asset data
 * @returns {Object|null} Parsed asset record or null
 */
export function normalizeJobAsset(raw) {
  const parsed = JobAssetRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Normalize a raw asset run.
 * @param {Object} raw - Raw run data
 * @returns {Object|null} Parsed asset run or null
 */
export function normalizeJobAssetRun(raw) {
  const parsed = JobAssetRunSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Load all assets for a job.
 * @param {Object} firestore - Firestore instance
 * @param {string} jobId - Job ID
 * @returns {Promise<Object[]>} Array of asset records
 */
export async function loadJobAssets(firestore, jobId) {
  const docs = await firestore.queryDocuments(
    JOB_ASSET_COLLECTION,
    "jobId",
    "==",
    jobId
  );
  return docs.map(normalizeJobAsset).filter(Boolean);
}

/**
 * Load the latest asset run for a job.
 * @param {Object} firestore - Firestore instance
 * @param {string} jobId - Job ID
 * @returns {Promise<Object|null>} Latest asset run or null
 */
export async function loadLatestAssetRun(firestore, jobId) {
  const runs = await firestore.queryDocuments(
    JOB_ASSET_RUN_COLLECTION,
    "jobId",
    "==",
    jobId
  );
  const parsed = runs.map(normalizeJobAssetRun).filter(Boolean);
  parsed.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  return parsed[0] ?? null;
}

/**
 * Save an asset record.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.record - Asset record to save
 * @returns {Promise<Object>} Saved asset record
 */
export async function saveAssetRecord({ firestore, record }) {
  const payload = JobAssetRecordSchema.parse(record);
  await firestore.saveDocument(JOB_ASSET_COLLECTION, payload.id, payload);
  return payload;
}

/**
 * Save an asset run.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.run - Asset run to save
 * @returns {Promise<Object>} Saved asset run
 */
export async function saveAssetRun({ firestore, run }) {
  const payload = JobAssetRunSchema.parse(run);
  await firestore.saveDocument(JOB_ASSET_RUN_COLLECTION, payload.id, payload);
  return payload;
}

/**
 * Serialize an asset record for API response.
 * @param {Object|null} record - Asset record
 * @returns {Object|null} Serialized asset
 */
export function serializeJobAsset(record) {
  if (!record) return null;
  return {
    id: record.id,
    jobId: record.jobId,
    channelId: record.channelId,
    formatId: record.formatId,
    artifactType: record.artifactType,
    status: record.status,
    provider: record.provider ?? null,
    model: record.model ?? null,
    llmRationale: record.llmRationale ?? null,
    content: record.content ?? null,
    failure: record.failure ?? null,
    updatedAt: record.updatedAt ?? record.createdAt ?? null,
  };
}

/**
 * Serialize an asset run for API response.
 * @param {Object|null} run - Asset run
 * @returns {Object|null} Serialized run
 */
export function serializeAssetRun(run) {
  if (!run) return null;
  return {
    id: run.id,
    jobId: run.jobId,
    status: run.status,
    channelIds: run.channelIds ?? [],
    formatIds: run.formatIds ?? [],
    stats: run.stats ?? null,
    startedAt: run.startedAt ?? null,
    completedAt: run.completedAt ?? null,
    error: run.error ?? null,
  };
}
