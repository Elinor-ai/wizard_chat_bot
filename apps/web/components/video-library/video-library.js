"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clsx } from "../../lib/cn";
import { VideoLibraryApi } from "../../lib/api-client";
import { useUser } from "../user-context";

const CHANNEL_OPTIONS = [
  { id: "META_FB_IG_LEAD", label: "Instagram Reels" },
  { id: "TIKTOK_LEAD", label: "TikTok" },
  { id: "YOUTUBE_LEAD", label: "YouTube Shorts" },
  { id: "SNAPCHAT_LEADS", label: "Snapchat" },
  { id: "X_HIRING", label: "X Video" }
];

const STATUS_OPTIONS = [
  { id: "planned", label: "Planned" },
  { id: "generating", label: "Generating" },
  { id: "extending", label: "Extending" },
  { id: "ready", label: "Ready" },
  { id: "approved", label: "Approved" },
  { id: "published", label: "Published" },
  { id: "archived", label: "Archived" }
];

function formatDate(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString();
}

function StoryboardPreview({ shots = [] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (shots.length === 0) return undefined;
    let cancelled = false;
    let timeoutId;

    function scheduleNext(index) {
      if (cancelled) return;
      const duration = (shots[index]?.durationSeconds ?? 4) * 1000;
      timeoutId = setTimeout(() => {
        const nextIndex = (index + 1) % shots.length;
        setActiveIndex(nextIndex);
        scheduleNext(nextIndex);
      }, Math.max(duration, 1500));
    }

    scheduleNext(0);

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [shots]);

  if (shots.length === 0) {
    return <p className="text-sm text-neutral-500">No storyboard available.</p>;
  }

  return (
    <ol className="space-y-2" aria-label="Storyboard preview">
      {shots.map((shot, index) => (
        <li
          key={shot.id}
          className={clsx(
            "rounded-2xl border px-4 py-3 text-sm",
            index === activeIndex
              ? "border-emerald-400 bg-emerald-50"
              : "border-neutral-200 bg-white"
          )}
        >
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <span>{shot.phase}</span>
            <span>{shot.durationSeconds?.toFixed(1)}s</span>
          </div>
          <p className="mt-1 font-semibold text-neutral-900">{shot.onScreenText ?? "—"}</p>
          <p className="mt-1 text-neutral-600">{shot.voiceOver ?? shot.visual ?? ""}</p>
        </li>
      ))}
    </ol>
  );
}

export function VideoLibrary() {
  const { user } = useUser();
  const [items, setItems] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [filters, setFilters] = useState({ status: "", channelId: "", geo: "", roleFamily: "" });
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [bulkSelection, setBulkSelection] = useState(new Set());
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isActionBusy, setIsActionBusy] = useState(false);
  const [formState, setFormState] = useState({ jobId: "", channelId: CHANNEL_OPTIONS[0].id });
  const [formError, setFormError] = useState(null);
  const [captionDraft, setCaptionDraft] = useState({ text: "", hashtags: "" });
  const authToken = user?.authToken;

  const loadItems = useCallback(async () => {
    if (!authToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await VideoLibraryApi.fetchItems(filters, { authToken });
      setItems(data);
      if (data.length > 0) {
        if (!selectedItemId) {
          setSelectedItemId(data[0].id);
        } else if (!data.find((item) => item.id === selectedItemId)) {
          setSelectedItemId(data[0].id);
        }
      } else {
        setSelectedItemId(null);
        setDetail(null);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, [authToken, filters, selectedItemId]);

  const loadJobs = useCallback(async () => {
    if (!authToken) return;
    try {
      const data = await VideoLibraryApi.fetchJobs({ authToken });
      setJobs(data);
      if (data.length > 0) {
        setFormState((prev) => (prev.jobId ? prev : { ...prev, jobId: data[0].id }));
      }
    } catch (requestError) {
      setFormError(requestError.message);
    }
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;
    loadJobs();
  }, [authToken, loadJobs]);

  useEffect(() => {
    if (!authToken) return;
    loadItems();
  }, [authToken, loadItems]);

  useEffect(() => {
    if (!authToken || !selectedItemId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    async function fetchDetail() {
      setIsDetailLoading(true);
      try {
        const full = await VideoLibraryApi.fetchItem(selectedItemId, { authToken });
        if (!cancelled) {
          setDetail(full);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message);
        }
      } finally {
        if (!cancelled) {
          setIsDetailLoading(false);
        }
      }
    }
    fetchDetail();
    return () => {
      cancelled = true;
    };
  }, [authToken, selectedItemId]);

  useEffect(() => {
    if (!detail?.manifest?.caption) {
      setCaptionDraft({ text: "", hashtags: "" });
      return;
    }
    setCaptionDraft({
      text: detail.manifest.caption.text,
      hashtags: (detail.manifest.caption.hashtags ?? []).join(", ")
    });
  }, [detail]);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!authToken) return;
    if (!formState.jobId) {
      setFormError("Select a job to generate a video plan");
      return;
    }
    setFormError(null);
    try {
      const created = await VideoLibraryApi.createItem(
        {
          jobId: formState.jobId,
          channelId: formState.channelId,
          recommendedMedium: "video"
        },
        { authToken }
      );
      await loadItems();
      setSelectedItemId(created.id);
      setDetail(created);
    } catch (requestError) {
      setFormError(requestError.message);
    }
  };

  const handleBulkAction = async (action) => {
    if (!authToken || bulkSelection.size === 0) return;
    try {
      await VideoLibraryApi.bulkAction({ action, ids: Array.from(bulkSelection) }, { authToken });
      setBulkSelection(new Set());
      await loadItems();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleAction = async (type, payload = {}) => {
    if (!authToken || !selectedItemId || isActionBusy) return;
    setIsActionBusy(true);
    try {
      let updated;
      if (type === "regenerate") {
        updated = await VideoLibraryApi.regenerate(selectedItemId, payload, { authToken });
      } else if (type === "render") {
        updated = await VideoLibraryApi.triggerRender(selectedItemId, { authToken });
      } else if (type === "approve") {
        updated = await VideoLibraryApi.approve(selectedItemId, { authToken });
      } else if (type === "publish") {
        updated = await VideoLibraryApi.publish(selectedItemId, { authToken });
      } else if (type === "caption") {
        updated = await VideoLibraryApi.updateCaption(selectedItemId, payload, { authToken });
      }
      if (updated) {
        setDetail(updated);
        await loadItems();
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsActionBusy(false);
    }
  };

  const selectedItems = useMemo(() => new Set(bulkSelection), [bulkSelection]);

  const selectionEnabled = items.length > 0;
  const isVeoGenerating = Boolean(
    detail?.veo && ["predicting", "fetching"].includes(detail.veo.status)
  );
  const renderButtonLabel = isVeoGenerating ? "Refresh status" : "Re-render";

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
        <h2 className="text-lg font-semibold text-neutral-900">Generate a new video plan</h2>
        <form className="mt-4 grid gap-4 md:grid-cols-3" onSubmit={handleCreate}>
          <label className="text-sm text-neutral-600">
            <span className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">Job</span>
            <select
              className="mt-1 w-full rounded-2xl border border-neutral-200 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none"
              value={formState.jobId}
              onChange={(event) => setFormState((prev) => ({ ...prev, jobId: event.target.value }))}
            >
              {jobs.length === 0 ? (
                <option value="">No jobs found</option>
              ) : null}
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} · {job.location || "Geo unknown"}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-neutral-600">
            <span className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">Channel</span>
            <select
              className="mt-1 w-full rounded-2xl border border-neutral-200 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none"
              value={formState.channelId}
              onChange={(event) => setFormState((prev) => ({ ...prev, channelId: event.target.value }))}
            >
              {CHANNEL_OPTIONS.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              Create manifest
            </button>
          </div>
        </form>
        {formError ? <p className="mt-2 text-sm text-red-600">{formError}</p> : null}
      </section>

      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Video library</h2>
            <p className="text-sm text-neutral-500">Preview, filter, and bulk-manage recruiting videos.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <select
              value={filters.channelId}
              onChange={(event) => setFilters((prev) => ({ ...prev, channelId: event.target.value }))}
              className="rounded-2xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            >
              <option value="">All channels</option>
              {CHANNEL_OPTIONS.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.label}
                </option>
              ))}
            </select>
            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
              className="rounded-2xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Filter geo"
              value={filters.geo}
              onChange={(event) => setFilters((prev) => ({ ...prev, geo: event.target.value }))}
              className="rounded-2xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Role family"
              value={filters.roleFamily}
              onChange={(event) => setFilters((prev) => ({ ...prev, roleFamily: event.target.value }))}
              className="rounded-2xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </div>
        </div>

        {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            className="rounded-full border border-neutral-200 px-3 py-1 text-neutral-600 disabled:opacity-50"
            onClick={() => handleBulkAction("approve")}
            disabled={!selectionEnabled || selectedItems.size === 0}
          >
            Bulk approve
          </button>
          <button
            type="button"
            className="rounded-full border border-neutral-200 px-3 py-1 text-neutral-600 disabled:opacity-50"
            onClick={() => handleBulkAction("archive")}
            disabled={!selectionEnabled || selectedItems.size === 0}
          >
            Bulk archive
          </button>
        </div>

        {isLoading ? (
          <p className="mt-4 text-sm text-neutral-500">Loading video items…</p>
        ) : items.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-sm text-neutral-500">
            Generate a manifest to see it appear here.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <article
                key={item.id}
                className={clsx(
                  "cursor-pointer rounded-3xl border px-4 py-4 transition",
                  item.id === selectedItemId
                    ? "border-neutral-900 bg-neutral-50"
                    : "border-neutral-200 bg-white hover:border-neutral-400"
                )}
                onClick={() => setSelectedItemId(item.id)}
              >
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={(event) => {
                        const next = new Set(selectedItems);
                        if (event.target.checked) {
                          next.add(item.id);
                        } else {
                          next.delete(item.id);
                        }
                        setBulkSelection(next);
                      }}
                      onClick={(event) => event.stopPropagation()}
                    />
                    Select
                  </label>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
                    {item.status}
                  </span>
                </div>
                <h3 className="mt-2 text-base font-semibold text-neutral-900">{item.jobTitle}</h3>
                <p className="text-sm text-neutral-500">
                  {item.channelName} • {item.placementName}
                </p>
                <p className="mt-2 text-xs text-neutral-500">
                  Updated {formatDate(item.updatedAt)}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Review & publish</h2>
        {isDetailLoading ? (
          <p className="mt-4 text-sm text-neutral-500">Loading preview…</p>
        ) : detail ? (
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-2xl border border-neutral-200 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Preview</h3>
                  {detail.generationMetrics?.synthIdWatermark !== false ? (
                    <span className="text-xs font-semibold text-neutral-500">SynthID watermark</span>
                  ) : null}
                </div>
                {detail.playback?.type === "file" && detail.playback.videoUrl ? (
                  <video
                    className="mt-3 w-full rounded-2xl"
                    controls
                    poster={detail.playback.posterUrl ?? undefined}
                  >
                    <source src={detail.playback.videoUrl} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <div className="mt-3 rounded-2xl border border-dashed border-neutral-200 p-3">
                    <StoryboardPreview shots={detail.manifest?.storyboard ?? []} />
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-neutral-200 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Caption</h3>
                <textarea
                  className="mt-2 w-full rounded-2xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
                  rows={3}
                  value={captionDraft.text}
                  onChange={(event) => setCaptionDraft((prev) => ({ ...prev, text: event.target.value }))}
                />
                <input
                  type="text"
                  className="mt-2 w-full rounded-2xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
                  placeholder="Hashtags (comma separated)"
                  value={captionDraft.hashtags}
                  onChange={(event) => setCaptionDraft((prev) => ({ ...prev, hashtags: event.target.value }))}
                />
                <button
                  type="button"
                  className="mt-3 rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white"
                  onClick={() =>
                    handleAction("caption", {
                      captionText: captionDraft.text,
                      hashtags: captionDraft.hashtags
                        .split(",")
                        .map((tag) => tag.trim().replace(/^#/, ""))
                        .filter(Boolean)
                    })
                  }
                >
                  Save caption
                </button>
              </div>

              {detail.generationMetrics ? (
                <div className="rounded-2xl border border-neutral-200 p-4 text-sm">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Generation metrics</h3>
                  <dl className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <dt className="text-neutral-500">Seconds generated</dt>
                      <dd>{detail.generationMetrics.secondsGenerated ?? "—"}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-neutral-500">Model tier</dt>
                      <dd className="uppercase">{detail.generationMetrics.tier ?? "—"}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-neutral-500">Cost estimate</dt>
                      <dd>
                        {typeof detail.generationMetrics.costEstimateUsd === "number"
                          ? `$${detail.generationMetrics.costEstimateUsd.toFixed(2)}`
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              {isVeoGenerating ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-semibold">Generating preview…</p>
                  <p className="mt-1">
                    Vertex Veo is still rendering this clip. Use “Refresh status” to resume polling without
                    restarting the request.
                  </p>
                </div>
              ) : null}
              <div className="rounded-2xl border border-neutral-200 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Compliance & QA</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {detail.manifest?.compliance?.flags?.map((flag) => (
                    <li key={flag.id} className="rounded-2xl border border-neutral-200 px-3 py-2">
                      <p className="font-semibold text-neutral-900">
                        {flag.label} ({flag.severity})
                      </p>
                      {flag.details ? <p className="text-xs text-neutral-500">{flag.details}</p> : null}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">QA checklist</p>
                  <ul className="mt-2 space-y-1">
                    {detail.manifest?.compliance?.qaChecklist?.map((item) => (
                      <li key={item.id} className="flex items-center justify-between rounded-xl border border-neutral-100 px-3 py-2">
                        <span>{item.label}</span>
                        <span className="text-xs font-semibold uppercase text-neutral-500">{item.status}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 p-4 text-sm">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Tracking & metadata</h3>
                <p className="mt-2 text-neutral-600">UTM: {detail.trackingString ?? "—"}</p>
                <p className="text-neutral-600">Job geo: {detail.jobSnapshot?.geo ?? "Unknown"}</p>
                <p className="text-neutral-600">Pay: {detail.jobSnapshot?.payRange ?? "Not provided"}</p>
                {detail.generationMetrics?.costEstimateUsd ? (
                  <p className="text-neutral-600">
                    Cost estimate: ${detail.generationMetrics.costEstimateUsd.toFixed(2)} USD
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    className="rounded-full bg-neutral-900 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => handleAction("regenerate", { jobId: detail.jobId })}
                    disabled={isActionBusy || isVeoGenerating}
                  >
                    Regenerate script
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-neutral-300 px-4 py-2 font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => handleAction("render")}
                    disabled={isActionBusy}
                  >
                    {renderButtonLabel}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-neutral-300 px-4 py-2 font-semibold text-neutral-700"
                    onClick={() => handleAction("approve")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-neutral-300 px-4 py-2 font-semibold text-neutral-700"
                    onClick={() => handleAction("publish")}
                  >
                    Publish
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-neutral-500">Select a video card to inspect manifest details.</p>
        )}
      </section>
    </div>
  );
}
