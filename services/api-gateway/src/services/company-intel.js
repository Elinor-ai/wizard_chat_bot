/**
 * @file company-intel.js
 * Company Intel Service - backward compatibility re-exports.
 *
 * ARCHITECTURE:
 * This file has been refactored. The implementation is now split across
 * the company-intel/ directory for better modularity:
 *
 * - company-intel/config.js - Constants and configuration
 * - company-intel/utils.js - Pure utility functions
 * - company-intel/brandfetch-service.js - Brandfetch API integration
 * - company-intel/web-search-service.js - Web search (Google CSE, SerpAPI)
 * - company-intel/website-scraper.js - HTML parsing and career page discovery
 * - company-intel/job-extraction.js - Job extraction from various sources
 * - company-intel/job-deduplication.js - Job merging and deduplication
 * - company-intel/company-enrichment-service.js - Main enrichment orchestration
 * - company-intel/company-repository-helpers.js - Company CRUD operations
 *
 * All exports maintain backward compatibility with existing imports.
 */

// Re-export all public functions from the modular implementation
export {
  // Utility functions
  normalizeEmailDomain,
  deriveCompanyNameFromDomain,
  extractEmailDomain,
  isGenericEmailDomain,
  // Gap analysis
  computeCompanyGaps,
  // Web search
  searchCompanyOnWeb,
  extractSocialLinksFromResults,
  // Career page discovery
  discoverCareerPage,
  // Company repository helpers
  ensureCompanyForDomain,
  ensureCompanyForEmail,
  enqueueCompanyEnrichment,
  ensureCompanyEnrichmentQueued,
  saveDiscoveredJobs,
  // Enrichment functions
  runCompanyEnrichmentOnce,
  retryStuckEnrichments,
  discoverJobsForCompany,
} from "./company-intel/index.js";
