/**
 * @file index.js
 * Company Intel Service - main entry point.
 *
 * ARCHITECTURE:
 * - This module re-exports all public functions from the decomposed service modules.
 * - All exports maintain the same signatures as the original company-intel.js.
 * - Internal implementation is split across:
 *   - config.js - Constants and configuration
 *   - utils.js - Pure utility functions
 *   - brandfetch-service.js - Brandfetch API integration
 *   - web-search-service.js - Web search (Google CSE, SerpAPI)
 *   - website-scraper.js - HTML parsing and career page discovery
 *   - job-extraction.js - Job extraction from various sources
 *   - job-deduplication.js - Job merging and deduplication
 *   - company-enrichment-service.js - Main enrichment orchestration
 *   - company-repository-helpers.js - Company CRUD operations
 */

// Re-export utility functions
export {
  normalizeEmailDomain,
  deriveCompanyNameFromDomain,
  extractEmailDomain,
  isGenericEmailDomain,
} from "./utils.js";

// Re-export gap analysis
export { computeCompanyGaps } from "./company-enrichment-service.js";

// Re-export web search functions
export {
  searchCompanyOnWeb,
  extractSocialLinksFromResults,
} from "./web-search-service.js";

// Re-export career page discovery
export { discoverCareerPage } from "./website-scraper.js";

// Re-export company repository helpers
export {
  ensureCompanyForDomain,
  ensureCompanyForEmail,
  enqueueCompanyEnrichment,
  ensureCompanyEnrichmentQueued,
  saveDiscoveredJobs,
} from "./company-repository-helpers.js";

// Re-export enrichment functions
export {
  runCompanyEnrichmentOnce,
  retryStuckEnrichments,
} from "./company-enrichment-service.js";

// Re-export job discovery function (now lives in job-intel module)
export { discoverJobsForCompany } from "../job-intel/job-discovery-service.js";
