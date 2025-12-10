/**
 * @file job-deduplication.js
 * Job deduplication and merging utilities.
 * Extracted from company-intel.js for better modularity.
 */

import { JOB_SOURCE_PRIORITY } from "./config.js";
import { hasValue, coerceDate } from "./utils.js";

/**
 * Clone a candidate job object.
 * @param {Object} job - Job to clone
 * @returns {Object|null} Cloned job or null
 */
export function cloneCandidateJob(job = {}) {
  if (!job) {
    return null;
  }
  return {
    ...job,
    coreDuties: Array.isArray(job.coreDuties) ? [...job.coreDuties] : [],
    mustHaves: Array.isArray(job.mustHaves) ? [...job.mustHaves] : [],
    benefits: Array.isArray(job.benefits) ? [...job.benefits] : [],
    evidenceSources: Array.isArray(job.evidenceSources)
      ? Array.from(new Set(job.evidenceSources.filter(Boolean)))
      : [],
    fieldConfidence:
      job.fieldConfidence && typeof job.fieldConfidence === "object"
        ? { ...job.fieldConfidence }
        : null
  };
}

/**
 * Score a candidate job for quality.
 * @param {Object} job - Job to score
 * @returns {number} Quality score
 */
export function scoreCandidateJob(job = {}) {
  let score = 0;
  if (hasValue(job.description)) score += 5;
  if (hasValue(job.location)) score += 2;
  if (Array.isArray(job.coreDuties) && job.coreDuties.length > 0) score += 2;
  if (Array.isArray(job.mustHaves) && job.mustHaves.length > 0) score += 1;
  if (Array.isArray(job.benefits) && job.benefits.length > 0) score += 1;
  if (hasValue(job.industry)) score += 1;
  if (hasValue(job.seniorityLevel)) score += 1;
  if (hasValue(job.employmentType)) score += 1;
  if (hasValue(job.workModel)) score += 1;
  if (Array.isArray(job.evidenceSources) && job.evidenceSources.length > 0) score += 1;
  if (job.source && job.source !== "other") score += 1;
  return score;
}

/**
 * Merge string arrays without duplicates.
 * @param {Array} a - First array
 * @param {Array} b - Second array
 * @returns {Array} Merged array
 */
export function mergeStringArrays(a = [], b = []) {
  const values = [];
  const add = (list) => {
    list.forEach((item) => {
      if (typeof item !== "string") return;
      const trimmed = item.trim();
      if (!trimmed) return;
      if (!values.includes(trimmed)) {
        values.push(trimmed);
      }
    });
  };
  add(Array.isArray(a) ? a : []);
  add(Array.isArray(b) ? b : []);
  return values;
}

/**
 * Merge field confidence maps.
 * @param {Object|null} base - Base confidence map
 * @param {Object|null} incoming - Incoming confidence map
 * @returns {Object|null} Merged confidence map
 */
export function mergeFieldConfidenceMaps(base = null, incoming = null) {
  const merged = { ...(base ?? {}) };
  Object.entries(incoming ?? {}).forEach(([field, value]) => {
    if (typeof value !== "number") {
      return;
    }
    const normalized = Math.min(Math.max(value, 0), 1);
    merged[field] = Math.max(merged[field] ?? 0, normalized);
  });
  return Object.keys(merged).length > 0 ? merged : null;
}

/**
 * Pick preferred source between two.
 * @param {string} current - Current source
 * @param {string} incoming - Incoming source
 * @returns {string|null} Preferred source
 */
export function pickPreferredSource(current, incoming) {
  if (!incoming) {
    return current ?? null;
  }
  if (!current) {
    return incoming;
  }
  const currentScore = JOB_SOURCE_PRIORITY[current] ?? 0;
  const incomingScore = JOB_SOURCE_PRIORITY[incoming] ?? 0;
  return incomingScore > currentScore ? incoming : current;
}

/**
 * Merge two candidate jobs.
 * @param {Object} existing - Existing job
 * @param {Object} incoming - Incoming job
 * @returns {Object} Merged job
 */
export function mergeCandidateJobs(existing, incoming) {
  if (!existing) {
    return cloneCandidateJob(incoming);
  }
  if (!incoming) {
    return cloneCandidateJob(existing);
  }
  const existingScore = scoreCandidateJob(existing);
  const incomingScore = scoreCandidateJob(incoming);
  const primary = incomingScore > existingScore ? cloneCandidateJob(incoming) : cloneCandidateJob(existing);
  const secondary = incomingScore > existingScore ? existing : incoming;

  const preferString = (field) => {
    if (!hasValue(primary[field]) && hasValue(secondary[field])) {
      primary[field] = secondary[field];
    }
  };
  const preferLongest = (field) => {
    const current = hasValue(primary[field]) ? primary[field] : "";
    const next = hasValue(secondary[field]) ? secondary[field] : "";
    if (!next) return;
    if (!current || next.length > current.length) {
      primary[field] = next;
    }
  };
  const mergeDates = (field, preferEarliest = false) => {
    const currentDate = coerceDate(primary[field]);
    const nextDate = coerceDate(secondary[field]);
    if (!nextDate) {
      primary[field] = currentDate;
      return;
    }
    if (!currentDate) {
      primary[field] = nextDate;
      return;
    }
    const shouldSwap = preferEarliest ? nextDate < currentDate : nextDate > currentDate;
    primary[field] = shouldSwap ? nextDate : currentDate;
  };

  preferLongest("description");
  preferString("location");
  preferString("industry");
  preferString("seniorityLevel");
  preferString("employmentType");
  preferString("workModel");
  preferString("salary");
  preferString("salaryPeriod");
  preferString("currency");
  preferString("externalId");
  primary.source = pickPreferredSource(primary.source, secondary.source);
  primary.evidenceSources = mergeStringArrays(primary.evidenceSources, secondary.evidenceSources);
  primary.coreDuties = mergeStringArrays(primary.coreDuties, secondary.coreDuties);
  primary.mustHaves = mergeStringArrays(primary.mustHaves, secondary.mustHaves);
  primary.benefits = mergeStringArrays(primary.benefits, secondary.benefits);
  mergeDates("postedAt", true);
  mergeDates("discoveredAt", true);
  primary.fieldConfidence = mergeFieldConfidenceMaps(primary.fieldConfidence, secondary.fieldConfidence);
  const normalizedSecondaryConfidence =
    typeof secondary.overallConfidence === "number"
      ? Math.min(Math.max(secondary.overallConfidence, 0), 1)
      : null;
  if (normalizedSecondaryConfidence !== null) {
    primary.overallConfidence =
      typeof primary.overallConfidence === "number"
        ? Math.max(primary.overallConfidence, normalizedSecondaryConfidence)
        : normalizedSecondaryConfidence;
  }
  return primary;
}

/**
 * Deduplicate jobs by URL or title+location.
 * @param {Array} jobs - Array of jobs
 * @returns {Array} Deduplicated jobs
 */
export function dedupeJobs(jobs = []) {
  const merged = new Map();
  let anonymousCounter = 0;
  const getKey = (job) => {
    if (!job) return `anon:${anonymousCounter++}`;
    if (typeof job.url === "string" && job.url.trim()) {
      return `url:${job.url.trim().toLowerCase()}`;
    }
    const title = typeof job.title === "string" ? job.title.trim().toLowerCase() : "";
    const location = typeof job.location === "string" ? job.location.trim().toLowerCase() : "";
    if (title || location) {
      return `title:${title}|${location}`;
    }
    return `anon:${anonymousCounter++}`;
  };
  for (const job of jobs) {
    if (!job) continue;
    const key = getKey(job);
    if (!merged.has(key)) {
      merged.set(key, cloneCandidateJob(job));
    } else {
      const existing = merged.get(key);
      merged.set(key, mergeCandidateJobs(existing, job));
    }
  }
  return Array.from(merged.values());
}
