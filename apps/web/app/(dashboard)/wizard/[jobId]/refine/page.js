"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useUser } from "../../../../../components/user-context";
import {
  finalizeJob,
  fetchChannelRecommendations,
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
}) {
  const [isEditing, setIsEditing] = useState(false);
  const draft = useMemo(() => normaliseJobDraft(job), [job]);

  const handleFieldChange = (fieldId, transform) => (event) => {
    const rawValue = event?.target ? event.target.value : event;
    const nextJob = { ...draft };
    if (ARRAY_FIELD_IDS.has(fieldId)) {
      nextJob[fieldId] = transform ? transform(rawValue) : textareaValueToList(rawValue);
    } else {
      nextJob[fieldId] = rawValue;
    }
    onChange(nextJob);
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

            if (field.type === "capsule" && Array.isArray(field.options)) {
              return (
                <label key={field.id} className="flex flex-col gap-1 text-sm text-neutral-700">
                  <span className="font-medium text-neutral-800">{field.label}</span>
                  <select
                    className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                    value={fieldValue}
                    onChange={handleFieldChange(field.id)}
                  >
                    <option value="">Select</option>
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
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
                    onChange={handleFieldChange(field.id, textareaValueToList)}
                  />
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
                    onChange={handleFieldChange(field.id)}
                  />
                </label>
              );
            }

            return (
              <label key={field.id} className="flex flex-col gap-1 text-sm text-neutral-700">
                <span className="font-medium text-neutral-800">{field.label}</span>
                <input
                  className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  value={fieldValue}
                  onChange={handleFieldChange(field.id)}
                />
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
}) {
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
          </li>
        ))}
      </ul>
    </div>
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
  const [isRegeneratingRefine, setIsRegeneratingRefine] = useState(false);
  const [refineError, setRefineError] = useState(null);
  const [summary, setSummary] = useState("");
  const [originalDraft, setOriginalDraft] = useState(DEFAULT_JOB_STATE);
  const [refinedDraft, setRefinedDraft] = useState(DEFAULT_JOB_STATE);
  const [initialOriginal, setInitialOriginal] = useState(DEFAULT_JOB_STATE);
  const [initialRefined, setInitialRefined] = useState(DEFAULT_JOB_STATE);
  const [selectedVersion, setSelectedVersion] = useState("refined");
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [channelRecommendations, setChannelRecommendations] = useState([]);
  const [channelUpdatedAt, setChannelUpdatedAt] = useState(null);
  const [channelFailure, setChannelFailure] = useState(null);
  const [isRegeneratingChannels, setIsRegeneratingChannels] = useState(false);

  useEffect(() => {
    if (!user || !jobId) return;

    let cancelled = false;
    const runRefinement = async () => {
      setIsRefining(true);
      setRefineError(null);
      try {
        const response = await refineJob({
          userId: user.id,
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
        setSelectedVersion(
          response.refinedJob && Object.values(response.refinedJob).some(Boolean)
            ? "refined"
            : "original"
        );
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
  }, [jobId, user]);

  const handleRegenerateRefinement = async () => {
    if (!user || !jobId) return;
    setIsRegeneratingRefine(true);
    setRefineError(null);
    try {
      const response = await refineJob({
        userId: user.id,
        jobId,
        forceRefresh: true,
      });
      const original = normaliseJobDraft(response.originalJob);
      const refined = normaliseJobDraft(response.refinedJob);
      setInitialOriginal(original);
      setInitialRefined(refined);
      setOriginalDraft(original);
      setRefinedDraft(refined);
      setSummary(response.summary ?? "");
      setSelectedVersion("refined");
      if (response.failure) {
        setRefineError(
          response.failure.message ?? response.failure.reason ?? null
        );
      }
    } catch (error) {
      setRefineError(error.message ?? "Failed to regenerate refinement.");
    } finally {
      setIsRegeneratingRefine(false);
    }
  };

  const handleFinalize = async () => {
    if (!user || !jobId) return;
    setIsFinalizing(true);
    setChannelFailure(null);
    try {
      const finalJob =
        selectedVersion === "original"
          ? normaliseJobDraft(originalDraft)
          : normaliseJobDraft(refinedDraft);
      const baseline =
        selectedVersion === "original"
          ? normaliseJobDraft(initialOriginal)
          : normaliseJobDraft(initialRefined);
      const isEdited =
        JSON.stringify(baseline) !== JSON.stringify(finalJob);

      const response = await finalizeJob({
        userId: user.id,
        jobId,
        finalJob,
        source: isEdited ? "edited" : selectedVersion,
      });

      setChannelRecommendations(response.channelRecommendations ?? []);
      setChannelUpdatedAt(response.channelUpdatedAt ?? null);
      setChannelFailure(response.channelFailure ?? null);
    } catch (error) {
      setChannelFailure({ reason: "finalize_failed", message: error.message });
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleRegenerateChannels = async () => {
    if (!user || !jobId) return;
    setIsRegeneratingChannels(true);
    try {
      const response = await fetchChannelRecommendations({
        userId: user.id,
        jobId,
        forceRefresh: true,
      });
      setChannelRecommendations(response.recommendations ?? []);
      setChannelUpdatedAt(response.updatedAt ?? null);
      setChannelFailure(response.failure ?? null);
    } catch (error) {
      setChannelFailure({ reason: "refresh_failed", message: error.message });
    } finally {
      setIsRegeneratingChannels(false);
    }
  };

  if (!user) {
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
        <button
          type="button"
          onClick={handleRegenerateRefinement}
          disabled={isRegeneratingRefine}
          className="rounded-full border border-primary-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRegeneratingRefine ? "Regenerating…" : "Regenerate refinement"}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <JobEditorCard
          title="Original job"
          job={originalDraft}
          onChange={setOriginalDraft}
        />
        <JobEditorCard
          title="Refined job"
          job={refinedDraft}
          onChange={setRefinedDraft}
        />
      </div>

      <section className="space-y-3 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm shadow-neutral-100">
        <h2 className="text-lg font-semibold text-neutral-900">
          Choose your final draft
        </h2>
        <p className="text-sm text-neutral-600">
          Select which version you want to move forward with. You can still edit
          the chosen draft before submitting.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="radio"
              name="final-version"
              checked={selectedVersion === "refined"}
              onChange={() => setSelectedVersion("refined")}
            />
            Use refined version
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="radio"
              name="final-version"
              checked={selectedVersion === "original"}
              onChange={() => setSelectedVersion("original")}
            />
            Keep my original draft
          </label>
        </div>
        <button
          type="button"
          onClick={handleFinalize}
          disabled={isFinalizing}
          className="rounded-full bg-primary-600 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
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
        />
      </section>
    </div>
  );
}
