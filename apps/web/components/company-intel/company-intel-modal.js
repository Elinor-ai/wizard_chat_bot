"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const SOCIAL_LABELS = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  twitter: "Twitter",
  x: "X",
  tiktok: "TikTok"
};

function formatLocation(company) {
  if (!company) return "";
  if (company.hqCity && company.hqCountry) {
    return `${company.hqCity}, ${company.hqCountry}`;
  }
  return company.hqCountry ?? company.hqCity ?? "";
}

function formatJobCount(jobs = []) {
  if (!jobs.length) {
    return "We didn't find public roles just yet.";
  }
  if (jobs.length === 1) {
    return "We found 1 live role you can spin into a campaign.";
  }
  return `We found ${jobs.length} active roles worth exploring.`;
}

export function CompanyIntelModal({
  isOpen,
  mode,
  company,
  jobs = [],
  onClose,
  footerContent,
  showApprovalActions = false,
  onApprove,
  onRequestRevision,
  approvalLoading = false
}) {
  if (!isOpen || !company) {
    return null;
  }

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: company?.name ?? "",
    country: company?.hqCountry ?? "",
    city: company?.hqCity ?? ""
  });

  useEffect(() => {
    if (!showApprovalActions) {
      setEditing(false);
      return;
    }
    setEditing(false);
    setForm({
      name: company?.name ?? "",
      country: company?.hqCountry ?? "",
      city: company?.hqCity ?? ""
    });
  }, [company?.id, company?.updatedAt, showApprovalActions]);

  const isSearching = mode === "searching";
  const companyName = company.name || company.primaryDomain || "your company";
  const location = formatLocation(company);
  const tagline = company.tagline || company.intelSummary || "Gathering your public narrative…";

  const showJobs = Array.isArray(jobs) && jobs.length > 0;
  const socialEntries = Object.entries(company.socials ?? {}).filter(
    ([, url]) => typeof url === "string" && url.trim().length > 0
  );
  const showSocials = socialEntries.length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-2xl shadow-black/20">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary-500">
              Company intelligence
            </p>
            <h2 className="mt-2 text-2xl font-bold text-neutral-900">
              {isSearching ? "Running Gemini discovery" : `Hello, ${companyName}`}
            </h2>
            <p className="mt-2 text-sm text-neutral-600">{tagline}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-600 transition hover:border-neutral-400"
          >
            Close
          </button>
        </div>

        {isSearching ? (
          <div className="mt-6 flex items-center gap-4 rounded-2xl border border-dashed border-primary-200 bg-primary-50/60 px-4 py-4 text-primary-700">
            <span className="h-3 w-3 animate-ping rounded-full bg-primary-500" />
            <p className="text-sm">
              We’re scouring public sources for brand, hiring, and social clues about{" "}
              <span className="font-semibold">{company.primaryDomain}</span>. Keep working—
              we’ll tap you once the intel drops.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-neutral-200 px-4 py-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Snapshot
              </h3>
              <dl className="mt-3 grid grid-cols-1 gap-2 text-sm text-neutral-700 sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-neutral-500">Tagline</dt>
                  <dd>{company.tagline || "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-neutral-500">Industry</dt>
                  <dd>{company.industry || "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-neutral-500">Headcount</dt>
                  <dd>{company.employeeCountBucket || "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-neutral-500">HQ</dt>
                  <dd>{location || "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-neutral-500">Website</dt>
                  <dd>
                    {company.website ? (
                      <a
                        href={company.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary-600 underline-offset-4 hover:underline"
                      >
                        {company.website.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-neutral-500">Tone of voice</dt>
                  <dd>{company.toneOfVoice || "—"}</dd>
                </div>
              </dl>
            </div>

            {company.enrichmentStatus === "FAILED" ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                We couldn’t confirm much from public sources yet. We’ll keep the Gemini scouts on
                standby and alert you if new data pops.
              </div>
            ) : null}

            {showSocials ? (
              <div className="rounded-2xl border border-neutral-200 px-4 py-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  Socials
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {socialEntries.map(([network, url]) => (
                    <a
                      key={network}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-primary-600 transition hover:border-primary-400 hover:text-primary-700"
                    >
                      {SOCIAL_LABELS[network] ?? network}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {showJobs ? (
              <div className="rounded-2xl border border-neutral-200 px-4 py-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                    Recent roles
                  </h3>
                  <span className="text-xs font-semibold text-neutral-500">
                    {formatJobCount(jobs)}
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  {jobs.slice(0, 3).map((job) => (
                    <div
                      key={`${job.title}-${job.url ?? job.location ?? job.source}`}
                      className="rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3"
                    >
                      <p className="text-sm font-semibold text-neutral-900">{job.title}</p>
                      <p className="text-xs text-neutral-500">
                        {job.location || "Location undisclosed"} • via {job.source || "public feed"}
                      </p>
                      {job.url ? (
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-xs font-semibold text-primary-600 underline-offset-4 hover:underline"
                        >
                          Open posting
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {showApprovalActions ? (
              <div className="rounded-2xl border border-neutral-200 px-4 py-4">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">Is this your company?</p>
                    <p className="text-xs text-neutral-600">
                      Confirm accuracy or provide a quick correction so we can keep your brand data
                      up to date.
                    </p>
                  </div>
                  {editing ? (
                    <form
                      className="space-y-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        onRequestRevision?.({
                          name: form.name,
                          country: form.country,
                          city: form.city
                        });
                      }}
                    >
                      <label className="grid gap-1 text-sm font-semibold text-neutral-700">
                        Company name
                        <input
                          type="text"
                          className="rounded-2xl border border-neutral-300 px-3 py-2 text-sm text-neutral-800"
                          value={form.name}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, name: event.target.value }))
                          }
                          required
                          disabled={approvalLoading}
                        />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm font-semibold text-neutral-700">
                          HQ Country
                          <input
                            type="text"
                            className="rounded-2xl border border-neutral-300 px-3 py-2 text-sm text-neutral-800"
                            value={form.country}
                            onChange={(event) =>
                              setForm((prev) => ({ ...prev, country: event.target.value }))
                            }
                            disabled={approvalLoading}
                          />
                        </label>
                        <label className="grid gap-1 text-sm font-semibold text-neutral-700">
                          HQ City
                          <input
                            type="text"
                            className="rounded-2xl border border-neutral-300 px-3 py-2 text-sm text-neutral-800"
                            value={form.city}
                            onChange={(event) =>
                              setForm((prev) => ({ ...prev, city: event.target.value }))
                            }
                            disabled={approvalLoading}
                          />
                        </label>
                      </div>
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setEditing(false)}
                          className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-600"
                          disabled={approvalLoading}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-primary-300"
                          disabled={approvalLoading}
                        >
                          Re-run enrichment
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={onApprove}
                        className="flex-1 rounded-2xl bg-primary-600 px-4 py-3 text-center text-sm font-semibold uppercase tracking-wide text-white shadow-lg shadow-primary-200 transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
                        disabled={approvalLoading}
                      >
                        Yes, looks good
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="flex-1 rounded-2xl border border-neutral-300 px-4 py-3 text-center text-sm font-semibold uppercase tracking-wide text-neutral-700 transition hover:border-primary-400 hover:text-primary-600 disabled:cursor-not-allowed"
                        disabled={approvalLoading}
                      >
                        No, fix details
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : footerContent ? (
              <div className="rounded-2xl border border-neutral-200 px-4 py-4">{footerContent}</div>
            ) : null}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
