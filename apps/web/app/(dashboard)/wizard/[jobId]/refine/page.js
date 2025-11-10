"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { clsx } from "../../../../../lib/cn";
import { useUser } from "../../../../../components/user-context";
import {
  finalizeJob,
  fetchChannelRecommendations,
  fetchJobAssets,
  generateJobAssets,
  refineJob,
} from "../../../../../components/wizard/wizard-services";
import {
  OPTIONAL_STEPS,
  REQUIRED_STEPS,
} from "../../../../../components/wizard/wizard-schema";

const FIELD_DEFINITIONS = [...REQUIRED_STEPS, ...OPTIONAL_STEPS].flatMap(
  (step) => step.fields
);

const ARRAY_FIELD_IDS = new Set([
  "coreDuties",
  "mustHaves",
  "benefits",
]);

const DEFAULT_JOB_STATE = {
  roleTitle: "",
  companyName: "",
  location: "",
  zipCode: "",
  industry: "",
  seniorityLevel: "",
  employmentType: "",
  workModel: "",
  jobDescription: "",
  coreDuties: [],
  mustHaves: [],
  benefits: [],
  salary: "",
  salaryPeriod: "",
  currency: "",
};

function normaliseJobDraft(input) {
  const base = { ...DEFAULT_JOB_STATE };
  if (!input || typeof input !== "object") {
    return base;
  }
  Object.keys(base).forEach((key) => {
    const value = input[key];
    if (ARRAY_FIELD_IDS.has(key)) {
      if (Array.isArray(value)) {
        base[key] = value.map((item) =>
          typeof item === "string" ? item.trim() : String(item)
        ).filter((item) => item.length > 0);
      } else if (typeof value === "string" && value.trim().length > 0) {
        base[key] = value
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } else if (typeof value === "string") {
      base[key] = value;
    } else if (value !== undefined && value !== null) {
      base[key] = String(value);
    }
  });
  return base;
}

function jobToTextareaValue(list = []) {
  if (!Array.isArray(list)) return "";
  return list.join("\n");
}

function textareaValueToList(value) {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasMeaningfulValue(field, value) {
  if (ARRAY_FIELD_IDS.has(field.id)) {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return value !== undefined && value !== null && value !== "";
}

function JobPreview({ job }) {
  const summary = useMemo(() => normaliseJobDraft(job), [job]);
  const { roleTitle, companyName, location } = summary;
  const tags = [summary.seniorityLevel, summary.employmentType, summary.workModel]
    .filter((tag) => tag && tag.length > 0);

  const detailItems = [
    { label: "Industry", value: summary.industry },
    { label: "Postal code", value: summary.zipCode },
    { label: "Salary", value: summary.salary },
    { label: "Pay cadence", value: summary.salaryPeriod },
    { label: "Currency", value: summary.currency },
  ].filter((item) => item.value && item.value.length > 0);

  const sections = [
    {
      title: "Key responsibilities",
      items: summary.coreDuties,
    },
    {
      title: "Must-have qualifications",
      items: summary.mustHaves,
    },
    {
      title: "Benefits",
      items: summary.benefits,
    },
  ].filter((section) => section.items && section.items.length > 0);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-xl font-semibold text-neutral-900">
          {roleTitle || "Untitled role"}
        </h3>
        <p className="text-sm text-neutral-600">
          {[companyName, location].filter(Boolean).join(" • ")}
        </p>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      {summary.jobDescription ? (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Role overview
          </h4>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
            {summary.jobDescription}
          </p>
        </section>
      ) : null}

      {sections.map((section) => (
        <section key={section.title} className="space-y-2">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {section.title}
          </h4>
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
            {section.items.map((item, index) => (
              <li key={`${section.title}-${index}`}>{item}</li>
            ))}
          </ul>
        </section>
      ))}

      {detailItems.length > 0 ? (
        <section className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Additional details
          </h4>
          <dl className="grid grid-cols-1 gap-3 text-sm text-neutral-700 sm:grid-cols-2">
            {detailItems.map((detail) => (
              <div
                key={detail.label}
                className="rounded-lg border border-neutral-200 bg-neutral-50 p-3"
              >
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {detail.label}
                </dt>
                <dd className="mt-1 text-sm text-neutral-700">
                  {detail.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function JobEditorCard({
  title,
  job,
  onChange,
  editable = true,
  showFieldRevert = false,
  originalValues = null,
  refinedValues = null,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const draft = useMemo(() => normaliseJobDraft(job), [job]);
  const baseline = useMemo(
    () => normaliseJobDraft(originalValues ?? {}),
    [originalValues]
  );
  const refinedBaseline = useMemo(
    () => normaliseJobDraft(refinedValues ?? {}),
    [refinedValues]
  );

  const applyChange = useCallback(
    (fieldId, nextValue) => {
      const next = { ...draft };
      if (
        nextValue === undefined ||
        nextValue === null ||
        (typeof nextValue === "string" && nextValue.length === 0)
      ) {
        delete next[fieldId];
      } else {
        next[fieldId] = nextValue;
      }
      onChange(next);
    },
    [draft, onChange]
  );

  const handleFieldChange = (field, transform) => (event) => {
    const rawValue = event?.target ? event.target.value : event;
    let nextValue = rawValue;
    if (ARRAY_FIELD_IDS.has(field.id)) {
      nextValue =
        transform ? transform(rawValue) : textareaValueToList(rawValue);
    } else if (field.type === "number" || field.valueAs === "number") {
      if (rawValue === "") {
        nextValue = "";
      } else {
        const numeric = Number(rawValue);
        nextValue = Number.isNaN(numeric) ? "" : numeric;
      }
    } else if (field.valueAs === "boolean") {
      if (rawValue === "") {
        nextValue = "";
      } else {
        nextValue = rawValue === "true";
      }
    }
    applyChange(field.id, nextValue);
  };

  const handleFieldRevert = (field, target = "original") => {
    const sourceDraft =
      target === "original" ? baseline : refinedBaseline;
    let targetValue = sourceDraft[field.id];

    if (ARRAY_FIELD_IDS.has(field.id)) {
      targetValue = Array.isArray(targetValue) ? [...targetValue] : [];
    } else if (
      targetValue === undefined ||
      targetValue === null ||
      targetValue === ""
    ) {
      targetValue = "";
    }
    applyChange(field.id, targetValue);
  };

  const normalizeForCompare = (value, field) => {
    if (ARRAY_FIELD_IDS.has(field.id)) {
      return JSON.stringify((value ?? []).map((item) => String(item)));
    }
    if (value === undefined || value === null) {
      return "";
    }
    if (typeof value === "string") {
      return value.trim();
    }
    return String(value);
  };

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm shadow-primary-100">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
        {editable ? (
          <button
            type="button"
            onClick={() => setIsEditing((prev) => !prev)}
            className="text-xs font-semibold uppercase tracking-wide text-primary-600 transition hover:text-primary-500"
          >
            {isEditing ? "Done" : "Edit"}
          </button>
        ) : null}
      </div>

      {isEditing ? (
        <div className="space-y-4">
          {FIELD_DEFINITIONS.map((field) => {
            const value = draft[field.id] ?? "";
            const isList = ARRAY_FIELD_IDS.has(field.id);
            const fieldValue = isList ? jobToTextareaValue(value) : value;
            const originalValue = baseline[field.id];
            const refinedValue = refinedBaseline[field.id];
            const normalizedValue = normalizeForCompare(value, field);
            const normalizedOriginal = normalizeForCompare(originalValue, field);
            const normalizedRefined = normalizeForCompare(refinedValue, field);
            const isSameAsOriginal = showFieldRevert
              ? normalizedValue === normalizedOriginal
              : true;
            const isSameAsRefined = showFieldRevert
              ? normalizedValue === normalizedRefined
              : true;
            const currentBaseline = showFieldRevert
              ? isSameAsOriginal
                ? "original"
                : isSameAsRefined
                ? "refined"
                : "custom"
              : null;
            const shouldShowBaselineToggle =
              showFieldRevert &&
              baseline &&
              refinedBaseline &&
              (hasMeaningfulValue(field, originalValue) ||
                hasMeaningfulValue(field, refinedValue)) &&
              normalizedOriginal !== normalizedRefined;

            const revertButton =
              shouldShowBaselineToggle ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex rounded-full border border-neutral-200 bg-neutral-50 p-0.5">
                    <button
                      type="button"
                      onClick={() => handleFieldRevert(field, "refined")}
                      disabled={isSameAsRefined}
                      className={clsx(
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition",
                        isSameAsRefined
                          ? "bg-primary-600 text-white shadow"
                          : "text-neutral-600 hover:text-primary-600 disabled:text-neutral-300"
                      )}
                    >
                      Refined
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFieldRevert(field, "original")}
                      disabled={isSameAsOriginal}
                      className={clsx(
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition",
                        isSameAsOriginal
                          ? "bg-primary-600 text-white shadow"
                          : "text-neutral-600 hover:text-primary-600 disabled:text-neutral-300"
                      )}
                    >
                      Original
                    </button>
                  </div>
                  {currentBaseline === "custom" ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                      Custom edits
                    </span>
                  ) : null}
                </div>
              ) : null;

            if (field.type === "capsule" && Array.isArray(field.options)) {
              return (
                <label key={field.id} className="flex flex-col gap-1 text-sm text-neutral-700">
                  <span className="font-medium text-neutral-800">{field.label}</span>
                  <select
                    className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                    value={fieldValue}
                    onChange={handleFieldChange(field)}
                  >
                    <option value="">Select</option>
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {revertButton}
                </label>
              );
            }

            if (field.asList) {
              return (
                <label key={field.id} className="flex flex-col gap-1 text-sm text-neutral-700">
                  <span className="font-medium text-neutral-800">{field.label}</span>
                  <textarea
                    className="min-h-[120px] rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                    value={fieldValue}
                    onChange={handleFieldChange(field, textareaValueToList)}
                  />
                  {revertButton}
                </label>
              );
            }

            if (field.type === "textarea") {
              return (
                <label key={field.id} className="flex flex-col gap-1 text-sm text-neutral-700">
                  <span className="font-medium text-neutral-800">{field.label}</span>
                  <textarea
                    className="min-h-[120px] rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                    value={fieldValue}
                    onChange={handleFieldChange(field)}
                  />
                  {revertButton}
                </label>
              );
            }

            return (
              <label key={field.id} className="flex flex-col gap-1 text-sm text-neutral-700">
                <span className="font-medium text-neutral-800">{field.label}</span>
                <input
                  className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  value={fieldValue}
                  onChange={handleFieldChange(field)}
                />
                {revertButton}
              </label>
            );
          })}
        </div>
      ) : (
        <JobPreview job={draft} />
      )}
    </div>
  );
}

function ChannelRecommendationList({
  recommendations,
  updatedAt,
  failure,
  selectable = false,
  selectedChannels = [],
  onToggleChannel
}) {
  const selectedSet = useMemo(
    () => new Set(selectedChannels ?? []),
    [selectedChannels]
  );
  if (!recommendations?.length) {
    return failure ? (
      <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
        {failure.message ?? failure.reason ?? "No channel recommendations yet."}
      </p>
    ) : (
      <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-500">
        No channel recommendations yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {updatedAt ? (
        <p className="text-xs text-neutral-500">
          Updated {updatedAt.toLocaleString()}
        </p>
      ) : null}
      <ul className="space-y-3">
        {recommendations.map((item, index) => (
          <li
            key={`${item.channel}-${index}`}
            className="rounded-2xl border border-primary-200 bg-white px-4 py-3 text-sm shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold capitalize text-primary-700">
                {item.channel.replace(/_/g, " ")}
              </span>
              {typeof item.expectedCPA === "number" ? (
                <span className="text-xs font-semibold text-neutral-500">
                  Est. CPA ${item.expectedCPA.toFixed(0)}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-neutral-600">{item.reason}</p>
            {selectable ? (
              <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-primary-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-500"
                  checked={selectedSet.has(item.channel)}
                  onChange={() => onToggleChannel?.(item.channel)}
                />
                Include this channel
              </label>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

const assetStatusStyles = {
  READY: "bg-emerald-100 text-emerald-700",
  GENERATING: "bg-amber-100 text-amber-700",
  PENDING: "bg-amber-50 text-amber-700",
  FAILED: "bg-red-100 text-red-700"
};

function AssetStatusList({ assets = [] }) {
  if (!assets || assets.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-sm text-neutral-500">
        No assets yet. Select channels and generate creative assets to populate this list.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {assets.map((asset) => {
        const statusClass =
          assetStatusStyles[asset.status] ?? "bg-neutral-100 text-neutral-600";
        const summary =
          asset.content?.summary ??
          asset.content?.body ??
          asset.llmRationale ??
          "Awaiting content…";
        return (
          <li
            key={asset.id}
            className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-neutral-900">
                  {asset.formatId.replace(/_/g, " ")}
                </p>
                <p className="text-xs text-neutral-500">{asset.channelId}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${statusClass}`}
              >
                {asset.status.toLowerCase()}
              </span>
            </div>
            <p className="mt-3 text-sm text-neutral-600">{summary}</p>
            <p className="mt-2 text-xs text-neutral-400">
              Updated{" "}
              {asset.updatedAt
                ? new Date(asset.updatedAt).toLocaleString()
                : "—"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function LoadingState({ label }) {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="flex flex-col items-center gap-3 text-neutral-600">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-200 border-t-primary-500" />
        <p className="text-sm font-medium">{label}</p>
      </div>
    </div>
  );
}

export default function RefineJobPage() {
  const params = useParams();
  const { user } = useUser();
  const jobId = Array.isArray(params?.jobId) ? params.jobId[0] : params?.jobId;

  const [isRefining, setIsRefining] = useState(true);
  const [refineError, setRefineError] = useState(null);
  const [summary, setSummary] = useState("");
  const [originalDraft, setOriginalDraft] = useState(DEFAULT_JOB_STATE);
  const [refinedDraft, setRefinedDraft] = useState(DEFAULT_JOB_STATE);
  const [initialOriginal, setInitialOriginal] = useState(DEFAULT_JOB_STATE);
  const [initialRefined, setInitialRefined] = useState(DEFAULT_JOB_STATE);
  const [viewMode, setViewMode] = useState("refined");
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [channelRecommendations, setChannelRecommendations] = useState([]);
  const [channelUpdatedAt, setChannelUpdatedAt] = useState(null);
  const [channelFailure, setChannelFailure] = useState(null);
  const [isRegeneratingChannels, setIsRegeneratingChannels] = useState(false);
  const [jobAssets, setJobAssets] = useState([]);
  const [assetRun, setAssetRun] = useState(null);
  const [assetError, setAssetError] = useState(null);
  const [isGeneratingAssets, setIsGeneratingAssets] = useState(false);
  const [isRefreshingAssets, setIsRefreshingAssets] = useState(false);
  const [shouldPollAssets, setShouldPollAssets] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [finalJobSource, setFinalJobSource] = useState(null);

  const syncSelectedChannels = useCallback((list) => {
    const available = Array.isArray(list)
      ? list.map((item) => item.channel).filter(Boolean)
      : [];
    if (available.length === 0) {
      setSelectedChannels([]);
      return;
    }
    setSelectedChannels((prev) => {
      if (!prev || prev.length === 0) {
        return available;
      }
      const prevSet = new Set(prev);
      const intersection = available.filter((channel) =>
        prevSet.has(channel)
      );
      return intersection.length > 0 ? intersection : available;
    });
  }, []);

  const loadAssets = useCallback(async () => {
    if (!user?.authToken || !jobId) return;
    try {
      const response = await fetchJobAssets({
        authToken: user.authToken,
        jobId
      });
      setJobAssets(response.assets ?? []);
      setAssetRun(response.run ?? null);
      setAssetError(null);
      const hasPending = (response.assets ?? []).some((asset) =>
        ["PENDING", "GENERATING"].includes(asset.status)
      );
      setShouldPollAssets(hasPending);
    } catch (error) {
      setAssetError(error.message ?? "Failed to load assets.");
    }
  }, [user?.authToken, jobId]);

  useEffect(() => {
    if (!user?.authToken || !jobId) return;

    let cancelled = false;
    const runRefinement = async () => {
      setIsRefining(true);
      setRefineError(null);
      try {
        const response = await refineJob({
          authToken: user.authToken,
          jobId,
        });
        if (cancelled) return;
        const original = normaliseJobDraft(response.originalJob);
        const refined = normaliseJobDraft(response.refinedJob);
        setInitialOriginal(original);
        setInitialRefined(refined);
        setOriginalDraft(original);
        setRefinedDraft(refined);
        setSummary(response.summary ?? "");
        setViewMode("refined");
        if (response.failure) {
          setRefineError(
            response.failure.message ?? response.failure.reason ?? null
          );
        }
      } catch (error) {
        if (cancelled) return;
        setRefineError(error.message ?? "Failed to refine the job.");
      } finally {
        if (!cancelled) {
          setIsRefining(false);
        }
      }
    };

    runRefinement();
    return () => {
      cancelled = true;
    };
  }, [jobId, user?.authToken]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    if (!shouldPollAssets) return undefined;
    const interval = setInterval(() => {
      loadAssets();
    }, 5000);
    return () => clearInterval(interval);
  }, [shouldPollAssets, loadAssets]);

  const toggleViewMode = () => {
    setViewMode((prev) => (prev === "refined" ? "original" : "refined"));
  };

  const handleToggleChannel = useCallback((channelId) => {
    setSelectedChannels((prev) => {
      if (prev.includes(channelId)) {
        return prev.filter((id) => id !== channelId);
      }
      return [...prev, channelId];
    });
  }, []);

  const handleFinalize = async () => {
    if (!user?.authToken || !jobId) return;
    setIsFinalizing(true);
    setChannelFailure(null);
    try {
      const activeDraft =
        viewMode === "original" ? originalDraft : refinedDraft;
      const baselineDraft =
        viewMode === "original" ? initialOriginal : initialRefined;
      const finalJob = normaliseJobDraft(activeDraft);
      const baseline = normaliseJobDraft(baselineDraft);
      const isEdited =
        JSON.stringify(baseline) !== JSON.stringify(finalJob);
      const submissionSource = isEdited ? "edited" : viewMode;

      const response = await finalizeJob({
        authToken: user.authToken,
        jobId,
        finalJob,
        source: submissionSource,
      });

      setChannelRecommendations(response.channelRecommendations ?? []);
      setChannelUpdatedAt(response.channelUpdatedAt ?? null);
      setChannelFailure(response.channelFailure ?? null);
      setFinalJobSource(submissionSource);
      syncSelectedChannels(response.channelRecommendations ?? []);
    } catch (error) {
      setChannelFailure({ reason: "finalize_failed", message: error.message });
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleRegenerateChannels = async () => {
    if (!user?.authToken || !jobId) return;
    setIsRegeneratingChannels(true);
    try {
      const response = await fetchChannelRecommendations({
        authToken: user.authToken,
        jobId,
        forceRefresh: true,
      });
      setChannelRecommendations(response.recommendations ?? []);
      setChannelUpdatedAt(response.updatedAt ?? null);
      setChannelFailure(response.failure ?? null);
      syncSelectedChannels(response.recommendations ?? []);
    } catch (error) {
      setChannelFailure({ reason: "refresh_failed", message: error.message });
    } finally {
      setIsRegeneratingChannels(false);
    }
  };

  const handleGenerateAssets = async () => {
    if (!user?.authToken || !jobId || selectedChannels.length === 0 || !finalJobSource) {
      return;
    }
    setIsGeneratingAssets(true);
    setAssetError(null);
    try {
      const response = await generateJobAssets({
        authToken: user.authToken,
        jobId,
        channelIds: selectedChannels,
        source: finalJobSource
      });
      setJobAssets(response.assets ?? []);
      setAssetRun(response.run ?? null);
      const hasPending = (response.assets ?? []).some((asset) =>
        ["PENDING", "GENERATING"].includes(asset.status)
      );
      setShouldPollAssets(hasPending);
    } catch (error) {
      setAssetError(error.message ?? "Failed to generate assets.");
    } finally {
      setIsGeneratingAssets(false);
    }
  };

  const handleRefreshAssets = async () => {
    if (!user?.authToken || !jobId) return;
    setIsRefreshingAssets(true);
    try {
      await loadAssets();
    } finally {
      setIsRefreshingAssets(false);
    }
  };

  if (!user?.authToken) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-10 text-center text-neutral-600 shadow-sm shadow-neutral-100">
        Please sign in to manage job publishing.
      </div>
    );
  }

  if (!jobId) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-10 text-center text-red-600 shadow-sm shadow-red-100">
        Missing job identifier. Navigate back to the wizard and try again.
      </div>
    );
  }

  if (isRefining) {
    return <LoadingState label="Polishing your job details…" />;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold text-neutral-900">
          Refine and publish your job
        </h1>
        <p className="text-sm text-neutral-600">
          Review the LLM-enhanced draft, make final edits, and generate channel
          recommendations tailored to your role.
        </p>
        {summary ? (
          <div className="rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700">
            <p className="font-semibold uppercase tracking-wide text-xs text-primary-500">
              Summary of improvements
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{summary}</p>
          </div>
        ) : null}
        {refineError ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {refineError}
          </p>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border border-neutral-200 bg-neutral-50 p-1 text-xs font-semibold uppercase tracking-wide">
          <button
            type="button"
            onClick={() => setViewMode("refined")}
            className={clsx(
              "rounded-full px-4 py-2 transition",
              viewMode === "refined"
                ? "bg-primary-600 text-white shadow"
                : "text-neutral-600 hover:text-primary-600"
            )}
          >
            Refined version
          </button>
          <button
            type="button"
            onClick={() => setViewMode("original")}
            className={clsx(
              "rounded-full px-4 py-2 transition",
              viewMode === "original"
                ? "bg-primary-600 text-white shadow"
                : "text-neutral-600 hover:text-primary-600"
            )}
          >
            Original version
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid w-full max-w-4xl gap-5">
          <JobEditorCard
            title={viewMode === "refined" ? "Refined job" : "Original job"}
            job={viewMode === "refined" ? refinedDraft : originalDraft}
            onChange={viewMode === "refined" ? setRefinedDraft : setOriginalDraft}
            showFieldRevert={viewMode === "refined"}
            originalValues={initialOriginal}
            refinedValues={initialRefined}
          />
        </div>

        <div className="space-y-5">
          <section className="space-y-3 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm shadow-neutral-100">
            <h2 className="text-lg font-semibold text-neutral-900">
              Choose your final draft
            </h2>
            <p className="text-sm text-neutral-600">
              Select which version you want to move forward with. You can still edit
              the chosen draft before submitting.
            </p>
            <p className="text-sm text-neutral-500">
              We’ll submit whichever version is currently visible. Use the toggle
              above to switch between drafts, and the per-field controls to bring
              back original values where needed.
            </p>
            <button
              type="button"
              onClick={handleFinalize}
              disabled={isFinalizing}
              className="w-full rounded-full bg-primary-600 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
            >
              {isFinalizing ? "Generating channels…" : "Confirm & generate channels"}
            </button>
          </section>

          <section className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm shadow-neutral-100">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">
                  Channel recommendations
                </h2>
                <p className="text-sm text-neutral-600">
                  We suggest these channels based on the final job profile. Regenerate
                  anytime after further edits.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRegenerateChannels}
                disabled={isRegeneratingChannels}
                className="rounded-full border border-primary-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRegeneratingChannels ? "Refreshing…" : "Regenerate"}
              </button>
            </div>
            <ChannelRecommendationList
              recommendations={channelRecommendations}
              updatedAt={channelUpdatedAt}
              failure={channelFailure}
              selectable
              selectedChannels={selectedChannels}
              onToggleChannel={handleToggleChannel}
            />
            <p className="text-xs text-neutral-500">
              Selected channels: {selectedChannels.length}.{" "}
              {finalJobSource
                ? "You can adjust the list before generating assets."
                : "Confirm your final draft before generating assets."}
            </p>
            <button
              type="button"
              onClick={handleGenerateAssets}
              disabled={
                isGeneratingAssets ||
                selectedChannels.length === 0 ||
                !finalJobSource
              }
              className="w-full rounded-full bg-primary-600 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
            >
              {isGeneratingAssets ? "Generating assets…" : "Generate creative assets"}
            </button>
            {assetError ? (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {assetError}
              </p>
            ) : null}
          </section>

          <section className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm shadow-neutral-100">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">
                  Publishing assets
                </h2>
                <p className="text-sm text-neutral-600">
                  Monitor generation status and copy snippets for each channel.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRefreshAssets}
                disabled={isRefreshingAssets}
                className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRefreshingAssets ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            {assetRun ? (
              <div className="rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
                <p className="font-semibold text-neutral-800">
                  Latest run: {assetRun.status}
                </p>
                <p>
                  {assetRun.stats?.assetsCompleted ?? 0} /{" "}
                  {assetRun.stats?.assetsPlanned ?? 0} assets ready
                </p>
                {assetRun.error?.message ? (
                  <p className="text-red-600">{assetRun.error.message}</p>
                ) : null}
              </div>
            ) : null}
            <AssetStatusList assets={jobAssets} />
          </section>
        </div>
      </div>
    </div>
  );
}
