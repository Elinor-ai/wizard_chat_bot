/**
 * @file job-coverage-critic.js
 * Prompt builder for evaluating job discovery coverage.
 *
 * The coverage critic analyzes discovered jobs and determines if
 * the job discovery is comprehensive or suspiciously low.
 * It does NOT create or modify jobs - only evaluates coverage.
 */

/**
 * System prompt for job coverage critic.
 * This is a critical, conservative analyst that evaluates coverage quality.
 */
export const JOB_COVERAGE_CRITIC_SYSTEM_PROMPT = `You are a critical, conservative coverage analyst for job discovery.

Your job:
1. Inspect the final discovered job list for a company,
2. Compare it with structural hints from the careers/ATS pages,
3. And decide whether our coverage is likely complete or suspiciously low.

You DO NOT create or modify jobs yourself.
You only evaluate coverage.

CRITICAL RULES:

1. NO HALLUCINATION
   - You must NOT invent new jobs.
   - You must NOT state that there are "exactly 42 jobs" unless the input explicitly says that.
   - You may only give a rough estimate range based on the hints we provide.

2. EVIDENCE-BASED ESTIMATION
   - Use hints like:
     - "domJobCardCount": how many job-card-like elements we detected,
     - "paginationHint": whether the page appears to have multiple pages of jobs,
     - "rawHtmlSnippet": small segments of the HTML (if provided),
     - source counts per stage: careers-site, ats-api, linkedin, external boards, social, etc.
   - If everything points to "only a few jobs", then coverage is likely complete.
   - If the DOM or text obviously suggests many jobs but we only found 0–1, coverage is suspicious.

3. STRICT JSON OUTPUT
   - Your entire response MUST be valid JSON.
   - DO NOT output explanations in natural language outside of JSON.
   - No markdown, no comments, no backticks.

Be strict and conservative. If in doubt, mark coverage as suspiciousLowCoverage = true so the system can re-try parsing.`;

/**
 * Build the user prompt for job coverage critique.
 *
 * @param {Object} context - Context for the prompt
 * @param {string} [context.companyName] - Target company name
 * @param {string} [context.companyDomain] - Target company domain
 * @param {string} [context.employeeCountBucket] - Company size bucket
 * @param {string} [context.hqCountry] - Company HQ country
 * @param {string} [context.strategyName] - Discovery strategy name
 * @param {Array} [context.stagesRun] - Stages that were run
 * @param {string} [context.preferredJobCountry] - Preferred job country
 * @param {number} [context.totalJobs] - Total jobs discovered
 * @param {number} [context.primaryMarketJobs] - Jobs in primary market
 * @param {number} [context.secondaryMarketJobs] - Jobs in secondary markets
 * @param {Object} [context.sourceCounts] - Jobs per source
 * @param {Array} [context.sampleTitles] - Sample job titles
 * @param {number} [context.domJobCardCount] - DOM job card count hint
 * @param {boolean} [context.hasPagination] - Whether pagination was detected
 * @param {string} [context.rawHtmlSnippet] - Raw HTML snippet for hints
 * @param {number} [context.attempt] - Attempt number (0-indexed)
 * @param {boolean} [context.strictMode] - Whether to use strict JSON mode
 * @returns {string} The constructed user prompt
 */
export function buildJobCoverageCriticPrompt(context = {}) {
  const {
    companyName = null,
    companyDomain = null,
    employeeCountBucket = null,
    hqCountry = null,
    strategyName = "default",
    stagesRun = [],
    preferredJobCountry = null,
    totalJobs = 0,
    primaryMarketJobs = 0,
    secondaryMarketJobs = 0,
    sourceCounts = {},
    sampleTitles = [],
    domJobCardCount = null,
    hasPagination = null,
    rawHtmlSnippet = null,
    // Legacy fields for backward compatibility
    discoveredJobs = [],
    sourcesUsed = [],
    industry,
    hqLocation,
    careerPageUrl,
    atsDetected,
    atsType,
    attempt = 0,
    strictMode = false,
  } = context;

  // Support legacy format
  const effectiveTotalJobs = totalJobs || discoveredJobs.length;
  const effectiveSampleTitles =
    sampleTitles.length > 0
      ? sampleTitles
      : discoveredJobs.slice(0, 10).map((j) => j.title);

  // Normalize source counts
  const effectiveSourceCounts = {
    "careers-site": sourceCounts["careers-site"] ?? 0,
    "ats-api": sourceCounts["ats-api"] ?? 0,
    "linkedin-jobs": sourceCounts["linkedin"] ?? sourceCounts["linkedin-jobs"] ?? 0,
    "external-board": sourceCounts["external-board"] ?? sourceCounts["external_search"] ?? 0,
    social: sourceCounts["social"] ?? 0,
    "intel-agent": sourceCounts["intel-agent"] ?? 0,
  };

  // Build stages run from sources used if not provided
  const effectiveStagesRun =
    stagesRun.length > 0
      ? stagesRun
      : sourcesUsed.length > 0
        ? sourcesUsed
        : ["first-party"];

  const inputPayload = {
    company: {
      name: companyName,
      domain: companyDomain,
      employeeCountBucket,
      hqCountry: hqCountry || hqLocation,
    },
    strategy: {
      name: strategyName,
      stagesRun: effectiveStagesRun,
      preferredJobCountry,
    },
    discoveredJobsSummary: {
      totalJobs: effectiveTotalJobs,
      primaryMarketJobs,
      secondaryMarketJobs,
      sourceCounts: effectiveSourceCounts,
      sampleTitles: effectiveSampleTitles.slice(0, 10),
    },
    htmlHints: {
      domJobCardCount,
      hasPagination,
      rawHtmlSnippet: rawHtmlSnippet?.slice(0, 2000) ?? null,
    },
  };

  const strictModeNote = strictMode
    ? "\n\nSTRICT MODE: Previous output was invalid JSON. Return ONLY the JSON object, no extra text."
    : "";

  const userPrompt = `You will receive a JSON payload describing:
- The company,
- The discovery strategy,
- The final discovered jobs,
- Structural hints from the HTML.

INPUT:
${JSON.stringify(inputPayload, null, 2)}

REQUIRED OUTPUT (STRICT JSON):

You must return a JSON object with this exact shape:

{
  "isCoverageLikelyComplete": true,
  "suspiciousLowCoverage": false,
  "estimatedJobCountRange": {
    "min": 1,
    "max": 3
  },
  "shouldRetryParsing": false,
  "explanation": "Short machine-readable explanation.",
  "suggestedNextActions": [],
  "suggestedDomHints": []
}

Field semantics:

- isCoverageLikelyComplete:
  - true if the discoveredJobsSummary and htmlHints suggest that we probably captured most or all jobs.

- suspiciousLowCoverage:
  - true if, for example, domJobCardCount is much larger than totalJobs, or a big enterprise has 0 jobs but the page clearly lists many.

- estimatedJobCountRange:
  - A rough guess based ONLY on the inputs; if unsure, use wide ranges like { "min": 0, "max": 50 }.

- shouldRetryParsing:
  - true if you believe we should re-run the careers/ATS parsing with better selectors or a second attempt.

- explanation:
  - Very short, plain-text justification (max ~2 sentences).

- suggestedNextActions:
  - Short, high-level hints, e.g.:
    - "retry_careers_page_parsing"
    - "inspect_ats_api_again"

- suggestedDomHints:
  - Optional array of CSS or structural hints, e.g.:
    - "each job card is inside <div class='open-position'>"
    - "job title links are inside <a class='job-title'>"

Rules:
- DO NOT invent exact job counts; use ranges.
- If you have almost no structural signal (domJobCardCount is null and no htmlSnippet), you can set:
  - isCoverageLikelyComplete = (totalJobs == 0 ? false : true)
  - suspiciousLowCoverage = (totalJobs == 0)
- Return ONLY JSON, no extra text.${strictModeNote}

ATTEMPT: ${attempt}`;

  return userPrompt;
}
