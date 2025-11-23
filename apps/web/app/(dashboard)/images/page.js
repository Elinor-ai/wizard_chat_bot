"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useUser } from "../../../components/user-context";
import { WizardApi } from "../../../lib/api-client";
import { clsx } from "../../../lib/cn";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function fetchHeroImage({ authToken, jobId }) {
  const response = await fetch(
    `${API_BASE_URL}/wizard/hero-image?jobId=${encodeURIComponent(jobId)}`,
    {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    }
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.error ?? "Failed to load hero image";
    throw new Error(message);
  }
  return response.json();
}

async function requestHeroImage({ authToken, jobId }) {
  const response = await fetch(`${API_BASE_URL}/wizard/hero-image`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ jobId, forceRefresh: true })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.error ?? "Failed to request hero image";
    throw new Error(message);
  }
  return response.json();
}

function useJobs(authToken) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!authToken) {
      setJobs([]);
      return;
    }
    let cancelled = false;

    const fetchJobs = async () => {
      setLoading(true);
      setError(null);
      try {
        const fetched = await WizardApi.fetchJobs({ authToken });
        if (!cancelled) {
          setJobs(Array.isArray(fetched) ? fetched : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? "Failed to load jobs");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchJobs();
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  return { jobs, loading, error };
}

export default function ImageStudioPage() {
  const { user } = useUser();
  const authToken = user?.authToken ?? null;
  const { jobs, loading: jobsLoading, error: jobsError } = useJobs(authToken);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [heroImage, setHeroImage] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId]
  );

  useEffect(() => {
    if (!selectedJobId || !authToken) {
      setHeroImage(null);
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setError(null);

    fetchHeroImage({ authToken, jobId: selectedJobId })
      .then((response) => {
        if (!cancelled) {
          setHeroImage(response.heroImage ?? null);
          setStatus("ready");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setHeroImage(null);
          setStatus("error");
          setError(err?.message ?? "Failed to load hero image");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedJobId, authToken]);

  const handleGenerate = useCallback(async () => {
    if (!selectedJobId || !authToken) {
      return;
    }
    setStatus("generating");
    setError(null);
    try {
      await requestHeroImage({ authToken, jobId: selectedJobId });
      const result = await fetchHeroImage({ authToken, jobId: selectedJobId });
      setHeroImage(result.heroImage ?? null);
      setStatus("ready");
    } catch (err) {
      setError(err?.message ?? "Failed to generate hero image");
      setStatus("error");
    }
  }, [authToken, selectedJobId]);

  const handleDownload = () => {
    if (!heroImage?.imageBase64 && !heroImage?.imageUrl) {
      return;
    }
    const link = document.createElement("a");
    if (heroImage.imageBase64) {
      const mime = heroImage.imageMimeType ?? "image/png";
      link.href = `data:${mime};base64,${heroImage.imageBase64}`;
      link.download = `${selectedJob?.roleTitle ?? "hero-image"}.png`;
    } else {
      link.href = heroImage.imageUrl;
      link.download = `${selectedJob?.roleTitle ?? "hero-image"}.png`;
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyCaption = async () => {
    if (!heroImage?.caption) {
      return;
    }
    const caption = [
      heroImage.caption,
      Array.isArray(heroImage.captionHashtags)
        ? heroImage.captionHashtags.join(" ")
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");
    if (!caption) return;
    try {
      await navigator.clipboard?.writeText(caption);
    } catch (error) {
      const textarea = document.createElement("textarea");
      textarea.value = caption;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  const imageInFlight = ["PROMPTING", "GENERATING"].includes(
    heroImage?.status ?? ""
  );
  const canGenerate =
    selectedJobId &&
    !imageInFlight &&
    (status === "ready" || status === "idle" || status === "error");

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
        <h1 className="text-2xl font-semibold text-neutral-900">
          AI Image Studio
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Generate or refine hero visuals for any of your jobs without leaving the dashboard.
        </p>
      </header>

      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
        <div className="space-y-3">
          <label className="text-sm font-medium text-neutral-800">
            Select a job
          </label>
          {jobsLoading ? (
            <p className="text-sm text-neutral-500">Loading jobs…</p>
          ) : jobsError ? (
            <p className="text-sm text-red-600">{jobsError}</p>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No jobs available. Create a job via the wizard first.
            </p>
          ) : (
            <select
              value={selectedJobId ?? ""}
              onChange={(event) =>
                setSelectedJobId(
                  event.target.value ? event.target.value : null
                )
              }
              className="w-full rounded-2xl border border-neutral-200 px-4 py-2 text-sm text-neutral-800 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
            >
              <option value="">Choose a job…</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.roleTitle || "Untitled role"} •{" "}
                  {job.companyName || "Company"}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>

      {selectedJobId ? (
        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold text-neutral-900">
                    {selectedJob?.roleTitle || "Hero visual"}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {heroImage?.status
                      ? heroImage.status.toLowerCase()
                      : status}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {heroImage?.imageBase64 || heroImage?.imageUrl ? (
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-600 transition hover:border-primary-500 hover:text-primary-600"
                    >
                      Download
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    className={clsx(
                      "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition",
                      canGenerate
                        ? "bg-primary-600 text-white hover:bg-primary-500"
                        : "cursor-not-allowed bg-neutral-200 text-neutral-500"
                    )}
                  >
                    {heroImage?.status === "READY" ? "Regenerate" : "Generate"}
                  </button>
                </div>
              </div>

              {error ? (
                <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </p>
              ) : null}

              <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-4">
                {status === "loading" ? (
                  <p className="text-sm text-neutral-500">Loading…</p>
                ) : heroImage?.status === "READY" &&
                  (heroImage?.imageBase64 || heroImage?.imageUrl) ? (
                  <img
                    src={
                      heroImage.imageBase64
                        ? `data:${
                            heroImage.imageMimeType ?? "image/png"
                          };base64,${heroImage.imageBase64}`
                        : heroImage.imageUrl
                    }
                    alt="AI hero"
                    className="h-auto w-full rounded-xl border border-neutral-200 object-cover"
                  />
                ) : imageInFlight ? (
                  <p className="text-sm text-neutral-600">
                    Generating image… this usually takes ~20 seconds.
                  </p>
                ) : (
                  <p className="text-sm text-neutral-500">
                    No AI hero image yet. Click Generate to get started.
                  </p>
                )}
              </div>
            </div>

            <aside className="flex-1 space-y-4">
              <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                <p className="text-sm font-semibold text-neutral-900">
                  Caption / copy
                </p>
                {heroImage?.caption ? (
                  <div className="space-y-2">
                    <p className="whitespace-pre-wrap text-sm text-neutral-800">
                      {heroImage.caption}
                    </p>
                    {Array.isArray(heroImage.captionHashtags) && heroImage.captionHashtags.length > 0 ? (
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        {heroImage.captionHashtags.join(" ")}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCopyCaption}
                        className="rounded-full border border-neutral-300 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-600 transition hover:border-primary-400 hover:text-primary-600"
                      >
                        Copy caption
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">
                    Once your image is ready, we’ll display the suggested caption or CTA here based on the job details.
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                <p className="text-sm font-semibold text-neutral-900">
                  Provider details
                </p>
                <p className="text-xs text-neutral-500">
                  Provider: {heroImage?.imageProvider ?? "—"} <br />
                  Model: {heroImage?.imageModel ?? "—"}
                </p>
              </div>
            </aside>
          </div>
        </section>
      ) : null}
    </div>
  );
}
