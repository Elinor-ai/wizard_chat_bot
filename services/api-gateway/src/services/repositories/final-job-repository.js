/**
 * @file final-job-repository.js
 * Repository for final job document persistence.
 */

import { JobFinalSchema } from "@wizard/core";

const FINAL_JOB_COLLECTION = "jobFinalJobs";

/**
 * Load a finalized job document.
 * @param {Object} firestore - Firestore instance
 * @param {string} jobId - Job ID
 * @returns {Promise<Object|null>} Parsed final job document or null
 */
export async function loadFinalJob(firestore, jobId) {
  const existing = await firestore.getDocument(FINAL_JOB_COLLECTION, jobId);
  if (!existing) return null;
  const parsed = JobFinalSchema.safeParse(existing);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

/**
 * Save a finalized job document.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {string} params.jobId - Job ID
 * @param {string|null} params.companyId - Company ID
 * @param {Object} params.finalJob - Final job data
 * @param {string} params.source - Source type (original, refined, edited)
 * @param {Date} params.now - Current timestamp
 * @returns {Promise<Object>} Saved final job document
 */
export async function saveFinalJob({
  firestore,
  logger,
  jobId,
  companyId = null,
  finalJob,
  source,
  now,
}) {
  const payload = JobFinalSchema.parse({
    id: jobId,
    jobId,
    companyId: companyId ?? null,
    schema_version: "1",
    job: finalJob,
    source,
    updatedAt: now,
  });

  await firestore.saveDocument(FINAL_JOB_COLLECTION, jobId, payload);
  logger.info({ jobId, source }, "Persisted final job version");
  return payload;
}
