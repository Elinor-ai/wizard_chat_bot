/**
 * @file website-scraper.js
 * Website scraping utilities for company intel.
 * Extracted from company-intel.js for better modularity.
 */

import { load as loadHtml } from "cheerio";
import { ALLOW_WEB_FETCH, COMMON_CAREER_PATHS, hasFetchSupport } from "./config.js";
import { cleanText, resolveRelativeUrl, normalizeUrl } from "./utils.js";

/**
 * Known ATS URL patterns for detection after redirects.
 */
const ATS_URL_PATTERNS = [
  { name: "greenhouse", pattern: /greenhouse\.io/i },
  { name: "lever", pattern: /lever\.co/i },
  { name: "workable", pattern: /workable\.com/i },
  { name: "ashby", pattern: /ashbyhq\.com/i },
  { name: "workday", pattern: /myworkday(?:jobs)?\.com/i },
  { name: "smartrecruiters", pattern: /smartrecruiters\.com/i },
  { name: "breezy", pattern: /breezy\.hr/i },
  { name: "eightfold", pattern: /eightfold\.ai/i }
];

/**
 * Detect ATS platform from URL.
 * @param {string} url - URL to check
 * @returns {string|null} ATS name or null
 */
export function detectAtsFromUrl(url) {
  if (!url) return null;
  for (const { name, pattern } of ATS_URL_PATTERNS) {
    if (pattern.test(url)) {
      return name;
    }
  }
  return null;
}

/**
 * Follow redirects and return the final URL.
 * @param {string} url - URL to follow
 * @param {Object} options
 * @param {number} options.maxRedirects - Maximum redirects to follow
 * @param {Object} options.logger - Logger instance
 * @returns {Promise<{finalUrl: string, redirectChain: string[], atsDetected: string|null}>}
 */
export async function followRedirects(url, { maxRedirects = 5, logger } = {}) {
  if (!url || !ALLOW_WEB_FETCH) {
    return { finalUrl: url, redirectChain: [], atsDetected: null };
  }

  const redirectChain = [];
  let currentUrl = url;
  let redirectCount = 0;

  while (redirectCount < maxRedirects) {
    try {
      const response = await fetch(currentUrl, {
        method: "HEAD",
        redirect: "manual"
      });

      const status = response.status;

      // Check if this is a redirect
      if (status >= 300 && status < 400) {
        const location = response.headers.get("location");
        if (!location) break;

        // Resolve relative redirect
        const nextUrl = location.startsWith("http")
          ? location
          : new URL(location, currentUrl).href;

        redirectChain.push(currentUrl);
        currentUrl = nextUrl;
        redirectCount++;
        continue;
      }

      // Not a redirect, we're done
      break;
    } catch (error) {
      logger?.debug?.({ err: error, url: currentUrl }, "redirect_follow_failed");
      break;
    }
  }

  const atsDetected = detectAtsFromUrl(currentUrl);

  return {
    finalUrl: currentUrl,
    redirectChain,
    atsDetected
  };
}

/**
 * Fetch HTML content from a website URL.
 * @param {string} url - URL to fetch
 * @param {Object} logger - Logger instance
 * @returns {Promise<string|null>} HTML content or null
 */
export async function fetchWebsiteHtml(url, logger) {
  if (!ALLOW_WEB_FETCH || !url) {
    return null;
  }
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      logger?.debug?.({ url, status: response.status }, "Website HTML fetch skipped");
      return null;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return null;
    }
    return await response.text();
  } catch (error) {
    logger?.debug?.({ url, err: error }, "Website HTML fetch failed");
    return null;
  }
}

/**
 * Flatten JSON-LD entries from parsed data.
 * @param {*} entry - JSON-LD entry
 * @returns {Array} Flattened entries
 */
export function flattenJsonLdEntries(entry) {
  if (!entry) return [];
  if (Array.isArray(entry)) {
    return entry.flatMap((child) => flattenJsonLdEntries(child));
  }
  if (entry["@graph"]) {
    return flattenJsonLdEntries(entry["@graph"]);
  }
  return [entry];
}

/**
 * Extract JSON-LD data from HTML.
 * @param {Object} $ - Cheerio instance
 * @returns {Object} Extracted job postings and organizations
 */
export function extractJsonLd($) {
  const jobPostings = [];
  const organizations = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const scriptContent = $(element).contents().text();
    if (!scriptContent) return;
    try {
      const parsed = JSON.parse(scriptContent);
      const items = flattenJsonLdEntries(parsed);
      items.forEach((item) => {
        const type = Array.isArray(item?.["@type"]) ? item["@type"] : [item?.["@type"]];
        if (type.some((entry) => String(entry).toLowerCase() === "jobposting")) {
          jobPostings.push(item);
        } else if (type.some((entry) => String(entry).toLowerCase() === "organization")) {
          organizations.push(item);
        }
      });
    } catch {
      // ignore malformed JSON-LD
    }
  });
  return { jobPostings, organizations };
}

/**
 * Extract meta tags from HTML.
 * @param {Object} $ - Cheerio instance
 * @param {string} baseUrl - Base URL for resolving relative URLs
 * @returns {Object} Extracted meta tags
 */
export function extractMetaTags($, baseUrl) {
  if (!$) {
    return { description: null, siteImage: null, siteTitle: null };
  }
  const pick = (selectors, attr = "content") => {
    for (const selector of selectors) {
      const node = $(selector).first();
      if (node && node.length > 0) {
        const value = attr === "text" ? node.text() : node.attr(attr);
        if (value && value.trim()) {
          return value.trim();
        }
      }
    }
    return null;
  };
  const description = pick(
    ['meta[name="description"]', 'meta[property="og:description"]']
  );
  const siteImageRaw = pick(['meta[property="og:image"]', 'meta[name="twitter:image"]']);
  const siteTitle =
    pick(['meta[property="og:title"]', 'meta[name="twitter:title"]']) ??
    pick(["title"], "text");
  return {
    description: description ? cleanText(description) : null,
    siteImage: siteImageRaw
      ? resolveRelativeUrl(baseUrl, siteImageRaw) ??
        normalizeUrl(siteImageRaw) ??
        siteImageRaw
      : null,
    siteTitle: siteTitle ? cleanText(siteTitle) : null
  };
}

/**
 * Extract career link from website HTML.
 * @param {Object} params
 * @param {Object} params.$ - Cheerio instance
 * @param {string} params.html - HTML content
 * @param {string} params.baseUrl - Base URL
 * @returns {string|null} Career page URL or null
 */
export function extractCareerLinkFromWebsite({ $, html, baseUrl }) {
  const root = $ ?? (html ? loadHtml(html) : null);
  if (!root) return null;
  const keywords = /(career|jobs|join)/i;
  const selectors = ["header nav a", "nav a", "footer a", "a"];
  for (const selector of selectors) {
    const anchors = root(selector).toArray();
    for (const anchor of anchors) {
      const node = root(anchor);
      const text = node.text() ?? "";
      const href = node.attr("href") ?? "";
      if (!href) continue;
      if (keywords.test(text) || keywords.test(href)) {
        const resolved = resolveRelativeUrl(baseUrl, href);
        if (resolved) {
          return resolved;
        }
      }
    }
  }
  return null;
}

/**
 * Try to discover career page from common paths.
 * @param {string} websiteUrl - Website base URL
 * @returns {Promise<string|null>} Career page URL or null
 */
async function tryDiscoverCareerPath(websiteUrl) {
  if (!websiteUrl || !ALLOW_WEB_FETCH) return null;
  const base = websiteUrl.replace(/\/$/, "");
  for (const path of COMMON_CAREER_PATHS) {
    const candidate = `${base}${path}`;
    try {
      const response = await fetch(candidate, { method: "HEAD" });
      if (response.ok) {
        return candidate;
      }
    } catch {
      // ignore network errors; we'll continue to next candidate
    }
  }
  return null;
}

/**
 * Extract a canonical career page URL from intel jobs.
 * Prefers URLs on the company's primary domain with career-like paths.
 *
 * @param {Object} params
 * @param {Array} params.intelJobs - Jobs from LLM intel
 * @param {string} params.domain - Company's primary domain
 * @returns {string|null} Career page URL or null
 */
export function extractCareerUrlFromIntelJobs({ intelJobs = [], domain }) {
  if (!Array.isArray(intelJobs) || intelJobs.length === 0) {
    return null;
  }

  const careerPattern = /\/(careers?|jobs|join[-_]?us|work[-_]?with[-_]?us|openings|positions)/i;
  const normalizedDomain = domain?.toLowerCase()?.replace(/^www\./, "");

  // First pass: look for URLs on the primary domain with career paths
  if (normalizedDomain) {
    for (const job of intelJobs) {
      const url = job?.url ?? job?.externalUrl;
      if (!url) continue;

      try {
        const parsed = new URL(url);
        const urlHost = parsed.hostname.toLowerCase().replace(/^www\./, "");

        // Check if URL is on primary domain and has career-like path
        if (urlHost === normalizedDomain && careerPattern.test(parsed.pathname)) {
          // Return the base career page (without job-specific paths)
          const pathParts = parsed.pathname.split("/").filter(Boolean);
          const careerIndex = pathParts.findIndex((p) => careerPattern.test("/" + p));
          if (careerIndex !== -1) {
            const basePath = "/" + pathParts.slice(0, careerIndex + 1).join("/");
            return `${parsed.origin}${basePath}`;
          }
          return `${parsed.origin}${parsed.pathname}`;
        }
      } catch {
        // Invalid URL, skip
      }
    }
  }

  // Second pass: look for any URL with career-like path (trusted ATS domains)
  const trustedAtsPatterns = [
    /greenhouse\.io/i,
    /lever\.co/i,
    /ashbyhq\.com/i,
    /workable\.com/i,
    /smartrecruiters\.com/i,
    /breezy\.hr/i,
    /myworkdayjobs\.com/i
  ];

  for (const job of intelJobs) {
    const url = job?.url ?? job?.externalUrl;
    if (!url) continue;

    try {
      const parsed = new URL(url);
      const isTrustedAts = trustedAtsPatterns.some((p) => p.test(parsed.hostname));

      if (isTrustedAts) {
        // For ATS platforms, return the company board URL
        const pathParts = parsed.pathname.split("/").filter(Boolean);
        if (pathParts.length > 0) {
          // Usually the first path segment is the company identifier
          return `${parsed.origin}/${pathParts[0]}`;
        }
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return null;
}

/**
 * Discover career page for a company.
 * Priority order:
 * 1. Intel jobs URLs on primary domain with career paths (highest confidence)
 * 2. Search results with career-like URLs
 * 3. Nav/footer links on the website
 * 4. Common career paths (/careers, /jobs, etc.)
 *
 * @param {Object} params
 * @param {string} params.domain - Company domain
 * @param {string} params.websiteUrl - Website URL
 * @param {Array} params.searchResults - Search results
 * @param {string} params.websiteHtml - HTML content
 * @param {Object} params.websiteCheerio - Cheerio instance
 * @param {Array} params.intelJobs - Jobs from LLM intel (optional)
 * @returns {Promise<{url: string|null, source: string|null}>} Career page URL and source
 */
export async function discoverCareerPage({
  domain,
  websiteUrl,
  searchResults = [],
  websiteHtml,
  websiteCheerio,
  intelJobs = []
}) {
  // Priority 1: Extract from intel jobs (LLM often provides accurate career URLs)
  const fromIntel = extractCareerUrlFromIntelJobs({ intelJobs, domain });
  if (fromIntel) {
    return { url: fromIntel, source: "intel_jobs" };
  }

  // Priority 2: Search results with career-like URLs
  const fromSearch = searchResults.find((result) =>
    /career|jobs|join/i.test(result?.url ?? "")
  );
  if (fromSearch?.url) {
    return { url: fromSearch.url, source: "web_search" };
  }

  const base = websiteUrl ?? (domain ? `https://${domain}` : null);

  // Priority 3: Nav/footer links on the website
  if (websiteCheerio) {
    const discovered = extractCareerLinkFromWebsite({
      $: websiteCheerio,
      baseUrl: base
    });
    if (discovered) {
      return { url: discovered, source: "website_nav" };
    }
  } else if (websiteHtml) {
    const discovered = extractCareerLinkFromWebsite({ html: websiteHtml, baseUrl: base });
    if (discovered) {
      return { url: discovered, source: "website_nav" };
    }
  }

  // Priority 4: Try common career paths
  const fromPath = await tryDiscoverCareerPath(base);
  if (fromPath) {
    return { url: fromPath, source: "common_path" };
  }

  return { url: null, source: null };
}

/**
 * Resolve career page URL with redirect following.
 * This is the main entry point for career URL resolution.
 *
 * @param {Object} params
 * @param {string} params.url - Initial career page URL
 * @param {Object} params.logger - Logger instance
 * @returns {Promise<{finalUrl: string, originalUrl: string, redirectChain: string[], atsDetected: string|null}>}
 */
export async function resolveCareerUrl({ url, logger }) {
  if (!url) {
    return { finalUrl: null, originalUrl: null, redirectChain: [], atsDetected: null };
  }

  const { finalUrl, redirectChain, atsDetected } = await followRedirects(url, { logger });

  if (redirectChain.length > 0) {
    logger?.info?.({
      originalUrl: url,
      finalUrl,
      redirectCount: redirectChain.length,
      atsDetected
    }, "career_url.redirects_followed");
  }

  return {
    finalUrl,
    originalUrl: url,
    redirectChain,
    atsDetected
  };
}

/**
 * Load HTML using cheerio.
 * @param {string} html - HTML content
 * @returns {Object} Cheerio instance
 */
export { loadHtml };
