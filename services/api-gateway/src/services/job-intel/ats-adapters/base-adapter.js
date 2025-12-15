/**
 * @file base-adapter.js
 * Base ATS adapter interface and common utilities.
 */

/**
 * Base ATS adapter interface.
 * All ATS adapters should implement these methods.
 */
export class BaseAtsAdapter {
  /**
   * @param {Object} options
   * @param {Object} options.logger - Logger instance
   */
  constructor({ logger } = {}) {
    this.logger = logger;
    this.name = "base";
  }

  /**
   * Check if this adapter can handle the given URL.
   * @param {string} url - Career page URL
   * @returns {boolean} True if this adapter can handle the URL
   */
  canHandle(url) {
    throw new Error("canHandle() must be implemented by subclass");
  }

  /**
   * Extract company identifier from URL.
   * @param {string} url - Career page URL
   * @returns {string|null} Company identifier
   */
  extractCompanyId(url) {
    throw new Error("extractCompanyId() must be implemented by subclass");
  }

  /**
   * Fetch jobs from the ATS.
   * @param {Object} params
   * @param {string} params.url - Career page URL
   * @param {string} params.companyId - Company identifier
   * @param {Object} params.company - Company document
   * @returns {Promise<Array>} Array of job objects
   */
  async fetchJobs({ url, companyId, company }) {
    throw new Error("fetchJobs() must be implemented by subclass");
  }

  /**
   * Normalize a raw job from the ATS into our standard format.
   * @param {Object} rawJob - Raw job from ATS
   * @param {Object} company - Company document
   * @returns {Object|null} Normalized job or null
   */
  normalizeJob(rawJob, company) {
    throw new Error("normalizeJob() must be implemented by subclass");
  }

  /**
   * Get jobs from the ATS (main entry point).
   * @param {Object} params
   * @param {string} params.url - Career page URL
   * @param {Object} params.company - Company document
   * @returns {Promise<{jobs: Array, source: string, boardUrl: string|null}>}
   */
  async getJobs({ url, company }) {
    const companyId = this.extractCompanyId(url);
    if (!companyId) {
      this.logger?.debug?.({ url, adapter: this.name }, "Could not extract company ID");
      return { jobs: [], source: `ats-api:${this.name}`, boardUrl: null };
    }

    const boardUrl = this.getBoardUrl(companyId);

    try {
      const rawJobs = await this.fetchJobs({ url, companyId, company });
      const jobs = rawJobs
        .map((job) => this.normalizeJob(job, company))
        .filter(Boolean);

      this.logger?.info?.(
        {
          adapter: this.name,
          companyId,
          rawCount: rawJobs.length,
          normalizedCount: jobs.length
        },
        "ats_adapter.jobs_fetched"
      );

      return { jobs, source: `ats-api:${this.name}`, boardUrl };
    } catch (error) {
      this.logger?.error?.(
        { err: error, adapter: this.name, companyId },
        "ats_adapter.fetch_failed"
      );
      return { jobs: [], source: `ats-api:${this.name}`, boardUrl };
    }
  }

  /**
   * Get the public board URL for the company.
   * @param {string} companyId - Company identifier
   * @returns {string} Board URL
   */
  getBoardUrl(companyId) {
    throw new Error("getBoardUrl() must be implemented by subclass");
  }
}

/**
 * Parse location string into structured components.
 * @param {string} locationStr - Location string (e.g., "San Francisco, CA, USA")
 * @returns {Object} { city, country, locationRaw }
 */
export function parseLocationString(locationStr) {
  if (!locationStr || typeof locationStr !== "string") {
    return { city: null, country: null, locationRaw: null };
  }

  const trimmed = locationStr.trim();
  if (!trimmed) {
    return { city: null, country: null, locationRaw: null };
  }

  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);

  // Common patterns:
  // "City, State, Country" -> city = City, country = Country
  // "City, Country" -> city = City, country = Country
  // "Remote" -> city = null, country = null
  // "City" -> city = City, country = null

  if (/^remote$/i.test(trimmed)) {
    return { city: null, country: null, locationRaw: trimmed };
  }

  let city = null;
  let country = null;

  if (parts.length >= 3) {
    city = parts[0];
    country = parts[parts.length - 1];
  } else if (parts.length === 2) {
    city = parts[0];
    // Could be "City, Country" or "City, State"
    // Try to detect country vs state
    const second = parts[1];
    if (second.length === 2 && /^[A-Z]{2}$/.test(second.toUpperCase())) {
      // Likely a US state abbreviation
      country = "United States";
    } else {
      country = second;
    }
  } else if (parts.length === 1) {
    city = parts[0];
  }

  return { city, country, locationRaw: trimmed };
}

/**
 * Build a candidate job payload in our standard format.
 * @param {Object} params
 * @returns {Object} Candidate job payload
 */
export function buildCandidateJobPayload({
  title,
  url,
  description = null,
  location = null,
  city = null,
  country = null,
  source = "ats-api",
  evidenceSources = [],
  overallConfidence = 0.95,
  externalId = null,
  department = null,
  employmentType = null,
  workModel = null,
  postedAt = null,
  discoveredAt = new Date()
}) {
  return {
    title: title?.trim() || null,
    url: url?.trim() || null,
    description: description?.trim() || null,
    location: location?.trim() || null,
    city: city?.trim() || null,
    country: country?.trim() || null,
    source,
    evidenceSources: Array.isArray(evidenceSources) ? evidenceSources : [],
    overallConfidence,
    externalId: externalId?.toString() || null,
    department: department?.trim() || null,
    employmentType: employmentType?.trim() || null,
    workModel: workModel?.trim() || null,
    postedAt: postedAt instanceof Date ? postedAt : null,
    discoveredAt: discoveredAt instanceof Date ? discoveredAt : new Date(),
    coreDuties: [],
    mustHaves: [],
    benefits: [],
    industry: null,
    seniorityLevel: null,
    salary: null,
    salaryPeriod: null,
    currency: null,
    fieldConfidence: null,
    isPrimaryMarket: null
  };
}
