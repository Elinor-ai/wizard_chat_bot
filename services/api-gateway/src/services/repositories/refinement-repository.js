/**
 * @file refinement-repository.js
 * Repository for job refinement document access.
 * Firestore access for the "jobRefinements" collection.
 */

import { JobRefinementSchema } from "@wizard/core";
import { buildJobSnapshot } from "../../wizard/job-intake.js";

const REFINEMENT_COLLECTION = "jobRefinements";

/**
 * Load refinement document from Firestore
 *
 * Supports both direct parameters (firestore, jobId) and object parameters ({firestore, jobId}).
 *
 * @param {Object} firestore - Firestore instance or object with {firestore, jobId}
 * @param {string} jobId - Job ID (optional if firestore is an object)
 * @returns {Promise<Object|null>} Parsed refinement document or null
 */
export async function loadRefinement(firestore, jobId) {
  // Handle parameter variations for backwards compatibility
  if (
    jobId === undefined &&
    firestore &&
    typeof firestore === "object" &&
    firestore.firestore &&
    firestore.jobId
  ) {
    jobId = firestore.jobId;
    firestore = firestore.firestore;
  }

  const existing = await firestore.getDocument(REFINEMENT_COLLECTION, jobId);
  if (!existing) return null;
  const parsed = JobRefinementSchema.safeParse(existing);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

/**
 * Load refined job snapshot from Firestore
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.jobId - Job ID
 * @returns {Promise<Object|null>} Refined job snapshot or null
 */
export async function loadRefinedSnapshot({ firestore, jobId }) {
  const existing = await loadRefinement(firestore, jobId);
  if (!existing) return null;
  return existing.refinedJob ?? null;
}

/**
 * Save a refinement document to Firestore
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.jobId - Job ID
 * @param {Object} params.payload - Validated refinement payload (already parsed with JobRefinementSchema)
 * @returns {Promise<void>}
 */
export async function saveRefinement({ firestore, jobId, payload }) {
  await firestore.saveDocument(REFINEMENT_COLLECTION, jobId, payload);
}

/**
 * Sync refined field updates to Firestore
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.job - Job document
 * @param {string} params.jobId - Job ID
 * @param {Array} params.updates - Array of {fieldId, value} updates
 * @returns {Promise<Object|null>} Updated refined job or null
 */
export async function syncRefinedFields({ firestore, job, jobId, updates }) {
  if (!updates || updates.length === 0 || !jobId) {
    return null;
  }
  const existing = await loadRefinement(firestore, jobId);
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
