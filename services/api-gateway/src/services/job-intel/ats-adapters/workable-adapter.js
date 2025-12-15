/**
 * @file workable-adapter.js
 * Workable ATS adapter.
 *
 * Workable provides a public API for job boards:
 * https://jobs.workable.com/api/v1/companies/{subdomain}/jobs
 *
 * URL patterns:
 * - apply.workable.com/{company}
 * - {company}.workable.com
 * - jobs.workable.com/company/{company}
 */

import { BaseAtsAdapter, buildCandidateJobPayload, parseLocationString } from "./base-adapter.js";

const WORKABLE_API_BASE = "https://jobs.workable.com/api/v1/companies";
const WORKABLE_PATTERNS = [
  /^https?:\/\/apply\.workable\.com\/([^/?#]+)/i,
  /^https?:\/\/([^.]+)\.workable\.com/i,
  /^https?:\/\/jobs\.workable\.com\/(?:company\/)?([^/?#]+)/i
];

export class WorkableAdapter extends BaseAtsAdapter {
  constructor(options) {
    super(options);
    this.name = "workable";
  }

  canHandle(url) {
    if (!url) return false;
    return WORKABLE_PATTERNS.some((pattern) => pattern.test(url));
  }

  extractCompanyId(url) {
    if (!url) return null;

    for (const pattern of WORKABLE_PATTERNS) {
      const match = url.match(pattern);
      if (match && match[1]) {
        const companyId = match[1].split("/")[0].split("?")[0];
        if (companyId && !["apply", "jobs", "www"].includes(companyId)) {
          return companyId.toLowerCase();
        }
      }
    }
    return null;
  }

  getBoardUrl(companyId) {
    return `https://apply.workable.com/${companyId}`;
  }

  async fetchJobs({ companyId }) {
    // Workable's public API requires fetching the embedded job board
    // First try the API endpoint
    const apiUrl = `${WORKABLE_API_BASE}/${companyId}/jobs`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          Accept: "application/json"
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data?.jobs ?? data ?? [];
      }
    } catch (error) {
      this.logger?.debug?.({ err: error, companyId }, "workable.api_fallback");
    }

    // Fallback: try scraping the apply.workable.com page
    return this.scrapeJobBoard(companyId);
  }

  async scrapeJobBoard(companyId) {
    const boardUrl = `https://apply.workable.com/${companyId}`;

    try {
      const response = await fetch(boardUrl, {
        headers: {
          Accept: "text/html"
        }
      });

      if (!response.ok) {
        return [];
      }

      const html = await response.text();

      // Look for embedded JSON data in the page
      // Workable typically embeds job data in a script tag
      const jsonMatch = html.match(/__NEXT_DATA__[^>]*>([^<]+)</);
      if (jsonMatch) {
        try {
          const pageData = JSON.parse(jsonMatch[1]);
          const jobs = pageData?.props?.pageProps?.jobs ?? [];
          return jobs;
        } catch {
          // JSON parse failed
        }
      }

      // Alternative: look for wkb_jobs variable
      const wkbMatch = html.match(/wkb_jobs\s*=\s*(\[[\s\S]*?\]);/);
      if (wkbMatch) {
        try {
          const jobs = JSON.parse(wkbMatch[1]);
          return jobs;
        } catch {
          // JSON parse failed
        }
      }

      return [];
    } catch (error) {
      this.logger?.debug?.({ err: error, companyId }, "workable.scrape_failed");
      return [];
    }
  }

  normalizeJob(rawJob, company) {
    // Handle both API and scraped job formats
    const title = rawJob?.title ?? rawJob?.name;
    const url = rawJob?.url ?? rawJob?.apply_url ?? rawJob?.shortlink;

    if (!title || !url) {
      return null;
    }

    // Parse location
    const locationStr = rawJob?.location?.city
      ? `${rawJob.location.city}${rawJob.location.country ? `, ${rawJob.location.country}` : ""}`
      : rawJob?.location ?? null;

    const { city, country, locationRaw } = parseLocationString(locationStr);

    // Extract department
    const department = rawJob?.department ?? rawJob?.category ?? null;

    // Parse employment type
    let employmentType = null;
    const type = rawJob?.employment_type ?? rawJob?.type;
    if (type) {
      const lower = type.toLowerCase();
      if (lower.includes("full")) {
        employmentType = "full-time";
      } else if (lower.includes("part")) {
        employmentType = "part-time";
      } else if (lower.includes("contract")) {
        employmentType = "contract";
      } else if (lower.includes("intern")) {
        employmentType = "internship";
      }
    }

    // Determine work model
    let workModel = null;
    const remote = rawJob?.remote ?? rawJob?.telecommuting;
    if (remote === true) {
      workModel = "remote";
    } else if (locationStr) {
      const lower = locationStr.toLowerCase();
      if (lower.includes("remote")) {
        workModel = "remote";
      } else if (lower.includes("hybrid")) {
        workModel = "hybrid";
      }
    }

    // Parse posted date
    let postedAt = null;
    const dateStr = rawJob?.published ?? rawJob?.created_at ?? rawJob?.published_at;
    if (dateStr) {
      postedAt = new Date(dateStr);
      if (isNaN(postedAt.getTime())) postedAt = null;
    }

    return buildCandidateJobPayload({
      title,
      url,
      description: rawJob?.description ?? rawJob?.full_description ?? null,
      location: locationRaw,
      city,
      country,
      source: "ats-api",
      evidenceSources: ["workable-api"],
      overallConfidence: 0.95,
      externalId: rawJob?.id ?? rawJob?.shortcode ?? null,
      department,
      employmentType,
      workModel,
      postedAt,
      discoveredAt: new Date()
    });
  }
}
