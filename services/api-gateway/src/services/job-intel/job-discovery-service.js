/**
 * @file job-discovery-service.js
 * Reusable job discovery service that can be called from:
 * - company_intel flow (after enrichment)
 * - job_intel_agent flow (standalone job discovery)
 *
 * This is the single source of truth for:
 * - Discovering jobs from career pages, LinkedIn, and LLM intel
 * - Deduplicating jobs
 * - Saving discovered jobs to Firestore
 * - Updating company.jobDiscoveryStatus
 */

import { CompanyJobDiscoveryStatusEnum } from "@wizard/core";
import {
  discoverJobsFromCareerPage,
  discoverJobsFromLinkedInFeed,
  normalizeIntelJob,
} from "../company-intel/job-extraction.js";
import { dedupeJobs, isFirstPartySource } from "../company-intel/job-deduplication.js";
import { saveDiscoveredJobs } from "../company-intel/company-repository-helpers.js";
import { extractCareerUrlFromIntelJobs, resolveCareerUrl } from "../company-intel/website-scraper.js";
import { fetchJobsFromAts, isAtsUrl, detectAtsFromUrl } from "./ats-adapters/index.js";

// =============================================================================
// SOURCE AGGREGATION HELPERS
// =============================================================================

/**
 * Get URL key for deduplication comparison.
 * @param {Object} job - Job object
 * @returns {string|null} Normalized URL or null
 */
function getJobUrlKey(job) {
  if (!job?.url || typeof job.url !== "string") return null;
  return job.url.trim().toLowerCase();
}

/**
 * Count jobs by source type.
 * @param {Array} jobs - Array of jobs
 * @returns {Object} Counts by source
 */
function countJobsBySource(jobs = []) {
  const counts = {
    "careers-site": 0,
    "ats-api": 0,
    linkedin: 0,
    "linkedin-post": 0,
    "intel-agent": 0,
    other: 0
  };
  for (const job of jobs) {
    const source = job?.source ?? "other";
    if (source in counts) {
      counts[source]++;
    } else {
      counts.other++;
    }
  }
  return counts;
}

/**
 * Aggregate jobs with source priority.
 *
 * Aggregation priority:
 * 1. If careerJobs.length > 0: Use career jobs as primary, only add intelJobs with distinct URLs
 * 2. Else if linkedinJobs.length > 0: Use LinkedIn as primary, enrich with intelJobs
 * 3. Else: Fall back to intelJobs (marked with source: "intel-agent", lower confidence)
 *
 * @param {Object} params
 * @param {Array} params.careerJobs - Jobs from career page scraping
 * @param {Array} params.linkedinJobs - Jobs from LinkedIn feed
 * @param {Array} params.intelJobs - Jobs from LLM intel (hints)
 * @returns {Object} { jobs: Array, strategy: string, sourceCounts: Object }
 */
function aggregateJobsWithPriority({ careerJobs = [], linkedinJobs = [], intelJobs = [] }) {
  // Get all first-party URLs (career page + ATS)
  const firstPartyUrls = new Set();
  for (const job of careerJobs) {
    const key = getJobUrlKey(job);
    if (key) firstPartyUrls.add(key);
  }

  // Get all LinkedIn URLs
  const linkedinUrls = new Set();
  for (const job of linkedinJobs) {
    const key = getJobUrlKey(job);
    if (key) linkedinUrls.add(key);
  }

  let jobs = [];
  let strategy = "fallback_intel";

  if (careerJobs.length > 0) {
    // STRATEGY 1: Career page jobs are primary
    // Only add intel jobs with distinct URLs not already in career jobs
    strategy = "career_page_primary";
    jobs = [...careerJobs];

    // Add LinkedIn jobs (may overlap with career page, dedupe will handle)
    jobs.push(...linkedinJobs);

    // Only add intel jobs if they have URLs not in first-party sources
    const distinctIntelJobs = intelJobs.filter((job) => {
      const key = getJobUrlKey(job);
      // Skip if URL already exists in first-party or LinkedIn
      return key && !firstPartyUrls.has(key) && !linkedinUrls.has(key);
    });

    // Only include a limited number of distinct intel jobs as "enrichment"
    const maxIntelEnrichment = 5;
    jobs.push(...distinctIntelJobs.slice(0, maxIntelEnrichment));

  } else if (linkedinJobs.length > 0) {
    // STRATEGY 2: LinkedIn jobs are primary (no career page jobs found)
    strategy = "linkedin_primary";
    jobs = [...linkedinJobs];

    // Add intel jobs with distinct URLs
    const distinctIntelJobs = intelJobs.filter((job) => {
      const key = getJobUrlKey(job);
      return key && !linkedinUrls.has(key);
    });

    // Include more intel jobs as enrichment when LinkedIn is primary
    const maxIntelEnrichment = 10;
    jobs.push(...distinctIntelJobs.slice(0, maxIntelEnrichment));

  } else if (intelJobs.length > 0) {
    // STRATEGY 3: Fallback to intel jobs only
    // This is acceptable but should be clearly logged
    strategy = "fallback_intel";
    jobs = [...intelJobs];
  }

  const sourceCounts = countJobsBySource(jobs);

  return { jobs, strategy, sourceCounts };
}

// =============================================================================
// DEBUG LOGGING HELPERS
// =============================================================================

const DEBUG_PREFIX = "[JOB_DISCOVERY_DEBUG]";

function debugLog(stage, message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`\n${DEBUG_PREFIX} ========== ${stage} ==========`);
  console.log(`${DEBUG_PREFIX} [${timestamp}] ${message}`);
  if (data !== null) {
    console.log(`${DEBUG_PREFIX} Data:`, JSON.stringify(data, null, 2));
  }
  console.log(`${DEBUG_PREFIX} =====================================\n`);
}

function debugLogCompact(stage, message, data = null) {
  const timestamp = new Date().toISOString();
  if (data !== null) {
    console.log(`${DEBUG_PREFIX} [${timestamp}] ${stage}: ${message}`, JSON.stringify(data));
  } else {
    console.log(`${DEBUG_PREFIX} [${timestamp}] ${stage}: ${message}`);
  }
}

/**
 * Discover jobs for a company from multiple sources.
 * This is a pure discovery function without Firestore writes.
 *
 * @param {Object} params
 * @param {Object} params.company - Company document
 * @param {Object} params.logger - Logger instance
 * @param {Array} [params.searchResults] - Web search results (optional, from enrichment)
 * @param {string} [params.careerPageUrl] - Career page URL (optional, falls back to company.careerPageUrl)
 * @param {Array} [params.intelJobs] - Jobs from LLM intel (optional, from enrichment)
 * @returns {Promise<Array>} Array of deduplicated job candidates
 */
export async function discoverJobsForCompany({
  company,
  logger,
  searchResults = [],
  careerPageUrl,
  intelJobs = []
} = {}) {
  debugLog("DISCOVER_START", "Starting job discovery for company", {
    companyId: company?.id,
    companyName: company?.name,
    careerPageUrl: careerPageUrl ?? company?.careerPageUrl,
    linkedinUrl: company?.socials?.linkedin,
    searchResultsCount: searchResults?.length ?? 0,
    intelJobsCount: intelJobs?.length ?? 0
  });

  if (!company) {
    debugLogCompact("DISCOVER", "No company provided, returning empty array");
    return [];
  }

  logger?.info?.(
    {
      companyId: company.id,
      companyName: company.name,
      careerPageUrl: careerPageUrl ?? company.careerPageUrl,
      hasSearchResults: searchResults.length > 0,
      hasIntelJobs: intelJobs.length > 0
    },
    "job_discovery.discover_start"
  );

  // ==========================================================================
  // STEP 1: Resolve career page URL (with fallback to intelJobs hints)
  // ==========================================================================

  // First, try the explicit careerPageUrl or company.careerPageUrl
  let initialCareerUrl = careerPageUrl ?? company.careerPageUrl ?? null;
  let careerUrlSource = initialCareerUrl ? "company_document" : null;

  // Fallback: If no career URL, try to infer from intelJobs hints
  if (!initialCareerUrl && Array.isArray(intelJobs) && intelJobs.length > 0) {
    const inferredFromIntel = extractCareerUrlFromIntelJobs({
      intelJobs,
      domain: company.primaryDomain
    });
    if (inferredFromIntel) {
      initialCareerUrl = inferredFromIntel;
      careerUrlSource = "inferred_from_intel_jobs";
      debugLog("CAREER_URL_FALLBACK", "Inferred career URL from intelJobs", {
        inferredUrl: inferredFromIntel,
        intelJobsCount: intelJobs.length
      });
    }
  }

  // Follow redirects to get the final URL (may land on ATS platform)
  let resolvedCareerUrl = initialCareerUrl;
  let redirectChain = [];
  let atsDetectedFromRedirect = null;

  if (initialCareerUrl) {
    const resolved = await resolveCareerUrl({ url: initialCareerUrl, logger });
    resolvedCareerUrl = resolved.finalUrl ?? initialCareerUrl;
    redirectChain = resolved.redirectChain ?? [];
    atsDetectedFromRedirect = resolved.atsDetected;

    if (redirectChain.length > 0) {
      debugLog("CAREER_URL_REDIRECT", "Career URL redirected", {
        originalUrl: initialCareerUrl,
        finalUrl: resolvedCareerUrl,
        redirectCount: redirectChain.length,
        atsDetected: atsDetectedFromRedirect,
        redirectChain
      });
    }
  }

  debugLog("CAREER_URL_RESOLUTION", "Final career page URL", {
    initialCareerUrl,
    resolvedCareerUrl,
    careerUrlSource,
    redirectsFollowed: redirectChain.length,
    atsDetectedFromRedirect,
    explicitCareerPageUrl: careerPageUrl,
    companyCareerPageUrl: company.careerPageUrl,
    hasUrl: !!resolvedCareerUrl
  });

  // ==========================================================================
  // STEP 2: Process intelJobs as HINTS (not authoritative job listings)
  // ==========================================================================

  // NOTE: intelJobs are treated as hints, not authoritative job sources.
  // They're useful for discovering the career URL but may contain inaccurate
  // or outdated job listings. The main jobs should come from:
  // - Career page scraping
  // - LinkedIn feed
  // - External search + HTML interpretation

  debugLogCompact("INTEL_JOBS", `Processing ${intelJobs?.length ?? 0} intel jobs as HINTS`);
  const verifiedIntelJobs = Array.isArray(intelJobs)
    ? intelJobs.map((job) => normalizeIntelJob(job, company)).filter(Boolean)
    : [];
  debugLog("INTEL_JOBS", `Normalized intel jobs (hints): ${verifiedIntelJobs.length}`,
    verifiedIntelJobs.map(j => ({ title: j.title, url: j.url }))
  );

  // ==========================================================================
  // STEP 3: Try ATS adapters first (if URL matches known ATS patterns)
  // ==========================================================================

  let atsJobs = [];
  let atsAdapter = null;
  let atsBoardUrl = null;

  if (resolvedCareerUrl && isAtsUrl(resolvedCareerUrl)) {
    const detectedAts = detectAtsFromUrl(resolvedCareerUrl);
    debugLog("ATS_DETECTION", "Detected ATS platform from career URL", {
      url: resolvedCareerUrl,
      atsType: detectedAts
    });

    const atsResult = await fetchJobsFromAts({
      url: resolvedCareerUrl,
      company,
      logger
    });

    atsJobs = atsResult.jobs ?? [];
    atsAdapter = atsResult.adapter;
    atsBoardUrl = atsResult.boardUrl;

    debugLog("ATS_FETCH", `Fetched ${atsJobs.length} jobs from ATS adapter`, {
      adapter: atsAdapter,
      boardUrl: atsBoardUrl,
      jobCount: atsJobs.length,
      jobs: atsJobs.slice(0, 5).map(j => ({
        title: j.title,
        url: j.url,
        location: j.location,
        source: j.source
      }))
    });
  }

  // ==========================================================================
  // STEP 4: Scrape career page for jobs (if ATS adapter didn't find jobs)
  // ==========================================================================

  // Only scrape if ATS adapter didn't return jobs
  let scrapedCareerJobs = [];

  if (atsJobs.length > 0) {
    debugLog("CAREER_PAGE", "Skipping generic scraping - using ATS adapter results", {
      atsAdapter,
      atsJobCount: atsJobs.length
    });
    // Use ATS jobs as the primary career page jobs
    scrapedCareerJobs = atsJobs;
  } else {
    debugLog("CAREER_PAGE", "Scraping career page (PRIMARY SOURCE)", {
      url: resolvedCareerUrl,
      source: careerUrlSource,
      hasUrl: !!resolvedCareerUrl,
      atsAttempted: atsAdapter !== null
    });

    scrapedCareerJobs = await discoverJobsFromCareerPage({
      careerPageUrl: resolvedCareerUrl,
      company,
      logger
    });

    debugLog("CAREER_PAGE", `Found ${scrapedCareerJobs.length} jobs from career page`,
      scrapedCareerJobs.map(j => ({
        title: j.title,
        url: j.url,
        location: j.location,
        source: j.source
      }))
    );
  }

  // ==========================================================================
  // STEP 5: Scrape LinkedIn feed for jobs (SECONDARY source)
  // ==========================================================================

  const linkedinUrl = company.socials?.linkedin ?? null;
  debugLog("LINKEDIN", "Scraping LinkedIn feed (SECONDARY SOURCE)", {
    url: linkedinUrl,
    hasUrl: !!linkedinUrl
  });

  const linkedinFeedJobs = await discoverJobsFromLinkedInFeed({
    company,
    linkedinUrl,
    logger
  });

  debugLog("LINKEDIN", `Found ${linkedinFeedJobs.length} jobs from LinkedIn`,
    linkedinFeedJobs.map(j => ({
      title: j.title,
      url: j.url,
      location: j.location,
      source: j.source
    }))
  );

  // ==========================================================================
  // STEP 6: Aggregate jobs with source priority
  // ==========================================================================

  // Use new aggregation strategy that prioritizes first-party sources:
  // 1. Career page jobs (first-party) are primary
  // 2. LinkedIn jobs are secondary
  // 3. Intel jobs are only used as hints/fallback with distinct URLs

  const aggregation = aggregateJobsWithPriority({
    careerJobs: scrapedCareerJobs,
    linkedinJobs: linkedinFeedJobs,
    intelJobs: verifiedIntelJobs
  });

  debugLog("AGGREGATION", "Aggregating jobs with source priority", {
    careerPageUrl: resolvedCareerUrl,
    careerUrlSource,
    strategy: aggregation.strategy,
    inputCounts: {
      careerJobs: scrapedCareerJobs.length,
      linkedinJobs: linkedinFeedJobs.length,
      intelJobHints: verifiedIntelJobs.length
    },
    preDedupeCount: aggregation.jobs.length,
    sourceCountsPreDedupe: aggregation.sourceCounts
  });

  // Deduplicate merged jobs (source-aware merging prefers first-party sources)
  const aggregated = dedupeJobs(aggregation.jobs);

  // Count jobs by source after deduplication
  const finalSourceCounts = countJobsBySource(aggregated);

  // ==========================================================================
  // STEP 7: Count primary vs secondary market jobs
  // ==========================================================================

  const preferredJobCountry = company?.hqCountry ?? null;
  const primaryMarketJobs = aggregated.filter((j) => j.isPrimaryMarket === true);
  const secondaryMarketJobs = aggregated.filter((j) => j.isPrimaryMarket !== true);

  // Check if first-party sources dominate (acceptance criteria)
  const firstPartyCount = (finalSourceCounts["careers-site"] ?? 0) + (finalSourceCounts["ats-api"] ?? 0);
  const intelOnlyCount = finalSourceCounts["intel-agent"] ?? 0;
  const isFirstPartyDominant = firstPartyCount > 0 && firstPartyCount >= intelOnlyCount;

  debugLog("DEDUPLICATION", "Deduplication complete", {
    strategy: aggregation.strategy,
    beforeDedupe: aggregation.jobs.length,
    afterDedupe: aggregated.length,
    removed: aggregation.jobs.length - aggregated.length,
    sourceCounts: finalSourceCounts,
    firstPartyCount,
    intelOnlyCount,
    isFirstPartyDominant,
    jobs: aggregated.map(j => ({
      title: j.title,
      url: j.url,
      source: j.source,
      overallConfidence: j.overallConfidence,
      location: j.location,
      country: j.country,
      city: j.city,
      isPrimaryMarket: j.isPrimaryMarket
    }))
  });

  debugLog("PRIMARY_MARKET", "Primary market analysis", {
    preferredJobCountry,
    primaryMarketJobs: primaryMarketJobs.length,
    secondaryMarketJobs: secondaryMarketJobs.length,
    primaryMarketJobTitles: primaryMarketJobs.map(j => ({
      title: j.title,
      location: j.location,
      country: j.country,
      source: j.source
    })),
    secondaryMarketJobTitles: secondaryMarketJobs.map(j => ({
      title: j.title,
      location: j.location,
      country: j.country,
      source: j.source
    }))
  });

  logger?.info?.(
    {
      companyId: company.id,
      strategy: aggregation.strategy,
      careerJobs: scrapedCareerJobs.length,
      linkedinJobs: linkedinFeedJobs.length,
      intelJobs: verifiedIntelJobs.length,
      totalAfterDedupe: aggregated.length,
      sourceCounts: finalSourceCounts,
      firstPartyCount,
      intelOnlyCount,
      isFirstPartyDominant,
      preferredJobCountry,
      primaryMarketJobs: primaryMarketJobs.length,
      secondaryMarketJobs: secondaryMarketJobs.length
    },
    "job_discovery.discover_complete"
  );

  // Log warning if fallback to intel-only jobs
  if (aggregation.strategy === "fallback_intel" && aggregated.length > 0) {
    logger?.warn?.(
      {
        companyId: company.id,
        jobCount: aggregated.length,
        sourceCounts: finalSourceCounts
      },
      "job_discovery.fallback_to_intel_jobs"
    );
    debugLog("WARNING", "Fell back to intel-agent jobs only - no first-party sources found", {
      jobCount: aggregated.length,
      allJobsAreIntelAgent: intelOnlyCount === aggregated.length
    });
  }

  if (aggregated.length === 0 && searchResults.length > 0) {
    debugLogCompact("DISCOVER", "No jobs found but search results were provided");
    logger?.debug?.(
      { companyId: company.id },
      "No verifiable jobs discovered from search results yet"
    );
  }

  debugLog("DISCOVER_COMPLETE", `Returning ${aggregated.length} jobs (${primaryMarketJobs.length} primary market, ${secondaryMarketJobs.length} secondary)`, {
    totalJobs: aggregated.length,
    strategy: aggregation.strategy,
    sourceCounts: finalSourceCounts,
    preferredJobCountry,
    primaryMarketJobs: primaryMarketJobs.length,
    secondaryMarketJobs: secondaryMarketJobs.length
  });

  return aggregated;
}

/**
 * Run full job discovery pipeline for a company.
 * This function:
 * 1. Discovers jobs from career pages, LinkedIn, and optionally LLM intel
 * 2. Deduplicates the jobs
 * 3. Saves jobs to Firestore (discoveredJobs collection)
 * 4. Updates company.jobDiscoveryStatus
 *
 * @param {Object} params
 * @param {Object} params.firestore - Firestore adapter
 * @param {Object} params.logger - Logger instance
 * @param {Object} params.company - Company document
 * @param {Date} [params.now] - Current timestamp (default: new Date())
 * @param {number} [params.maxJobsPerSource] - Max jobs per source (reserved for future use)
 * @param {Array} [params.searchResults] - Web search results (optional, from enrichment)
 * @param {string} [params.careerPageUrl] - Career page URL (optional)
 * @param {Array} [params.intelJobs] - Jobs from LLM intel (optional)
 * @returns {Promise<Object>} Result with jobs, jobDiscoveryStatus, jobCount
 */
export async function runJobDiscoveryForCompany({
  firestore,
  logger,
  company,
  now = new Date(),
  maxJobsPerSource = 100,
  searchResults = [],
  careerPageUrl,
  intelJobs = []
}) {
  const effectiveCareerUrl = careerPageUrl ?? company?.careerPageUrl ?? null;

  debugLog("PIPELINE_START", "Starting job discovery pipeline", {
    companyId: company?.id,
    companyName: company?.name,
    primaryDomain: company?.primaryDomain,
    careerPageUrl: effectiveCareerUrl,
    careerPageSource: careerPageUrl ? "explicit_param" : (company?.careerPageUrl ? "company_document" : "none"),
    linkedinUrl: company?.socials?.linkedin,
    maxJobsPerSource,
    searchResultsCount: searchResults?.length ?? 0,
    intelJobsCount: intelJobs?.length ?? 0
  });

  if (!company?.id) {
    debugLogCompact("PIPELINE", "Error: Company context required");
    throw new Error("Company context required for job discovery");
  }

  logger?.info?.(
    {
      companyId: company.id,
      companyName: company.name,
      careerPageUrl: effectiveCareerUrl,
      linkedinUrl: company.socials?.linkedin ?? null,
      intelJobsCount: intelJobs?.length ?? 0
    },
    "job_discovery.pipeline_start"
  );

  // Step 1: Discover jobs from all sources
  debugLogCompact("PIPELINE", "Step 1: Discovering jobs from all sources...");
  const jobs = await discoverJobsForCompany({
    company,
    logger,
    searchResults,
    careerPageUrl,
    intelJobs
  });
  debugLogCompact("PIPELINE", `Step 1 complete: Found ${jobs.length} jobs`);

  // Step 2: Save discovered jobs to Firestore
  debugLogCompact("PIPELINE", "Step 2: Saving jobs to Firestore...");
  await saveDiscoveredJobs({
    firestore,
    logger,
    company,
    jobs
  });
  debugLogCompact("PIPELINE", "Step 2 complete: Jobs saved");

  // Step 3: Determine job discovery status
  const jobDiscoveryStatus =
    jobs.length > 0
      ? CompanyJobDiscoveryStatusEnum.enum.FOUND_JOBS
      : CompanyJobDiscoveryStatusEnum.enum.NOT_FOUND;
  debugLogCompact("PIPELINE", `Step 3: Status = ${jobDiscoveryStatus}`);

  // Step 4: Update company document with discovery status
  const jobDiscoveryAttempts = (company.jobDiscoveryAttempts ?? 0) + 1;
  debugLogCompact("PIPELINE", `Step 4: Updating company (attempt #${jobDiscoveryAttempts})...`);
  await firestore.saveCompanyDocument(company.id, {
    jobDiscoveryStatus,
    lastJobDiscoveryAt: now,
    jobDiscoveryQueuedAt: now,
    jobDiscoveryAttempts,
    updatedAt: new Date()
  });
  debugLogCompact("PIPELINE", "Step 4 complete: Company updated");

  logger?.info?.(
    {
      companyId: company.id,
      jobCount: jobs.length,
      jobDiscoveryStatus,
      jobDiscoveryAttempts
    },
    "job_discovery.pipeline_complete"
  );

  const result = {
    jobs,
    jobDiscoveryStatus,
    jobCount: jobs.length
  };

  debugLog("PIPELINE_COMPLETE", "Pipeline finished", result);

  return result;
}
