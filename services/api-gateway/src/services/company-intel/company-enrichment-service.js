/**
 * @file company-enrichment-service.js
 * Main company enrichment orchestration service.
 * Extracted from company-intel.js for better modularity.
 */

import { CompanyEnrichmentStatusEnum, CompanyTypeEnum } from "@wizard/core";
import { recordLlmUsageFromResult } from "../llm-usage-ledger.js";
import { LLM_CORE_TASK } from "../../config/task-types.js";

import { BRAND_SOURCE, STUCK_ENRICHMENT_THRESHOLD_MS } from "./config.js";
import {
  hasValue,
  normalizeUrl,
  normalizeSocials,
  isGenericEmailDomain,
  sanitizeString,
} from "./utils.js";
import { fetchBrandfetchData, applyBrandfetchToCompany, ensureBrandShape } from "./brandfetch-service.js";
import { searchCompanyOnWeb, extractSocialLinksFromResults } from "./web-search-service.js";
import { fetchWebsiteHtml, extractMetaTags, discoverCareerPage, loadHtml } from "./website-scraper.js";
import { markEnrichmentFailed } from "./company-repository-helpers.js";
import { runJobDiscoveryForCompany } from "../job-intel/job-discovery-service.js";

/**
 * Compute gaps in company data.
 * @param {Object} company - Company object
 * @returns {Object} Gaps by section
 */
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

/**
 * Build gap lookup from gaps object.
 * @param {Object} gaps - Gaps object
 * @returns {Object} Gap lookup
 */
function buildGapLookup(gaps = {}) {
  const lookup = {};
  Object.entries(gaps ?? {}).forEach(([section, fields]) => {
    lookup[section] = new Set(Array.isArray(fields) ? fields : []);
  });
  return lookup;
}

/**
 * Normalize intel evidence from LLM response.
 * @param {Object} evidence - Evidence object
 * @returns {Object} Normalized evidence
 */
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

/**
 * Update field evidence tracking.
 * @param {Object} params
 * @param {Object} params.company - Company object
 * @param {Object} params.evidence - Evidence object
 * @param {string} params.field - Field name
 * @param {*} params.value - Field value
 * @param {Array} params.sources - Sources array
 */
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

/**
 * Run the core company enrichment pipeline.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.bigQuery - BigQuery instance
 * @param {Object} params.logger - Logger instance
 * @param {Object} params.llmClient - LLM client
 * @param {Object} params.company - Company to enrich
 * @returns {Promise<Object>} Enrichment result with jobs
 */
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

  // Run initial data gathering in parallel
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

  let websiteHtml = websiteResult.status === "fulfilled" ? websiteResult.value : null;
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
    websiteContext = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 10000);
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

  // Apply Brandfetch data if available
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

  // Call LLM for company intel
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

  // Build patch object
  const now = new Date();
  const sourcesUsed = new Set(company.sourcesUsed ?? []);
  sourcesUsed.add("gemini-intel");
  if (searchResults.length > 0) {
    sourcesUsed.add("web-search");
  }
  const fieldEvidence = { ...(company.fieldSources ?? {}) };

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

  // Apply meta tags
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

  // Apply profile fields
  const normalizedWebsite =
    normalizeUrl(profile.website) ??
    normalizeUrl(company.website) ??
    (company.primaryDomain ? `https://${company.primaryDomain}` : null);

  if (normalizedWebsite && (!websiteHtml || normalizedWebsite !== currentWebsiteBase)) {
    currentWebsiteBase = normalizedWebsite;
    const fetched = await fetchWebsiteHtml(normalizedWebsite, logger);
    if (fetched) {
      hydrateWebsiteArtifacts(fetched, currentWebsiteBase);
    } else if (websiteCheerio) {
      metaTags = extractMetaTags(websiteCheerio, currentWebsiteBase);
    }
  }

  // Discover career page URL with intel jobs from LLM
  const intelJobs = intelResult?.jobs ?? [];
  const careerPageDiscovery = await discoverCareerPage({
    domain: company.primaryDomain,
    websiteUrl: normalizedWebsite,
    searchResults,
    websiteHtml,
    websiteCheerio,
    intelJobs
  });
  const careerPageUrl = careerPageDiscovery?.url ?? company.careerPageUrl ?? null;
  const careerPageSource = careerPageDiscovery?.source ?? null;

  logger?.debug?.(
    {
      companyId: company.id,
      careerPageUrl,
      careerPageSource,
      intelJobsCount: intelJobs.length
    },
    "company.intel.career_page_discovery"
  );

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
    // Map source to readable evidence name
    const sourceMap = {
      intel_jobs: "llm_intel_jobs",
      web_search: "web_search",
      website_nav: "website_navigation",
      common_path: "common_career_path"
    };
    const careerSources = careerPageSource
      ? [sourceMap[careerPageSource] ?? careerPageSource]
      : ["career-page-discovery"];

    applyField("careerPageUrl", careerPageUrl, {
      section: null,
      evidenceSection: null,
      requireGap: false,
      sources: careerSources
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
  if (profile.employeeCountBucket && profile.employeeCountBucket !== "unknown" && hasGap("segmentation", "employeeCountBucket")) {
    applyField("employeeCountBucket", profile.employeeCountBucket, {
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

  // Merge social links
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

  if (JSON.stringify(mergedSocials) !== JSON.stringify(normalizedExistingSocials)) {
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

  // Save enriched company
  const refreshed = await firestore.saveCompanyDocument(company.id, patch);
  const updatedCompany = {
    ...company,
    ...refreshed
  };

  // Discover and save jobs using the reusable job discovery service
  const { jobs } = await runJobDiscoveryForCompany({
    firestore,
    logger,
    company: updatedCompany,
    now,
    searchResults,
    careerPageUrl,
    intelJobs: intelResult?.jobs ?? []
  });

  return { jobs };
}

/**
 * Run company enrichment with error handling.
 * @param {Object} args - Arguments
 * @returns {Promise<Object>} Result with jobs
 */
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

/**
 * Retry stuck enrichments.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.bigQuery - BigQuery instance
 * @param {Object} params.logger - Logger instance
 * @param {Object} params.llmClient - LLM client
 * @returns {Promise<Object>} Result with processed count
 */
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
