/**
 * @file lever-adapter.js
 * Lever ATS adapter.
 *
 * Lever provides a public API for job boards:
 * https://api.lever.co/v0/postings/{company}
 *
 * URL patterns:
 * - jobs.lever.co/{company}
 * - {company}.lever.co
 */

import { BaseAtsAdapter, buildCandidateJobPayload, parseLocationString } from "./base-adapter.js";

const LEVER_API_BASE = "https://api.lever.co/v0/postings";
const LEVER_PATTERNS = [
  /^https?:\/\/jobs\.lever\.co\/([^/?#]+)/i,
  /^https?:\/\/([^.]+)\.lever\.co/i
];

export class LeverAdapter extends BaseAtsAdapter {
  constructor(options) {
    super(options);
    this.name = "lever";
  }

  canHandle(url) {
    if (!url) return false;
    return LEVER_PATTERNS.some((pattern) => pattern.test(url));
  }

  extractCompanyId(url) {
    if (!url) return null;

    for (const pattern of LEVER_PATTERNS) {
      const match = url.match(pattern);
      if (match && match[1]) {
        const companyId = match[1].split("/")[0].split("?")[0];
        if (companyId && companyId !== "jobs") {
          return companyId.toLowerCase();
        }
      }
    }
    return null;
  }

  getBoardUrl(companyId) {
    return `https://jobs.lever.co/${companyId}`;
  }

  async fetchJobs({ companyId }) {
    const apiUrl = `${LEVER_API_BASE}/${companyId}?mode=json`;

    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      this.logger?.warn?.(
        { status: response.status, companyId },
        "lever.api_error"
      );
      return [];
    }

    const data = await response.json();
    // Lever returns an array directly
    return Array.isArray(data) ? data : [];
  }

  normalizeJob(rawJob, company) {
    if (!rawJob?.text || !rawJob?.hostedUrl) {
      return null;
    }

    // Parse location
    const locationStr = rawJob.categories?.location ?? null;
    const { city, country, locationRaw } = parseLocationString(locationStr);

    // Extract department/team
    const department = rawJob.categories?.department ?? rawJob.categories?.team ?? null;

    // Extract commitment (full-time, part-time, etc.)
    const commitment = rawJob.categories?.commitment ?? null;
    let employmentType = null;
    if (commitment) {
      const lower = commitment.toLowerCase();
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
    if (locationStr) {
      const lower = locationStr.toLowerCase();
      if (lower.includes("remote")) {
        workModel = "remote";
      } else if (lower.includes("hybrid")) {
        workModel = "hybrid";
      }
    }

    // Parse posted date
    let postedAt = null;
    if (rawJob.createdAt) {
      postedAt = new Date(rawJob.createdAt);
      if (isNaN(postedAt.getTime())) postedAt = null;
    }

    return buildCandidateJobPayload({
      title: rawJob.text,
      url: rawJob.hostedUrl,
      description: rawJob.descriptionPlain ?? rawJob.description ?? null,
      location: locationRaw,
      city,
      country,
      source: "ats-api",
      evidenceSources: ["lever-api"],
      overallConfidence: 0.95,
      externalId: rawJob.id ?? null,
      department,
      employmentType,
      workModel,
      postedAt,
      discoveredAt: new Date()
    });
  }
}
