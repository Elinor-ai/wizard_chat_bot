const DEFAULT_JOB_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // ~90 days

function coerceDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractJobLink(job) {
  if (!job) {
    return null;
  }
  if (typeof job.externalUrl === "string" && job.externalUrl.trim()) {
    return job.externalUrl.trim();
  }
  const context = job.importContext ?? {};
  if (typeof context.sourceUrl === "string" && context.sourceUrl.trim()) {
    return context.sourceUrl.trim();
  }
  if (typeof context.externalUrl === "string" && context.externalUrl.trim()) {
    return context.externalUrl.trim();
  }
  if (typeof job.url === "string" && job.url.trim()) {
    return job.url.trim();
  }
  return null;
}

export function isUsableCompanyJob(job, { maxAgeMs = DEFAULT_JOB_MAX_AGE_MS } = {}) {
  if (!job) return false;
  const title =
    typeof job.roleTitle === "string"
      ? job.roleTitle.trim()
      : typeof job.title === "string"
        ? job.title.trim()
        : "";
  const url = extractJobLink(job);
  if (!title || !url) {
    return false;
  }
  if (job.isActive === false || job.status === "archived") {
    return false;
  }
  if (maxAgeMs && maxAgeMs > 0) {
    const context = job.importContext ?? {};
    const timestamp =
      coerceDate(context.originalPostedAt) ??
      coerceDate(context.discoveredAt) ??
      coerceDate(job.createdAt) ??
      coerceDate(job.updatedAt);
    if (timestamp) {
      const ageMs = Date.now() - timestamp.getTime();
      if (ageMs > maxAgeMs) {
        return false;
      }
    }
  }
  return true;
}

export function filterUsableCompanyJobs(jobs = [], options = {}) {
  return jobs
    .map((job) => ({
      ...job,
      externalUrl: extractJobLink(job)
    }))
    .filter((job) => isUsableCompanyJob(job, options));
}

export function canSkipWizardForCompany(company, jobs = [], options = {}) {
  if (!company?.profileConfirmed) {
    return false;
  }
  if (company?.jobDiscoveryStatus !== "FOUND_JOBS") {
    return false;
  }
  const usableJobs = filterUsableCompanyJobs(jobs, options);
  return usableJobs.length > 0;
}
