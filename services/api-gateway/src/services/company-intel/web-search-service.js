/**
 * @file web-search-service.js
 * Web search integration (Google CSE, SerpAPI) for company intel.
 * Extracted from company-intel.js for better modularity.
 */

import {
  ALLOW_WEB_FETCH,
  GOOGLE_CSE_ID,
  GOOGLE_CSE_KEY,
  SERP_API_KEY,
  SERP_API_ENGINE,
  KNOWN_SOCIAL_HOSTS,
} from "./config.js";
import { sanitizeString, normalizeUrl } from "./utils.js";

/**
 * Fetch results from Google Custom Search Engine.
 * @param {Object} params
 * @param {string} params.query - Search query
 * @param {number} params.limit - Result limit
 * @returns {Promise<Array>} Search results
 */
async function fetchGoogleSearchResults({ query, limit }) {
  if (!GOOGLE_CSE_ID || !GOOGLE_CSE_KEY) {
    return [];
  }
  const params = new URLSearchParams({
    key: GOOGLE_CSE_KEY,
    cx: GOOGLE_CSE_ID,
    q: query,
    num: String(Math.min(limit, 10))
  });
  const response = await fetch(
    `https://www.googleapis.com/customsearch/v1?${params.toString()}`,
    { method: "GET" }
  );
  if (!response.ok) {
    throw new Error(`Google CSE search failed with status ${response.status}`);
  }
  const data = await response.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  return items
    .map((item) => {
      const url = normalizeUrl(item?.link ?? item?.formattedUrl ?? "");
      if (!url) {
        return null;
      }
      return {
        title: sanitizeString(item?.title ?? item?.htmlTitle ?? ""),
        url,
        snippet: sanitizeString(item?.snippet ?? item?.htmlSnippet ?? "")
      };
    })
    .filter(Boolean);
}

/**
 * Fetch results from SerpAPI.
 * @param {Object} params
 * @param {string} params.query - Search query
 * @param {number} params.limit - Result limit
 * @returns {Promise<Array>} Search results
 */
async function fetchSerpApiResults({ query, limit }) {
  if (!SERP_API_KEY) {
    return [];
  }
  const params = new URLSearchParams({
    engine: SERP_API_ENGINE,
    q: query,
    num: String(Math.min(limit, 10)),
    api_key: SERP_API_KEY
  });
  const response = await fetch(
    `https://serpapi.com/search.json?${params.toString()}`,
    { method: "GET" }
  );
  if (!response.ok) {
    throw new Error(`SerpAPI search failed with status ${response.status}`);
  }
  const data = await response.json();
  const organicResults = Array.isArray(data?.organic_results) ? data.organic_results : [];
  return organicResults
    .map((entry) => {
      const url = normalizeUrl(entry?.link ?? entry?.url ?? "");
      if (!url) {
        return null;
      }
      const snippetArray = Array.isArray(entry?.snippet_highlighted_words)
        ? entry.snippet_highlighted_words
        : [];
      const snippet = sanitizeString(entry?.snippet ?? snippetArray.join(" "));
      return {
        title: sanitizeString(entry?.title ?? ""),
        url,
        snippet
      };
    })
    .filter(Boolean);
}

/**
 * Search for company information on the web.
 * @param {Object} params
 * @param {string} params.domain - Company domain
 * @param {string} params.name - Company name
 * @param {string} params.location - Company location
 * @param {Object} params.logger - Logger instance
 * @param {number} params.limit - Result limit
 * @returns {Promise<Array>} Search results
 */
export async function searchCompanyOnWeb({ domain, name, location, logger, limit = 8 } = {}) {
  const query = [name, domain, location].filter(Boolean).join(" ").trim();
  if (!query) {
    return [];
  }
  if (!ALLOW_WEB_FETCH) {
    logger?.debug?.({ domain, query }, "Skipped live web search (disabled)");
    return [];
  }

  try {
    let results = [];
    if (GOOGLE_CSE_ID && GOOGLE_CSE_KEY) {
      results = await fetchGoogleSearchResults({ query, limit });
    } else if (SERP_API_KEY) {
      results = await fetchSerpApiResults({ query, limit });
    } else {
      logger?.debug?.(
        { domain, query },
        "No search provider configured for company intel"
      );
      return [];
    }
    logger?.info?.(
      { domain, query, hits: results.length },
      "company.intel.web_search"
    );
    return results.slice(0, limit);
  } catch (error) {
    logger?.warn?.({ domain, query, err: error }, "Company web search failed");
    return [];
  }
}

/**
 * Extract social links from search results.
 * @param {Array} results - Search results
 * @param {Object} hints - Hints object with domain/name
 * @returns {Object} Extracted social links
 */
export function extractSocialLinksFromResults(results = [], hints = {}) {
  const socials = {};
  results.forEach((result) => {
    const url = result?.url ?? result?.link;
    if (!url) return;
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (KNOWN_SOCIAL_HOSTS.some((known) => host.includes(known))) {
        if (host.includes("linkedin") && !socials.linkedin) {
          socials.linkedin = url;
        } else if (host.includes("facebook") && !socials.facebook) {
          socials.facebook = url;
        } else if (host.includes("instagram") && !socials.instagram) {
          socials.instagram = url;
        } else if (host.includes("tiktok") && !socials.tiktok) {
          socials.tiktok = url;
        } else if ((host.includes("twitter") || host.includes("x.com")) && !socials.twitter) {
          socials.twitter = url;
        }
      }
    } catch {
      // ignore malformed URLs
    }
  });

  if (!socials.linkedin && hints.domain) {
    const slug = (hints.name ?? hints.domain).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
    if (slug) {
      socials.linkedin = `https://www.linkedin.com/company/${slug}`;
    }
  }

  return Object.fromEntries(Object.entries(socials).filter(([, value]) => Boolean(value)));
}
