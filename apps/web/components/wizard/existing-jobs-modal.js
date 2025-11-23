"use client";

import { createPortal } from "react-dom";
import { filterUsableCompanyJobs } from "../../lib/company-job-helpers";

function formatJobAge(job) {
  const timestamp = job?.postedAt ?? job?.discoveredAt ?? null;
  if (!timestamp) {
    return null;
  }
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) {
    return "Just discovered";
  }
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) {
    return "Posted today";
  }
  if (days === 1) {
    return "Posted 1 day ago";
  }
  return `Posted ${days} days ago`;
}

function formatSourceLabel(source) {
  if (!source) return "web";
  const normalized = source.toLowerCase();
  if (normalized.includes("linkedin-post")) {
    return "LinkedIn post";
  }
  if (normalized.includes("linkedin")) {
    return "LinkedIn";
  }
  if (normalized.includes("career")) {
    return "Careers site";
  }
  return source;
}

export function ExistingJobsModal({
  isOpen,
  company,
  jobs = [],
  onUseJob,
  onStartFromScratch,
  onClose,
  loadingJobId = null,
  errorMessage = null,
}) {
  if (!isOpen) {
    return null;
  }

  const usableJobs = filterUsableCompanyJobs(jobs);

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl shadow-black/15">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-500">
            Fast-track wizard
          </p>
          <h2 className="text-2xl font-bold text-neutral-900">
            Use an existing job for {company?.name || company?.primaryDomain || "this company"}
          </h2>
          <p className="text-sm text-neutral-600">
            We already discovered live openings for{" "}
            <span className="font-semibold text-neutral-900">
              {company?.name || company?.primaryDomain || "your company"}
            </span>
            . Import one to skip most of the intake questions.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {usableJobs.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
              We couldn’t find a recent job to import. Start from scratch to continue.
            </p>
          ) : (
            <ul className="space-y-4">
              {usableJobs.map((job) => {
                const ageLabel = formatJobAge(job);
                const sourceLabel = formatSourceLabel(job.source);
                return (
                  <li
                    key={job.id}
                    className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 shadow-sm shadow-neutral-100"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-neutral-900">{job.title}</h3>
                        <p className="text-sm text-neutral-600">
                          {job.location || deriveCompanyLocationFallback(company) || "Location unknown"}
                        </p>
                        <p className="text-xs uppercase tracking-wide text-neutral-400">
                          {sourceLabel}
                          {ageLabel ? ` • ${ageLabel}` : null}
                        </p>
                      </div>
                      <div className="flex flex-col items-stretch gap-2 sm:w-48">
                        <button
                          type="button"
                          onClick={() => onUseJob?.(job)}
                          disabled={Boolean(loadingJobId) && loadingJobId !== job.id}
                          className="rounded-full bg-primary-600 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white shadow-primary-200 transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
                        >
                          {loadingJobId === job.id ? "Importing…" : "Use this job"}
                        </button>
                        {job.url ? (
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-center text-xs font-semibold uppercase tracking-wide text-primary-600 underline-offset-2 hover:underline"
                          >
                            View original posting
                          </a>
                        ) : null}
                      </div>
                    </div>
                    {job.description ? (
                      <p className="mt-3 text-sm text-neutral-600">
                        {job.description}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {errorMessage ? (
          <p className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => onStartFromScratch?.()}
            className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-900"
          >
            Start from scratch (full wizard)
          </button>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="text-xs font-semibold uppercase tracking-wide text-neutral-400 underline-offset-4 hover:underline"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function deriveCompanyLocationFallback(company) {
  if (!company) return "";
  const city = typeof company.hqCity === "string" ? company.hqCity.trim() : "";
  const country = typeof company.hqCountry === "string" ? company.hqCountry.trim() : "";
  return [city, country].filter(Boolean).join(", ");
}
