/**
 * @file company-repository.js
 * Repository for company document access.
 * Firestore access for the "companies" and "discoveredJobs" collections.
 */

import { httpError } from "@wizard/utils";
import {
  CompanySchema,
  CompanyEnrichmentStatusEnum,
  CompanyJobDiscoveryStatusEnum,
  CompanyTypeEnum
} from "@wizard/core";

const COMPANY_COLLECTION = "companies";
const USER_COLLECTION = "users";

/**
 * Ensure enum value is valid, return fallback if not
 * @param {Object} enumShape - Zod enum schema
 * @param {*} value - Value to check
 * @param {*} fallback - Fallback value
 * @returns {*} Valid enum value
 */
function ensureEnumValue(enumShape, value, fallback) {
  const allowed = Object.values(enumShape.enum ?? {});
  return allowed.includes(value) ? value : fallback;
}

/**
 * Sanitize a company record for schema validation
 * @param {Object} rawCompany - Raw company document
 * @param {string} [fallbackDomain] - Fallback domain if missing
 * @returns {Object} Sanitized company record
 */
export function sanitizeCompanyRecord(rawCompany, fallbackDomain = "") {
  const fallbackDate = new Date();
  const normalizedDomain =
    typeof rawCompany.primaryDomain === "string" && rawCompany.primaryDomain.trim().length > 0
      ? rawCompany.primaryDomain.toLowerCase()
      : (fallbackDomain ?? "").toLowerCase();

  return {
    ...rawCompany,
    name: typeof rawCompany.name === "string" ? rawCompany.name : "",
    primaryDomain: normalizedDomain,
    additionalDomains: Array.isArray(rawCompany.additionalDomains)
      ? rawCompany.additionalDomains.filter((domain) => typeof domain === "string" && domain.trim())
      : [],
    enrichmentStatus: ensureEnumValue(
      CompanyEnrichmentStatusEnum,
      rawCompany.enrichmentStatus,
      CompanyEnrichmentStatusEnum.enum.PENDING
    ),
    jobDiscoveryStatus: ensureEnumValue(
      CompanyJobDiscoveryStatusEnum,
      rawCompany.jobDiscoveryStatus,
      CompanyJobDiscoveryStatusEnum.enum.UNKNOWN
    ),
    companyType: ensureEnumValue(CompanyTypeEnum, rawCompany.companyType, CompanyTypeEnum.enum.company),
    createdAt: rawCompany.createdAt ?? rawCompany.updatedAt ?? fallbackDate,
    updatedAt: rawCompany.updatedAt ?? rawCompany.createdAt ?? fallbackDate
  };
}

/**
 * Get company by ID
 * @param {Object} firestore - Firestore instance
 * @param {string} companyId - Company ID
 * @returns {Promise<Object|null>} Company document or null
 */
export async function getCompanyById(firestore, companyId) {
  return firestore.getDocument(COMPANY_COLLECTION, companyId);
}

/**
 * Get company by ID and parse with schema
 * @param {Object} firestore - Firestore instance
 * @param {string} companyId - Company ID
 * @returns {Promise<Object|null>} Parsed company or null
 */
export async function getCompanyByIdParsed(firestore, companyId) {
  const raw = await firestore.getDocument(COMPANY_COLLECTION, companyId);
  if (!raw) return null;
  const sanitized = sanitizeCompanyRecord(raw, raw.primaryDomain);
  const parsed = CompanySchema.safeParse(sanitized);
  return parsed.success ? parsed.data : null;
}

/**
 * Get company by domain
 * @param {Object} firestore - Firestore instance
 * @param {string} domain - Company domain
 * @returns {Promise<Object|null>} Company document or null
 */
export async function getCompanyByDomain(firestore, domain) {
  return firestore.getCompanyByDomain(domain);
}

/**
 * Save/update company document
 * @param {Object} firestore - Firestore instance
 * @param {string} companyId - Company ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated company document
 */
export async function saveCompany(firestore, companyId, updates) {
  return firestore.saveCompanyDocument(companyId, {
    ...updates,
    updatedAt: updates.updatedAt ?? new Date()
  });
}

/**
 * Get company by ID and refresh with latest data
 * @param {Object} firestore - Firestore instance
 * @param {string} companyId - Company ID
 * @returns {Promise<Object>} Parsed company document
 * @throws {HttpError} If company not found or invalid
 */
export async function getCompanyRefreshed(firestore, companyId) {
  const raw = await firestore.getDocument(COMPANY_COLLECTION, companyId);
  if (!raw) {
    throw httpError(404, "Company not found");
  }
  return CompanySchema.parse(raw);
}

/**
 * List discovered jobs for a company
 * @param {Object} firestore - Firestore instance
 * @param {string} companyId - Company ID
 * @returns {Promise<Array>} Array of discovered job documents
 */
export async function listDiscoveredJobs(firestore, companyId) {
  return firestore.listDiscoveredJobs(companyId);
}

/**
 * List legacy company jobs
 * @param {Object} firestore - Firestore instance
 * @param {string} companyId - Company ID
 * @returns {Promise<Array>} Array of legacy job documents
 */
export async function listCompanyJobs(firestore, companyId) {
  return firestore.listCompanyJobs(companyId);
}

/**
 * Query companies created by a user
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of company documents
 */
export async function getCompaniesCreatedByUser(firestore, userId) {
  return firestore.queryDocuments(COMPANY_COLLECTION, "createdByUserId", "==", userId);
}

/**
 * Subscribe to company document changes
 * @param {Object} firestore - Firestore instance
 * @param {string} companyId - Company ID
 * @param {Function} onUpdate - Callback for updates
 * @param {Function} onError - Callback for errors
 * @returns {Function} Unsubscribe function
 */
export function subscribeToCompany(firestore, companyId, onUpdate, onError) {
  return firestore.subscribeDocument(COMPANY_COLLECTION, companyId, onUpdate, onError);
}

/**
 * Subscribe to discovered jobs collection
 * @param {Object} firestore - Firestore instance
 * @param {string} companyId - Company ID
 * @param {Function} onUpdate - Callback for updates
 * @param {Function} onError - Callback for errors
 * @returns {Function} Unsubscribe function
 */
export function subscribeToDiscoveredJobs(firestore, companyId, onUpdate, onError) {
  return firestore.subscribeCollection(
    "discoveredJobs",
    [{ field: "companyId", operator: "==", value: companyId }],
    onUpdate,
    onError
  );
}

/**
 * Get user document for company resolution
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User document or null
 */
export async function getUserForCompanyResolution(firestore, userId) {
  return firestore.getDocument(USER_COLLECTION, userId);
}

/**
 * List all companies accessible to a user
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.user - User object with id
 * @param {Object} params.logger - Logger instance
 * @returns {Promise<Array>} Array of parsed company documents
 */
export async function listCompaniesForUser({ firestore, user, logger }) {
  const userDoc = await firestore.getDocument(USER_COLLECTION, user.id);
  if (!userDoc) {
    throw httpError(404, "User context not found");
  }

  const companies = new Map();
  const collect = (rawCompany) => {
    if (!rawCompany?.id) {
      return;
    }
    const sanitized = sanitizeCompanyRecord(rawCompany, rawCompany.primaryDomain);
    const parsed = CompanySchema.safeParse(sanitized);
    if (!parsed.success) {
      logger?.error?.(
        { userId: user.id, companyId: rawCompany.id, issues: parsed.error?.flatten?.() },
        "User company record invalid"
      );
      return;
    }
    companies.set(parsed.data.id, parsed.data);
  };

  // Get companies by IDs in user profile
  const profileCompanyIds = Array.isArray(userDoc.profile?.companyIds)
    ? userDoc.profile.companyIds.filter((value) => typeof value === "string" && value.trim().length > 0)
    : [];
  const mainCompanyId = userDoc.profile?.mainCompanyId ?? null;
  const uniqueCompanyIds = new Set(profileCompanyIds);
  if (typeof mainCompanyId === "string" && mainCompanyId.trim().length > 0) {
    uniqueCompanyIds.add(mainCompanyId.trim());
  }
  for (const companyId of uniqueCompanyIds) {
    const direct = await firestore.getDocument(COMPANY_COLLECTION, companyId);
    collect(direct);
  }

  // Get company by domain
  const domain = userDoc.profile?.companyDomain ?? null;
  if (domain) {
    const fromDomain = await firestore.getCompanyByDomain(domain);
    collect(fromDomain);
  }

  // Get companies created by user
  const created = await firestore.queryDocuments(COMPANY_COLLECTION, "createdByUserId", "==", user.id);
  created.forEach(collect);

  return Array.from(companies.values());
}
