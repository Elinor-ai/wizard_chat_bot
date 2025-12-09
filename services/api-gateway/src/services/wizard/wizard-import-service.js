/**
 * @file wizard-import-service.js
 * Service layer for company job import operations in the wizard.
 */

import { httpError } from "@wizard/utils";
import { JobSchema, CompanyDiscoveredJobSchema, CompanySchema } from "@wizard/core";
import { listCompaniesForUser } from "../repositories/index.js";
import {
  createBaseJob,
  mergeIntakeIntoJob,
  computeRequiredProgress,
  applyRequiredProgress,
  buildImportedJobState,
  ALLOWED_INTAKE_KEYS,
} from "./job-lifecycle.js";

const JOB_COLLECTION = "jobs";

/**
 * Import a company job into the wizard.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {string} params.userId - User ID
 * @param {Object} params.payload - Request payload
 * @param {Object} params.user - Full user object (for access checks)
 * @param {Object} params.userProfile - User profile
 * @returns {Promise<Object>} Import result
 */
export async function importCompanyJob({
  firestore,
  logger,
  userId,
  payload,
  user,
  userProfile,
}) {
  const allowedCompanyIds = new Set(
    Array.isArray(userProfile.companyIds)
      ? userProfile.companyIds.filter(
          (value) => typeof value === "string" && value.trim().length > 0
        )
      : []
  );
  const normalizedMainCompanyId =
    typeof userProfile.mainCompanyId === "string" &&
    userProfile.mainCompanyId.trim().length > 0
      ? userProfile.mainCompanyId.trim()
      : null;
  if (normalizedMainCompanyId) {
    allowedCompanyIds.add(normalizedMainCompanyId);
  }
  const requestedCompanyId =
    typeof payload.companyId === "string" && payload.companyId.trim().length > 0
      ? payload.companyId.trim()
      : null;
  const resolvedCompanyId = requestedCompanyId ?? normalizedMainCompanyId ?? null;
  if (!resolvedCompanyId) {
    throw httpError(400, "Company identifier required to import a job");
  }

  let hasCompanyAccess = allowedCompanyIds.has(resolvedCompanyId);
  if (!hasCompanyAccess) {
    try {
      const accessibleCompanies = await listCompaniesForUser({
        firestore,
        user,
        logger,
      });
      hasCompanyAccess = accessibleCompanies.some(
        (company) => company.id === resolvedCompanyId
      );
    } catch (error) {
      logger?.warn?.(
        { userId, companyId: resolvedCompanyId, err: error },
        "Failed to cross-check company access; defaulting to denial"
      );
      hasCompanyAccess = false;
    }
  }
  if (!hasCompanyAccess) {
    throw httpError(403, "You do not have access to this company");
  }

  const companyRecord = await firestore.getDocument("companies", resolvedCompanyId);
  if (!companyRecord) {
    throw httpError(404, "Company not found");
  }
  const company = CompanySchema.parse(companyRecord);

  const discoveredJobRecord = await firestore.getDocument(
    "discoveredJobs",
    payload.companyJobId
  );
  let importedState = null;
  let importMetadata = null;
  if (discoveredJobRecord) {
    const discoveredJob = JobSchema.parse(discoveredJobRecord);
    if (discoveredJob.companyId !== company.id) {
      throw httpError(403, "Job does not belong to the selected company");
    }
    importedState = ALLOWED_INTAKE_KEYS.reduce((acc, key) => {
      acc[key] = discoveredJob[key];
      return acc;
    }, {});
    importMetadata = discoveredJob.importContext ?? null;
  } else {
    const companyJobRecord = await firestore.getDocument(
      "companyJobs",
      payload.companyJobId
    );
    if (!companyJobRecord) {
      throw httpError(404, "Discovered job not found");
    }
    const companyJob = CompanyDiscoveredJobSchema.parse(companyJobRecord);
    if (companyJob.companyId !== company.id) {
      throw httpError(403, "Job does not belong to the selected company");
    }
    if (companyJob.isActive === false) {
      throw httpError(409, "This job is no longer marked as active");
    }
    importedState = buildImportedJobState({
      company,
      companyJob,
    });
    importMetadata = {
      source: companyJob.source ?? "external_import",
      externalUrl: companyJob.url ?? null,
      companyJobId: companyJob.id,
    };
  }

  const now = new Date();
  const jobId = `job_${crypto.randomUUID()}`;
  const baseJob = createBaseJob({
    jobId,
    userId,
    companyId: company.id,
    now,
  });

  const mergedJob = mergeIntakeIntoJob(baseJob, importedState, { userId, now });
  const progress = computeRequiredProgress(mergedJob);
  const jobWithProgress = applyRequiredProgress(mergedJob, progress, now);
  jobWithProgress.companyId = company.id;
  jobWithProgress.importContext = {
    source: importMetadata?.source ?? "external_import",
    externalSource:
      importMetadata?.externalSource ?? importMetadata?.source ?? null,
    externalUrl: importMetadata?.externalUrl ?? importMetadata?.sourceUrl ?? null,
    companyJobId: payload.companyJobId,
    importedAt: now,
  };
  const validatedJob = JobSchema.parse(jobWithProgress);
  const savedJob = await firestore.saveDocument(JOB_COLLECTION, jobId, validatedJob);

  const responseState = ALLOWED_INTAKE_KEYS.reduce((acc, key) => {
    acc[key] = savedJob[key];
    return acc;
  }, {});

  logger.info(
    { jobId, companyId: company.id, companyJobId: payload.companyJobId },
    "Imported discovered job into wizard draft"
  );

  return {
    jobId,
    state: responseState,
    includeOptional: Boolean(savedJob.stateMachine?.optionalComplete),
    updatedAt: savedJob.updatedAt ?? savedJob.createdAt ?? now,
    status: savedJob.status ?? null,
    companyId: savedJob.companyId ?? null,
    importContext: savedJob.importContext ?? null,
  };
}
