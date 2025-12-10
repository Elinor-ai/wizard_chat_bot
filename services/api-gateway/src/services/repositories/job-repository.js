/**
 * @file job-repository.js
 * Repository for job document access.
 * Firestore access for the "jobs" collection used by LLM tasks.
 */

import { httpError } from "@wizard/utils";
import { JobSchema } from "@wizard/core";

const JOB_COLLECTION = "jobs";

/**
 * Load a job document by ID (no ownership check)
 * @param {Object} firestore - Firestore instance
 * @param {string} jobId - Job ID
 * @returns {Promise<Object|null>} Job document or null if not found
 */
export async function getJob(firestore, jobId) {
  const doc = await firestore.getDocument(JOB_COLLECTION, jobId);
  if (!doc) {
    return null;
  }
  const parsed = JobSchema.safeParse(doc);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

/**
 * Load a job document with ownership validation
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.jobId - Job ID
 * @param {string} params.userId - User ID for ownership check
 * @returns {Promise<Object>} Parsed job document
 * @throws {HttpError} If job not found or access denied
 */
export async function loadJobForUser({ firestore, jobId, userId }) {
  const doc = await firestore.getDocument(JOB_COLLECTION, jobId);
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

/**
 * Load a job document (raw, without parsing)
 * Used when we need the raw document for validation checks
 * @param {Object} firestore - Firestore instance
 * @param {string} jobId - Job ID
 * @returns {Promise<Object|null>} Raw job document or null
 */
export async function getJobRaw(firestore, jobId) {
  return firestore.getDocument(JOB_COLLECTION, jobId);
}

/**
 * List all jobs for a user
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID for ownership filter
 * @returns {Promise<Object[]>} Array of parsed job documents
 */
export async function listJobsForUser(firestore, userId) {
  const docs = await firestore.listCollection(JOB_COLLECTION, [
    { field: "ownerUserId", operator: "==", value: userId }
  ]);
  return docs
    .map((doc) => {
      const parsed = JobSchema.safeParse(doc);
      return parsed.success ? parsed.data : null;
    })
    .filter(Boolean);
}

/**
 * Load job with ownership check - returns null if not found or not owned
 * Suitable for validation before HTTP operations
 * @param {Object} firestore - Firestore instance
 * @param {string} jobId - Job ID
 * @param {string} userId - User ID for ownership check
 * @returns {Promise<Object|null>} Parsed job document or null
 */
export async function getJobForUser(firestore, jobId, userId) {
  const doc = await firestore.getDocument(JOB_COLLECTION, jobId);
  if (!doc || doc.ownerUserId !== userId) {
    return null;
  }
  const parsed = JobSchema.safeParse(doc);
  return parsed.success ? parsed.data : null;
}
