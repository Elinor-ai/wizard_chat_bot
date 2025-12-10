/**
 * @file website-scraper.js
 * Website scraping utilities for company intel.
 * Extracted from company-intel.js for better modularity.
 */

import { load as loadHtml } from "cheerio";
import { ALLOW_WEB_FETCH, COMMON_CAREER_PATHS, hasFetchSupport } from "./config.js";
import { cleanText, resolveRelativeUrl, normalizeUrl } from "./utils.js";

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
 * Discover career page for a company.
 * @param {Object} params
 * @param {string} params.domain - Company domain
 * @param {string} params.websiteUrl - Website URL
 * @param {Array} params.searchResults - Search results
 * @param {string} params.websiteHtml - HTML content
 * @param {Object} params.websiteCheerio - Cheerio instance
 * @returns {Promise<string|null>} Career page URL or null
 */
export async function discoverCareerPage({
  domain,
  websiteUrl,
  searchResults = [],
  websiteHtml,
  websiteCheerio
}) {
  const fromSearch = searchResults.find((result) =>
    /career|jobs|join/i.test(result?.url ?? "")
  );
  if (fromSearch?.url) {
    return fromSearch.url;
  }
  const base = websiteUrl ?? (domain ? `https://${domain}` : null);
  if (websiteCheerio) {
    const discovered = extractCareerLinkFromWebsite({
      $: websiteCheerio,
      baseUrl: base
    });
    if (discovered) {
      return discovered;
    }
  } else if (websiteHtml) {
    const discovered = extractCareerLinkFromWebsite({ html: websiteHtml, baseUrl: base });
    if (discovered) {
      return discovered;
    }
  }
  return tryDiscoverCareerPath(base);
}

/**
 * Load HTML using cheerio.
 * @param {string} html - HTML content
 * @returns {Object} Cheerio instance
 */
export { loadHtml };
