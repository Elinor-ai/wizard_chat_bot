/**
 * @file wizard-suggestion-service.js
 * Service layer for suggestion merge operations in the wizard.
 */

import { httpError } from "@wizard/utils";
import { JobSchema, JobSuggestionSchema } from "@wizard/core";
import { loadSuggestionDocument } from "../../wizard/job-helpers.js";
import {
  deepClone,
  setDeep,
  computeRequiredProgress,
  applyRequiredProgress,
} from "./job-lifecycle.js";

const JOB_COLLECTION = "jobs";
const SUGGESTION_COLLECTION = "jobSuggestions";

/**
 * Remove a field from the suggestion candidates after merge.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.jobId - Job ID
 * @param {string} params.fieldId - Field ID to remove
 * @param {string|null} params.companyId - Company ID
 * @param {Object} params.logger - Logger instance
 * @param {Date} params.now - Current timestamp
 */
async function acknowledgeSuggestionField({
  firestore,
  jobId,
  fieldId,
  companyId = null,
  logger,
  now,
}) {
  const existing = await loadSuggestionDocument(firestore, jobId);
  if (!existing || !existing.candidates?.[fieldId]) {
    return;
  }

  const candidateMap = { ...existing.candidates };
  delete candidateMap[fieldId];

  const payload = JobSuggestionSchema.parse({
    id: jobId,
    jobId,
    companyId: companyId ?? existing?.companyId ?? null,
    schema_version: "3",
    candidates: candidateMap,
    provider: existing.provider,
    model: existing.model,
    metadata: existing.metadata,
    lastFailure: existing.lastFailure,
    updatedAt: now,
  });

  await firestore.saveDocument(SUGGESTION_COLLECTION, jobId, payload);
  logger.info({ jobId, fieldId }, "Suggestion removed after merge");
}

/**
 * Merge a suggestion value into a job field.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {string} params.userId - User ID
 * @param {Object} params.payload - Request payload (jobId, fieldId, value)
 * @returns {Promise<Object>} Merge result
 */
export async function mergeSuggestionIntoJob({
  firestore,
  logger,
  userId,
  payload,
}) {
  const job = await firestore.getDocument(JOB_COLLECTION, payload.jobId);
  if (!job) {
    throw httpError(404, "Job not found");
  }

  const parsedJob = JobSchema.parse(job);
  const now = new Date();
  const nextJob = deepClone(parsedJob);

  setDeep(nextJob, payload.fieldId, payload.value);
  nextJob.updatedAt = now;

  const progress = computeRequiredProgress(nextJob);
  const jobWithProgress = applyRequiredProgress(nextJob, progress, now);
  const validatedJob = JobSchema.parse(jobWithProgress);

  await firestore.saveDocument(JOB_COLLECTION, payload.jobId, validatedJob);
  await acknowledgeSuggestionField({
    firestore,
    jobId: payload.jobId,
    fieldId: payload.fieldId,
    companyId: parsedJob.companyId ?? null,
    logger,
    now,
  });

  return { status: "ok" };
}
