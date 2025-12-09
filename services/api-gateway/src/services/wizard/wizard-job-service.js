/**
 * @file wizard-job-service.js
 * Service layer for job CRUD operations in the wizard.
 */

import { httpError } from "@wizard/utils";
import { JobSchema } from "@wizard/core";
import { loadCompanyProfile } from "../company-context.js";
import {
  createBaseJob,
  mergeIntakeIntoJob,
  computeRequiredProgress,
  applyRequiredProgress,
  normalizeFinalJobPayload,
  deepClone,
  setDeep,
  ALLOWED_INTAKE_KEYS,
  extractIntakeFields,
} from "./job-lifecycle.js";
import {
  loadFinalJob,
  saveFinalJob,
} from "../repositories/final-job-repository.js";

const JOB_COLLECTION = "jobs";

/**
 * Create or update a job draft.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {string} params.userId - User ID
 * @param {Object} params.payload - Request payload
 * @param {Object} params.userProfile - User profile
 * @returns {Promise<Object>} Response payload
 */
export async function createOrUpdateDraft({
  firestore,
  logger,
  userId,
  payload,
  userProfile,
}) {
  const normalizedMainCompanyId =
    typeof userProfile.mainCompanyId === "string" &&
    userProfile.mainCompanyId.trim().length > 0
      ? userProfile.mainCompanyId.trim()
      : null;
  const allowedCompanySet = new Set(
    Array.isArray(userProfile.companyIds)
      ? userProfile.companyIds.filter(
          (value) => typeof value === "string" && value.trim().length > 0
        )
      : []
  );
  if (normalizedMainCompanyId) {
    allowedCompanySet.add(normalizedMainCompanyId);
  }
  const requestedCompanyId =
    typeof payload.companyId === "string" &&
    payload.companyId.trim().length > 0
      ? payload.companyId.trim()
      : null;
  let selectedCompanyId = null;
  if (requestedCompanyId) {
    if (
      allowedCompanySet.size === 0 ||
      allowedCompanySet.has(requestedCompanyId)
    ) {
      selectedCompanyId = requestedCompanyId;
    }
  }
  const companyDocId = selectedCompanyId ?? normalizedMainCompanyId ?? null;
  const companyProfile = companyDocId
    ? await loadCompanyProfile({
        firestore,
        companyId: companyDocId,
        logger,
      })
    : null;

  const jobId =
    typeof payload.jobId === "string" && payload.jobId.length > 0
      ? payload.jobId
      : `job_${crypto.randomUUID()}`;

  logger.info(
    {
      userId,
      jobId,
      requestedCompanyId,
      selectedCompanyId,
      normalizedMainCompanyId,
      companyProfileLoaded: Boolean(companyProfile),
    },
    "wizard:draft:company-selection"
  );

  const now = new Date();
  const existing = await firestore.getDocument(JOB_COLLECTION, jobId);

  let baseJob;
  if (existing) {
    const parsed = JobSchema.safeParse(existing);
    if (parsed.success) {
      baseJob = parsed.data;
    } else {
      logger.warn(
        { jobId, issues: parsed.error.issues },
        "Existing job failed schema validation; reinitialising base job"
      );
      baseJob = createBaseJob({
        jobId,
        userId: existing.ownerUserId ?? userId,
        companyId: selectedCompanyId ?? normalizedMainCompanyId ?? null,
        companyProfile,
        now,
      });
    }
    if (!baseJob.companyId) {
      baseJob = {
        ...baseJob,
        companyId: selectedCompanyId ?? normalizedMainCompanyId ?? null,
      };
    }
  } else {
    baseJob = createBaseJob({
      jobId,
      userId,
      companyId: selectedCompanyId ?? normalizedMainCompanyId ?? null,
      companyProfile,
      now,
    });
  }

  const mergedJob = mergeIntakeIntoJob(baseJob, payload.state ?? {}, {
    userId,
    now,
  });
  const progress = computeRequiredProgress(mergedJob);
  const jobWithProgress = applyRequiredProgress(mergedJob, progress, now);
  if (
    !jobWithProgress.companyId &&
    (selectedCompanyId || normalizedMainCompanyId)
  ) {
    jobWithProgress.companyId =
      selectedCompanyId ?? normalizedMainCompanyId ?? null;
  }
  const validatedJob = JobSchema.parse(jobWithProgress);

  const savedJob = await firestore.saveDocument(
    JOB_COLLECTION,
    jobId,
    validatedJob
  );

  logger.info(
    {
      jobId,
      userId,
      step: payload.currentStepId,
      state: savedJob.stateMachine?.currentState,
    },
    "Job persisted"
  );

  const latestFields = extractIntakeFields(validatedJob);

  logger.info(
    {
      jobId,
      intakePreview: {
        location: latestFields.location ?? null,
        companyName: latestFields.companyName ?? null,
      },
    },
    "wizard:draft:response"
  );

  return {
    jobId,
    status: savedJob.status,
    state: savedJob.stateMachine?.currentState ?? "DRAFT",
    companyId: savedJob.companyId ?? null,
    intake: latestFields,
  };
}

/**
 * Get a job for a user.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.userId - User ID
 * @param {string} params.jobId - Job ID
 * @returns {Promise<Object>} Job data response
 */
export async function getJobForUser({ firestore, userId, jobId }) {
  if (!jobId) {
    throw httpError(400, "Job identifier required");
  }

  const job = await firestore.getDocument(JOB_COLLECTION, jobId);
  if (!job) {
    throw httpError(404, "Job not found");
  }

  if (job.ownerUserId && job.ownerUserId !== userId) {
    throw httpError(403, "You do not have access to this job");
  }

  const parsedJob = JobSchema.parse(job);
  const latestFields = extractIntakeFields(parsedJob);

  return {
    jobId: parsedJob.id,
    state: latestFields,
    includeOptional: Boolean(parsedJob.stateMachine?.optionalComplete),
    updatedAt: parsedJob.updatedAt ?? parsedJob.createdAt ?? null,
    status: parsedJob.status ?? null,
    companyId: parsedJob.companyId ?? null,
    importContext: parsedJob.importContext ?? null,
  };
}

/**
 * List all jobs for a user.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.userId - User ID
 * @returns {Promise<Object>} Jobs list response
 */
export async function listJobsForUser({ firestore, userId }) {
  const docs = await firestore.listCollection(JOB_COLLECTION, [
    { field: "ownerUserId", operator: "==", value: userId },
  ]);
  const normalized = docs
    .map((raw) => {
      const parsed = JobSchema.safeParse(raw);
      if (!parsed.success) {
        return null;
      }
      const job = parsed.data;
      return {
        id: job.id,
        roleTitle: job.roleTitle ?? "",
        companyName: job.companyName ?? null,
        status: job.status ?? "draft",
        location: job.location ?? "",
        updatedAt: job.updatedAt ?? job.createdAt ?? null,
      };
    })
    .filter(Boolean);

  return { jobs: normalized };
}

/**
 * Finalize a job for publishing.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {string} params.userId - User ID
 * @param {Object} params.payload - Request payload
 * @returns {Promise<Object>} Finalize response
 */
export async function finalizeJob({ firestore, logger, userId, payload }) {
  const job = await firestore.getDocument(JOB_COLLECTION, payload.jobId);
  if (!job) {
    throw httpError(404, "Job not found");
  }

  const parsedJob = JobSchema.parse(job);
  const now = new Date();
  const finalJob = normalizeFinalJobPayload(payload.finalJob);
  const source = payload.source ?? "refined";

  const progressCheck = computeRequiredProgress(finalJob);
  if (!progressCheck.allComplete) {
    throw httpError(
      422,
      "Final job must include all required fields before publishing."
    );
  }

  const nextJob = deepClone(parsedJob);
  for (const fieldId of ALLOWED_INTAKE_KEYS) {
    const value = finalJob[fieldId];
    if (value === undefined) {
      setDeep(nextJob, fieldId, undefined);
    } else {
      setDeep(nextJob, fieldId, value);
    }
  }
  nextJob.confirmed = {
    ...(nextJob.confirmed ?? {}),
    ...finalJob,
  };
  nextJob.updatedAt = now;

  const finalProgress = computeRequiredProgress(nextJob);
  const jobWithProgress = applyRequiredProgress(nextJob, finalProgress, now);
  const validatedJob = JobSchema.parse(jobWithProgress);
  await firestore.saveDocument(JOB_COLLECTION, payload.jobId, validatedJob);

  await saveFinalJob({
    firestore,
    logger,
    jobId: payload.jobId,
    companyId: validatedJob.companyId ?? null,
    finalJob,
    source,
    now,
  });

  return {
    jobId: payload.jobId,
    finalJob,
    source,
  };
}
