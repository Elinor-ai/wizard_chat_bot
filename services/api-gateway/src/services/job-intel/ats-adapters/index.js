/**
 * @file index.js
 * ATS adapters registry and router.
 *
 * This module provides:
 * - Registration of all ATS adapters
 * - URL pattern detection to route to the correct adapter
 * - Single entry point for fetching jobs from any supported ATS
 */

import { GreenhouseAdapter } from "./greenhouse-adapter.js";
import { LeverAdapter } from "./lever-adapter.js";
import { WorkableAdapter } from "./workable-adapter.js";

export { BaseAtsAdapter, buildCandidateJobPayload, parseLocationString } from "./base-adapter.js";
export { GreenhouseAdapter } from "./greenhouse-adapter.js";
export { LeverAdapter } from "./lever-adapter.js";
export { WorkableAdapter } from "./workable-adapter.js";

/**
 * Known ATS URL patterns for quick detection.
 */
export const ATS_PATTERNS = {
  greenhouse: [
    /boards\.greenhouse\.io/i,
    /\.greenhouse\.io/i,
    /jobs\.greenhouse\.io/i
  ],
  lever: [
    /jobs\.lever\.co/i,
    /\.lever\.co/i
  ],
  workable: [
    /apply\.workable\.com/i,
    /\.workable\.com/i,
    /jobs\.workable\.com/i
  ],
  // Future adapters
  ashby: [
    /jobs\.ashbyhq\.com/i,
    /\.ashbyhq\.com/i
  ],
  workday: [
    /myworkdayjobs\.com/i,
    /\.myworkday\.com/i
  ],
  smartrecruiters: [
    /jobs\.smartrecruiters\.com/i,
    /\.smartrecruiters\.com/i
  ]
};

/**
 * Detect which ATS platform a URL belongs to.
 * @param {string} url - Career page or job URL
 * @returns {string|null} ATS name or null if not recognized
 */
export function detectAtsFromUrl(url) {
  if (!url) return null;

  for (const [atsName, patterns] of Object.entries(ATS_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(url))) {
      return atsName;
    }
  }

  return null;
}

/**
 * Check if a URL is from a known ATS platform.
 * @param {string} url - Career page or job URL
 * @returns {boolean} True if URL is from a known ATS
 */
export function isAtsUrl(url) {
  return detectAtsFromUrl(url) !== null;
}

/**
 * Create all registered ATS adapters.
 * @param {Object} options
 * @param {Object} options.logger - Logger instance
 * @returns {Object} Map of adapter name to adapter instance
 */
export function createAdapters({ logger } = {}) {
  return {
    greenhouse: new GreenhouseAdapter({ logger }),
    lever: new LeverAdapter({ logger }),
    workable: new WorkableAdapter({ logger })
  };
}

/**
 * Get the adapter instance for a given URL.
 * @param {string} url - Career page URL
 * @param {Object} adapters - Map of adapters (from createAdapters)
 * @returns {Object|null} Adapter instance or null
 */
export function getAdapterForUrl(url, adapters) {
  if (!url || !adapters) return null;

  for (const adapter of Object.values(adapters)) {
    if (adapter.canHandle(url)) {
      return adapter;
    }
  }

  return null;
}

/**
 * Fetch jobs from an ATS given a URL.
 * This is the main entry point for the ATS adapters.
 *
 * @param {Object} params
 * @param {string} params.url - Career page URL
 * @param {Object} params.company - Company document
 * @param {Object} params.logger - Logger instance
 * @returns {Promise<{jobs: Array, source: string, boardUrl: string|null, adapter: string|null}>}
 */
export async function fetchJobsFromAts({ url, company, logger }) {
  if (!url) {
    return { jobs: [], source: null, boardUrl: null, adapter: null };
  }

  const adapters = createAdapters({ logger });
  const adapter = getAdapterForUrl(url, adapters);

  if (!adapter) {
    logger?.debug?.({ url }, "ats_adapters.no_adapter_found");
    return { jobs: [], source: null, boardUrl: null, adapter: null };
  }

  const result = await adapter.getJobs({ url, company });

  return {
    ...result,
    adapter: adapter.name
  };
}

/**
 * Get all supported ATS platforms.
 * @returns {Array<string>} List of supported ATS names
 */
export function getSupportedAtsPlatforms() {
  return ["greenhouse", "lever", "workable"];
}

/**
 * Check if an ATS platform is fully supported (has an adapter).
 * @param {string} atsName - ATS platform name
 * @returns {boolean} True if platform has an adapter
 */
export function isAtsPlatformSupported(atsName) {
  return getSupportedAtsPlatforms().includes(atsName?.toLowerCase());
}
