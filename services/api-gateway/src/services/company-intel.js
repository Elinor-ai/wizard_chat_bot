import { v4 as uuid } from "uuid";
import {
  CompanySchema,
  CompanyDiscoveredJobSchema,
  CompanyEnrichmentStatusEnum,
  CompanyJobDiscoveryStatusEnum,
  CompanyTypeEnum
} from "@wizard/core";
import { recordLlmUsageFromResult } from "./llm-usage-ledger.js";
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
const ENRICHMENT_LOCK_TTL_MS = 5 * 60 * 1000;
const BRANDFETCH_API_URL = "https://api.brandfetch.io/v2/brands";
const BRANDFETCH_API_TOKEN = "mrzkuqeDHxVfPF2xEOGgtPCPRP6jpIyCpMd0XJ1Gvf4=";
const BRAND_SOURCE = "brandfetch";

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

export async function searchCompanyOnWeb({ domain, name, location, logger, limit = 8 } = {}) {
  const query = [name, domain, location].filter(Boolean).join(" ").trim();
  if (!query) {
    return [];
  }
  if (!ALLOW_WEB_FETCH) {
    logger?.debug?.({ domain, query }, "Skipped live web search (disabled)");
    return [];
  }

  // TODO: integrate SerpAPI/programmable search and return structured results.
  logger?.info?.({ domain, query, limit }, "Company web search requested");
  return [];
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

export async function discoverCareerPage({ domain, websiteUrl, searchResults = [] }) {
  const fromSearch = searchResults.find((result) =>
    /career|jobs|join/i.test(result?.url ?? "")
  );
  if (fromSearch?.url) {
    return fromSearch.url;
  }
  return tryDiscoverCareerPath(websiteUrl ?? (domain ? `https://${domain}` : null));
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

function dedupeJobs(jobs = []) {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = job.url ?? `${job.title}|${job.location ?? ""}`.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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
    if (!/career|job|role|opening|position/i.test(text)) continue;
    const url = resolveRelativeUrl(baseUrl, href);
    if (!url || !isLikelyRealJobUrl(url, company)) continue;

    matches.push({
      title: sanitizeJobTitle(text),
      location: "",
      description: "",
      url,
      source: determineJobSource(url, company),
      discoveredAt: new Date(),
      isActive: true
    });

    if (matches.length >= 10) {
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
    return extractJobAnchorsFromHtml({ html: body, baseUrl: careerPageUrl, company });
  } catch (error) {
    logger?.debug?.({ careerPageUrl, err: error }, "Failed to crawl career page");
    return [];
  }
}

async function discoverJobsFromLinkedInFeed({ company, linkedinUrl, logger }) {
  if (!linkedinUrl) {
    return [];
  }

  logger?.debug?.(
    { companyId: company.id, linkedinUrl },
    "LinkedIn feed job discovery placeholder"
  );

  // TODO: Integrate LinkedIn feed crawling or LLM summarization to extract hiring signals.
  // This should analyze recent posts for phrases like “We’re hiring” and resolve real apply links.
  return [];
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

export function startCompanyIntelWorker({ firestore, llmClient, logger }) {
  if (!firestore || !llmClient || !logger) {
    throw new Error("firestore, llmClient, and logger are required to start worker");
  }
  if (startCompanyIntelWorker.started) {
    return;
  }
  startCompanyIntelWorker.started = true;
  processCompanyIntelJobs({ firestore, llmClient, logger });
}

startCompanyIntelWorker.started = false;

async function processCompanyIntelJobs({ firestore, llmClient, logger }) {
  while (true) {
    try {
      const claimedCompany = await claimNextCompanyForEnrichment({ firestore });
      if (!claimedCompany) {
        await delay(8000);
        continue;
      }

      logger.info(
        { companyId: claimedCompany.id },
        "Processing company enrichment run"
      );

      const company = await firestore.getDocument("companies", claimedCompany.id);
      if (!company) {
        logger.warn(
          { companyId: claimedCompany.id },
          "Company document missing for enrichment run"
        );
        continue;
      }

      if (company.nameConfirmed === false) {
        await markEnrichmentFailed({
          firestore,
          companyId: company.id,
          reason: "name_not_confirmed",
          message: "Company name must be confirmed before enrichment can run"
        });
        continue;
      }

      const startTime = new Date();
      const attempts = (company.enrichmentAttempts ?? 0) + 1;
      await firestore.saveCompanyDocument(company.id, {
        enrichmentStartedAt: startTime,
        enrichmentLockedAt: startTime,
        enrichmentAttempts: attempts,
        enrichmentError: null,
        updatedAt: startTime
      });

      const refreshedCompany =
        (await firestore.getDocument("companies", company.id)) ?? company;

      try {
        await runCompanyEnrichmentOnce({
          firestore,
          logger,
          llmClient,
          company: refreshedCompany
        });
        logger.info(
          { companyId: company.id },
          "Company enrichment run completed"
        );
      } catch (error) {
        logger.warn(
          { companyId: company.id, err: error },
          "Company enrichment run failed"
        );
        await markEnrichmentFailed({
          firestore,
          companyId: company.id,
          reason: "enrichment_failed",
          message: error?.message ?? "Enrichment pipeline failed"
        });
      }
    } catch (error) {
      logger.error({ err: error }, "Company intel worker loop error");
      await delay(8000);
    }
  }
}

async function claimNextCompanyForEnrichment({ firestore }) {
  const pending = await firestore.listCollection("companies", [
    { field: "enrichmentStatus", operator: "==", value: CompanyEnrichmentStatusEnum.enum.PENDING }
  ]);
  if (!pending || pending.length === 0) {
    return null;
  }
  const available = pending.filter(isLockAvailable);
  if (available.length === 0) {
    return null;
  }
  const nextCompany = available.sort((a, b) => {
    const aTime = resolveSortTime(a);
    const bTime = resolveSortTime(b);
    return aTime - bTime;
  })[0];
  const lockTime = new Date();
  await firestore.saveCompanyDocument(nextCompany.id, {
    enrichmentLockedAt: lockTime,
    updatedAt: lockTime
  });
  return { ...nextCompany, enrichmentLockedAt: lockTime };
}

function resolveSortTime(company) {
  const fallback = company.updatedAt ?? 0;
  const source = company.enrichmentQueuedAt ?? fallback;
  const value = source instanceof Date ? source : new Date(source);
  const time = value.getTime();
  return Number.isNaN(time) ? 0 : time;
}

function isLockAvailable(company) {
  if (!company.enrichmentLockedAt) {
    return true;
  }
  const lockSource =
    company.enrichmentLockedAt instanceof Date
      ? company.enrichmentLockedAt
      : new Date(company.enrichmentLockedAt);
  const lockTime = lockSource.getTime();
  if (Number.isNaN(lockTime)) {
    return true;
  }
  return Date.now() - lockTime > ENRICHMENT_LOCK_TTL_MS;
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runCompanyEnrichmentOnce({ firestore, logger, llmClient, company }) {
  if (!company?.id) {
    throw new Error("Company context required for enrichment");
  }

  const normalizedDomain = company.primaryDomain?.toLowerCase();
  if (normalizedDomain && !isGenericEmailDomain(normalizedDomain)) {
    const brandfetchData = await fetchBrandfetchData(normalizedDomain, logger);
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
      }
    }
  }

  const searchResults = await searchCompanyOnWeb({
    domain: company.primaryDomain,
    name: company.name,
    location: company.hqCountry ?? company.locationHint ?? "",
    logger
  });

  const intelResult = await llmClient.askCompanyIntel({
    domain: company.primaryDomain,
    company
  });
  await recordLlmUsageFromResult({
    firestore,
    logger,
    usageContext: {
      userId: company.createdByUserId ?? null,
      jobId: null,
      taskType: "company_intel"
    },
    result: intelResult
  });

  if (intelResult?.error) {
    throw new Error(intelResult.error.message ?? "LLM company intel task failed");
  }

  const profile = intelResult?.profile ?? {};
  const branding = intelResult?.branding ?? {};
  const llmSocials = intelResult?.socials ?? {};
  const normalizedWebsite =
    normalizeUrl(profile.website) ??
    normalizeUrl(company.website) ??
    `https://${company.primaryDomain}`;
  const careerPageUrl =
    (await discoverCareerPage({
      domain: company.primaryDomain,
      websiteUrl: normalizedWebsite,
      searchResults
    })) ?? company.careerPageUrl ?? null;
  const now = new Date();
  const sourcesUsed = new Set(company.sourcesUsed ?? []);
  sourcesUsed.add("gemini-intel");
  if (searchResults.length > 0) {
    sourcesUsed.add("web-search");
  }
  const fieldEvidence = { ...(company.fieldSources ?? {}) };
  const applyField = (field, value, sources = []) => {
    if (value === undefined || value === null) return;
    patch[field] = value;
    updateFieldEvidence({
      company,
      evidence: fieldEvidence,
      field,
      value,
      sources
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

  const websiteSources = [];
  if (profile.website) {
    websiteSources.push("gemini-intel");
  } else if (!company.website) {
    websiteSources.push("domain-default");
  }
  applyField("website", normalizedWebsite, websiteSources);
  applyField("careerPageUrl", careerPageUrl, ["career-page-discovery"]);
  applyField("intelSummary", profile.summary, ["gemini-intel"]);

  applyField("name", profile.officialName, ["gemini-intel"]);
  applyField("tagline", profile.tagline, ["gemini-intel"]);
  applyField("industry", profile.industry, ["gemini-intel"]);
  applyField("companyType", profile.companyType, ["gemini-intel"]);
  applyField("employeeCountBucket", profile.employeeCountBucket, ["gemini-intel"]);
  applyField("hqCountry", profile.hqCountry, ["gemini-intel"]);
  applyField("hqCity", profile.hqCity, ["gemini-intel"]);
  applyField("toneOfVoice", profile.toneOfVoice, ["gemini-intel"]);

  applyField("primaryColor", branding.primaryColor, ["gemini-intel"]);
  applyField("secondaryColor", branding.secondaryColor, ["gemini-intel"]);
  applyField("fontFamilyPrimary", branding.fontFamilyPrimary, ["gemini-intel"]);

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
    if (!mergedSocials[key]) {
      mergedSocials[key] = value;
    }
    socialSourceMap[key] = Array.from(new Set([...(socialSourceMap[key] ?? []), "gemini-intel"]));
  });

  patch.socials = mergedSocials;
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
  for (const job of jobs) {
    const jobId = `companyJob_${uuid()}`;
    const payload = CompanyDiscoveredJobSchema.parse({
      id: jobId,
      companyId: company.id,
      companyDomain: company.primaryDomain,
      source: job.source ?? "other",
      externalId: job.externalId ?? null,
      title: job.title ?? "Untitled role",
      location: job.location ?? "",
      description: job.description ?? "",
      url: job.url ?? null,
      postedAt: job.postedAt ?? null,
      discoveredAt: job.discoveredAt ?? new Date(),
      isActive: job.isActive ?? true
    });
    await firestore.saveCompanyJob(jobId, payload);
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

function normalizeIntelJob(job, company) {
  if (!job || typeof job !== "object") {
    return null;
  }
  const title = sanitizeJobTitle(job.title);
  const url = normalizeUrl(job.url);
  if (!title || !url) {
    return null;
  }
  if (!isLikelyRealJobUrl(url, company)) {
    return null;
  }

  return {
    title,
    location: typeof job.location === "string" ? job.location.trim() : "",
    description: typeof job.description === "string" ? job.description.trim() : "",
    url,
    source: job.source ?? determineJobSource(url, company),
    externalId: job.externalId ?? null,
    postedAt: job.postedAt ?? null,
    discoveredAt: job.discoveredAt ?? new Date(),
    isActive: job.isActive ?? true
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
