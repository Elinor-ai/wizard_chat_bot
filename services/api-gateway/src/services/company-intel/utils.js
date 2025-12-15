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

// =============================================================================
// LOCATION PARSING AND PRIMARY MARKET UTILITIES
// =============================================================================

/**
 * Common country name aliases and normalizations.
 * Maps various forms to canonical country names.
 */
const COUNTRY_ALIASES = {
  // English variations
  usa: "United States",
  "u.s.a.": "United States",
  "u.s.": "United States",
  us: "United States",
  "united states of america": "United States",
  uk: "United Kingdom",
  "u.k.": "United Kingdom",
  "great britain": "United Kingdom",
  gb: "United Kingdom",
  england: "United Kingdom",
  uae: "United Arab Emirates",
  "u.a.e.": "United Arab Emirates",

  // Hebrew transliterations
  "ישראל": "Israel",
  "tel aviv": "Israel", // City that implies Israel
  "herzliya": "Israel",
  "ramat gan": "Israel",
  "petah tikva": "Israel",
  "netanya": "Israel",
  "haifa": "Israel",
  "jerusalem": "Israel",
  "beer sheva": "Israel",
  "be'er sheva": "Israel",

  // Common abbreviations
  sg: "Singapore",
  hk: "Hong Kong",
  nl: "Netherlands",
  de: "Germany",
  fr: "France",
  jp: "Japan",
  kr: "South Korea",
  au: "Australia",
  ca: "Canada",
  br: "Brazil",
  mx: "Mexico",
  in: "India",
  cn: "China",
  ru: "Russia",
  za: "South Africa",
  nz: "New Zealand",
  ie: "Ireland",
  ch: "Switzerland",
  at: "Austria",
  be: "Belgium",
  dk: "Denmark",
  fi: "Finland",
  no: "Norway",
  se: "Sweden",
  pl: "Poland",
  cz: "Czech Republic",
  ro: "Romania",
  il: "Israel"
};

/**
 * Cities that strongly imply a specific country.
 * Used when location only contains a city name.
 */
const CITY_TO_COUNTRY = {
  // Israel
  "tel aviv": "Israel",
  "tel-aviv": "Israel",
  "herzliya": "Israel",
  "ramat gan": "Israel",
  "petah tikva": "Israel",
  "petach tikva": "Israel",
  "netanya": "Israel",
  "haifa": "Israel",
  "jerusalem": "Israel",
  "beer sheva": "Israel",
  "be'er sheva": "Israel",
  "rishon lezion": "Israel",
  "ashdod": "Israel",
  "ashkelon": "Israel",
  "holon": "Israel",
  "bat yam": "Israel",
  "rehovot": "Israel",
  "kfar saba": "Israel",
  "ra'anana": "Israel",
  "raanana": "Israel",
  "modiin": "Israel",
  "modi'in": "Israel",

  // India
  "bangalore": "India",
  "bengaluru": "India",
  "mumbai": "India",
  "delhi": "India",
  "new delhi": "India",
  "hyderabad": "India",
  "chennai": "India",
  "pune": "India",
  "kolkata": "India",
  "ahmedabad": "India",
  "gurgaon": "India",
  "gurugram": "India",
  "noida": "India",

  // USA
  "new york": "United States",
  "nyc": "United States",
  "los angeles": "United States",
  "san francisco": "United States",
  "sf": "United States",
  "seattle": "United States",
  "boston": "United States",
  "chicago": "United States",
  "austin": "United States",
  "denver": "United States",
  "miami": "United States",
  "atlanta": "United States",
  "dallas": "United States",
  "houston": "United States",
  "phoenix": "United States",
  "philadelphia": "United States",
  "san diego": "United States",
  "san jose": "United States",
  "palo alto": "United States",
  "mountain view": "United States",
  "sunnyvale": "United States",
  "cupertino": "United States",
  "menlo park": "United States",
  "redwood city": "United States",

  // UK
  "london": "United Kingdom",
  "manchester": "United Kingdom",
  "birmingham": "United Kingdom",
  "leeds": "United Kingdom",
  "glasgow": "United Kingdom",
  "edinburgh": "United Kingdom",
  "bristol": "United Kingdom",
  "cambridge": "United Kingdom",
  "oxford": "United Kingdom",

  // Other major cities
  "berlin": "Germany",
  "munich": "Germany",
  "frankfurt": "Germany",
  "paris": "France",
  "amsterdam": "Netherlands",
  "tokyo": "Japan",
  "singapore": "Singapore",
  "sydney": "Australia",
  "melbourne": "Australia",
  "toronto": "Canada",
  "vancouver": "Canada",
  "dublin": "Ireland",
  "zurich": "Switzerland",
  "stockholm": "Sweden",
  "copenhagen": "Denmark",
  "oslo": "Norway",
  "helsinki": "Finland"
};

/**
 * Normalize a country name to a canonical form.
 * @param {string} country - Country name or abbreviation
 * @returns {string|null} Normalized country name or null
 */
export function normalizeCountryName(country) {
  if (!country || typeof country !== "string") {
    return null;
  }

  const trimmed = country.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();

  // Check aliases first
  if (COUNTRY_ALIASES[lower]) {
    return COUNTRY_ALIASES[lower];
  }

  // Return title-cased version if not found in aliases
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Parse a location string into city and country components.
 *
 * Handles formats like:
 * - "Tel Aviv, Israel"
 * - "Bangalore, India"
 * - "New York, NY, USA"
 * - "London" (infers UK from city)
 * - "Remote - Israel"
 *
 * @param {string} location - Location string
 * @returns {{ city: string|null, country: string|null }} Parsed location
 */
export function parseJobLocation(location) {
  if (!location || typeof location !== "string") {
    return { city: null, country: null };
  }

  const trimmed = location.trim();
  if (!trimmed) {
    return { city: null, country: null };
  }

  // Remove common prefixes
  const cleaned = trimmed
    .replace(/^(remote\s*[-–—]\s*|hybrid\s*[-–—]\s*|on-?site\s*[-–—]\s*)/i, "")
    .replace(/\s*\(remote\)$/i, "")
    .replace(/\s*\(hybrid\)$/i, "")
    .trim();

  if (!cleaned) {
    return { city: null, country: null };
  }

  // Split by comma, dash, or slash
  const parts = cleaned.split(/[,\-–—\/]+/).map((p) => p.trim()).filter(Boolean);

  if (parts.length === 0) {
    return { city: null, country: null };
  }

  // Single part - check if it's a known city
  if (parts.length === 1) {
    const single = parts[0];
    const lowerSingle = single.toLowerCase();

    // Check if it's a city that implies a country
    if (CITY_TO_COUNTRY[lowerSingle]) {
      return {
        city: single,
        country: CITY_TO_COUNTRY[lowerSingle]
      };
    }

    // Check if it's a country
    const normalizedCountry = normalizeCountryName(single);
    if (COUNTRY_ALIASES[lowerSingle] || lowerSingle.length > 3) {
      // Likely a country
      return {
        city: null,
        country: normalizedCountry
      };
    }

    // Unknown single value
    return { city: single, country: null };
  }

  // Multiple parts - last part is usually the country
  const lastPart = parts[parts.length - 1];
  const lowerLast = lastPart.toLowerCase();

  // Check if last part is a known country
  const normalizedCountry = normalizeCountryName(lastPart);

  // Check if it's a US state abbreviation (2 letters)
  const isUsState = /^[A-Z]{2}$/.test(lastPart);

  if (isUsState && parts.length >= 2) {
    // Format: "City, ST" - assume USA
    return {
      city: parts.slice(0, -1).join(", "),
      country: "United States"
    };
  }

  // Check if last part looks like a country
  if (COUNTRY_ALIASES[lowerLast] || lastPart.length > 2) {
    return {
      city: parts.slice(0, -1).join(", "),
      country: normalizedCountry
    };
  }

  // Fall back: first part is city, try to infer country from city
  const firstPart = parts[0];
  const lowerFirst = firstPart.toLowerCase();

  if (CITY_TO_COUNTRY[lowerFirst]) {
    return {
      city: firstPart,
      country: CITY_TO_COUNTRY[lowerFirst]
    };
  }

  return {
    city: parts.slice(0, -1).join(", ") || parts[0],
    country: normalizedCountry
  };
}

/**
 * Check if a job's country matches the preferred/primary country.
 *
 * @param {string|null} jobCountry - The job's country (normalized)
 * @param {string|null} preferredCountry - The company's preferred country (e.g., hqCountry)
 * @returns {boolean} True if the job is in the primary market
 */
export function isPrimaryMarketMatch(jobCountry, preferredCountry) {
  if (!jobCountry || !preferredCountry) {
    return false;
  }

  const normalizedJob = normalizeCountryName(jobCountry);
  const normalizedPreferred = normalizeCountryName(preferredCountry);

  if (!normalizedJob || !normalizedPreferred) {
    return false;
  }

  return normalizedJob.toLowerCase() === normalizedPreferred.toLowerCase();
}
