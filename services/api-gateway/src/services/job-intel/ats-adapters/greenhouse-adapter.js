/**
 * @file greenhouse-adapter.js
 * Greenhouse ATS adapter.
 *
 * Greenhouse provides a public API for job boards:
 * https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs
 *
 * URL patterns:
 * - boards.greenhouse.io/{company}
 * - {company}.greenhouse.io
 * - jobs.greenhouse.io/embed/job_board?for={company}
 */

import { BaseAtsAdapter, buildCandidateJobPayload, parseLocationString } from "./base-adapter.js";

const GREENHOUSE_API_BASE = "https://boards-api.greenhouse.io/v1/boards";
const GREENHOUSE_PATTERNS = [
  /^https?:\/\/boards\.greenhouse\.io\/([^/?#]+)/i,
  /^https?:\/\/([^.]+)\.greenhouse\.io/i,
  /^https?:\/\/(?:www\.)?greenhouse\.io\/([^/?#]+)/i,
  /^https?:\/\/jobs\.greenhouse\.io\/embed\/job_board\?(?:.*&)?for=([^&]+)/i
];

export class GreenhouseAdapter extends BaseAtsAdapter {
  constructor(options) {
    super(options);
    this.name = "greenhouse";
  }

  canHandle(url) {
    if (!url) return false;
    return GREENHOUSE_PATTERNS.some((pattern) => pattern.test(url));
  }

  extractCompanyId(url) {
    if (!url) return null;

    for (const pattern of GREENHOUSE_PATTERNS) {
      const match = url.match(pattern);
      if (match && match[1]) {
        // Clean up company ID (remove path segments, query strings)
        const companyId = match[1].split("/")[0].split("?")[0];
        if (companyId && companyId !== "embed") {
          return companyId.toLowerCase();
        }
      }
    }
    return null;
  }

  getBoardUrl(companyId) {
    return `https://boards.greenhouse.io/${companyId}`;
  }

  async fetchJobs({ companyId }) {
    const apiUrl = `${GREENHOUSE_API_BASE}/${companyId}/jobs?content=true`;

    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      this.logger?.warn?.(
        { status: response.status, companyId },
        "greenhouse.api_error"
      );
      return [];
    }

    const data = await response.json();
    return data?.jobs ?? [];
  }

  normalizeJob(rawJob, company) {
    if (!rawJob?.title || !rawJob?.absolute_url) {
      return null;
    }

    // Parse location
    const locationParts = [];
    if (rawJob.location?.name) {
      locationParts.push(rawJob.location.name);
    }

    const locationStr = locationParts.join(", ") || null;
    const { city, country, locationRaw } = parseLocationString(locationStr);

    // Extract department
    const departments = rawJob.departments ?? [];
    const department = departments.map((d) => d.name).filter(Boolean).join(", ") || null;

    // Parse posted date
    let postedAt = null;
    if (rawJob.updated_at) {
      postedAt = new Date(rawJob.updated_at);
      if (isNaN(postedAt.getTime())) postedAt = null;
    }

    // Determine work model from location
    let workModel = null;
    if (locationStr) {
      const lower = locationStr.toLowerCase();
      if (lower.includes("remote")) {
        workModel = "remote";
      } else if (lower.includes("hybrid")) {
        workModel = "hybrid";
      }
    }

    return buildCandidateJobPayload({
      title: rawJob.title,
      url: rawJob.absolute_url,
      description: rawJob.content ?? null,
      location: locationRaw,
      city,
      country,
      source: "ats-api",
      evidenceSources: ["greenhouse-api"],
      overallConfidence: 0.95,
      externalId: rawJob.id?.toString() ?? null,
      department,
      workModel,
      postedAt,
      discoveredAt: new Date()
    });
  }
}
