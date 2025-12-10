/**
 * @file utils.js
 * Pure utility functions for company intel operations.
 * Extracted from company-intel.js for better modularity.
 */

import { htmlToText } from "html-to-text";
import { GENERIC_EMAIL_DOMAINS, TRUSTED_JOB_HOSTS, JOB_URL_RED_FLAGS } from "./config.js";

/**
 * Clean HTML text to plain text.
 * @param {string} raw - Raw HTML text
 * @returns {string} Cleaned plain text
 */
export function cleanText(raw) {
  if (!raw || typeof raw !== "string") {
    return "";
  }
  return htmlToText(raw, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" }
    ]
  })
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convert string to title case.
 * @param {string} value - String to convert
 * @returns {string} Title case string
 */
export function toTitleCase(value) {
  if (!value) return "";
  return value
    .split(/[\s.-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Normalize email to extract domain.
 * @param {string} email - Email address
 * @returns {Object|null} Object with localPart and domain, or null
 */
export function normalizeEmailDomain(email) {
  if (!email || typeof email !== "string") {
    return null;
  }
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex === -1) {
    return null;
  }
  const localPart = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1).trim().toLowerCase();
  if (!domain) {
    return null;
  }
  return {
    localPart,
    domain
  };
}

/**
 * Derive company name from domain.
 * @param {string} domain - Domain name
 * @returns {string} Derived company name
 */
export function deriveCompanyNameFromDomain(domain) {
  if (!domain) return "";
  const cleaned = domain.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, " ");
  const fallback = cleaned || domain.split(".")[0];
  return toTitleCase(fallback);
}

/**
 * Sanitize string by trimming.
 * @param {*} value - Value to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Check if value has content.
 * @param {*} value - Value to check
 * @returns {boolean} True if has content
 */
export function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Normalize hex color value.
 * @param {string} value - Color value
 * @returns {string|null} Normalized hex color or null
 */
export function normalizeHex(value) {
  const raw = sanitizeString(value);
  if (!raw) return null;
  return raw.startsWith("#") ? raw : `#${raw}`;
}

/**
 * Normalize URL to ensure https prefix.
 * @param {*} value - URL value
 * @returns {string|null} Normalized URL or null
 */
export function normalizeUrl(value) {
  if (!value || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return `https://${trimmed.replace(/^\/+/, "")}`;
  } catch {
    return null;
  }
}

/**
 * Normalize domain to lowercase.
 * @param {string} value - Domain value
 * @returns {string} Normalized domain
 */
export function normalizeDomain(value) {
  return sanitizeString(value).toLowerCase();
}

/**
 * Coerce value to Date object.
 * @param {*} value - Value to coerce
 * @returns {Date|null} Date object or null
 */
export function coerceDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

/**
 * Strip HTML tags from string.
 * @param {string} value - HTML string
 * @returns {string} Plain text
 */
export function stripHtml(value) {
  if (!value) return "";
  return value.replace(/<[^>]*>/g, "").trim();
}

/**
 * Sanitize job title.
 * @param {string} value - Job title
 * @returns {string} Sanitized title
 */
export function sanitizeJobTitle(value) {
  if (!value || typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Extract email domain.
 * @param {string} email - Email address
 * @returns {string|null} Domain or null
 */
export function extractEmailDomain(email) {
  return normalizeEmailDomain(email)?.domain ?? null;
}

/**
 * Check if domain is a generic email provider.
 * @param {string} domain - Domain to check
 * @returns {boolean} True if generic
 */
export function isGenericEmailDomain(domain) {
  if (!domain) return true;
  return GENERIC_EMAIL_DOMAINS.has(domain.toLowerCase());
}

/**
 * Check if hostname is suspicious.
 * @param {string} hostname - Hostname to check
 * @returns {boolean} True if suspicious
 */
export function isSuspiciousHost(hostname = "") {
  return JOB_URL_RED_FLAGS.some((fragment) => hostname.includes(fragment));
}

/**
 * Check if URL is likely a real job URL.
 * @param {string} url - URL to check
 * @param {Object} company - Company object
 * @returns {boolean} True if likely real
 */
export function isLikelyRealJobUrl(url, company) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (isSuspiciousHost(host)) {
      return false;
    }
    const companyDomain = company?.primaryDomain?.toLowerCase();
    if (companyDomain && (host === companyDomain || host.endsWith(`.${companyDomain}`))) {
      return true;
    }
    return TRUSTED_JOB_HOSTS.some(
      (allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`)
    );
  } catch {
    return false;
  }
}

/**
 * Determine job source from URL.
 * @param {string} url - Job URL
 * @param {Object} company - Company object
 * @returns {string} Source identifier
 */
export function determineJobSource(url, company) {
  if (!url) {
    return "other";
  }
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (company?.primaryDomain && (host === company.primaryDomain || host.endsWith(`.${company.primaryDomain}`))) {
      return "careers-site";
    }
    if (host.includes("linkedin") || host.includes("lnkd.in")) {
      return "linkedin";
    }
    return "other";
  } catch {
    return "other";
  }
}

/**
 * Resolve relative URL to absolute.
 * @param {string} baseUrl - Base URL
 * @param {string} target - Target path or URL
 * @returns {string|null} Absolute URL or null
 */
export function resolveRelativeUrl(baseUrl, target) {
  if (!target) return null;
  try {
    if (/^https?:\/\//i.test(target)) {
      return target;
    }
    if (!baseUrl) return null;
    return new URL(target, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Normalize social links object.
 * @param {Object} socials - Social links
 * @returns {Object} Normalized socials
 */
export function normalizeSocials(socials = {}) {
  const normalized = {};
  Object.entries(socials).forEach(([key, value]) => {
    const url = normalizeUrl(value);
    if (url) {
      normalized[key] = url;
    }
  });
  return normalized;
}

/**
 * Infer job title from URL.
 * @param {string} url - Job URL
 * @returns {string} Inferred title
 */
export function inferTitleFromUrl(url) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const slug = segments.pop() ?? "";
    const cleaned = slug.replace(/\d+/g, "").replace(/[-_]+/g, " ");
    const title = sanitizeJobTitle(cleaned);
    if (title && title.length > 3) {
      return title;
    }
    return "";
  } catch {
    return "";
  }
}
