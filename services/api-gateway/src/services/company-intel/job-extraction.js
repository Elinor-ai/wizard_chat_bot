/**
 * @file job-extraction.js
 * Job extraction from various sources (JSON-LD, HTML, LinkedIn).
 * Extracted from company-intel.js for better modularity.
 */

import { load as loadHtml } from "cheerio";
import { EmploymentTypeEnum, ExperienceLevelEnum, WorkModelEnum } from "@wizard/core";
import {
  ALLOW_WEB_FETCH,
  MAX_LINKEDIN_JOBS,
  LINKEDIN_JOB_HINTS,
  LINKEDIN_HIRING_REGEX,
} from "./config.js";
import {
  cleanText,
  stripHtml,
  sanitizeJobTitle,
  resolveRelativeUrl,
  determineJobSource,
  isLikelyRealJobUrl,
  coerceDate,
  inferTitleFromUrl,
} from "./utils.js";
import { extractJsonLd } from "./website-scraper.js";

/**
 * Normalize job enum value.
 * @param {*} value - Value to normalize
 * @param {Object} enumShape - Zod enum shape
 * @returns {string|undefined} Normalized value
 */
function normalizeJobEnum(value, enumShape) {
  if (!value) return undefined;
  const source = Array.isArray(value) ? value[0] : value;
  if (typeof source !== "string") {
    return undefined;
  }
  const normalized = source.toLowerCase().replace(/[\s-]+/g, "_");
  return enumShape.options.find((option) => option === normalized);
}

/**
 * Derive location from JSON-LD job location.
 * @param {*} jobLocation - Job location data
 * @returns {string} Location string
 */
function deriveLocationFromLd(jobLocation) {
  if (!jobLocation) return "";
  const location = Array.isArray(jobLocation) ? jobLocation[0] : jobLocation;
  if (typeof location === "string") {
    return location;
  }
  const address = location?.address ?? location?.addressLocality ?? {};
  if (typeof address === "string") {
    return address;
  }
  const parts = [
    address?.addressLocality ?? location?.addressLocality,
    address?.addressRegion ?? location?.addressRegion,
    address?.addressCountry ?? location?.addressCountry
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  return parts.join(", ");
}

/**
 * Build a candidate job payload.
 * @param {Object} params - Job parameters
 * @returns {Object|null} Job payload or null
 */
export function buildCandidateJobPayload({
  company,
  title,
  url,
  source = "other",
  location = "",
  description = "",
  postedAt = null,
  discoveredAt = new Date(),
  externalId = undefined,
  evidenceSources = [],
  industry = null,
  seniorityLevel = null,
  employmentType = null,
  workModel = null,
  salary = null,
  salaryPeriod = null,
  currency = null,
  coreDuties = [],
  mustHaves = [],
  benefits = [],
  overallConfidence = null,
  fieldConfidence = null
}) {
  const normalizedTitle = sanitizeJobTitle(title);
  const normalizedUrl = url ? url.trim() : null;
  if (!normalizedTitle || !normalizedUrl) {
    return null;
  }
  if (!isLikelyRealJobUrl(normalizedUrl, company)) {
    return null;
  }
  return {
    title: normalizedTitle,
    url: normalizedUrl,
    location: location?.trim() ?? "",
    description: description?.trim() ?? "",
    source,
    externalId: typeof externalId === "string" && externalId.trim().length > 0 ? externalId.trim() : undefined,
    postedAt: coerceDate(postedAt),
    discoveredAt: coerceDate(discoveredAt) ?? new Date(),
    isActive: true,
    evidenceSources: Array.from(
      new Set((Array.isArray(evidenceSources) ? evidenceSources : []).filter(Boolean))
    ),
    industry: industry ?? null,
    seniorityLevel: seniorityLevel ?? null,
    employmentType: employmentType ?? null,
    workModel: workModel ?? null,
    salary: salary ?? null,
    salaryPeriod: salaryPeriod ?? null,
    currency: currency ?? null,
    coreDuties: Array.isArray(coreDuties) ? coreDuties.filter(Boolean) : [],
    mustHaves: Array.isArray(mustHaves) ? mustHaves.filter(Boolean) : [],
    benefits: Array.isArray(benefits) ? benefits.filter(Boolean) : [],
    overallConfidence:
      typeof overallConfidence === "number"
        ? Math.min(Math.max(overallConfidence, 0), 1)
        : null,
    fieldConfidence:
      fieldConfidence && typeof fieldConfidence === "object"
        ? fieldConfidence
        : null
  };
}

/**
 * Build job from JSON-LD posting.
 * @param {Object} params
 * @param {Object} params.posting - JSON-LD posting
 * @param {Object} params.company - Company object
 * @param {string} params.baseUrl - Base URL
 * @returns {Object|null} Job object or null
 */
export function buildJobFromJsonLd({ posting, company, baseUrl }) {
  if (!posting) return null;
  const title = posting.title ?? posting.name;
  const url =
    posting.url ??
    posting.applicationUrl ??
    posting.canonicalUrl ??
    (posting.hiringOrganization?.sameAs ?? null);
  const employmentType = normalizeJobEnum(posting.employmentType, EmploymentTypeEnum);
  const workModel = normalizeJobEnum(posting.workLocationType ?? posting.workModel, WorkModelEnum);
  const seniority = normalizeJobEnum(posting.seniorityLevel, ExperienceLevelEnum);
  const salary = posting.baseSalary?.value ?? posting.salary;
  const salaryText =
    typeof salary === "object"
      ? `${salary?.value ?? ""} ${salary?.currency ?? ""}`.trim()
      : typeof salary === "string"
        ? salary
        : null;
  if (!title || !url) {
    return null;
  }
  const resolvedUrl = resolveRelativeUrl(baseUrl, url);
  const description = cleanText(posting.description ?? posting.responsibilities ?? "");
  return buildCandidateJobPayload({
    company,
    title,
    url: resolvedUrl,
    source: determineJobSource(url, company),
    location: deriveLocationFromLd(posting.jobLocation ?? posting.jobLocationType),
    description,
    postedAt: posting.datePosted ?? posting.validThrough ?? null,
    employmentType,
    workModel,
    seniorityLevel: seniority,
    salary: salaryText || null,
    currency: posting.baseSalary?.currency ?? null,
    evidenceSources: ["json-ld"]
  });
}

/**
 * Extract snippet from HTML around a match.
 * @param {string} html - HTML content
 * @param {number} startIndex - Start index
 * @param {number} endIndex - End index
 * @param {number} radius - Radius to expand
 * @returns {string} Extracted snippet
 */
export function extractSnippet(html, startIndex, endIndex, radius = 400) {
  const from = Math.max(0, startIndex - radius);
  const to = Math.min(html.length, endIndex + radius);
  return html.slice(from, to);
}

/**
 * Extract location from HTML snippet.
 * @param {string} snippet - HTML snippet
 * @returns {string} Location string
 */
export function extractLocationFromSnippet(snippet) {
  if (!snippet) return "";
  const locationAttr = snippet.match(/data-location=["']([^"']+)["']/i);
  if (locationAttr?.[1]) {
    return stripHtml(locationAttr[1]);
  }
  const ariaLocation = snippet.match(/aria-label=["'][^"']*Location[:\s-]+([^"']+)["']/i);
  if (ariaLocation?.[1]) {
    return stripHtml(ariaLocation[1]);
  }
  const locationMatch = stripHtml(snippet)
    .split(/[\n\r]+/)
    .map((line) => line.trim())
    .find((line) => /^location\b/i.test(line));
  if (locationMatch) {
    return locationMatch.replace(/^location[:\s-]*/i, "").trim();
  }
  const inlineMatch = snippet.match(/location[:\s-]+([^<]{2,120})/i);
  if (inlineMatch?.[1]) {
    return inlineMatch[1].trim();
  }
  return "";
}

/**
 * Extract description from HTML snippet.
 * @param {string} snippet - HTML snippet
 * @param {string} fallback - Fallback value
 * @returns {string} Description
 */
export function extractDescriptionFromSnippet(snippet, fallback = "") {
  if (!snippet) return fallback;
  const text = stripHtml(snippet).replace(/\s+/g, " ").trim();
  if (!text) {
    return fallback;
  }
  if (text.length > 600) {
    return `${text.slice(0, 600).trim()}…`;
  }
  return text;
}

/**
 * Extract posted date from HTML snippet.
 * @param {string} snippet - HTML snippet
 * @returns {Date|null} Posted date or null
 */
export function extractPostedAtFromSnippet(snippet) {
  if (!snippet) return null;
  const datetimeAttr = snippet.match(/datetime=["']([^"']+)["']/i);
  if (datetimeAttr?.[1]) {
    const parsed = coerceDate(datetimeAttr[1]);
    if (parsed) return parsed;
  }
  const postedMatch = stripHtml(snippet).match(/posted(?:\s+on|\s*[:\-])\s*([A-Za-z0-9,\s-]+)/i);
  if (postedMatch?.[1]) {
    const parsed = coerceDate(postedMatch[1]);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Extract job anchors from HTML using Cheerio.
 * @param {Object} params
 * @param {Object} params.$ - Cheerio instance
 * @param {string} params.baseUrl - Base URL
 * @param {Object} params.company - Company object
 * @returns {Array} Array of jobs
 */
export function extractJobAnchorsWithCheerio({ $, baseUrl, company }) {
  if (!$) return [];
  const jobs = [];
  const seen = new Set();
  const selectors = ["main a", "section a", "article a", "div a", "li a"];
  $(selectors.join(",")).each((_, element) => {
    const node = $(element);
    const href = node.attr("href");
    if (!href) return;
    const url = resolveRelativeUrl(baseUrl, href);
    if (!url) return;
    const rawText = cleanText(node.text());
    if (!rawText) return;
    const linkTextMatches = /job|role|opening|apply|career/i.test(rawText);
    const hrefMatches = /job|career|apply|opening/i.test(href);
    if (!linkTextMatches && !hrefMatches) {
      return;
    }
    const container = node.closest("[class*=job], article, li, div, section").first();
    const context = container.length > 0 ? container : node.parent();
    const description = cleanText(context.html() ?? node.html() ?? rawText);
    const location =
      cleanText(
        (context.find('[class*="location"], [data-location], .job-location').first().text() ??
          "")
      ) || "";
    const key = `${url}|${rawText}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const job = buildCandidateJobPayload({
      company,
      title: rawText,
      url,
      source: determineJobSource(url, company),
      location,
      description,
      evidenceSources: ["career-page-dom"]
    });
    if (job) {
      jobs.push(job);
    }
  });
  return jobs;
}

/**
 * Extract job anchors from HTML using regex.
 * @param {Object} params
 * @param {string} params.html - HTML content
 * @param {string} params.baseUrl - Base URL
 * @param {Object} params.company - Company object
 * @returns {Array} Array of jobs
 */
export function extractJobAnchorsFromHtml({ html, baseUrl, company }) {
  if (!html) return [];
  const matches = [];
  const anchorRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
  let match;
  while ((match = anchorRegex.exec(html))) {
    const href = match[1];
    const text = stripHtml(match[2]);
    if (!href || !text) continue;
    if (!/career|job|role|opening|position|opportunity/i.test(text)) continue;
    const url = resolveRelativeUrl(baseUrl, href);
    if (!url) continue;
    const snippet = extractSnippet(html, match.index, anchorRegex.lastIndex);
    const location = extractLocationFromSnippet(snippet);
    const description = extractDescriptionFromSnippet(snippet, text);
    const postedAt = extractPostedAtFromSnippet(snippet);
    const job = buildCandidateJobPayload({
      company,
      title: text,
      url,
      source: determineJobSource(url, company),
      location,
      description,
      postedAt,
      evidenceSources: ["career-page-crawler"]
    });
    if (job) {
      matches.push(job);
    }
    if (matches.length >= 20) {
      break;
    }
  }
  return matches;
}

/**
 * Check if title looks like a LinkedIn "Related Jobs" aggregation.
 * These are NOT real job listings - they're search result counts like "Security Professional jobs 114,757 open jobs"
 * @param {string} title - Job title to check
 * @returns {boolean} True if looks like aggregated listing (should be rejected)
 */
function looksLikeAggregatedJobListing(title) {
  if (!title) return true;
  const normalized = title.trim().toLowerCase();

  // Too generic - just "jobs" or very short
  if (normalized === "jobs" || normalized === "job" || normalized.length < 5) {
    return true;
  }

  // Contains job count patterns like "114,757 open jobs" or "500+ jobs"
  // Matches: "X,XXX jobs", "X,XXX open jobs", "XXX+ jobs"
  if (/\d[\d,]*\+?\s*(open\s+)?jobs?/i.test(title)) {
    return true;
  }

  // Pattern: "X jobs Y open jobs" (like "Security Professional jobs 114,757 open jobs")
  if (/jobs\s+\d/i.test(title)) {
    return true;
  }

  // Ends with " jobs" (like "Marketing jobs", "Technology Specialist jobs")
  // These are LinkedIn category searches, not actual job postings
  // Real job titles don't end with "jobs" - they're specific like "Marketing Manager"
  if (/\sjobs$/i.test(normalized)) {
    return true;
  }

  return false;
}

/**
 * Check if anchor looks like a LinkedIn job link.
 * @param {string} href - Anchor href
 * @param {string} text - Anchor text
 * @returns {boolean} True if looks like job link
 */
function looksLikeLinkedInJobAnchor(href = "", text = "") {
  if (!href) return false;
  const normalizedHref = href.toLowerCase();
  const normalizedText = text.toLowerCase();
  const hasHint = LINKEDIN_JOB_HINTS.some((hint) => hint.test(normalizedHref));
  const hasKeyword = /job|role|opening|position|apply|careers?/i.test(normalizedText);
  return hasHint || hasKeyword;
}

/**
 * Build LinkedIn job from anchor.
 * @param {Object} params - Parameters
 * @returns {Object|null} Job or null
 */
function buildLinkedInJobFromAnchor({ anchorMarkup, href, text, baseUrl, company, source, snippet }) {
  const url = resolveRelativeUrl(baseUrl, href);
  if (!url) {
    return null;
  }
  const isLinkedInHost = /linkedin\.com|lnkd\.in/i.test(url);
  if (!isLinkedInHost && !isLikelyRealJobUrl(url, company)) {
    return null;
  }
  let title = sanitizeJobTitle(text);
  if (!title || /apply|view job|learn more/i.test(title)) {
    const ariaMatch = /aria-label=["']([^"']+)["']/i.exec(anchorMarkup);
    if (ariaMatch) {
      const ariaTitle = sanitizeJobTitle(ariaMatch[1]);
      if (ariaTitle && !/apply|view job/i.test(ariaTitle)) {
        title = ariaTitle;
      }
    }
  }
  if (!title || /apply|view job/i.test(title)) {
    const titleAttr = /title=["']([^"']+)["']/i.exec(anchorMarkup);
    if (titleAttr) {
      const attrTitle = sanitizeJobTitle(titleAttr[1]);
      if (attrTitle && !/apply|view job/i.test(attrTitle)) {
        title = attrTitle;
      }
    }
  }
  if (!title || title.length < 3) {
    title = inferTitleFromUrl(url);
  }
  if (!title || title.length < 3) {
    return null;
  }
  // Filter out LinkedIn "Related Jobs" aggregations (e.g., "Security Professional jobs 114,757 open jobs")
  if (looksLikeAggregatedJobListing(title)) {
    return null;
  }
  const jobSource =
    source === "linkedin-post"
      ? "linkedin-post"
      : determineJobSource(url, company) || "linkedin";
  const location = extractLocationFromSnippet(snippet ?? anchorMarkup ?? "");
  const description = extractDescriptionFromSnippet(snippet ?? anchorMarkup ?? "", text);
  const postedAt = extractPostedAtFromSnippet(snippet ?? anchorMarkup ?? "");
  return buildCandidateJobPayload({
    company,
    title,
    url,
    source: jobSource,
    location,
    description,
    postedAt,
    evidenceSources: [source === "linkedin-post" ? "linkedin-post" : "linkedin-jobs-tab"]
  });
}

/**
 * Extract LinkedIn job anchors from HTML.
 * @param {Object} params
 * @param {string} params.html - HTML content
 * @param {string} params.baseUrl - Base URL
 * @param {Object} params.company - Company object
 * @returns {Array} Array of jobs
 */
export function extractLinkedInJobAnchors({ html, baseUrl, company }) {
  if (!html) return [];
  const jobs = [];
  const anchorRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
  let match;
  while ((match = anchorRegex.exec(html))) {
    const href = match[1];
    const text = stripHtml(match[2]);
    if (!looksLikeLinkedInJobAnchor(href, text)) {
      continue;
    }
    const snippet = extractSnippet(html, match.index, anchorRegex.lastIndex);
    const job = buildLinkedInJobFromAnchor({
      anchorMarkup: match[0],
      href,
      text,
      baseUrl,
      company,
      source: "linkedin",
      snippet
    });
    if (job) {
      jobs.push(job);
    }
    if (jobs.length >= MAX_LINKEDIN_JOBS) {
      break;
    }
  }
  return jobs;
}

/**
 * Extract LinkedIn post jobs from HTML.
 * @param {Object} params
 * @param {string} params.html - HTML content
 * @param {string} params.baseUrl - Base URL
 * @param {Object} params.company - Company object
 * @returns {Array} Array of jobs
 */
export function extractLinkedInPostJobs({ html, baseUrl, company }) {
  if (!html) return [];
  const jobs = [];
  const regex = LINKEDIN_HIRING_REGEX;
  let match;
  while ((match = regex.exec(html))) {
    const snippetStart = Math.max(0, match.index - 400);
    const snippetEnd = Math.min(html.length, match.index + 600);
    const snippet = html.slice(snippetStart, snippetEnd);
    let anchorMatch = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/i.exec(snippet);
    let href;
    let text;
    if (anchorMatch) {
      href = anchorMatch[1];
      text = stripHtml(anchorMatch[2]);
    } else {
      const urlMatch = snippet.match(/https?:\/\/[^\s"'<)]+/i);
      if (!urlMatch) {
        continue;
      }
      href = urlMatch[0];
      const plain = stripHtml(snippet);
      const titleMatch = plain.match(/hiring\s+(?:for|a|an)?\s+([^.!?]{3,120})/i);
      text = titleMatch?.[1] ?? plain.slice(0, 140);
    }
    const job = buildLinkedInJobFromAnchor({
      anchorMarkup: anchorMatch ? anchorMatch[0] : "",
      href,
      text,
      baseUrl,
      company,
      source: "linkedin-post",
      snippet
    });
    if (job) {
      jobs.push(job);
    }
    if (jobs.length >= MAX_LINKEDIN_JOBS) {
      break;
    }
  }
  regex.lastIndex = 0;
  return jobs;
}

/**
 * Discover jobs from career page.
 * @param {Object} params
 * @param {string} params.careerPageUrl - Career page URL
 * @param {Object} params.company - Company object
 * @param {Object} params.logger - Logger instance
 * @returns {Promise<Array>} Array of jobs
 */
export async function discoverJobsFromCareerPage({ careerPageUrl, company, logger }) {
  if (!careerPageUrl || !ALLOW_WEB_FETCH) {
    return [];
  }
  try {
    const response = await fetch(careerPageUrl, { method: "GET" });
    if (!response.ok) {
      return [];
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return [];
    }
    const body = await response.text();
    const $ = loadHtml(body);
    const structured = extractJsonLd($);
    const jsonLdJobs = Array.isArray(structured.jobPostings)
      ? structured.jobPostings
          .map((posting) =>
            buildJobFromJsonLd({
              posting,
              company,
              baseUrl: careerPageUrl
            })
          )
          .filter(Boolean)
      : [];
    const anchorJobs = extractJobAnchorsWithCheerio({
      $,
      baseUrl: careerPageUrl,
      company
    });
    return [...jsonLdJobs, ...anchorJobs];
  } catch (error) {
    logger?.debug?.({ careerPageUrl, err: error }, "Failed to crawl career page");
    return [];
  }
}

/**
 * Discover jobs from LinkedIn feed.
 * @param {Object} params
 * @param {Object} params.company - Company object
 * @param {string} params.linkedinUrl - LinkedIn URL
 * @param {Object} params.logger - Logger instance
 * @returns {Promise<Array>} Array of jobs
 */
export async function discoverJobsFromLinkedInFeed({ company, linkedinUrl, logger }) {
  if (!linkedinUrl || !ALLOW_WEB_FETCH) {
    return [];
  }
  try {
    const response = await fetch(linkedinUrl, { method: "GET" });
    if (!response.ok) {
      logger?.debug?.(
        { companyId: company.id, linkedinUrl, status: response.status },
        "LinkedIn feed fetch skipped"
      );
      return [];
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return [];
    }
    const html = await response.text();
    const results = [];
    const seen = new Set();
    const pushJob = (job) => {
      if (!job) return;
      const key = job.url ?? `${job.title}|${job.source}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      results.push(job);
    };
    extractLinkedInJobAnchors({ html, baseUrl: linkedinUrl, company }).forEach(pushJob);
    extractLinkedInPostJobs({ html, baseUrl: linkedinUrl, company }).forEach(pushJob);
    logger?.info?.(
      { companyId: company.id, linkedinUrl, jobs: results.length },
      "company.intel.linkedin_jobs"
    );
    return results.slice(0, MAX_LINKEDIN_JOBS);
  } catch (error) {
    logger?.debug?.(
      { companyId: company.id, linkedinUrl, err: error },
      "Failed to inspect LinkedIn feed"
    );
    return [];
  }
}

/**
 * Normalize intel job from LLM response.
 * @param {Object} job - Job from LLM
 * @param {Object} company - Company object
 * @returns {Object|null} Normalized job or null
 */
export function normalizeIntelJob(job, company) {
  if (!job || typeof job !== "object") {
    return null;
  }
  const candidate = buildCandidateJobPayload({
    company,
    title: job.title,
    url: job.url,
    source: job.source ?? "intel-agent",
    location: job.location?.trim?.() ?? "",
    description: job.description?.trim?.() ?? "",
    postedAt: job.postedAt ?? null,
    discoveredAt: job.discoveredAt ?? new Date(),
    externalId: job.externalId?.trim?.() || undefined,
    evidenceSources: Array.isArray(job.sourceEvidence) ? job.sourceEvidence : [],
    industry: job.industry?.trim?.() ?? null,
    seniorityLevel: job.seniorityLevel?.trim?.() ?? null,
    employmentType: job.employmentType?.trim?.() ?? null,
    workModel: job.workModel?.trim?.() ?? null,
    salary: job.salary?.trim?.() ?? null,
    salaryPeriod: job.salaryPeriod?.trim?.() ?? null,
    currency: job.currency?.trim?.() ?? null,
    coreDuties: Array.isArray(job.coreDuties) ? job.coreDuties : [],
    mustHaves: Array.isArray(job.mustHaves) ? job.mustHaves : [],
    benefits: Array.isArray(job.benefits) ? job.benefits : [],
    overallConfidence: typeof job.confidence === "number" ? job.confidence : null,
    fieldConfidence:
      job.fieldConfidence && typeof job.fieldConfidence === "object"
        ? job.fieldConfidence
        : null
  });
  if (!candidate) {
    return null;
  }
  candidate.source = job.source ?? determineJobSource(candidate.url, company);
  return candidate;
}
