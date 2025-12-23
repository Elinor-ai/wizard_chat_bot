/**
 * @file company-repository-helpers.js
 * Company repository helper functions for creation, lookup, and status updates.
 * Extracted from company-intel.js for better modularity.
 */

import { v4 as uuid } from "uuid";
import {
  CompanySchema,
  CompanyEnrichmentStatusEnum,
  CompanyJobDiscoveryStatusEnum,
  JobSchema,
} from "@wizard/core";
import { DISCOVERED_JOB_OWNER_FALLBACK } from "./config.js";
import {
  normalizeEmailDomain,
  isGenericEmailDomain,
  deriveCompanyNameFromDomain,
  determineJobSource,
} from "./utils.js";

/**
 * Ensure a company exists for a domain.
 * Creates one if not found.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {string} params.domain - Domain
 * @param {string} params.createdByUserId - User ID
 * @param {boolean} params.autoEnqueue - Auto-enqueue enrichment
 * @param {string} params.nameHint - Name hint
 * @param {string} params.locationHint - Location hint
 * @returns {Promise<Object|null>} Company result or null
 */
export async function ensureCompanyForDomain({
  firestore,
  logger,
  domain,
  createdByUserId,
  autoEnqueue = false,
  nameHint,
  locationHint
}) {
  if (!domain) {
    return null;
  }
  const normalizedDomain = domain.trim().toLowerCase();
  if (!normalizedDomain || isGenericEmailDomain(normalizedDomain)) {
    return null;
  }

  const existing = await firestore.getCompanyByDomain(normalizedDomain);
  if (existing) {
    return { domain: normalizedDomain, company: existing, created: false };
  }

  const now = new Date();
  const guessedName = nameHint ?? deriveCompanyNameFromDomain(normalizedDomain);
  const companyId = `company_${uuid()}`;
  const payload = CompanySchema.parse({
    id: companyId,
    primaryDomain: normalizedDomain,
    additionalDomains: [],
    name: guessedName ?? "",
    nameConfirmed: false,
    profileConfirmed: false,
    companyType: "company",
    employeeCountBucket: "unknown",
    enrichmentStatus: CompanyEnrichmentStatusEnum.enum.PENDING,
    jobDiscoveryStatus: CompanyJobDiscoveryStatusEnum.enum.UNKNOWN,
    lastEnrichedAt: null,
    lastJobDiscoveryAt: null,
    enrichmentQueuedAt: null,
    enrichmentStartedAt: null,
    enrichmentCompletedAt: null,
    enrichmentLockedAt: null,
    enrichmentAttempts: 0,
    enrichmentError: null,
    jobDiscoveryQueuedAt: null,
    jobDiscoveryAttempts: 0,
    confidenceScore: 0,
    sourcesUsed: [],
    fieldSources: {},
    locationHint: locationHint ?? "",
    createdAt: now,
    updatedAt: now,
    createdByUserId: createdByUserId ?? null
  });

  const company = await firestore.saveCompanyDocument(companyId, payload);
  logger?.info?.(
    { companyId, domain: normalizedDomain },
    "Created pending company record from domain"
  );
  if (autoEnqueue && payload.nameConfirmed) {
    await enqueueCompanyEnrichment({ firestore, logger, company });
  }
  return { domain: normalizedDomain, company, created: true };
}

/**
 * Ensure a company exists for an email.
 * @param {Object} params - Same as ensureCompanyForDomain
 * @returns {Promise<Object|null>} Company result or null
 */
export async function ensureCompanyForEmail({
  firestore,
  logger,
  email,
  createdByUserId,
  autoEnqueue = false,
  nameHint,
  locationHint
}) {
  const normalized = normalizeEmailDomain(email);
  if (!normalized || isGenericEmailDomain(normalized.domain)) {
    return null;
  }
  return ensureCompanyForDomain({
    firestore,
    logger,
    domain: normalized.domain,
    createdByUserId,
    autoEnqueue,
    nameHint,
    locationHint
  });
}

/**
 * Enqueue company for enrichment.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {Object} params.company - Company object
 */
export async function enqueueCompanyEnrichment({ firestore, logger, company }) {
  if (!company?.id) return;
  if (company.nameConfirmed === false) {
    logger?.info?.({ companyId: company.id }, "Skipping enrichment enqueue until name confirmed");
    return;
  }
  const now = new Date();
  await firestore.saveCompanyDocument(company.id, {
    enrichmentStatus: CompanyEnrichmentStatusEnum.enum.PENDING,
    enrichmentQueuedAt: now,
    enrichmentLockedAt: null,
    enrichmentError: null,
    updatedAt: now
  });
  logger?.info?.(
    { companyId: company.id },
    "Marked company for enrichment"
  );
}

/**
 * Ensure company enrichment is queued.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {Object} params.company - Company object
 */
export async function ensureCompanyEnrichmentQueued({ firestore, logger, company }) {
  if (!company?.id || company.nameConfirmed === false) {
    return;
  }
  if (company.enrichmentStatus === CompanyEnrichmentStatusEnum.enum.PENDING) {
    return;
  }
  await enqueueCompanyEnrichment({ firestore, logger, company });
}

/**
 * Mark enrichment as failed.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.companyId - Company ID
 * @param {string} params.reason - Failure reason
 * @param {string} params.message - Error message
 */
export async function markEnrichmentFailed({ firestore, companyId, reason, message }) {
  if (!companyId) {
    return;
  }
  const failureTime = new Date();
  await firestore.saveCompanyDocument(companyId, {
    enrichmentStatus: CompanyEnrichmentStatusEnum.enum.FAILED,
    enrichmentError: {
      reason,
      message,
      occurredAt: failureTime
    },
    enrichmentLockedAt: null,
    enrichmentCompletedAt: failureTime,
    updatedAt: failureTime,
    intelSummary: message
  });
}

/**
 * Save discovered jobs to Firestore.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {Object} params.company - Company object
 * @param {Array} params.jobs - Array of jobs
 */
export async function saveDiscoveredJobs({ firestore, logger, company, jobs }) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return;
  }
  const ownerUserId = company.createdByUserId ?? DISCOVERED_JOB_OWNER_FALLBACK;
  if (!company.createdByUserId) {
    logger?.debug?.(
      { companyId: company.id },
      "Using fallback owner for discovered jobs"
    );
  }
  const companyName =
    company.name && company.name.trim().length > 0
      ? company.name
      : deriveCompanyNameFromDomain(company.primaryDomain);
  const companyLogo =
    company.logoUrl ??
    company.brand?.logoUrl ??
    company.brand?.iconUrl ??
    "";
  for (const job of jobs) {
    const now = job.discoveredAt ?? new Date();
    const jobId = job.id ?? `discoveredJob_${uuid()}`;
    const payload = JobSchema.parse({
      id: jobId,
      ownerUserId,
      orgId: null,
      companyId: company.id,
      status: "draft",
      stateMachine: {
        currentState: "DRAFT",
        previousState: null,
        history: [],
        requiredComplete: false,
        optionalComplete: false,
        lastTransitionAt: now,
        lockedByRequestId: null
      },
      roleTitle: job.title ?? "",
      companyName,
      logoUrl: companyLogo,
      location: job.location ?? "",
      zipCode: "",
      industry: job.industry ?? company.industry ?? undefined,
      seniorityLevel: job.seniorityLevel ?? undefined,
      employmentType: job.employmentType ?? undefined,
      workModel: job.workModel ?? undefined,
      jobDescription: job.description ?? "",
      coreDuties: Array.isArray(job.coreDuties) ? job.coreDuties : [],
      mustHaves: Array.isArray(job.mustHaves) ? job.mustHaves : [],
      benefits: Array.isArray(job.benefits) ? job.benefits : [],
      salary: job.salary ?? undefined,
      salaryPeriod: job.salaryPeriod ?? undefined,
      currency: job.currency ?? undefined,
      confirmed: {},
      importContext: {
        source: job.source ?? determineJobSource(job.url, company),
        externalSource: job.source ?? null,
        externalUrl: job.url ?? null,
        sourceUrl: job.url ?? null,
        companyJobId: job.externalId ?? undefined,
        discoveredAt: job.discoveredAt ?? now,
        originalPostedAt: job.postedAt ?? null,
        importedAt: now,
        companyIntelSource: "company-intel-worker",
        // These are optional in schema (not nullable), so use undefined if not present
        overallConfidence: job.overallConfidence ?? undefined,
        fieldConfidence: job.fieldConfidence ?? undefined,
        evidenceSources: job.evidenceSources ?? []
      },
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    });
    await firestore.saveDiscoveredJob(jobId, payload);
    logger?.info?.(
      { companyId: company.id, jobId },
      "Saved discovered company job"
    );
  }
}
