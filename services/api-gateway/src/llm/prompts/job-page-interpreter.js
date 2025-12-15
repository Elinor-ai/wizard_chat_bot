/**
 * @file job-page-interpreter.js
 * Prompt builder for interpreting job listings from HTML content.
 *
 * This task extracts structured job listings from career pages with
 * STRICT evidence-based extraction rules - no hallucination allowed.
 */

/**
 * System prompt for job page interpreter.
 * This is a precise, non-creative parser that extracts ONLY what's in the HTML.
 */
export const JOB_PAGE_INTERPRETER_SYSTEM_PROMPT = `You are a precise, non-creative job page interpreter.

Your ONLY job:
1. Look at the provided HTML of a single web page,
2. Look at the pre-parsed candidate jobs (if any),
3. And return a STRICT JSON object with:
   - Whether this page is actually a job listing page for the given company,
   - A list of real jobs that appear on THIS page,
   - A rough estimate of how many total jobs appear on this page,
   - Whether it looks like some jobs were missed by the parser.

CRITICAL RULES:

1. EVIDENCE ONLY
   - You may ONLY use information that is present in the given HTML or candidate job list.
   - DO NOT use external knowledge or guess based on what you know about the company.
   - If you do not see a specific job in the HTML, you MUST NOT invent it.

2. NO HALLUCINATED JOBS
   - Do NOT invent job titles, locations, salaries, or benefits.
   - If a field is not clearly supported by the text, set it to null.
   - Salary MUST be null unless a salary or range appears explicitly in the text.
   - Location MUST be null unless you see it or you can safely infer it from text like "Location: Netanya, Israel".

3. PAGE SCOPE ONLY
   - Only extract jobs that are on THIS page.
   - Do not assume other jobs on the site or in the company.
   - If the page only says "See all jobs" with a link, that is NOT a job; just a navigation element.

4. STRICT JSON OUTPUT
   - Your entire response MUST be valid JSON.
   - DO NOT include backticks, markdown, comments, or explanation text.
   - DO NOT include a top-level "data" or "response" wrapper; return the object directly.

5. COMPANY MATCH
   - Only extract jobs that clearly belong to the given company (or brand).
   - If the page shows jobs for multiple employers, only keep jobs for the target company.

6. PRIMARY MARKET
   - If a job's country matches the given preferredJobCountry (case-insensitive), set isPrimaryMarket = true.
   - Otherwise, isPrimaryMarket = false.
   - If you cannot determine a country at all, set isPrimaryMarket = null.

Be conservative: it is better to return FEWER jobs with high confidence than to invent or over-interpret.`;

/**
 * Build the user prompt for job page interpretation.
 *
 * @param {Object} context - Context for the prompt
 * @param {string} [context.companyName] - Target company name
 * @param {string} [context.companyDomain] - Target company domain
 * @param {string} [context.hqCountry] - Company HQ country
 * @param {string} [context.employeeCountBucket] - Company size bucket
 * @param {string} [context.pageUrl] - URL of the page being parsed
 * @param {string} [context.sourceHint] - Source hint (careers-site, ats-api, external-board)
 * @param {string} [context.preferredJobCountry] - Preferred job country for isPrimaryMarket
 * @param {string} [context.truncatedHtml] - HTML content (truncated)
 * @param {Array} [context.candidateJobs] - Pre-parsed candidate jobs
 * @param {number} [context.attempt] - Attempt number (0-indexed)
 * @param {boolean} [context.strictMode] - Whether to use strict JSON mode
 * @returns {string} The constructed user prompt
 */
export function buildJobPageInterpreterPrompt(context = {}) {
  const {
    companyName = null,
    companyDomain = null,
    hqCountry = null,
    employeeCountBucket = null,
    pageUrl = null,
    sourceHint = "careers-site",
    preferredJobCountry = null,
    truncatedHtml = "",
    candidateJobs = [],
    // Legacy fields for backward compatibility
    htmlSnippet,
    sourceUrl,
    attempt = 0,
    strictMode = false,
  } = context;

  // Support legacy field names
  const html = truncatedHtml || htmlSnippet || "";
  const url = pageUrl || sourceUrl || null;

  const inputPayload = {
    company: {
      name: companyName,
      domain: companyDomain,
      hqCountry,
      employeeCountBucket,
    },
    pageContext: {
      url,
      sourceHint,
      preferredJobCountry,
    },
    rawHtml: html.slice(0, 50000), // Truncate to avoid token limits
    candidateJobs: candidateJobs.map((job) => ({
      title: job.title ?? null,
      url: job.url ?? job.externalUrl ?? null,
      location: job.location ?? null,
      description: job.description?.slice(0, 500) ?? null,
    })),
  };

  const strictModeNote = strictMode
    ? "\n\nSTRICT MODE: Previous output was invalid JSON. Return ONLY the JSON object, no extra text."
    : "";

  const userPrompt = `You will receive a JSON payload with all the context you need.

INPUT:
${JSON.stringify(inputPayload, null, 2)}

REQUIRED OUTPUT (STRICT JSON):

You must return a JSON object with this exact structure:

{
  "isJobListingPage": true,
  "normalizedJobs": [
    {
      "title": "Senior Software Engineer - JFrog ML",
      "url": "https://jfrog.com/careers/job/123",
      "location": "Netanya, Israel",
      "city": "Netanya",
      "country": "Israel",
      "isPrimaryMarket": true,
      "description": "Short plain-text description extracted from the page.",
      "source": "careers-site",
      "postedAt": "2025-12-01T00:00:00Z",
      "isActive": true,
      "employmentType": "full_time",
      "workModel": "hybrid",
      "seniorityLevel": "senior",
      "industry": "Software Development",
      "salary": null,
      "salaryPeriod": null,
      "currency": null,
      "coreDuties": [
        "First short duty bullet",
        "Second short duty bullet"
      ],
      "mustHaves": [
        "First clear requirement from the text",
        "Second clear requirement from the text"
      ],
      "benefits": [
        "Optional short benefit if clearly stated"
      ],
      "overallConfidence": 0.9,
      "fieldConfidence": {
        "title": 1.0,
        "location": 0.95,
        "description": 0.9,
        "employmentType": 0.7,
        "workModel": 0.6,
        "seniorityLevel": 0.6,
        "salary": 0.0
      }
    }
  ],
  "estimatedJobCount": 1,
  "wereWeMissingJobs": false,
  "reasonsIfNotJobPage": null,
  "suggestedDomHints": []
}

Rules:
- If this is NOT a job listing page:
  - Set isJobListingPage = false
  - Set normalizedJobs = []
  - Set estimatedJobCount = 0
  - Set wereWeMissingJobs = false
  - Set reasonsIfNotJobPage to a short explanation string

- If you are unsure about any field, set it to null and reduce confidence scores.

- If you think we probably missed some jobs (e.g. you see many repeated job cards but only a few candidateJobs), set wereWeMissingJobs = true and fill suggestedDomHints with short hints such as:
  - "Look for <a> tags inside elements with class 'job-card'"
  - "Each job is in a <li> inside <ul class='jobs-list'>"

Remember:
- Use ONLY the HTML and candidateJobs.
- Do NOT invent jobs, salaries, or locations that are not clearly present.
- Return ONLY JSON, no additional text.${strictModeNote}

ATTEMPT: ${attempt}`;

  return userPrompt;
}
