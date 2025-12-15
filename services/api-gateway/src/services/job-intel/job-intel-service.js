/**
 * @file job-intel-service.js
 * Job Intel Agent Service - discovers job listings for a given company.
 *
 * ARCHITECTURE:
 * This service is invoked via POST /api/llm with taskType: "job_intel_agent".
 * It uses multiple discovery strategies:
 * - First-party sources: career pages, LinkedIn feed (via runJobDiscoveryForCompany)
 * - External search: web search + LLM classification (for SME/ENTERPRISE companies)
 *
 * The strategy is determined by company size and type:
 * - LOCAL_SMALL: Only first-party sources (cost-efficient)
 * - SME: First-party + limited external search
 * - ENTERPRISE: First-party + broader external search
 */

import { LLM_CORE_TASK } from "../../config/task-types.js";
import { runJobDiscoveryForCompany, discoverJobsForCompany } from "./job-discovery-service.js";
import { dedupeJobs } from "../company-intel/job-deduplication.js";
import { saveDiscoveredJobs } from "../company-intel/company-repository-helpers.js";
import { searchCompanyOnWeb } from "../company-intel/web-search-service.js";
import { discoverCareerPage } from "../company-intel/website-scraper.js";
import { COMMON_CAREER_PATHS } from "../company-intel/config.js";
import { recordLlmUsageFromResult } from "../llm-usage-ledger.js";
import { CompanyJobDiscoveryStatusEnum } from "@wizard/core";
import { load as loadHtml } from "cheerio";

// =============================================================================
// DEBUG LOGGING HELPERS
// =============================================================================

const DEBUG_PREFIX = "[JOB_INTEL_DEBUG]";

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

// =============================================================================
// CAREER PAGE DISCOVERY HELPERS
// =============================================================================

/**
 * Try common career paths on a website.
 * Unlike the website-scraper version, this doesn't check ALLOW_WEB_FETCH.
 *
 * @param {string} websiteUrl - Base website URL
 * @param {Object} logger - Logger instance
 * @param {number} timeoutMs - Timeout per request
 * @returns {Promise<string|null>} Career page URL or null
 */
async function tryCommonCareerPaths(websiteUrl, logger, timeoutMs = 5000) {
  if (!websiteUrl) return null;

  const base = websiteUrl.replace(/\/$/, "");
  debugLogCompact("CAREER_PATHS", `Trying common paths on: ${base}`);

  for (const path of COMMON_CAREER_PATHS) {
    const candidate = `${base}${path}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(candidate, {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; WizardBot/1.0)"
        }
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        debugLogCompact("CAREER_PATHS", `Found valid path: ${candidate}`);
        return candidate;
      }
    } catch (error) {
      // Ignore errors, continue to next path
      if (error.name !== "AbortError") {
        logger?.debug?.({ url: candidate, err: error.message }, "career_path_check_failed");
      }
    }
  }

  debugLogCompact("CAREER_PATHS", "No common paths found");
  return null;
}

// =============================================================================
// STRATEGY INFERENCE
// =============================================================================

/**
 * Infer the job discovery strategy based on company characteristics.
 *
 * @param {Object} company - Company document
 * @returns {"LOCAL_SMALL" | "SME" | "ENTERPRISE"} Discovery strategy
 */
export function inferJobDiscoveryStrategy(company) {
  const bucket = company?.employeeCountBucket;
  const type = company?.companyType;

  debugLogCompact("STRATEGY", "Inferring strategy", {
    employeeCountBucket: bucket,
    companyType: type
  });

  const smallBuckets = ["1-10", "11-50"];
  const largeBuckets = ["501-1000", "1001-5000", "5001-10000", "10000+"];

  let strategy;
  if (smallBuckets.includes(bucket) && type === "local_business") {
    strategy = "LOCAL_SMALL";
  } else if (largeBuckets.includes(bucket)) {
    strategy = "ENTERPRISE";
  } else {
    strategy = "SME";
  }

  debugLogCompact("STRATEGY", `Determined strategy: ${strategy}`);
  return strategy;
}

// =============================================================================
// EXTERNAL SEARCH HELPERS
// =============================================================================

/**
 * Build search queries for job discovery.
 *
 * @param {Object} company - Company document
 * @returns {string[]} Array of search queries
 */
function buildJobSearchQueries(company) {
  const queries = [];
  const name = company?.name;

  if (!name) {
    debugLogCompact("QUERIES", "No company name, returning empty queries");
    return queries;
  }

  queries.push(`${name} jobs`);
  queries.push(`${name} careers`);

  if (company.hqCity && company.hqCountry) {
    queries.push(`${name} jobs ${company.hqCity} ${company.hqCountry}`);
  }

  debugLog("SEARCH_QUERIES", `Built ${queries.length} search queries`, queries);
  return queries;
}

/**
 * Fetch HTML safely with timeout and error handling.
 *
 * @param {string} url - URL to fetch
 * @param {Object} logger - Logger instance
 * @param {number} [timeoutMs=5000] - Timeout in milliseconds
 * @returns {Promise<string|null>} HTML content or null
 */
async function fetchHtmlSafely(url, logger, timeoutMs = 5000) {
  debugLogCompact("HTML_FETCH", `Fetching URL: ${url}`);

  if (!url) {
    debugLogCompact("HTML_FETCH", "No URL provided, skipping");
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    debugLogCompact("HTML_FETCH", `Starting fetch with ${timeoutMs}ms timeout`);
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WizardBot/1.0)"
      }
    });

    clearTimeout(timeoutId);

    debugLogCompact("HTML_FETCH", `Response status: ${response.status}`);

    if (!response.ok) {
      debugLogCompact("HTML_FETCH", `Failed with status ${response.status}`);
      logger?.debug?.({ url, status: response.status }, "job_intel.html_fetch_failed");
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    debugLogCompact("HTML_FETCH", `Content-Type: ${contentType}`);

    if (!contentType.includes("text/html")) {
      debugLogCompact("HTML_FETCH", "Not HTML content, skipping");
      return null;
    }

    const html = await response.text();
    const truncatedHtml = html.slice(0, 50000);
    debugLogCompact("HTML_FETCH", `Got HTML: ${html.length} chars, truncated to ${truncatedHtml.length}`);

    return truncatedHtml;
  } catch (error) {
    if (error.name === "AbortError") {
      debugLogCompact("HTML_FETCH", `Timeout after ${timeoutMs}ms`);
      logger?.debug?.({ url }, "job_intel.html_fetch_timeout");
    } else {
      debugLogCompact("HTML_FETCH", `Error: ${error.message}`);
      logger?.debug?.({ url, err: error.message }, "job_intel.html_fetch_error");
    }
    return null;
  }
}

/**
 * Run external web search and classify results as job postings.
 *
 * @param {Object} params
 * @param {Object} params.company - Company document
 * @param {Object} params.llmClient - LLM client
 * @param {Object} params.firestore - Firestore adapter
 * @param {Object} params.bigQuery - BigQuery adapter
 * @param {Object} params.logger - Logger instance
 * @param {Object} params.usageContext - Usage context for tracking
 * @param {number} [params.maxResults=10] - Max results per query
 * @returns {Promise<{jobs: Array, errors: Array}>} External jobs and errors
 */
async function runExternalSearchDiscovery({
  company,
  llmClient,
  firestore,
  bigQuery,
  logger,
  usageContext,
  maxResults = 10
}) {
  debugLog("EXTERNAL_SEARCH", "Starting external search discovery", {
    companyId: company.id,
    companyName: company.name,
    primaryDomain: company.primaryDomain,
    maxResults
  });

  const extraJobs = [];
  const errors = [];

  const queries = buildJobSearchQueries(company);
  if (queries.length === 0) {
    debugLogCompact("EXTERNAL_SEARCH", "No queries to run, returning empty");
    return { jobs: extraJobs, errors };
  }

  logger?.info?.(
    { companyId: company.id, queryCount: queries.length },
    "job_intel.external_search_start"
  );

  // Process queries sequentially to avoid rate limiting
  for (let queryIndex = 0; queryIndex < queries.length; queryIndex++) {
    const query = queries[queryIndex];
    debugLog("WEB_SEARCH", `Running query ${queryIndex + 1}/${queries.length}`, { query });

    try {
      const searchParams = {
        domain: company.primaryDomain,
        name: company.name,
        location: company.hqCity,
        logger,
        limit: maxResults
      };
      debugLogCompact("WEB_SEARCH", "Search params:", searchParams);

      const searchResults = await searchCompanyOnWeb(searchParams);

      debugLog("WEB_SEARCH", `Got ${searchResults?.length ?? 0} results`, {
        resultCount: searchResults?.length ?? 0,
        results: searchResults?.map(r => ({ title: r.title, url: r.url })) ?? []
      });

      if (!searchResults || searchResults.length === 0) {
        debugLogCompact("WEB_SEARCH", "No results for this query, continuing");
        continue;
      }

      // Classify each search result
      for (let resultIndex = 0; resultIndex < searchResults.length; resultIndex++) {
        const result = searchResults[resultIndex];
        debugLog("CLASSIFIER", `Classifying result ${resultIndex + 1}/${searchResults.length}`, {
          title: result.title,
          url: result.url,
          snippet: result.snippet?.slice(0, 200) + "..."
        });

        try {
          const classifierContext = {
            companyName: company.name,
            companyDomain: company.primaryDomain,
            text: `${result.title ?? ""}\n\n${result.snippet ?? ""}`,
            title: result.title,
            url: result.url,
            locale: company.locale ?? null
          };

          debugLog("CLASSIFIER", "Sending to LLM classifier", {
            companyName: classifierContext.companyName,
            companyDomain: classifierContext.companyDomain,
            textLength: classifierContext.text.length,
            url: classifierContext.url
          });

          const classifierResult = await llmClient.askJobSnippetClassifier(classifierContext);

          debugLog("CLASSIFIER", "LLM classifier response", {
            provider: classifierResult.provider,
            model: classifierResult.model,
            isLikelyJob: classifierResult.isLikelyJob,
            confidence: classifierResult.confidence,
            employerMatchesCompany: classifierResult.employerMatchesCompany,
            inferredTitle: classifierResult.inferredTitle,
            inferredLocation: classifierResult.inferredLocation,
            error: classifierResult.error ?? null
          });

          // Record LLM usage
          await recordLlmUsageFromResult({
            firestore,
            bigQuery,
            logger,
            usageContext: {
              ...usageContext,
              taskType: LLM_CORE_TASK.JOB_SNIPPET_CLASSIFIER
            },
            usageType: "text",
            result: classifierResult
          });

          if (classifierResult.error) {
            debugLogCompact("CLASSIFIER", `Error: ${classifierResult.error.message}`);
            logger?.warn?.(
              {
                companyId: company.id,
                url: result.url,
                error: classifierResult.error.message
              },
              "job_intel.classifier_error"
            );
            errors.push({
              type: "classifier_error",
              url: result.url,
              message: classifierResult.error.message
            });
            continue;
          }

          // Only accept if likely a job AND employer matches
          const shouldAccept = classifierResult.isLikelyJob && classifierResult.employerMatchesCompany;
          debugLogCompact("CLASSIFIER", `Decision: ${shouldAccept ? "ACCEPT" : "REJECT"} (isLikelyJob=${classifierResult.isLikelyJob}, employerMatches=${classifierResult.employerMatchesCompany})`);

          if (shouldAccept) {
            const newJob = {
              title: classifierResult.inferredTitle ?? result.title ?? "Unknown Position",
              location: classifierResult.inferredLocation ?? null,
              employmentType: classifierResult.inferredEmploymentType ?? null,
              workModel: null,
              description: result.snippet ?? null,
              url: result.url,
              source: "external_search",
              discoveredAt: new Date(),
              confidence: classifierResult.confidence ?? 0.5,
              evidenceSources: ["web_search"]
            };
            debugLog("CLASSIFIER", "Adding job to results", newJob);
            extraJobs.push(newJob);
          }
        } catch (classifyError) {
          debugLogCompact("CLASSIFIER", `Exception: ${classifyError.message}`);
          logger?.warn?.(
            { companyId: company.id, url: result.url, err: classifyError.message },
            "job_intel.classify_exception"
          );
          errors.push({
            type: "classify_exception",
            url: result.url,
            message: classifyError.message
          });
        }
      }
    } catch (searchError) {
      debugLogCompact("WEB_SEARCH", `Exception: ${searchError.message}`);
      logger?.warn?.(
        { companyId: company.id, query, err: searchError.message },
        "job_intel.search_exception"
      );
      errors.push({
        type: "search_exception",
        query,
        message: searchError.message
      });
    }
  }

  debugLog("EXTERNAL_SEARCH", "External search complete", {
    jobsFound: extraJobs.length,
    errorCount: errors.length,
    jobs: extraJobs.map(j => ({ title: j.title, url: j.url }))
  });

  logger?.info?.(
    { companyId: company.id, jobsFound: extraJobs.length, errorCount: errors.length },
    "job_intel.external_search_complete"
  );

  return { jobs: extraJobs, errors };
}

/**
 * Enrich jobs with HTML page interpretation.
 *
 * @param {Object} params
 * @param {Array} params.jobs - Jobs to enrich
 * @param {Object} params.company - Company document
 * @param {Object} params.llmClient - LLM client
 * @param {Object} params.firestore - Firestore adapter
 * @param {Object} params.bigQuery - BigQuery adapter
 * @param {Object} params.logger - Logger instance
 * @param {Object} params.usageContext - Usage context for tracking
 * @param {number} [params.maxInterpretations=5] - Max pages to interpret
 * @returns {Promise<{jobs: Array, errors: Array}>} Enriched jobs and errors
 */
async function enrichJobsWithPageInterpretation({
  jobs,
  company,
  llmClient,
  firestore,
  bigQuery,
  logger,
  usageContext,
  maxInterpretations = 5
}) {
  debugLog("PAGE_INTERPRETATION", "Starting page interpretation", {
    inputJobCount: jobs.length,
    maxInterpretations
  });

  const enrichedJobs = [...jobs];
  const errors = [];

  // Only interpret a subset to limit cost
  const jobsToInterpret = jobs
    .filter((job) => job.url && job.source === "external_search")
    .slice(0, maxInterpretations);

  debugLogCompact("PAGE_INTERPRETATION", `Jobs to interpret: ${jobsToInterpret.length} (max: ${maxInterpretations})`);

  if (jobsToInterpret.length === 0) {
    debugLogCompact("PAGE_INTERPRETATION", "No jobs to interpret, returning");
    return { jobs: enrichedJobs, errors };
  }

  logger?.info?.(
    { companyId: company.id, count: jobsToInterpret.length },
    "job_intel.page_interpretation_start"
  );

  for (let i = 0; i < jobsToInterpret.length; i++) {
    const job = jobsToInterpret[i];
    debugLog("PAGE_INTERPRETATION", `Processing job ${i + 1}/${jobsToInterpret.length}`, {
      title: job.title,
      url: job.url
    });

    try {
      const html = await fetchHtmlSafely(job.url, logger);
      if (!html) {
        debugLogCompact("PAGE_INTERPRETATION", "No HTML content, skipping");
        continue;
      }

      const interpreterContext = {
        companyName: company.name,
        companyDomain: company.primaryDomain,
        htmlSnippet: html,
        sourceUrl: job.url,
        locale: company.locale ?? null
      };

      debugLog("PAGE_INTERPRETER", "Sending to LLM interpreter", {
        companyName: interpreterContext.companyName,
        companyDomain: interpreterContext.companyDomain,
        htmlLength: interpreterContext.htmlSnippet.length,
        sourceUrl: interpreterContext.sourceUrl
      });

      const interpreterResult = await llmClient.askJobPageInterpreter(interpreterContext);

      debugLog("PAGE_INTERPRETER", "LLM interpreter response", {
        provider: interpreterResult.provider,
        model: interpreterResult.model,
        isJobListingPage: interpreterResult.isJobListingPage,
        jobCount: interpreterResult.normalizedJobs?.length ?? 0,
        estimatedJobCount: interpreterResult.estimatedJobCount,
        wereWeMissingJobs: interpreterResult.wereWeMissingJobs,
        jobs: interpreterResult.normalizedJobs?.map(j => ({ title: j.title, location: j.location, confidence: j.overallConfidence })) ?? [],
        suggestedDomHints: interpreterResult.suggestedDomHints ?? [],
        error: interpreterResult.error ?? null
      });

      // Record LLM usage
      await recordLlmUsageFromResult({
        firestore,
        bigQuery,
        logger,
        usageContext: {
          ...usageContext,
          taskType: LLM_CORE_TASK.JOB_PAGE_INTERPRETER
        },
        usageType: "text",
        result: interpreterResult
      });

      if (interpreterResult.error) {
        debugLogCompact("PAGE_INTERPRETER", `Error: ${interpreterResult.error.message}`);
        logger?.warn?.(
          {
            companyId: company.id,
            url: job.url,
            error: interpreterResult.error.message
          },
          "job_intel.interpreter_error"
        );
        errors.push({
          type: "interpreter_error",
          url: job.url,
          message: interpreterResult.error.message
        });
        continue;
      }

      // If page has detailed job info, enrich the original job
      const normalizedJobs = interpreterResult.normalizedJobs ?? [];
      if (interpreterResult.isJobListingPage && normalizedJobs.length > 0) {
        debugLogCompact("PAGE_INTERPRETER", `Found ${normalizedJobs.length} jobs on page`);
        const parsedJob = normalizedJobs[0];

        // Find and update the original job in enrichedJobs
        const jobIndex = enrichedJobs.findIndex((j) => j.url === job.url);
        if (jobIndex !== -1) {
          const updatedJob = {
            ...enrichedJobs[jobIndex],
            title: parsedJob.title ?? enrichedJobs[jobIndex].title,
            location: parsedJob.location ?? enrichedJobs[jobIndex].location,
            city: parsedJob.city ?? enrichedJobs[jobIndex].city,
            country: parsedJob.country ?? enrichedJobs[jobIndex].country,
            isPrimaryMarket: parsedJob.isPrimaryMarket ?? enrichedJobs[jobIndex].isPrimaryMarket,
            employmentType: parsedJob.employmentType ?? enrichedJobs[jobIndex].employmentType,
            workModel: parsedJob.workModel ?? enrichedJobs[jobIndex].workModel,
            seniorityLevel: parsedJob.seniorityLevel ?? enrichedJobs[jobIndex].seniorityLevel,
            description: parsedJob.description ?? enrichedJobs[jobIndex].description,
            url: parsedJob.url ?? enrichedJobs[jobIndex].url,
            overallConfidence: parsedJob.overallConfidence ?? enrichedJobs[jobIndex].confidence,
            evidenceSources: [...(enrichedJobs[jobIndex].evidenceSources ?? []), "page_interpretation"]
          };
          debugLog("PAGE_INTERPRETER", "Updated existing job", updatedJob);
          enrichedJobs[jobIndex] = updatedJob;
        }

        // If page has multiple jobs, add additional ones
        if (normalizedJobs.length > 1) {
          debugLogCompact("PAGE_INTERPRETER", `Adding ${normalizedJobs.length - 1} additional jobs`);
          for (let j = 1; j < normalizedJobs.length; j++) {
            const additionalJob = normalizedJobs[j];
            const newJob = {
              title: additionalJob.title ?? "Unknown Position",
              location: additionalJob.location ?? null,
              city: additionalJob.city ?? null,
              country: additionalJob.country ?? null,
              isPrimaryMarket: additionalJob.isPrimaryMarket ?? null,
              employmentType: additionalJob.employmentType ?? null,
              workModel: additionalJob.workModel ?? null,
              seniorityLevel: additionalJob.seniorityLevel ?? null,
              description: additionalJob.description ?? null,
              url: additionalJob.url ?? job.url,
              source: "external_search",
              discoveredAt: new Date(),
              overallConfidence: additionalJob.overallConfidence ?? 0.5,
              evidenceSources: ["page_interpretation"]
            };
            debugLog("PAGE_INTERPRETER", "Adding new job from page", newJob);
            enrichedJobs.push(newJob);
          }
        }

        // Log if we might have missed jobs
        if (interpreterResult.wereWeMissingJobs) {
          debugLog("PAGE_INTERPRETER", "Parser may have missed jobs", {
            suggestedDomHints: interpreterResult.suggestedDomHints
          });
          logger?.warn?.({
            companyId: company.id,
            url: job.url,
            suggestedDomHints: interpreterResult.suggestedDomHints
          }, "job_intel.page_interpreter_missed_jobs");
        }
      } else {
        debugLogCompact("PAGE_INTERPRETER", "Not a job listing page or no jobs found");
        if (interpreterResult.reasonsIfNotJobPage) {
          debugLogCompact("PAGE_INTERPRETER", `Reason: ${interpreterResult.reasonsIfNotJobPage}`);
        }
      }
    } catch (interpretError) {
      debugLogCompact("PAGE_INTERPRETER", `Exception: ${interpretError.message}`);
      logger?.warn?.(
        { companyId: company.id, url: job.url, err: interpretError.message },
        "job_intel.interpret_exception"
      );
      errors.push({
        type: "interpret_exception",
        url: job.url,
        message: interpretError.message
      });
    }
  }

  debugLog("PAGE_INTERPRETATION", "Page interpretation complete", {
    inputJobCount: jobs.length,
    outputJobCount: enrichedJobs.length,
    errorCount: errors.length
  });

  logger?.info?.(
    { companyId: company.id, enrichedCount: enrichedJobs.length },
    "job_intel.page_interpretation_complete"
  );

  return { jobs: enrichedJobs, errors };
}

// =============================================================================
// MAIN AGENT FUNCTION
// =============================================================================

/**
 * Run the job intel agent once for a given company.
 *
 * @param {Object} params
 * @param {Object} params.firestore - Firestore adapter
 * @param {Object} params.bigQuery - BigQuery adapter
 * @param {Object} params.logger - Logger instance
 * @param {Object} params.llmClient - LLM client for AI calls
 * @param {Object} params.company - Company document from Firestore
 * @param {Object} params.usageContext - Context for usage tracking
 * @param {string} params.usageContext.userId - User ID
 * @param {string} params.usageContext.companyId - Company ID
 * @param {string} [params.usageContext.requestId] - Optional request ID
 * @param {Object} [params.options] - Optional configuration
 * @param {boolean} [params.options.skipExternalSearch=false] - Skip external search
 * @param {boolean} [params.options.skipPageInterpretation=false] - Skip page interpretation
 * @param {number} [params.options.maxExternalResults=10] - Max external search results
 * @param {number} [params.options.maxPageInterpretations=5] - Max pages to interpret
 * @returns {Promise<Object>} Result object with jobs and metadata
 */
export async function runJobIntelAgentOnce({
  firestore,
  bigQuery,
  logger,
  llmClient,
  company,
  usageContext = {},
  options = {}
}) {
  const startedAt = new Date();
  const now = new Date();
  const errors = [];

  console.log("\n\n");
  debugLog("AGENT_START", "=== JOB INTEL AGENT STARTED ===", {
    companyId: company?.id,
    companyName: company?.name,
    primaryDomain: company?.primaryDomain,
    careerPageUrl: company?.careerPageUrl,
    linkedinUrl: company?.socials?.linkedin,
    employeeCountBucket: company?.employeeCountBucket,
    companyType: company?.companyType,
    hqCity: company?.hqCity,
    hqCountry: company?.hqCountry,
    userId: usageContext.userId,
    options
  });

  // Determine discovery strategy
  const strategy = inferJobDiscoveryStrategy(company);
  debugLog("AGENT_STRATEGY", `Using strategy: ${strategy}`, {
    willRunExternalSearch: (strategy === "SME" || strategy === "ENTERPRISE") && !options.skipExternalSearch,
    willRunPageInterpretation: strategy === "ENTERPRISE" && !options.skipPageInterpretation
  });

  logger?.info?.(
    {
      companyId: company?.id,
      companyName: company?.name,
      strategy,
      careerPageUrl: company?.careerPageUrl,
      linkedinUrl: company?.socials?.linkedin,
      userId: usageContext.userId
    },
    "job_intel_agent.started"
  );

  // ==========================================================================
  // STEP 0: Discover career page URL if not set on company
  // ==========================================================================

  debugLog("STEP_0", "=== CAREER PAGE DISCOVERY ===", {
    existingCareerPageUrl: company?.careerPageUrl,
    websiteUrl: company?.website,
    primaryDomain: company?.primaryDomain
  });

  let resolvedCareerPageUrl = company?.careerPageUrl ?? null;
  let careerPageSource = resolvedCareerPageUrl ? "company_document" : null;

  if (!resolvedCareerPageUrl) {
    debugLogCompact("CAREER_PAGE", "No careerPageUrl on company, running discovery...");

    try {
      // Fetch website HTML for nav/footer link extraction using existing fetchHtmlSafely
      const websiteUrl = company?.website ?? (company?.primaryDomain ? `https://${company.primaryDomain}` : null);
      let websiteHtml = null;
      let websiteCheerio = null;

      if (websiteUrl) {
        debugLogCompact("CAREER_PAGE", `Fetching website HTML from: ${websiteUrl}`);
        websiteHtml = await fetchHtmlSafely(websiteUrl, logger);
        if (websiteHtml) {
          websiteCheerio = loadHtml(websiteHtml);
          debugLogCompact("CAREER_PAGE", `Got website HTML: ${websiteHtml.length} chars`);
        }
      }

      // Run career page discovery with all strategies (nav/footer links, search results)
      const careerPageDiscovery = await discoverCareerPage({
        domain: company?.primaryDomain,
        websiteUrl,
        searchResults: [],
        websiteHtml,
        websiteCheerio,
        intelJobs: []
      });

      if (careerPageDiscovery?.url) {
        resolvedCareerPageUrl = careerPageDiscovery.url;
        careerPageSource = careerPageDiscovery.source;
        debugLog("CAREER_PAGE", "Career page discovered!", {
          url: resolvedCareerPageUrl,
          source: careerPageSource
        });
      } else {
        // Fallback: Try common career paths directly (not gated by ALLOW_WEB_FETCH)
        debugLogCompact("CAREER_PAGE", "discoverCareerPage returned null, trying common paths...");
        const fromCommonPath = await tryCommonCareerPaths(websiteUrl, logger);
        if (fromCommonPath) {
          resolvedCareerPageUrl = fromCommonPath;
          careerPageSource = "common_path";
          debugLog("CAREER_PAGE", "Career page found via common path!", {
            url: resolvedCareerPageUrl,
            source: careerPageSource
          });
        } else {
          debugLogCompact("CAREER_PAGE", "No career page discovered from any heuristics");
        }
      }

      // Persist the discovered careerPageUrl to the company document
      if (resolvedCareerPageUrl) {
        try {
          await firestore.saveCompanyDocument(company.id, {
            careerPageUrl: resolvedCareerPageUrl,
            updatedAt: new Date()
          });
          debugLogCompact("CAREER_PAGE", "Persisted careerPageUrl to company document");
        } catch (persistError) {
          debugLogCompact("CAREER_PAGE", `Failed to persist careerPageUrl: ${persistError.message}`);
          logger?.warn?.({
            companyId: company?.id,
            err: persistError.message
          }, "job_intel_agent.career_page_persist_error");
        }
      }
    } catch (careerDiscoveryError) {
      debugLogCompact("CAREER_PAGE", `Discovery error: ${careerDiscoveryError.message}`);
      logger?.warn?.({
        companyId: company?.id,
        err: careerDiscoveryError.message
      }, "job_intel_agent.career_discovery_error");
    }
  } else {
    debugLogCompact("CAREER_PAGE", `Using existing careerPageUrl: ${resolvedCareerPageUrl}`);
  }

  // ==========================================================================
  // STEP 1: First-party discovery (careers page, LinkedIn)
  // ==========================================================================

  debugLog("STEP_1", "=== FIRST-PARTY DISCOVERY ===", {
    careerPageUrl: resolvedCareerPageUrl,
    careerPageSource,
    linkedinUrl: company?.socials?.linkedin
  });

  let firstPartyJobs = [];
  let jobDiscoveryStatus = CompanyJobDiscoveryStatusEnum.enum.NOT_FOUND;

  try {
    debugLogCompact("FIRST_PARTY", "Calling discoverJobsForCompany...");
    const firstPartyResult = await discoverJobsForCompany({
      company,
      logger,
      searchResults: [],
      careerPageUrl: resolvedCareerPageUrl,
      intelJobs: []
    });

    firstPartyJobs = firstPartyResult ?? [];
    debugLog("FIRST_PARTY", "First-party discovery complete", {
      jobCount: firstPartyJobs.length,
      jobs: firstPartyJobs.map(j => ({
        title: j.title,
        source: j.source,
        url: j.url,
        location: j.location
      }))
    });
  } catch (firstPartyError) {
    debugLogCompact("FIRST_PARTY", `Error: ${firstPartyError.message}`);
    logger?.error?.(
      { companyId: company?.id, err: firstPartyError.message },
      "job_intel_agent.first_party_error"
    );
    errors.push({
      type: "first_party_error",
      message: firstPartyError.message
    });
  }

  // ==========================================================================
  // STEP 2: External search discovery (for SME/ENTERPRISE)
  // ==========================================================================

  debugLog("STEP_2", "=== EXTERNAL SEARCH DISCOVERY ===");

  let externalJobs = [];

  const shouldRunExternalSearch =
    !options.skipExternalSearch &&
    (strategy === "SME" || strategy === "ENTERPRISE") &&
    llmClient?.askJobSnippetClassifier;

  debugLog("EXTERNAL_SEARCH_CHECK", "Should run external search?", {
    skipExternalSearch: options.skipExternalSearch,
    strategy,
    hasClassifier: !!llmClient?.askJobSnippetClassifier,
    decision: shouldRunExternalSearch
  });

  if (shouldRunExternalSearch) {
    try {
      const externalResult = await runExternalSearchDiscovery({
        company,
        llmClient,
        firestore,
        bigQuery,
        logger,
        usageContext,
        maxResults: options.maxExternalResults ?? 10
      });

      externalJobs = externalResult.jobs ?? [];
      errors.push(...(externalResult.errors ?? []));

      debugLog("EXTERNAL_SEARCH_RESULT", "External search complete", {
        jobsFound: externalJobs.length,
        errorsFound: externalResult.errors?.length ?? 0
      });
    } catch (externalError) {
      debugLogCompact("EXTERNAL_SEARCH", `Exception: ${externalError.message}`);
      logger?.error?.(
        { companyId: company?.id, err: externalError.message },
        "job_intel_agent.external_search_error"
      );
      errors.push({
        type: "external_search_error",
        message: externalError.message
      });
    }
  } else {
    debugLogCompact("EXTERNAL_SEARCH", "Skipping external search");
  }

  // ==========================================================================
  // STEP 3: Page interpretation for external jobs (optional enrichment)
  // ==========================================================================

  debugLog("STEP_3", "=== PAGE INTERPRETATION ===");

  const shouldRunPageInterpretation =
    !options.skipPageInterpretation &&
    externalJobs.length > 0 &&
    strategy === "ENTERPRISE" &&
    llmClient?.askJobPageInterpreter;

  debugLog("PAGE_INTERPRETATION_CHECK", "Should run page interpretation?", {
    skipPageInterpretation: options.skipPageInterpretation,
    externalJobCount: externalJobs.length,
    strategy,
    hasInterpreter: !!llmClient?.askJobPageInterpreter,
    decision: shouldRunPageInterpretation
  });

  if (shouldRunPageInterpretation) {
    try {
      const enrichmentResult = await enrichJobsWithPageInterpretation({
        jobs: externalJobs,
        company,
        llmClient,
        firestore,
        bigQuery,
        logger,
        usageContext,
        maxInterpretations: options.maxPageInterpretations ?? 5
      });

      externalJobs = enrichmentResult.jobs ?? externalJobs;
      errors.push(...(enrichmentResult.errors ?? []));

      debugLog("PAGE_INTERPRETATION_RESULT", "Page interpretation complete", {
        enrichedJobCount: externalJobs.length,
        errorsFound: enrichmentResult.errors?.length ?? 0
      });
    } catch (enrichError) {
      debugLogCompact("PAGE_INTERPRETATION", `Exception: ${enrichError.message}`);
      logger?.error?.(
        { companyId: company?.id, err: enrichError.message },
        "job_intel_agent.page_interpretation_error"
      );
      errors.push({
        type: "page_interpretation_error",
        message: enrichError.message
      });
    }
  } else {
    debugLogCompact("PAGE_INTERPRETATION", "Skipping page interpretation");
  }

  // ==========================================================================
  // STEP 4: Deduplicate all jobs
  // ==========================================================================

  debugLog("STEP_4", "=== DEDUPLICATION ===", {
    firstPartyCount: firstPartyJobs.length,
    externalCount: externalJobs.length,
    totalBeforeDedupe: firstPartyJobs.length + externalJobs.length
  });

  const allCandidateJobs = [...firstPartyJobs, ...externalJobs];
  const dedupedJobs = dedupeJobs(allCandidateJobs);

  debugLog("DEDUPLICATION_RESULT", "Deduplication complete", {
    beforeDedupe: allCandidateJobs.length,
    afterDedupe: dedupedJobs.length,
    removed: allCandidateJobs.length - dedupedJobs.length,
    jobs: dedupedJobs.map(j => ({
      title: j.title,
      source: j.source,
      url: j.url
    }))
  });

  // ==========================================================================
  // STEP 5: Coverage critic evaluation
  // ==========================================================================

  debugLog("STEP_5", "=== COVERAGE CRITIC EVALUATION ===");

  let coverageCriticResult = null;
  const shouldRunCoverageCritic = llmClient?.askJobCoverageCritic;

  debugLog("COVERAGE_CRITIC_CHECK", "Should run coverage critic?", {
    hasMethod: !!shouldRunCoverageCritic,
    dedupedJobCount: dedupedJobs.length
  });

  if (shouldRunCoverageCritic) {
    try {
      // Build source counts
      const sourceCounts = {};
      for (const job of dedupedJobs) {
        const source = job.source ?? "unknown";
        sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
      }

      // Build sample titles (up to 10)
      const sampleTitles = dedupedJobs.slice(0, 10).map(j => j.title);

      // Count primary market jobs
      const primaryMarketJobs = dedupedJobs.filter(j => j.isPrimaryMarket === true).length;
      const secondaryMarketJobs = dedupedJobs.filter(j => j.isPrimaryMarket === false).length;

      const coverageCriticContext = {
        companyName: company?.name,
        companyDomain: company?.primaryDomain,
        employeeCountBucket: company?.employeeCountBucket,
        hqCountry: company?.hqCountry,
        strategyName: strategy,
        stagesRun: ["first-party", ...(shouldRunExternalSearch ? ["external-search"] : [])],
        preferredJobCountry: company?.hqCountry ?? null,
        totalJobs: dedupedJobs.length,
        primaryMarketJobs,
        secondaryMarketJobs,
        sourceCounts,
        sampleTitles,
        // DOM hints from page interpretation (if any were collected)
        domJobCardCount: null,
        hasPagination: null,
        rawHtmlSnippet: null
      };

      debugLog("COVERAGE_CRITIC", "Sending to LLM coverage critic", {
        companyName: coverageCriticContext.companyName,
        employeeCountBucket: coverageCriticContext.employeeCountBucket,
        totalJobs: coverageCriticContext.totalJobs,
        sourceCounts: coverageCriticContext.sourceCounts
      });

      coverageCriticResult = await llmClient.askJobCoverageCritic(coverageCriticContext);

      debugLog("COVERAGE_CRITIC", "LLM coverage critic response", {
        provider: coverageCriticResult.provider,
        model: coverageCriticResult.model,
        isCoverageLikelyComplete: coverageCriticResult.isCoverageLikelyComplete,
        suspiciousLowCoverage: coverageCriticResult.suspiciousLowCoverage,
        estimatedJobCountRange: coverageCriticResult.estimatedJobCountRange,
        shouldRetryParsing: coverageCriticResult.shouldRetryParsing,
        explanation: coverageCriticResult.explanation,
        suggestedNextActions: coverageCriticResult.suggestedNextActions,
        error: coverageCriticResult.error ?? null
      });

      // Record LLM usage
      await recordLlmUsageFromResult({
        firestore,
        bigQuery,
        logger,
        usageContext: {
          ...usageContext,
          taskType: LLM_CORE_TASK.JOB_COVERAGE_CRITIC
        },
        usageType: "text",
        result: coverageCriticResult
      });

      if (coverageCriticResult.error) {
        debugLogCompact("COVERAGE_CRITIC", `Error: ${coverageCriticResult.error.message}`);
        logger?.warn?.({
          companyId: company?.id,
          error: coverageCriticResult.error.message
        }, "job_intel.coverage_critic_error");
        errors.push({
          type: "coverage_critic_error",
          message: coverageCriticResult.error.message
        });
      } else if (coverageCriticResult.suspiciousLowCoverage) {
        // Log warning for suspicious low coverage
        debugLog("COVERAGE_CRITIC", "SUSPICIOUS LOW COVERAGE DETECTED", {
          totalJobs: dedupedJobs.length,
          estimatedRange: coverageCriticResult.estimatedJobCountRange,
          suggestedActions: coverageCriticResult.suggestedNextActions
        });
        logger?.warn?.({
          companyId: company?.id,
          totalJobs: dedupedJobs.length,
          estimatedJobCountRange: coverageCriticResult.estimatedJobCountRange,
          shouldRetryParsing: coverageCriticResult.shouldRetryParsing,
          suggestedNextActions: coverageCriticResult.suggestedNextActions
        }, "job_intel.suspicious_low_coverage");
      }
    } catch (coverageError) {
      debugLogCompact("COVERAGE_CRITIC", `Exception: ${coverageError.message}`);
      logger?.error?.({
        companyId: company?.id,
        err: coverageError.message
      }, "job_intel.coverage_critic_exception");
      errors.push({
        type: "coverage_critic_exception",
        message: coverageError.message
      });
    }
  } else {
    debugLogCompact("COVERAGE_CRITIC", "Skipping coverage critic (method not available)");
  }

  // ==========================================================================
  // STEP 6: Save discovered jobs to Firestore
  // ==========================================================================

  debugLog("STEP_6", "=== SAVE TO FIRESTORE ===", {
    jobCount: dedupedJobs.length
  });

  try {
    debugLogCompact("SAVE", "Saving jobs to Firestore...");
    await saveDiscoveredJobs({
      firestore,
      logger,
      company,
      jobs: dedupedJobs
    });
    debugLogCompact("SAVE", "Jobs saved successfully");
  } catch (saveError) {
    debugLogCompact("SAVE", `Error: ${saveError.message}`);
    logger?.error?.(
      { companyId: company?.id, err: saveError.message },
      "job_intel_agent.save_jobs_error"
    );
    errors.push({
      type: "save_jobs_error",
      message: saveError.message
    });
  }

  // ==========================================================================
  // STEP 7: Update company job discovery status
  // ==========================================================================

  debugLog("STEP_7", "=== UPDATE COMPANY STATUS ===");

  jobDiscoveryStatus =
    dedupedJobs.length > 0
      ? CompanyJobDiscoveryStatusEnum.enum.FOUND_JOBS
      : CompanyJobDiscoveryStatusEnum.enum.NOT_FOUND;

  debugLogCompact("STATUS", `Setting status to: ${jobDiscoveryStatus}`);

  try {
    const jobDiscoveryAttempts = (company.jobDiscoveryAttempts ?? 0) + 1;
    debugLogCompact("STATUS", `Updating company document (attempt #${jobDiscoveryAttempts})`);
    await firestore.saveCompanyDocument(company.id, {
      jobDiscoveryStatus,
      lastJobDiscoveryAt: now,
      jobDiscoveryQueuedAt: now,
      jobDiscoveryAttempts,
      updatedAt: new Date()
    });
    debugLogCompact("STATUS", "Company status updated successfully");
  } catch (statusError) {
    debugLogCompact("STATUS", `Error: ${statusError.message}`);
    logger?.error?.(
      { companyId: company?.id, err: statusError.message },
      "job_intel_agent.status_update_error"
    );
    errors.push({
      type: "status_update_error",
      message: statusError.message
    });
  }

  // ==========================================================================
  // STEP 8: Build result
  // ==========================================================================

  const finishedAt = new Date();
  const durationMs = finishedAt - startedAt;

  const summary =
    dedupedJobs.length > 0
      ? `Discovered ${dedupedJobs.length} job(s) for ${company?.name ?? company?.primaryDomain}`
      : `No jobs discovered for ${company?.name ?? company?.primaryDomain}`;

  const result = {
    provider: null, // meta-task, no single model
    model: null,
    jobs: dedupedJobs,
    jobDiscoveryStatus,
    summary,
    counts: {
      firstParty: firstPartyJobs.length,
      external: externalJobs.length,
      total: dedupedJobs.length
    },
    // Coverage critic assessment (if available)
    coverageAssessment: coverageCriticResult && !coverageCriticResult.error ? {
      isCoverageLikelyComplete: coverageCriticResult.isCoverageLikelyComplete,
      suspiciousLowCoverage: coverageCriticResult.suspiciousLowCoverage,
      estimatedJobCountRange: coverageCriticResult.estimatedJobCountRange,
      shouldRetryParsing: coverageCriticResult.shouldRetryParsing,
      explanation: coverageCriticResult.explanation,
      suggestedNextActions: coverageCriticResult.suggestedNextActions,
      suggestedDomHints: coverageCriticResult.suggestedDomHints
    } : undefined,
    errors: errors.length > 0 ? errors : undefined,
    metadata: {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs,
      companyId: company?.id,
      companyDomain: company?.primaryDomain,
      taskType: LLM_CORE_TASK.JOB_INTEL_AGENT,
      strategy,
      jobCount: dedupedJobs.length,
      // Token counts are 0 for the meta-task itself (inner tasks record separately)
      promptTokens: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0
    }
  };

  debugLog("AGENT_COMPLETE", "=== JOB INTEL AGENT COMPLETE ===", {
    summary,
    durationMs,
    counts: result.counts,
    jobDiscoveryStatus,
    errorCount: errors.length,
    errors: errors.length > 0 ? errors : undefined
  });

  logger?.info?.(
    {
      companyId: company?.id,
      strategy,
      firstPartyJobs: firstPartyJobs.length,
      externalJobs: externalJobs.length,
      totalJobs: dedupedJobs.length,
      jobDiscoveryStatus,
      durationMs,
      errorCount: errors.length
    },
    "job_intel_agent.completed"
  );

  console.log("\n\n");
  return result;
}
