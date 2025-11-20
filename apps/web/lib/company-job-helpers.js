const DEFAULT_JOB_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // ~90 days

function coerceDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isUsableCompanyJob(job, { maxAgeMs = DEFAULT_JOB_MAX_AGE_MS } = {}) {
  if (!job) return false;
  const title = typeof job.title === "string" ? job.title.trim() : "";
  const url = typeof job.url === "string" ? job.url.trim() : "";
  if (!title || !url) {
    return false;
  }
  if (job.isActive === false) {
    return false;
  }
  if (maxAgeMs && maxAgeMs > 0) {
    const timestamp = coerceDate(job.postedAt) ?? coerceDate(job.discoveredAt);
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
  return jobs.filter((job) => isUsableCompanyJob(job, options));
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
