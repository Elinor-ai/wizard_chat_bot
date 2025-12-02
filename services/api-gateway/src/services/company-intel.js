import { v4 as uuid } from "uuid";
import {
  CompanySchema,
  CompanyEnrichmentStatusEnum,
  CompanyJobDiscoveryStatusEnum,
  CompanyTypeEnum,
  EmploymentTypeEnum,
  ExperienceLevelEnum,
  JobSchema,
  WorkModelEnum
} from "@wizard/core";
import { recordLlmUsageFromResult } from "./llm-usage-ledger.js";
import { LLM_CORE_TASK } from "../config/task-types.js";
import { load as loadHtml } from "cheerio";
import { htmlToText } from "html-to-text";
const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "protonmail.com",
  "pm.me",
  "live.com",
  "msn.com",
  "mail.com",
  "gmx.com"
]);
const KNOWN_SOCIAL_HOSTS = ["linkedin.com", "lnkd.in", "facebook.com", "instagram.com", "tiktok.com", "twitter.com", "x.com"];
const COMMON_CAREER_PATHS = ["/careers", "/jobs", "/join-us", "/joinus", "/work-with-us", "/team#jobs"];
const TRUSTED_JOB_HOSTS = [
  "greenhouse.io",
  "boards.greenhouse.io",
  "lever.co",
  "jobs.lever.co",
  "workable.com",
  "ashbyhq.com",
  "jobs.ashbyhq.com",
  "smartrecruiters.com",
  "breezy.hr",
  "myworkdayjobs.com",
  "indeed.com",
  "glassdoor.com",
  "linkedin.com",
  "lnkd.in",
  "angel.co",
  "eightfold.ai"
];
const JOB_URL_RED_FLAGS = ["example", "sample", "placeholder", "dummy", "lorem", "acme"];
const hasFetchSupport = typeof fetch === "function";
const ALLOW_WEB_FETCH = hasFetchSupport && process.env.ENABLE_COMPANY_INTEL_FETCH === "true";
const BRANDFETCH_API_URL = "https://api.brandfetch.io/v2/brands";
const BRANDFETCH_API_TOKEN = "mrzkuqeDHxVfPF2xEOGgtPCPRP6jpIyCpMd0XJ1Gvf4=";
const BRAND_SOURCE = "brandfetch";
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID ?? null;
const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_KEY ?? null;
const SERP_API_KEY = process.env.SERP_API_KEY ?? null;
const SERP_API_ENGINE = process.env.SERP_API_ENGINE ?? "google";
const MAX_LINKEDIN_JOBS = 8;
const LINKEDIN_JOB_HINTS = [/\/jobs\//i, /currentjob/i, /viewjob/i, /apply/i];
const LINKEDIN_HIRING_PHRASES = [
  "we're hiring",
  "we\u2019re hiring",
  "hiring",
  "join our team",
  "open role",
  "open roles",
  "looking for",
  "apply now"
];
const LINKEDIN_HIRING_REGEX = new RegExp(LINKEDIN_HIRING_PHRASES.join("|"), "gi");
const DISCOVERED_JOB_OWNER_FALLBACK = "system_company_intel";
const STUCK_ENRICHMENT_THRESHOLD_MS = 10 * 60 * 1000;

function cleanText(raw) {
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

async function fetchWebsiteHtml(url, logger) {
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

function flattenJsonLdEntries(entry) {
  if (!entry) return [];
  if (Array.isArray(entry)) {
    return entry.flatMap((child) => flattenJsonLdEntries(child));
  }
  if (entry["@graph"]) {
    return flattenJsonLdEntries(entry["@graph"]);
  }
  return [entry];
}

function extractJsonLd($) {
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

function toTitleCase(value) {
  if (!value) return "";
  return value
    .split(/[\s.-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

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

export function deriveCompanyNameFromDomain(domain) {
  if (!domain) return "";
  const cleaned = domain.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, " ");
  const fallback = cleaned || domain.split(".")[0];
  return toTitleCase(fallback);
}

const SOCIAL_LINK_KEYS = [
  { key: "linkedin", aliases: ["linkedin"] },
  { key: "facebook", aliases: ["facebook"] },
  { key: "instagram", aliases: ["instagram"] },
  { key: "twitter", aliases: ["twitter", "x"] },
  { key: "tiktok", aliases: ["tiktok"] },
  { key: "youtube", aliases: ["youtube", "yt"] }
];

function sanitizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeHex(value) {
  const raw = sanitizeString(value);
  if (!raw) return null;
  return raw.startsWith("#") ? raw : `#${raw}`;
}

function ensureBrandShape(brand = {}) {
  return {
    ...brand,
    colors: {
      primary: brand?.colors?.primary ?? null,
      secondary: brand?.colors?.secondary ?? null,
      palette: Array.isArray(brand?.colors?.palette) ? [...brand.colors.palette] : []
    },
    fonts: {
      primary: brand?.fonts?.primary ?? null,
      secondary: brand?.fonts?.secondary ?? null,
      all: Array.isArray(brand?.fonts?.all) ? [...brand.fonts.all] : []
    }
  };
}

async function fetchBrandfetchData(domain, logger) {
  if (!domain || !hasFetchSupport) {
    return null;
  }
  try {
    const response = await fetch(`${BRANDFETCH_API_URL}/${encodeURIComponent(domain)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${BRANDFETCH_API_TOKEN}`
      }
    });
    if (!response.ok) {
      logger?.debug?.(
        { domain, status: response.status },
        "Brandfetch lookup skipped due to response status"
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    logger?.warn?.({ domain, err: error }, "Brandfetch lookup failed");
    return null;
  }
}

function selectBrandfetchAsset(items = [], matcher = () => true) {
  for (const item of items) {
    if (!matcher(item)) continue;
    const formats = Array.isArray(item?.formats) ? item.formats : [];
    const preferred =
      formats.find((format) => format.format === "svg") ??
      formats.find((format) => Boolean(format.src)) ??
      null;
    if (preferred?.src) {
      return preferred.src;
    }
    if (item?.src) {
      return item.src;
    }
  }
  return null;
}

function normalizeDomain(value) {
  return sanitizeString(value).toLowerCase();
}

function mapBrandfetchCompanyType(kind) {
  if (!kind) return null;
  const normalized = kind.toLowerCase();
  if (CompanyTypeEnum.options.includes(normalized)) {
    return normalized;
  }
  if (normalized.includes("agency")) {
    return CompanyTypeEnum.enum.agency;
  }
  if (normalized.includes("freelance")) {
    return CompanyTypeEnum.enum.freelancer;
  }
  return null;
}

function mergeSocialLinks(existing = {}, links = []) {
  const merged = { ...(existing ?? {}) };
  let touched = false;
  links.forEach((link) => {
    const url = normalizeUrl(link?.url ?? link?.link ?? link?.value ?? "");
    if (!url) {
      return;
    }
    const name = sanitizeString(link?.name ?? link?.type ?? "");
    const lower = name.toLowerCase();
    const match = SOCIAL_LINK_KEYS.find((entry) =>
      entry.aliases.some((alias) => lower.includes(alias))
    );
    if (match && !hasValue(merged[match.key])) {
      merged[match.key] = url;
      touched = true;
    }
  });
  return touched ? merged : existing;
}

function applyBrandfetchToCompany(company, brandData) {
  if (!brandData || typeof brandData !== "object") {
    return null;
  }
  const patch = {};
  const nextBrand = ensureBrandShape(company.brand ?? {});
  let brandTouched = false;
  const fieldSourceUpdates = {};
  const trackFieldSource = (field, value) => {
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
      return;
    }
    const existingSources = company.fieldSources?.[field]?.sources ?? [];
    fieldSourceUpdates[field] = {
      value,
      sources: Array.from(new Set([...existingSources, BRAND_SOURCE]))
    };
  };

  const brandName = sanitizeString(brandData.name ?? brandData.brand?.name ?? "");
  if (brandName && !hasValue(nextBrand.name)) {
    nextBrand.name = brandName;
    brandTouched = true;
    trackFieldSource("brand.name", brandName);
  }
  const brandDomain = normalizeDomain(brandData.domain ?? brandData.website ?? "");
  if (brandDomain && !hasValue(nextBrand.domain)) {
    nextBrand.domain = brandDomain;
    brandTouched = true;
    trackFieldSource("brand.domain", brandDomain);
  }

  const logos = Array.isArray(brandData.logos) ? brandData.logos : [];
  const primaryLogo = selectBrandfetchAsset(logos, () => true);
  const iconLogo = selectBrandfetchAsset(
    logos,
    (logo) => (logo?.type ?? "").toLowerCase().includes("icon") || (logo?.type ?? "").toLowerCase().includes("symbol")
  );
  if (primaryLogo && !hasValue(nextBrand.logoUrl)) {
    nextBrand.logoUrl = primaryLogo;
    brandTouched = true;
    trackFieldSource("brand.logoUrl", primaryLogo);
  }
  if (iconLogo && !hasValue(nextBrand.iconUrl)) {
    nextBrand.iconUrl = iconLogo;
    brandTouched = true;
    trackFieldSource("brand.iconUrl", iconLogo);
  }
  if (!hasValue(company.logoUrl) && primaryLogo) {
    patch.logoUrl = primaryLogo;
    trackFieldSource("logoUrl", primaryLogo);
  }

  const images = Array.isArray(brandData.images) ? brandData.images : [];
  const bannerImage = selectBrandfetchAsset(
    images,
    (img) => (img?.type ?? "").toLowerCase().includes("banner") || (img?.type ?? "").toLowerCase().includes("cover")
  );
  if (bannerImage && !hasValue(nextBrand.bannerUrl)) {
    nextBrand.bannerUrl = bannerImage;
    brandTouched = true;
    trackFieldSource("brand.bannerUrl", bannerImage);
  }

  const colors = Array.isArray(brandData.colors) ? brandData.colors : [];
  if (colors.length > 0) {
    const palette = new Set(nextBrand.colors.palette ?? []);
    colors.forEach((color) => {
      const hex = normalizeHex(color?.hex);
      if (!hex) return;
      palette.add(hex);
      if (!hasValue(nextBrand.colors.primary) && (color?.type === "brand" || color?.type === "dark")) {
        nextBrand.colors.primary = hex;
        trackFieldSource("brand.colors.primary", hex);
      } else if (!hasValue(nextBrand.colors.secondary) && color?.type && color.type !== "brand") {
        nextBrand.colors.secondary = hex;
        trackFieldSource("brand.colors.secondary", hex);
      }
    });
    const paletteArray = Array.from(palette);
    if (paletteArray.length !== (nextBrand.colors.palette?.length ?? 0)) {
      nextBrand.colors.palette = paletteArray;
      brandTouched = true;
      trackFieldSource("brand.colors.palette", paletteArray);
    }
    if (!hasValue(patch.primaryColor) && !hasValue(company.primaryColor) && hasValue(nextBrand.colors.primary)) {
      patch.primaryColor = nextBrand.colors.primary;
      trackFieldSource("primaryColor", nextBrand.colors.primary);
    }
    if (!hasValue(patch.secondaryColor) && !hasValue(company.secondaryColor) && hasValue(nextBrand.colors.secondary)) {
      patch.secondaryColor = nextBrand.colors.secondary;
      trackFieldSource("secondaryColor", nextBrand.colors.secondary);
    }
  }

  const fonts = Array.isArray(brandData.fonts) ? brandData.fonts : [];
  if (fonts.length > 0) {
    const fontSet = new Set(nextBrand.fonts.all ?? []);
    fonts.forEach((font) => {
      const name = sanitizeString(font?.name ?? font?.family ?? "");
      if (!name) return;
      fontSet.add(name);
      if (!hasValue(nextBrand.fonts.primary) && (font?.type ?? "").toLowerCase().includes("body")) {
        nextBrand.fonts.primary = name;
        trackFieldSource("brand.fonts.primary", name);
      } else if (!hasValue(nextBrand.fonts.secondary) && (font?.type ?? "").toLowerCase().includes("heading")) {
        nextBrand.fonts.secondary = name;
        trackFieldSource("brand.fonts.secondary", name);
      }
    });
    const fontList = Array.from(fontSet);
    if (fontList.length !== (nextBrand.fonts.all?.length ?? 0)) {
      nextBrand.fonts.all = fontList;
      brandTouched = true;
      trackFieldSource("brand.fonts.all", fontList);
    }
    if (!hasValue(company.fontFamilyPrimary) && hasValue(nextBrand.fonts.primary)) {
      patch.fontFamilyPrimary = nextBrand.fonts.primary;
      trackFieldSource("fontFamilyPrimary", nextBrand.fonts.primary);
    }
  }

  if (!hasValue(nextBrand.toneOfVoiceHint)) {
    const hint = sanitizeString(brandData.summary ?? brandData.description ?? "");
    if (hint) {
      nextBrand.toneOfVoiceHint = hint;
      brandTouched = true;
      trackFieldSource("brand.toneOfVoiceHint", hint);
    }
  }

  if (!hasValue(company.name) && brandName) {
    patch.name = brandName;
    trackFieldSource("name", brandName);
  }
  if (!hasValue(company.description) && hasValue(brandData.description)) {
    const value = sanitizeString(brandData.description);
    patch.description = value;
    trackFieldSource("description", value);
  }
  if (!hasValue(company.longDescription) && hasValue(brandData.longDescription)) {
    const value = sanitizeString(brandData.longDescription);
    patch.longDescription = value;
    trackFieldSource("longDescription", value);
  }
  if (!hasValue(company.tagline) && hasValue(brandData.tagline ?? brandData.summary)) {
    const value = sanitizeString(brandData.tagline ?? brandData.summary);
    patch.tagline = value;
    trackFieldSource("tagline", value);
  }
  if (!hasValue(company.website) && brandDomain) {
    const website = normalizeUrl(`https://${brandDomain}`);
    if (website) {
      patch.website = website;
      trackFieldSource("website", website);
    }
  }

  const brandCompany = brandData.company ?? {};
  const location = brandCompany.location ?? {};
  if (!hasValue(company.hqCity) && hasValue(location.city)) {
    const value = sanitizeString(location.city);
    patch.hqCity = value;
    trackFieldSource("hqCity", value);
  }
  if (!hasValue(company.hqCountry) && hasValue(location.country)) {
    const value = sanitizeString(location.country);
    patch.hqCountry = value;
    trackFieldSource("hqCountry", value);
  }
  if (!hasValue(company.industry)) {
    const industries = Array.isArray(brandCompany.industries) ? brandCompany.industries : [];
    const primaryIndustry =
      industries.find((entry) => typeof entry === "string" && entry.trim().length > 0) ??
      sanitizeString(brandCompany.industry);
    if (hasValue(primaryIndustry)) {
      const value = sanitizeString(primaryIndustry);
      patch.industry = value;
      trackFieldSource("industry", value);
    }
  }
  if (!hasValue(company.companyType)) {
    const mappedType = mapBrandfetchCompanyType(brandCompany.kind);
    if (mappedType) {
      patch.companyType = mappedType;
      trackFieldSource("companyType", mappedType);
    }
  }

  const mergedSocials = mergeSocialLinks(company.socials ?? {}, brandData.links ?? []);
  if (mergedSocials !== company.socials) {
    Object.entries(mergedSocials).forEach(([key, value]) => {
      if (!hasValue(company.socials?.[key]) && hasValue(value)) {
        trackFieldSource(`socials.${key}`, value);
      }
    });
    patch.socials = mergedSocials;
  }

  if (brandTouched) {
    patch.brand = nextBrand;
  }
  if (Object.keys(fieldSourceUpdates).length > 0) {
    patch.fieldSources = {
      ...(company.fieldSources ?? {}),
      ...fieldSourceUpdates
    };
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

export function computeCompanyGaps(company = {}) {
  const gaps = {
    core: [],
    segmentation: [],
    location: [],
    branding: [],
    voice: [],
    socials: [],
    jobs: []
  };
  const brand = ensureBrandShape(company?.brand ?? {});
  const pushGap = (section, field) => {
    if (!section || !field) return;
    if (!Array.isArray(gaps[section])) {
      gaps[section] = [];
    }
    if (!gaps[section].includes(field)) {
      gaps[section].push(field);
    }
  };
  const normalizedWebsite = normalizeUrl(company?.website);
  if (!hasValue(company?.name) && !hasValue(brand?.name)) {
    pushGap("core", "name");
  }
  if (!normalizedWebsite) {
    pushGap("core", "website");
  }
  if (!hasValue(company?.companyType)) {
    pushGap("segmentation", "companyType");
  }
  if (!hasValue(company?.industry)) {
    pushGap("segmentation", "industry");
  }
  if (!company?.employeeCountBucket || company.employeeCountBucket === "unknown") {
    pushGap("segmentation", "employeeCountBucket");
  }
  if (!hasValue(company?.hqCountry)) {
    pushGap("location", "hqCountry");
  }
  if (!hasValue(company?.hqCity)) {
    pushGap("location", "hqCity");
  }
  if (!hasValue(company?.logoUrl) && !hasValue(brand?.logoUrl)) {
    pushGap("branding", "logoUrl");
  }
  const brandPrimaryColor = brand?.colors?.primary ?? null;
  if (!hasValue(company?.primaryColor) && !hasValue(brandPrimaryColor)) {
    pushGap("branding", "primaryColor");
  }
  const brandPrimaryFont = brand?.fonts?.primary ?? null;
  if (!hasValue(company?.fontFamilyPrimary) && !hasValue(brandPrimaryFont)) {
    pushGap("branding", "fontFamilyPrimary");
  }
  if (!hasValue(company?.toneOfVoice) && !hasValue(brand?.toneOfVoiceHint)) {
    pushGap("voice", "toneOfVoice");
  }
  const hasStory = hasValue(company?.tagline) || hasValue(company?.description);
  if (!hasStory) {
    pushGap("voice", "tagline");
  }
  const normalizedSocials = normalizeSocials(company?.socials ?? {});
  if (!hasValue(normalizedSocials?.linkedin)) {
    pushGap("socials", "linkedin");
  }
  if (!Array.isArray(gaps.jobs)) {
    gaps.jobs = [];
  }
  if (!gaps.jobs.includes("discoveredJobs")) {
    gaps.jobs.push("discoveredJobs");
  }
  return gaps;
}

function buildGapLookup(gaps = {}) {
  const lookup = {};
  Object.entries(gaps ?? {}).forEach(([section, fields]) => {
    lookup[section] = new Set(Array.isArray(fields) ? fields : []);
  });
  return lookup;
}

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

function extractCareerLinkFromWebsite({ $, html, baseUrl }) {
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

function extractMetaTags($, baseUrl) {
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

function resolveRelativeUrl(baseUrl, target) {
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

function stripHtml(value) {
  if (!value) return "";
  return value.replace(/<[^>]*>/g, "").trim();
}

function sanitizeJobTitle(value) {
  if (!value || typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function isSuspiciousHost(hostname = "") {
  return JOB_URL_RED_FLAGS.some((fragment) => hostname.includes(fragment));
}

function isLikelyRealJobUrl(url, company) {
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

function determineJobSource(url, company) {
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

function normalizeJobEnum(value, enumShape) {
  if (!value) return undefined;
  const source = Array.isArray(value) ? value[0] : value;
  if (typeof source !== "string") {
    return undefined;
  }
  const normalized = source.toLowerCase().replace(/[\s-]+/g, "_");
  return enumShape.options.find((option) => option === normalized);
}

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

function buildJobFromJsonLd({ posting, company, baseUrl }) {
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

function extractJobAnchorsWithCheerio({ $, baseUrl, company }) {
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

function dedupeJobs(jobs = []) {
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

function cloneCandidateJob(job = {}) {
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

function scoreCandidateJob(job = {}) {
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

const JOB_SOURCE_PRIORITY = {
  "careers-site": 3,
  linkedin: 2,
  "linkedin-post": 1,
  other: 0,
  "intel-agent": 0
};

function mergeStringArrays(a = [], b = []) {
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

function mergeFieldConfidenceMaps(base = null, incoming = null) {
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

function pickPreferredSource(current, incoming) {
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

function mergeCandidateJobs(existing, incoming) {
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

function extractSnippet(html, startIndex, endIndex, radius = 400) {
  const from = Math.max(0, startIndex - radius);
  const to = Math.min(html.length, endIndex + radius);
  return html.slice(from, to);
}

function extractLocationFromSnippet(snippet) {
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

function extractDescriptionFromSnippet(snippet, fallback = "") {
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

function extractPostedAtFromSnippet(snippet) {
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

function extractJobAnchorsFromHtml({ html, baseUrl, company }) {
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

async function discoverJobsFromCareerPage({ careerPageUrl, company, logger }) {
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

async function discoverJobsFromLinkedInFeed({ company, linkedinUrl, logger }) {
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

function extractLinkedInJobAnchors({ html, baseUrl, company }) {
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

function extractLinkedInPostJobs({ html, baseUrl, company }) {
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

function looksLikeLinkedInJobAnchor(href = "", text = "") {
  if (!href) return false;
  const normalizedHref = href.toLowerCase();
  const normalizedText = text.toLowerCase();
  const hasHint = LINKEDIN_JOB_HINTS.some((hint) => hint.test(normalizedHref));
  const hasKeyword = /job|role|opening|position|apply|careers?/i.test(normalizedText);
  return hasHint || hasKeyword;
}

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

function inferTitleFromUrl(url) {
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

export function extractEmailDomain(email) {
  return normalizeEmailDomain(email)?.domain ?? null;
}

export function isGenericEmailDomain(domain) {
  if (!domain) return true;
  return GENERIC_EMAIL_DOMAINS.has(domain.toLowerCase());
}

export async function ensureCompanyForDomain({
  firestore,
  logger,
  domain,
  createdByUserId,
  autoEnqueue = false,
  nameHint,
  locationHint
}) {
  if (!domain) {
    return null;
  }
  const normalizedDomain = domain.trim().toLowerCase();
  if (!normalizedDomain || isGenericEmailDomain(normalizedDomain)) {
    return null;
  }

  const existing = await firestore.getCompanyByDomain(normalizedDomain);
  if (existing) {
    return { domain: normalizedDomain, company: existing, created: false };
  }

  const now = new Date();
  const guessedName = nameHint ?? deriveCompanyNameFromDomain(normalizedDomain);
  const companyId = `company_${uuid()}`;
  const payload = CompanySchema.parse({
    id: companyId,
    primaryDomain: normalizedDomain,
    additionalDomains: [],
    name: guessedName ?? "",
    nameConfirmed: false,
    profileConfirmed: false,
    companyType: "company",
    employeeCountBucket: "unknown",
    enrichmentStatus: CompanyEnrichmentStatusEnum.enum.PENDING,
    jobDiscoveryStatus: CompanyJobDiscoveryStatusEnum.enum.UNKNOWN,
     lastEnrichedAt: null,
     lastJobDiscoveryAt: null,
     enrichmentQueuedAt: null,
     enrichmentStartedAt: null,
     enrichmentCompletedAt: null,
     enrichmentLockedAt: null,
     enrichmentAttempts: 0,
     enrichmentError: null,
     jobDiscoveryQueuedAt: null,
     jobDiscoveryAttempts: 0,
    confidenceScore: 0,
    sourcesUsed: [],
    fieldSources: {},
    locationHint: locationHint ?? "",
    createdAt: now,
    updatedAt: now,
    createdByUserId: createdByUserId ?? null
  });

  const company = await firestore.saveCompanyDocument(companyId, payload);
  logger?.info?.(
    { companyId, domain: normalizedDomain },
    "Created pending company record from domain"
  );
  if (autoEnqueue && payload.nameConfirmed) {
    await enqueueCompanyEnrichment({ firestore, logger, company });
  }
  return { domain: normalizedDomain, company, created: true };
}

export async function ensureCompanyForEmail({
  firestore,
  logger,
  email,
  createdByUserId,
  autoEnqueue = false,
  nameHint,
  locationHint
}) {
  const normalized = normalizeEmailDomain(email);
  if (!normalized || isGenericEmailDomain(normalized.domain)) {
    return null;
  }
  return ensureCompanyForDomain({
    firestore,
    logger,
    domain: normalized.domain,
    createdByUserId,
    autoEnqueue,
    nameHint,
    locationHint
  });
}

export async function enqueueCompanyEnrichment({ firestore, logger, company }) {
  if (!company?.id) return;
  if (company.nameConfirmed === false) {
    logger?.info?.({ companyId: company.id }, "Skipping enrichment enqueue until name confirmed");
    return;
  }
  const now = new Date();
  await firestore.saveCompanyDocument(company.id, {
    enrichmentStatus: CompanyEnrichmentStatusEnum.enum.PENDING,
    enrichmentQueuedAt: now,
    enrichmentLockedAt: null,
    enrichmentError: null,
    updatedAt: now
  });
  logger?.info?.(
    { companyId: company.id },
    "Marked company for enrichment"
  );
}

export async function ensureCompanyEnrichmentQueued({ firestore, logger, company }) {
  if (!company?.id || company.nameConfirmed === false) {
    return;
  }
  if (company.enrichmentStatus === CompanyEnrichmentStatusEnum.enum.PENDING) {
    return;
  }
  await enqueueCompanyEnrichment({ firestore, logger, company });
}

async function markEnrichmentFailed({ firestore, companyId, reason, message }) {
  if (!companyId) {
    return;
  }
  const failureTime = new Date();
  await firestore.saveCompanyDocument(companyId, {
    enrichmentStatus: CompanyEnrichmentStatusEnum.enum.FAILED,
    enrichmentError: {
      reason,
      message,
      occurredAt: failureTime
    },
    enrichmentLockedAt: null,
    enrichmentCompletedAt: failureTime,
    updatedAt: failureTime,
    intelSummary: message
  });
}

async function runCompanyEnrichmentCore({
  firestore,
  bigQuery,
  logger,
  llmClient,
  company
}) {
  if (!company?.id) {
    throw new Error("Company context required for enrichment");
  }

  const normalizedDomain = company.primaryDomain?.toLowerCase();
  const websiteCandidate =
    company.website ?? (normalizedDomain ? `https://${normalizedDomain}` : null);
  let currentWebsiteBase = websiteCandidate;
  const tasks = [
    normalizedDomain && !isGenericEmailDomain(normalizedDomain)
      ? fetchBrandfetchData(normalizedDomain, logger)
      : Promise.resolve(null),
    searchCompanyOnWeb({
      domain: company.primaryDomain,
      name: company.name,
      location: company.hqCountry ?? company.locationHint ?? "",
      logger
    }),
    fetchWebsiteHtml(websiteCandidate, logger)
  ];
  const [brandResult, searchResult, websiteResult] = await Promise.allSettled(tasks);
  const brandfetchData = brandResult.status === "fulfilled" ? brandResult.value : null;
  if (brandResult.status === "rejected") {
    logger?.debug?.(
      { companyId: company.id, err: brandResult.reason },
      "Brandfetch lookup rejected"
    );
  }
  const searchResults =
    searchResult.status === "fulfilled" && Array.isArray(searchResult.value)
      ? searchResult.value
      : [];
  if (searchResult.status === "rejected") {
    logger?.debug?.(
      { companyId: company.id, err: searchResult.reason },
      "Web search failed"
    );
  }
  let websiteHtml =
    websiteResult.status === "fulfilled" ? websiteResult.value : null;
  let websiteCheerio = null;
  let websiteContext = "";
  let metaTags = null;
  const hydrateWebsiteArtifacts = (html, base) => {
    websiteHtml = html ?? websiteHtml;
    if (!html) {
      websiteCheerio = null;
      websiteContext = "";
      metaTags = null;
      return;
    }
    websiteCheerio = loadHtml(html);
    websiteContext = cleanText(html);
    metaTags = extractMetaTags(websiteCheerio, base ?? currentWebsiteBase);
  };
  if (websiteResult.status === "rejected") {
    logger?.debug?.(
      { companyId: company.id, err: websiteResult.reason },
      "Website HTML fetch failed"
    );
  }
  if (websiteHtml) {
    hydrateWebsiteArtifacts(websiteHtml, currentWebsiteBase);
  }

  if (brandfetchData) {
    const brandPatch = applyBrandfetchToCompany(company, brandfetchData);
    if (brandPatch) {
      const brandSources = new Set(company.sourcesUsed ?? []);
      brandSources.add(BRAND_SOURCE);
      brandPatch.sourcesUsed = Array.from(brandSources);
      brandPatch.updatedAt = new Date();
      const refreshed = await firestore.saveCompanyDocument(company.id, brandPatch);
      company = {
        ...company,
        ...refreshed
      };
      if (refreshed.website && refreshed.website !== currentWebsiteBase) {
        currentWebsiteBase = refreshed.website;
        const refreshedHtml = await fetchWebsiteHtml(refreshed.website, logger);
        if (refreshedHtml) {
          hydrateWebsiteArtifacts(refreshedHtml, currentWebsiteBase);
        }
      } else if (!websiteHtml && refreshed.website) {
        currentWebsiteBase = refreshed.website;
        const refreshedHtml = await fetchWebsiteHtml(refreshed.website, logger);
        if (refreshedHtml) {
          hydrateWebsiteArtifacts(refreshedHtml, currentWebsiteBase);
        }
      }
    }
  }

  const gaps = computeCompanyGaps(company);
  logger?.info?.({ companyId: company.id, gaps }, "company.intel.gaps");

  const intelResult = await llmClient.askCompanyIntel({
    domain: company.primaryDomain,
    companySnapshot: company,
    gaps,
    websiteContext: websiteContext ?? ""
  });
  await recordLlmUsageFromResult({
    firestore,
    bigQuery,
    logger,
    usageContext: {
      userId: company.createdByUserId ?? null,
      jobId: null,
      taskType: LLM_CORE_TASK.COMPANY_INTEL
    },
    result: intelResult
  });

  if (intelResult?.error) {
    throw new Error(intelResult.error.message ?? "LLM company intel task failed");
  }

  const profile = intelResult?.profile ?? {};
  const branding = intelResult?.branding ?? {};
  const llmSocials = intelResult?.socials ?? {};
  const intelEvidence = normalizeIntelEvidence(intelResult?.evidence ?? {});
  const gapLookup = buildGapLookup(gaps);
  const hasGap = (section, field) => {
    if (!section || !field) return false;
    return gapLookup?.[section]?.has(field) ?? false;
  };
  const gatherSources = (section, field, fallback = ["gemini-intel"]) => {
    const intelSources =
      section && field ? intelEvidence?.[section]?.[field] ?? [] : [];
    const merged = new Set([...(fallback ?? []), ...intelSources]);
    return Array.from(merged).filter(Boolean);
  };
  const normalizedWebsite =
    normalizeUrl(profile.website) ??
    normalizeUrl(company.website) ??
    (company.primaryDomain ? `https://${company.primaryDomain}` : null);
  if (
    normalizedWebsite &&
    (!websiteHtml || normalizedWebsite !== currentWebsiteBase)
  ) {
    currentWebsiteBase = normalizedWebsite;
    const fetched = await fetchWebsiteHtml(normalizedWebsite, logger);
    if (fetched) {
      hydrateWebsiteArtifacts(fetched, currentWebsiteBase);
    } else if (websiteCheerio) {
      metaTags = extractMetaTags(websiteCheerio, currentWebsiteBase);
    }
  } else if (websiteCheerio && normalizedWebsite && normalizedWebsite !== currentWebsiteBase) {
    currentWebsiteBase = normalizedWebsite;
    metaTags = extractMetaTags(websiteCheerio, currentWebsiteBase);
  }
  const careerPageUrl =
    (await discoverCareerPage({
      domain: company.primaryDomain,
      websiteUrl: normalizedWebsite,
      searchResults,
      websiteHtml,
      websiteCheerio
    })) ?? company.careerPageUrl ?? null;
  const now = new Date();
  const sourcesUsed = new Set(company.sourcesUsed ?? []);
  sourcesUsed.add("gemini-intel");
  if (searchResults.length > 0) {
    sourcesUsed.add("web-search");
  }
  const fieldEvidence = { ...(company.fieldSources ?? {}) };
  const applyField = (
    field,
    value,
    {
      section = null,
      evidenceSection = section,
      requireGap = true,
      requireEmpty = false,
      sources = null
    } = {}
  ) => {
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value === "string" && !value.trim()) {
      return;
    }
    if (requireGap && section && !hasGap(section, field)) {
      return;
    }
    if (requireEmpty && hasValue(company[field])) {
      return;
    }
    if (company[field] === value) {
      return;
    }
    patch[field] = value;
    updateFieldEvidence({
      company,
      evidence: fieldEvidence,
      field,
      value,
      sources: sources ?? gatherSources(evidenceSection, field)
    });
  };

  const patch = {
    enrichmentStatus: CompanyEnrichmentStatusEnum.enum.READY,
    lastEnrichedAt: now,
    enrichmentCompletedAt: now,
    enrichmentLockedAt: null,
    enrichmentError: null,
    confidenceScore: company.confidenceScore ?? 0.5,
    sourcesUsed: Array.from(sourcesUsed),
    updatedAt: now
  };

  if (metaTags?.description && !hasValue(company.description)) {
    patch.description = metaTags.description;
    updateFieldEvidence({
      company,
      evidence: fieldEvidence,
      field: "description",
      value: metaTags.description,
      sources: ["meta-tags"]
    });
  }
  if (metaTags?.siteImage && !hasValue(company.brand?.bannerUrl)) {
    const brandPatch = ensureBrandShape(patch.brand ?? company.brand ?? {});
    brandPatch.bannerUrl = metaTags.siteImage;
    patch.brand = brandPatch;
    updateFieldEvidence({
      company,
      evidence: fieldEvidence,
      field: "brand.bannerUrl",
      value: metaTags.siteImage,
      sources: ["meta-tags"]
    });
  }

  const websiteFromProfile = normalizeUrl(profile.website);
  if (normalizedWebsite && hasGap("core", "website")) {
    const websiteSources =
      websiteFromProfile && normalizedWebsite === websiteFromProfile
        ? gatherSources("profile", "website")
        : ["domain-default"];
    applyField("website", normalizedWebsite, {
      section: "core",
      evidenceSection: websiteFromProfile ? "profile" : null,
      sources: websiteSources
    });
  }
  if (careerPageUrl && careerPageUrl !== company.careerPageUrl) {
    applyField("careerPageUrl", careerPageUrl, {
      section: null,
      evidenceSection: null,
      requireGap: false,
      sources: ["career-page-discovery"]
    });
  }
  if (profile.summary && !hasValue(company.intelSummary)) {
    applyField("intelSummary", profile.summary, {
      section: "voice",
      evidenceSection: "profile",
      requireGap: false,
      requireEmpty: true,
      sources: gatherSources("profile", "summary")
    });
  }

  if (hasGap("core", "name") && hasValue(profile.officialName)) {
    applyField("name", profile.officialName, {
      section: "core",
      evidenceSection: "profile",
      sources: gatherSources("profile", "officialName")
    });
  }
  if (hasGap("voice", "tagline") && hasValue(profile.tagline)) {
    applyField("tagline", profile.tagline, {
      section: "voice",
      evidenceSection: "profile",
      sources: gatherSources("profile", "tagline")
    });
  }
  if (hasGap("segmentation", "industry") && hasValue(profile.industry)) {
    applyField("industry", profile.industry, {
      section: "segmentation",
      evidenceSection: "profile",
      sources: gatherSources("profile", "industry")
    });
  }
  const normalizedCompanyType = hasValue(profile.companyType)
    ? profile.companyType.toLowerCase()
    : null;
  if (
    normalizedCompanyType &&
    CompanyTypeEnum.options.includes(normalizedCompanyType) &&
    hasGap("segmentation", "companyType")
  ) {
    applyField("companyType", normalizedCompanyType, {
      section: "segmentation",
      evidenceSection: "profile",
      sources: gatherSources("profile", "companyType")
    });
  }
  const normalizedEmployeeBucket =
    profile.employeeCountBucket && profile.employeeCountBucket !== "unknown"
      ? profile.employeeCountBucket
      : null;
  if (normalizedEmployeeBucket && hasGap("segmentation", "employeeCountBucket")) {
    applyField("employeeCountBucket", normalizedEmployeeBucket, {
      section: "segmentation",
      evidenceSection: "profile",
      sources: gatherSources("profile", "employeeCountBucket")
    });
  }
  if (hasGap("location", "hqCountry") && hasValue(profile.hqCountry)) {
    applyField("hqCountry", profile.hqCountry, {
      section: "location",
      evidenceSection: "profile",
      sources: gatherSources("profile", "hqCountry")
    });
  }
  if (hasGap("location", "hqCity") && hasValue(profile.hqCity)) {
    applyField("hqCity", profile.hqCity, {
      section: "location",
      evidenceSection: "profile",
      sources: gatherSources("profile", "hqCity")
    });
  }
  if (hasGap("voice", "toneOfVoice") && hasValue(profile.toneOfVoice)) {
    applyField("toneOfVoice", profile.toneOfVoice, {
      section: "voice",
      evidenceSection: "profile",
      sources: gatherSources("profile", "toneOfVoice")
    });
  }
  if (hasGap("branding", "primaryColor") && hasValue(branding.primaryColor)) {
    applyField("primaryColor", branding.primaryColor, {
      section: "branding",
      evidenceSection: "branding",
      sources: gatherSources("branding", "primaryColor")
    });
  }
  if (hasGap("branding", "fontFamilyPrimary") && hasValue(branding.fontFamilyPrimary)) {
    applyField("fontFamilyPrimary", branding.fontFamilyPrimary, {
      section: "branding",
      evidenceSection: "branding",
      sources: gatherSources("branding", "fontFamilyPrimary")
    });
  }

  const normalizedExistingSocials = normalizeSocials(company.socials ?? {});
  const mergedSocials = { ...normalizedExistingSocials };
  const socialSourceMap = {};
  Object.keys(normalizedExistingSocials).forEach((key) => {
    socialSourceMap[key] = ["persisted"];
  });

  const searchSocialHits = normalizeSocials(
    extractSocialLinksFromResults(searchResults, {
      domain: company.primaryDomain,
      name: company.name
    })
  );
  Object.entries(searchSocialHits).forEach(([key, value]) => {
    if (!mergedSocials[key]) {
      mergedSocials[key] = value;
    }
    socialSourceMap[key] = Array.from(new Set([...(socialSourceMap[key] ?? []), "web-search"]));
  });

  const normalizedLlmSocials = normalizeSocials(llmSocials);
  Object.entries(normalizedLlmSocials).forEach(([key, value]) => {
    if (!hasGap("socials", key)) {
      return;
    }
    if (!mergedSocials[key]) {
      mergedSocials[key] = value;
    }
    const intelSources = gatherSources("socials", key);
    socialSourceMap[key] = Array.from(
      new Set([...(socialSourceMap[key] ?? []), ...intelSources])
    );
  });

  if (
    JSON.stringify(mergedSocials) !== JSON.stringify(normalizedExistingSocials)
  ) {
    patch.socials = mergedSocials;
  }
  Object.entries(socialSourceMap).forEach(([key, sources]) => {
    if (!mergedSocials[key]) {
      return;
    }
    updateFieldEvidence({
      company,
      evidence: fieldEvidence,
      field: `socials.${key}`,
      value: mergedSocials[key],
      sources
    });
  });

  patch.fieldSources = fieldEvidence;
  logger.info(
    { companyId: company.id, fieldSources: fieldEvidence },
    "company.intel.field_sources"
  );

  const refreshed = await firestore.saveCompanyDocument(company.id, patch);
  const updatedCompany = {
    ...company,
    ...refreshed
  };

  const jobs = await discoverJobsForCompany({
    company: updatedCompany,
    logger,
    searchResults,
    careerPageUrl,
    intelJobs: intelResult?.jobs ?? []
  });
  await saveDiscoveredJobs({ firestore, logger, company: updatedCompany, jobs });

  const jobDiscoveryStatus =
    jobs.length > 0
      ? CompanyJobDiscoveryStatusEnum.enum.FOUND_JOBS
      : CompanyJobDiscoveryStatusEnum.enum.NOT_FOUND;

  const jobDiscoveryAttempts = (company.jobDiscoveryAttempts ?? 0) + 1;
  await firestore.saveCompanyDocument(company.id, {
    jobDiscoveryStatus,
    lastJobDiscoveryAt: now,
    jobDiscoveryQueuedAt: now,
    jobDiscoveryAttempts,
    updatedAt: new Date()
  });
  return { jobs };
}

export async function runCompanyEnrichmentOnce(args) {
  const { firestore, logger, company } = args ?? {};
  if (!company?.id) {
    throw new Error("Company context required for enrichment");
  }
  try {
    return await runCompanyEnrichmentCore(args);
  } catch (error) {
    const reason = error?.name ?? "company_enrichment_error";
    const message = error?.message ?? "Company enrichment failed";
    logger?.error?.({ companyId: company.id, err: message }, "company.intel.failed");
    await markEnrichmentFailed({
      firestore,
      companyId: company.id,
      reason,
      message
    });
    throw error;
  }
}

export async function retryStuckEnrichments({ firestore, bigQuery, logger, llmClient }) {
  if (!firestore || !logger || !llmClient) {
    throw new Error("firestore, logger, and llmClient are required");
  }
  const pending = await firestore.listCollection("companies", [
    { field: "enrichmentStatus", operator: "==", value: CompanyEnrichmentStatusEnum.enum.PENDING }
  ]);
  if (!pending || pending.length === 0) {
    return { processed: 0 };
  }
  const cutoff = Date.now() - STUCK_ENRICHMENT_THRESHOLD_MS;
  const stuckCompanies = pending.filter((company) => {
    const queuedAtRaw = company.enrichmentQueuedAt ?? company.updatedAt ?? null;
    const queuedAt =
      queuedAtRaw instanceof Date ? queuedAtRaw : queuedAtRaw ? new Date(queuedAtRaw) : null;
    if (!queuedAt) {
      return true;
    }
    const time = queuedAt.getTime();
    return Number.isNaN(time) ? true : time <= cutoff;
  });

  for (const record of stuckCompanies) {
    try {
      if (record.nameConfirmed === false) {
        logger.warn(
          { companyId: record.id },
          "Skipping stuck enrichment retry because name is not confirmed"
        );
        continue;
      }
      const fresh = (await firestore.getDocument("companies", record.id)) ?? record;
      await runCompanyEnrichmentOnce({
        firestore,
        bigQuery,
        logger,
        llmClient,
        company: fresh
      });
    } catch (error) {
      logger.warn(
        { companyId: record.id, err: error },
        "retryStuckEnrichments failed for company"
      );
    }
  }
  return { processed: stuckCompanies.length };
}

export async function discoverJobsForCompany({
  company,
  logger,
  searchResults = [],
  careerPageUrl,
  intelJobs = []
} = {}) {
  if (!company) {
    return [];
  }

  const verifiedIntelJobs = Array.isArray(intelJobs)
    ? intelJobs.map((job) => normalizeIntelJob(job, company)).filter(Boolean)
    : [];

  const scrapedCareerJobs = await discoverJobsFromCareerPage({
    careerPageUrl: careerPageUrl ?? company.careerPageUrl ?? null,
    company,
    logger
  });

  const linkedinFeedJobs = await discoverJobsFromLinkedInFeed({
    company,
    linkedinUrl: company.socials?.linkedin ?? null,
    logger
  });

  const aggregated = dedupeJobs([...scrapedCareerJobs, ...linkedinFeedJobs, ...verifiedIntelJobs]);

  if (aggregated.length === 0 && searchResults.length > 0) {
    logger?.debug?.(
      { companyId: company.id },
      "No verifiable jobs discovered from search results yet"
    );
  }

  return aggregated;
}

export async function saveDiscoveredJobs({ firestore, logger, company, jobs }) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return;
  }
  const ownerUserId = company.createdByUserId ?? DISCOVERED_JOB_OWNER_FALLBACK;
  if (!company.createdByUserId) {
    logger?.debug?.(
      { companyId: company.id },
      "Using fallback owner for discovered jobs"
    );
  }
  const companyName =
    company.name && company.name.trim().length > 0
      ? company.name
      : deriveCompanyNameFromDomain(company.primaryDomain);
  const companyLogo =
    company.logoUrl ??
    company.brand?.logoUrl ??
    company.brand?.iconUrl ??
    "";
  for (const job of jobs) {
    const now = job.discoveredAt ?? new Date();
    const jobId = job.id ?? `discoveredJob_${uuid()}`;
    const payload = JobSchema.parse({
      id: jobId,
      ownerUserId,
      orgId: null,
      companyId: company.id,
      status: "draft",
      stateMachine: {
        currentState: "DRAFT",
        previousState: null,
        history: [],
        requiredComplete: false,
        optionalComplete: false,
        lastTransitionAt: now,
        lockedByRequestId: null
      },
      roleTitle: job.title ?? "",
      companyName,
      logoUrl: companyLogo,
      location: job.location ?? "",
      zipCode: "",
      industry: job.industry ?? company.industry ?? undefined,
      seniorityLevel: job.seniorityLevel ?? undefined,
      employmentType: job.employmentType ?? undefined,
      workModel: job.workModel ?? undefined,
      jobDescription: job.description ?? "",
      coreDuties: Array.isArray(job.coreDuties) ? job.coreDuties : [],
      mustHaves: Array.isArray(job.mustHaves) ? job.mustHaves : [],
      benefits: Array.isArray(job.benefits) ? job.benefits : [],
      salary: job.salary ?? undefined,
      salaryPeriod: job.salaryPeriod ?? undefined,
      currency: job.currency ?? undefined,
      confirmed: {},
      importContext: {
        source: job.source ?? determineJobSource(job.url, company),
        externalSource: job.source ?? null,
        externalUrl: job.url ?? null,
        sourceUrl: job.url ?? null,
        companyJobId: job.externalId ?? undefined,
        discoveredAt: job.discoveredAt ?? now,
        originalPostedAt: job.postedAt ?? null,
        importedAt: now,
        companyIntelSource: "company-intel-worker",
        overallConfidence: job.overallConfidence ?? null,
        fieldConfidence: job.fieldConfidence ?? null,
        evidenceSources: job.evidenceSources ?? []
      },
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    });
    await firestore.saveDiscoveredJob(jobId, payload);
    logger?.info?.(
      { companyId: company.id, jobId },
      "Saved discovered company job"
    );
  }
}

function normalizeSocials(socials = {}) {
  const normalized = {};
  Object.entries(socials).forEach(([key, value]) => {
    const url = normalizeUrl(value);
    if (url) {
      normalized[key] = url;
    }
  });
  return normalized;
}

function normalizeUrl(value) {
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

function coerceDate(value) {
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

function normalizeIntelJob(job, company) {
  if (!job || typeof job !== "object") {
    return null;
  }
  const candidate = buildCandidateJobPayload({
    company,
    title: job.title,
    url: job.url,
    source: job.source ?? "intel-agent",
    location: sanitizeString(job.location) ?? "",
    description: sanitizeString(job.description) ?? "",
    postedAt: job.postedAt ?? null,
    discoveredAt: job.discoveredAt ?? new Date(),
    externalId: sanitizeString(job.externalId) || undefined,
    evidenceSources: Array.isArray(job.sourceEvidence) ? job.sourceEvidence : [],
    industry: sanitizeString(job.industry),
    seniorityLevel: sanitizeString(job.seniorityLevel),
    employmentType: sanitizeString(job.employmentType),
    workModel: sanitizeString(job.workModel),
    salary: sanitizeString(job.salary),
    salaryPeriod: sanitizeString(job.salaryPeriod),
    currency: sanitizeString(job.currency),
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

function normalizeIntelEvidence(evidence = {}) {
  const normalizeSection = (section = {}) => {
    const normalized = {};
    Object.entries(section ?? {}).forEach(([field, entry]) => {
      const sources = Array.isArray(entry?.sources)
        ? entry.sources.map((src) => sanitizeString(src)).filter(Boolean)
        : [];
      normalized[field] = sources;
    });
    return normalized;
  };
  const normalizeJobEvidence = Array.isArray(evidence?.jobs)
    ? evidence.jobs
        .map((entry) => ({
          title: sanitizeString(entry?.title ?? ""),
          url: normalizeUrl(entry?.url ?? ""),
          sources: Array.isArray(entry?.sources)
            ? entry.sources.map((src) => sanitizeString(src)).filter(Boolean)
            : []
        }))
        .filter((record) => record.title || record.url)
    : [];
  return {
    profile: normalizeSection(evidence?.profile),
    branding: normalizeSection(evidence?.branding),
    socials: normalizeSection(evidence?.socials),
    jobs: normalizeJobEvidence
  };
}

function updateFieldEvidence({ company, evidence, field, value, sources = [] }) {
  if (value === undefined || value === null) {
    return;
  }
  const normalizedSources = Array.from(
    new Set((Array.isArray(sources) ? sources : []).filter(Boolean))
  );
  const prev =
    evidence[field] ??
    company.fieldSources?.[field] ??
    null;
  const mergedSources = Array.from(
    new Set([...(prev?.sources ?? []), ...normalizedSources])
  );
  evidence[field] = {
    value,
    sources: mergedSources
  };
}
function buildCandidateJobPayload({
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
  const normalizedUrl = normalizeUrl(url);
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
