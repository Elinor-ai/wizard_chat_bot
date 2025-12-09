"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  AlignLeft,
  ArrowUpRight,
  BadgePercent,
  Bolt,
  CheckCircle2,
  Coins,
  Info,
  ListChecks,
  MapPin,
  PenSquare,
  TrendingUp,
} from "lucide-react";
import { clsx } from "../../../../../lib/cn";
import { useUser } from "../../../../../components/user-context";
import {
  finalizeJob,
  fetchChannelRecommendations,
  fetchExistingChannelRecommendations,
  fetchCopilotConversation,
  fetchJobAssets,
  fetchJobDraft,
  generateJobAssets,
  refineJob,
  sendCopilotAgentMessage,
  fetchHeroImage,
  requestHeroImage,
} from "../../../../../components/wizard/wizard-services";
import { VideoLibraryApi } from "../../../../../lib/api-client";
import {
  OPTIONAL_STEPS,
  REQUIRED_STEPS,
} from "../../../../../components/wizard/wizard-schema";
import { WizardSuggestionPanel } from "../../../../../components/wizard/wizard-suggestion-panel";
import {
  deepClone,
  setDeep,
} from "../../../../../components/wizard/wizard-utils";

const FIELD_DEFINITIONS = [...REQUIRED_STEPS, ...OPTIONAL_STEPS].flatMap(
  (step) => step.fields
);

const ARRAY_FIELD_IDS = new Set(["coreDuties", "mustHaves", "benefits"]);

const FLOW_STEPS = [
  {
    id: "refine",
    label: "Refine job",
    description: "Polish the draft and confirm the final version.",
  },
  {
    id: "channels",
    label: "Pick channels",
    description:
      "Let the copilot recommend channels and choose where to promote.",
  },
  {
    id: "assets",
    label: "Generate assets",
    description: "Produce campaign-ready copy and creative briefs.",
  },
];

const DEFAULT_FLOW_STEP = FLOW_STEPS[0].id;
const FLOW_STEP_IDS = new Set(FLOW_STEPS.map((step) => step.id));

function normalizeFlowStepId(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return DEFAULT_FLOW_STEP;
  }
  const candidate = value.trim().toLowerCase();
  return FLOW_STEP_IDS.has(candidate) ? candidate : DEFAULT_FLOW_STEP;
}

const STEP_INDEX = FLOW_STEPS.reduce((acc, step, index) => {
  acc[step.id] = index;
  return acc;
}, {});

const DEFAULT_JOB_STATE = {
  roleTitle: "",
  companyName: "",
  logoUrl: "",
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

const DEFAULT_REFINE_INSIGHTS = {
  improvementScore: 90,
  originalScore: 60,
  interestLift: "+18%",
  impactSummary: "Optimized for clarity and engagement.",
  keyImprovements: [
    "Sharpened search-friendly title",
    "Value prop reframed for motivation",
    "Responsibilities organized for scannability",
  ],
};

function calculateInterestLift(
  improvementScore,
  originalScore,
  fallback = DEFAULT_REFINE_INSIGHTS.interestLift
) {
  const base = Number(originalScore);
  const improved = Number(improvementScore);
  if (!Number.isFinite(base) || !Number.isFinite(improved) || base <= 0) {
    return fallback;
  }
  const delta = improved - base;
  if (delta <= 0) {
    return "+0%";
  }
  const lift = Math.round((delta / base) * 100);
  if (!Number.isFinite(lift) || lift <= 0) {
    return "+0%";
  }
  return `+${lift}%`;
}

const DIFF_FIELD_CONFIG = [
  {
    id: "roleTitle",
    label: "Role title",
    icon: PenSquare,
    badge: "SEO optimized",
  },
  {
    id: "compensation",
    label: "Compensation & benefits",
    icon: Coins,
    badge: "Value prop",
    getValue: (job) => buildCompensationValue(job),
    getCompareValue: (job) =>
      JSON.stringify({
        salary: job?.salary ?? "",
        salaryPeriod: job?.salaryPeriod ?? "",
        currency: job?.currency ?? "",
        benefits: Array.isArray(job?.benefits)
          ? job.benefits.filter(Boolean)
          : [],
      }),
  },
  {
    id: "jobDescription",
    label: "The hook (job summary)",
    icon: AlignLeft,
    badge: "Messaging refresh",
  },
  {
    id: "coreDuties",
    label: "Responsibilities",
    icon: ListChecks,
    badge: "Structured",
    asList: true,
  },
  {
    id: "location",
    label: "Location",
    icon: MapPin,
  },
];

function normalizeLogoUrl(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function normaliseJobDraft(input) {
  const base = { ...DEFAULT_JOB_STATE };
  if (!input || typeof input !== "object") {
    return base;
  }
  Object.keys(base).forEach((key) => {
    const value = input[key];
    if (key === "logoUrl") {
      base[key] = normalizeLogoUrl(value);
      return;
    }
    if (ARRAY_FIELD_IDS.has(key)) {
      if (Array.isArray(value)) {
        base[key] = value
          .map((item) =>
            typeof item === "string" ? item.trim() : String(item)
          )
          .filter((item) => item.length > 0);
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

function clampScoreUi(value, fallback = 0) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function deriveInsights(metadata, fallbackSummary) {
  if (!metadata) {
    return {
      ...DEFAULT_REFINE_INSIGHTS,
      impactSummary: fallbackSummary || DEFAULT_REFINE_INSIGHTS.impactSummary,
    };
  }
  const source =
    (metadata.analysis && typeof metadata.analysis === "object"
      ? metadata.analysis
      : metadata) ?? {};
  const keyImprovements = Array.isArray(
    source.keyImprovements ?? metadata.keyImprovements
  )
    ? (source.keyImprovements ?? metadata.keyImprovements).filter(
        (item) => typeof item === "string" && item.trim().length > 0
      )
    : DEFAULT_REFINE_INSIGHTS.keyImprovements;
  const improvementScore =
    source.improvementScore ??
    metadata.improvementScore ??
    DEFAULT_REFINE_INSIGHTS.improvementScore;
  const originalScore =
    source.originalScore ??
    metadata.originalScore ??
    DEFAULT_REFINE_INSIGHTS.originalScore;
  return {
    improvementScore,
    originalScore,
    interestLift: calculateInterestLift(improvementScore, originalScore),
    impactSummary:
      source.impactSummary ??
      metadata.impactSummary ??
      fallbackSummary ??
      DEFAULT_REFINE_INSIGHTS.impactSummary,
    keyImprovements: keyImprovements.length
      ? keyImprovements
      : DEFAULT_REFINE_INSIGHTS.keyImprovements,
  };
}

function formatListValue(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return "";
  }
  return list
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .join("\n");
}

function buildCompensationValue(job) {
  if (!job) return "";
  const parts = [job?.salary, job?.salaryPeriod, job?.currency]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  const salaryLine = parts.join(" • ");
  const benefits = formatListValue(job?.benefits);
  return [salaryLine, benefits].filter(Boolean).join("\n");
}

function normalizeDiffValue(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(
      value.map((item) => (typeof item === "string" ? item.trim() : item))
    );
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function calculateCompleteness(job) {
  if (!job) return 0;
  const fieldsToCheck = [
    "roleTitle",
    "location",
    "jobDescription",
    "salary",
    "coreDuties",
    "mustHaves",
    "benefits",
  ];
  const total = fieldsToCheck.length;
  if (total === 0) return 0;
  const filled = fieldsToCheck.reduce((count, fieldId) => {
    const value = job[fieldId];
    if (Array.isArray(value)) {
      return value.length > 0 ? count + 1 : count;
    }
    if (typeof value === "string") {
      return value.trim().length > 0 ? count + 1 : count;
    }
    return value ? count + 1 : count;
  }, 0);
  return Math.round((filled / total) * 100);
}

function jobHasContent(job) {
  if (!job || typeof job !== "object") return false;
  return Object.values(job).some((value) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    return value !== undefined && value !== null && value !== "";
  });
}

function buildDiffEntries(originalJob, refinedJob) {
  return DIFF_FIELD_CONFIG.map((field) => {
    const originalValue = field.getValue
      ? field.getValue(originalJob)
      : field.asList
        ? formatListValue(originalJob?.[field.id])
        : (originalJob?.[field.id] ?? "");
    const refinedValue = field.getValue
      ? field.getValue(refinedJob)
      : field.asList
        ? formatListValue(refinedJob?.[field.id])
        : (refinedJob?.[field.id] ?? "");
    const originalCompare = field.getCompareValue
      ? field.getCompareValue(originalJob)
      : normalizeDiffValue(originalValue);
    const refinedCompare = field.getCompareValue
      ? field.getCompareValue(refinedJob)
      : normalizeDiffValue(refinedValue);
    return {
      ...field,
      original: originalValue,
      refined: refinedValue,
      changed: originalCompare !== refinedCompare,
    };
  });
}

function getMessageTimestamp(message) {
  if (!message) {
    return null;
  }
  const { createdAt } = message;
  if (createdAt instanceof Date) {
    return createdAt.getTime();
  }
  if (typeof createdAt === "number") {
    return createdAt;
  }
  if (typeof createdAt === "string") {
    const parsed = Date.parse(createdAt);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function deriveConversationVersion(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 0;
  }
  let latest = 0;
  for (const message of messages) {
    const timestamp = getMessageTimestamp(message);
    if (Number.isFinite(timestamp)) {
      latest = Math.max(latest, timestamp);
    }
  }
  return latest || Date.now();
}

function applyClientMessageIds(messages = []) {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages.map((message) => {
    const clientId = message?.metadata?.clientMessageId;
    if (
      message?.role === "user" &&
      typeof clientId === "string" &&
      clientId.length > 0
    ) {
      return {
        ...message,
        id: clientId,
      };
    }
    return message;
  });
}

function mergeSnapshot(prev, snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return prev;
  }
  const next = deepClone(prev);
  Object.entries(snapshot).forEach(([fieldId, value]) => {
    setDeep(next, fieldId, value);
  });
  return next;
}

function JobPreview({ job }) {
  const summary = useMemo(() => normaliseJobDraft(job), [job]);
  const { roleTitle, companyName, location, logoUrl } = summary;
  const tags = [
    summary.seniorityLevel,
    summary.employmentType,
    summary.workModel,
  ].filter((tag) => tag && tag.length > 0);

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

  const initials =
    (companyName || roleTitle || "J")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("") || "J";

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 shadow-sm shadow-neutral-200">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`${companyName ?? "Company"} logo`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-neutral-500">
                {initials}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-semibold text-neutral-900">
              {roleTitle || "Untitled role"}
            </h3>
            <p className="text-sm text-neutral-600">
              {[companyName, location].filter(Boolean).join(" • ")}
            </p>
          </div>
        </div>
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
      nextValue = transform
        ? transform(rawValue)
        : textareaValueToList(rawValue);
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
    const sourceDraft = target === "original" ? baseline : refinedBaseline;
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
            const normalizedOriginal = normalizeForCompare(
              originalValue,
              field
            );
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

            const revertButton = shouldShowBaselineToggle ? (
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
                <label
                  key={field.id}
                  className="flex flex-col gap-1 text-sm text-neutral-700"
                >
                  <span className="font-medium text-neutral-800">
                    {field.label}
                  </span>
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
                <label
                  key={field.id}
                  className="flex flex-col gap-1 text-sm text-neutral-700"
                >
                  <span className="font-medium text-neutral-800">
                    {field.label}
                  </span>
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
                <label
                  key={field.id}
                  className="flex flex-col gap-1 text-sm text-neutral-700"
                >
                  <span className="font-medium text-neutral-800">
                    {field.label}
                  </span>
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
              <label
                key={field.id}
                className="flex flex-col gap-1 text-sm text-neutral-700"
              >
                <span className="font-medium text-neutral-800">
                  {field.label}
                </span>
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

function OptimizationScoreCard({ insights }) {
  const optimizedScore = clampScoreUi(insights?.improvementScore ?? 0);
  const draftScore = clampScoreUi(insights?.originalScore ?? 0);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Optimization score
          </p>
          <div className="mt-3 flex items-baseline gap-2 text-slate-900">
            <span className="text-5xl font-semibold">{optimizedScore}</span>
            <span className="text-sm text-slate-400">/ 100</span>
          </div>
          <p className="text-xs text-slate-400">
            Draft quality {draftScore}/100
          </p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <TrendingUp className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-6 space-y-4">
        <ScoreTrack label="Draft quality" value={draftScore} tone="muted" />
        <ScoreTrack
          label="AI optimized"
          value={optimizedScore}
          tone="primary"
          helper={insights?.interestLift}
        />
      </div>
      <div className="mt-6 flex gap-3 rounded-2xl bg-gradient-to-r from-indigo-50 to-indigo-100/70 px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-indigo-600">
          <Bolt className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Projected impact
          </p>
          <p className="text-xs text-slate-500">
            {insights?.impactSummary ??
              "The refined listing is projected to attract more qualified candidates due to high-intent keyword matching."}
          </p>
        </div>
      </div>
    </div>
  );
}

function ScoreTrack({ label, value, tone, helper }) {
  const fillColor =
    tone === "primary"
      ? "bg-gradient-to-r from-indigo-500 to-indigo-600"
      : "bg-slate-300";
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-slate-400">
        <span>{label}</span>
        <span className="text-slate-900">{value}%</span>
      </div>
      {helper ? (
        <p className="text-xs font-semibold text-emerald-600">{helper}</p>
      ) : null}
      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${fillColor}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function InsightStats({ interestLift, completeness }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <MetricStatCard
        label="Est. clicks"
        value={interestLift || "+15%"}
        caption="versus original"
        Icon={ArrowUpRight}
        accent="text-emerald-600 bg-emerald-50"
      />
      <MetricStatCard
        label="Completeness"
        value={`${clampScoreUi(completeness, 95)}%`}
        caption="all essentials covered"
        Icon={BadgePercent}
        accent="text-indigo-600 bg-indigo-50"
      />
    </div>
  );
}

function MetricStatCard({ label, value, caption, Icon, accent }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div
        className={`inline-flex items-center justify-center rounded-full p-2 ${accent}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-slate-400">
        {label}
      </p>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{caption}</p>
    </div>
  );
}

function EnhancementsPanel({ items }) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        Key enhancements
      </p>
      <ul className="mt-4 space-y-3 text-sm text-slate-700">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// function ProTipCard({ copy }) {
//   return (
//     <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-5 text-sm text-blue-900">
//       <div className="flex items-start gap-3">
//         <div className="mt-0.5">
//           <Info className="h-4 w-4" />
//         </div>
//         <div>
//           <p className="font-semibold">Pro tip</p>
//           <p className="text-sm text-blue-900/80">{copy}</p>
//         </div>
//       </div>
//     </div>
//   );
// }

function DiffFieldCard({ diff }) {
  const Icon = diff.icon ?? PenSquare;
  const hasOriginal =
    typeof diff.original === "string" && diff.original.trim().length > 0;
  const hasRefined =
    typeof diff.refined === "string" && diff.refined.trim().length > 0;
  const isAddition = !hasOriginal && hasRefined;
  const isMissingBoth = !hasOriginal && !hasRefined;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
            {diff.label}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {diff.badge ? (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              {diff.badge}
            </span>
          ) : null}
          {isAddition ? (
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
              Added by Wizard
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-5 grid gap-6 border-t border-slate-100 pt-5 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
            Original input
          </p>
          {hasOriginal ? (
            <p
              className={clsx(
                "whitespace-pre-wrap text-sm",
                diff.changed ? "text-slate-400 line-through" : "text-slate-500"
              )}
            >
              {diff.original}
            </p>
          ) : (
            <p className="text-sm italic text-slate-300">
              {isAddition
                ? "No content provided. Wizard filled this in for you."
                : "No content provided"}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-500">
            Professional suggestion
          </p>
          <p
            className={clsx(
              "whitespace-pre-wrap text-sm",
              hasRefined ? "font-semibold text-slate-900" : "text-slate-400"
            )}
          >
            {hasRefined ? diff.refined : isMissingBoth ? "—" : diff.original}
          </p>
        </div>
      </div>
      {diff.explanation && (diff.changed || isAddition) ? (
        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-900">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-600">
            Why we updated this
          </p>
          <p className="mt-1 text-sm text-emerald-900/90">{diff.explanation}</p>
        </div>
      ) : null}
    </div>
  );
}

function ChannelRecommendationList({
  recommendations,
  updatedAt,
  failure,
  selectable = false,
  selectedChannels = [],
  onToggleChannel,
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

function HeroImageOptIn({ checked, onToggle }) {
  return (
    <div className="rounded-2xl border border-primary-100 bg-white px-4 py-3 shadow-sm">
      <label className="flex items-start gap-3 text-sm text-neutral-700">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-500"
          checked={checked}
          onChange={(event) => {
            const next = event.target.checked;
            // eslint-disable-next-line no-console
            console.log("[HeroImage] Checkbox toggled", { checked: next });
            onToggle?.(next);
          }}
        />
        <span>
          <span className="block text-sm font-semibold text-neutral-900">
            Generate AI image?
          </span>
          <span className="text-sm text-neutral-500">
            We'll auto-create a single visual to reuse across channels once you
            continue to assets.
          </span>
        </span>
      </label>
    </div>
  );
}

function VideoOptIn({ checked, onToggle }) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-sm">
      <label className="flex items-start gap-3 text-sm text-neutral-700">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
          checked={checked}
          onChange={(event) => {
            const next = event.target.checked;
            // eslint-disable-next-line no-console
            console.log("[Video] Checkbox toggled", { checked: next });
            onToggle?.(next);
          }}
        />
        <span>
          <span className="block text-sm font-semibold text-neutral-900">
            Generate videos?
          </span>
          <span className="text-sm text-neutral-500">
            We'll create short-form videos for all selected channels with captions and compliance.
          </span>
        </span>
      </label>
    </div>
  );
}

function mapHeroImageStatus(status, inFlight) {
  if (status === "READY") {
    return "READY";
  }
  if (status === "FAILED") {
    return "FAILED";
  }
  if (status === "PROMPTING" || status === "GENERATING" || inFlight) {
    return "GENERATING";
  }
  return "PENDING";
}

const assetStatusStyles = {
  READY: "bg-emerald-100 text-emerald-700",
  GENERATING: "bg-amber-100 text-amber-700",
  PENDING: "bg-amber-50 text-amber-700",
  FAILED: "bg-red-100 text-red-700",
};

const ASSET_VARIANT_MAP = {
  LINKEDIN_JOB_POSTING: "linkedin_job",
  LINKEDIN_FEED_POST: "linkedin_feed",
  GENERIC_JOB_POSTING: "linkedin_job",
  SOCIAL_IMAGE_POST: "social_image",
  SOCIAL_IMAGE_CAPTION: "image_caption",
  SOCIAL_STORY_SCRIPT: "story",
  SHORT_VIDEO_MASTER: "story",
  SHORT_VIDEO_TIKTOK: "story",
  SHORT_VIDEO_INSTAGRAM: "story",
  SHORT_VIDEO_YOUTUBE: "story",
  VIDEO_TIKTOK: "video",
  VIDEO_INSTAGRAM: "video",
  VIDEO_YOUTUBE: "video",
  VIDEO_LINKEDIN: "video",
  AI_HERO_IMAGE: "hero_image",
  AI_VIDEO: "video",
};

function AssetPreviewGrid({ assets = [], logoUrl }) {
  if (!assets || assets.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-sm text-neutral-500">
        No assets yet. Generate creatives to see them here.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {assets.map((asset) => (
        <AssetPreviewCard key={asset.id} asset={asset} logoUrl={logoUrl} />
      ))}
    </div>
  );
}

function AssetPreviewCard({ asset, logoUrl }) {
  const variant = ASSET_VARIANT_MAP[asset.formatId] ?? "generic";
  const content = asset.content ?? {};
  const badgeClass =
    assetStatusStyles[asset.status] ?? assetStatusStyles.PENDING;
  const formatLabel =
    variant === "hero_image" ? "AI image" :
    variant === "video" ? "AI video" :
    asset.formatId.replace(/_/g, " ");
  const channelLabel =
    variant === "hero_image" ? "Campaign visual" :
    variant === "video" ? "Short-form video" :
    asset.channelId.replace(/_/g, " ");
  const normalizedAssetLogo =
    typeof asset.logoUrl === "string" && asset.logoUrl.length > 0
      ? asset.logoUrl
      : null;
  const normalizedJobLogo =
    typeof logoUrl === "string" && logoUrl.length > 0 ? logoUrl : null;
  const finalLogo = normalizedAssetLogo ?? normalizedJobLogo;

  return (
    <div className="space-y-2 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-neutral-900">
            {formatLabel}
          </p>
          <p className="text-xs text-neutral-500">{channelLabel}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase ${badgeClass}`}
        >
          {asset.status.toLowerCase()}
        </span>
      </div>
      {variant === "linkedin_job" ? (
        <LinkedInJobCard content={content} logoUrl={finalLogo} />
      ) : variant === "linkedin_feed" ? (
        <LinkedInFeedCard content={content} logoUrl={finalLogo} />
      ) : variant === "social_image" ? (
        <SocialImageCard content={content} logoUrl={finalLogo} />
      ) : variant === "story" ? (
        <StoryCard content={content} logoUrl={finalLogo} />
      ) : variant === "video" ? (
        <VideoCard content={content} status={asset.status} />
      ) : variant === "hero_image" ? (
        <HeroImageCard content={content} status={asset.status} />
      ) : variant === "image_caption" ? (
        <ImageCaptionCard content={content} />
      ) : (
        <GenericAssetCard content={content} logoUrl={finalLogo} />
      )}
    </div>
  );
}

function LinkedInJobCard({ content, logoUrl }) {
  const bullets = Array.isArray(content.bullets)
    ? content.bullets.slice(0, 3)
    : [];
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-100">
      <div className="flex items-center gap-3 border-b border-neutral-100 bg-neutral-50 px-4 py-3">
        <div className="h-10 w-10 overflow-hidden rounded bg-primary-100">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Company logo"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-primary-700">
              {(content.companyName ?? content.title ?? "J")
                .charAt(0)
                .toUpperCase()}
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-neutral-900">
            {content.title || "Untitled posting"}
          </p>
          {content.subtitle ? (
            <p className="text-xs text-neutral-500">{content.subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className="space-y-3 px-4 py-4">
        {content.body ? (
          <p className="text-sm text-neutral-700 whitespace-pre-wrap">
            {content.body}
          </p>
        ) : null}
        {bullets.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
            {bullets.map((item, index) => (
              <li key={`job-bullet-${index}`}>{item}</li>
            ))}
          </ul>
        ) : null}
        {content.callToAction ? (
          <div className="rounded-full bg-primary-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-600">
            {content.callToAction}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LinkedInFeedCard({ content, logoUrl }) {
  const hashtags = Array.isArray(content.hashtags) ? content.hashtags : [];
  return (
    <div className="space-y-3 rounded-2xl border border-neutral-100 bg-white px-4 py-4 shadow-inner">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 overflow-hidden rounded-full bg-primary-100">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Company logo"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-primary-700">
              {(content.companyName ?? "J").charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-neutral-900">Your Company</p>
          <p className="text-xs text-neutral-500">Promoted</p>
        </div>
      </div>
      {content.body ? (
        <p className="text-sm text-neutral-800 whitespace-pre-wrap">
          {content.body}
        </p>
      ) : (
        <p className="text-sm text-neutral-500">No copy provided.</p>
      )}
      {hashtags.length ? (
        <p className="text-xs text-neutral-500">
          {hashtags
            .map((tag) => `#${String(tag).replace(/^#/g, "")}`)
            .join(" ")}
        </p>
      ) : null}
    </div>
  );
}

function SocialImageCard({ content, logoUrl }) {
  return (
    <div className="flex justify-center">
      <div className="relative h-64 w-40 rounded-[28px] border-4 border-neutral-900 bg-neutral-900 text-white shadow-lg">
        <div className="absolute inset-0 rounded-[24px] bg-gradient-to-b from-primary-500/70 to-neutral-900/80 px-3 py-4 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <p className="uppercase tracking-wide text-[10px] text-white/80">
              Story preview
            </p>
            {logoUrl ? (
              <span className="h-5 w-5 overflow-hidden rounded-full border border-white/30">
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-full w-full object-cover"
                />
              </span>
            ) : null}
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <p className="font-semibold">{content.title ?? "Hook headline"}</p>
            {content.body ? (
              <p className="text-white/80">{content.body}</p>
            ) : null}
          </div>
          {content.callToAction ? (
            <div className="absolute bottom-4 left-3 right-3 rounded-full bg-white/90 py-2 text-center text-xs font-bold uppercase text-neutral-900">
              {content.callToAction}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StoryCard({ content, logoUrl }) {
  const beats = Array.isArray(content.script)
    ? content.script
    : (content.script_beats ?? []);
  return (
    <div className="rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        <span>Story beats</span>
        {logoUrl ? (
          <span className="h-5 w-5 overflow-hidden rounded-full border border-neutral-200 bg-white">
            <img
              src={logoUrl}
              alt="Logo"
              className="h-full w-full object-cover"
            />
          </span>
        ) : null}
      </div>
      <ol className="mt-2 space-y-2 text-sm text-neutral-700">
        {beats.slice(0, 4).map((beat, index) => (
          <li
            key={`beat-${index}`}
            className="rounded-lg bg-white/70 px-3 py-2 shadow-sm"
          >
            <p className="font-semibold">{beat.beat ?? `Beat ${index + 1}`}</p>
            {beat.dialogue ? (
              <p className="text-neutral-600">{beat.dialogue}</p>
            ) : null}
            {beat.visual ? (
              <p className="text-xs text-neutral-500">Visual: {beat.visual}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function VideoCard({ content, status }) {
  const videoUrl = content?.videoUrl ?? null;
  const posterUrl = content?.posterUrl ?? content?.thumbnailUrl ?? null;
  const caption = content?.caption ?? content?.body ?? "Video being generated...";
  const durationSeconds = content?.durationSeconds ?? 0;

  // Debug logging
  console.log("[VideoCard Debug] ═══════════════════════════════════");
  console.log("  content:", content);
  console.log("  videoUrl:", videoUrl);
  console.log("  durationSeconds:", durationSeconds);
  console.log("  status:", status);
  console.log("═══════════════════════════════════════════════════════");

  const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleVideoError = (e) => {
    console.error("[VideoCard] Video load error:", e.target.error);
    console.error("[VideoCard] Video src:", e.target.currentSrc);
  };

  const handleVideoLoaded = (e) => {
    console.log("[VideoCard] Video loaded successfully!");
    console.log("[VideoCard] Duration from video element:", e.target.duration);
    console.log("[VideoCard] Video dimensions:", e.target.videoWidth, "x", e.target.videoHeight);
  };

  return (
    <div className="rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-4">
      {videoUrl ? (
        <div className="mb-3 overflow-hidden rounded-xl">
          <video
            controls
            poster={posterUrl}
            className="h-auto w-full"
            style={{ maxHeight: "300px" }}
            onError={handleVideoError}
            onLoadedMetadata={handleVideoLoaded}
          >
            <source src={videoUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      ) : posterUrl ? (
        <div className="mb-3 overflow-hidden rounded-xl bg-neutral-200">
          <img
            src={posterUrl}
            alt="Video thumbnail"
            className="h-auto w-full"
            style={{ maxHeight: "300px" }}
          />
        </div>
      ) : (
        <div className="mb-3 flex h-48 items-center justify-center rounded-xl bg-neutral-200">
          <div className="text-center text-sm text-neutral-500">
            <p className="font-semibold">Video generating...</p>
            <p className="text-xs">This may take a few minutes</p>
          </div>
        </div>
      )}
      {caption && (
        <p className="mb-2 whitespace-pre-wrap text-sm text-neutral-700">
          {caption}
        </p>
      )}
      {durationSeconds > 0 && (
        <p className="text-xs text-neutral-500">
          Duration: {formatDuration(durationSeconds)}
        </p>
      )}
    </div>
  );
}

function HeroImageCard({ content, status }) {
  const failureMessage = content?.failureMessage;
  const provider = content?.provider ?? "pending";
  const model = content?.model ?? "pending";
  const imageUrl = content?.imageUrl;
  const caption = content?.caption ?? null;
  const hashtags = Array.isArray(content?.hashtags)
    ? content.hashtags.filter(Boolean).join(" ")
    : (content?.hashtags ?? "");
  const captionText = [caption, hashtags].filter(Boolean).join("\n\n");

  const handleCopyCaption = async () => {
    if (!captionText) return;
    try {
      await navigator.clipboard?.writeText(captionText);
    } catch (error) {
      const textarea = document.createElement("textarea");
      textarea.value = captionText;
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
  const filename = `hero-image-${provider ?? "ai"}.png`;

  const handleDownload = () => {
    if (!imageUrl) {
      return;
    }
    const isDataUrl = imageUrl.startsWith("data:");
    const extensionMatch = isDataUrl
      ? imageUrl.match(/^data:image\/([a-zA-Z0-9+]+);/i)
      : imageUrl.split("?")[0].split(".").pop();
    const extension =
      (Array.isArray(extensionMatch) && extensionMatch[1]) ||
      (typeof extensionMatch === "string" ? extensionMatch : "png");
    const downloadName = filename.endsWith(extension)
      ? filename
      : `${filename.replace(/\.[a-z]+$/i, "")}.${extension}`;

    const link = document.createElement("a");
    let objectUrl = null;

    if (isDataUrl) {
      const base64 = imageUrl.split(",")[1];
      const mimeMatch = imageUrl.match(/^data:([^;]+);base64,/i);
      const mimeType = mimeMatch?.[1] ?? "image/png";
      try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mimeType });
        objectUrl = URL.createObjectURL(blob);
        link.href = objectUrl;
      } catch (error) {
        // Fallback to raw data URL if conversion fails
        link.href = imageUrl;
      }
    } else {
      link.href = imageUrl;
    }

    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  };

  if (status === "READY" && imageUrl) {
    return (
      <div className="space-y-2 rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-2">
          <img
            src={imageUrl}
            alt="AI hero visual"
            className="h-auto w-full rounded-lg object-cover"
          />
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4 text-xs text-neutral-500">
            <p>
              Provider: {provider} • Model: {model}
            </p>
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-full border border-neutral-300 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-600 transition hover:border-primary-400 hover:text-primary-600"
            >
              Download
            </button>
          </div>
          {captionText ? (
            <div className="rounded-xl border border-neutral-200 bg-white/80 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Suggested caption
                </p>
                <button
                  type="button"
                  onClick={handleCopyCaption}
                  className="rounded-full border border-neutral-300 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-600 transition hover:border-primary-400 hover:text-primary-600"
                >
                  Copy
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">
                {caption}
                {hashtags ? `\n\n${hashtags}` : ""}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (status === "FAILED") {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
        {failureMessage ??
          "Image request failed. Try again from the Channels step."}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-primary-200 bg-white px-4 py-4 text-sm text-primary-600">
      Generating image… this usually takes ~20 seconds.
    </div>
  );
}

function ImageCaptionCard({ content }) {
  const caption = content?.body ?? content?.caption ?? "";
  const hashtags = Array.isArray(content?.hashtags)
    ? content.hashtags.filter(Boolean).join(" ")
    : (content?.hashtags ?? "");
  const fullText = [caption.trim(), hashtags.trim()]
    .filter(Boolean)
    .join("\n\n");

  const handleCopy = async () => {
    if (!fullText) {
      return;
    }
    try {
      await navigator.clipboard?.writeText(fullText);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = fullText;
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

  return (
    <div className="space-y-2 rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Suggested caption
        </p>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-full border border-neutral-300 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-600 transition hover:border-primary-400 hover:text-primary-600"
        >
          Copy
        </button>
      </div>
      {fullText ? (
        <p className="whitespace-pre-wrap text-sm text-neutral-800">
          {fullText}
        </p>
      ) : (
        <p className="text-sm text-neutral-400">
          Caption not available yet. Generate assets to populate it.
        </p>
      )}
    </div>
  );
}

function GenericAssetCard({ content, logoUrl }) {
  const bullets = Array.isArray(content.bullets) ? content.bullets : [];
  return (
    <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-4 text-sm text-neutral-700">
      {logoUrl ? (
        <div className="mb-3 h-10 w-10 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <img
            src={logoUrl}
            alt="Logo"
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}
      {content.body ? (
        <p className="whitespace-pre-wrap">{content.body}</p>
      ) : (
        <p>No copy available yet.</p>
      )}
      {bullets.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {bullets.slice(0, 4).map((item, index) => (
            <li key={`generic-bullet-${index}`}>{item}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function StepProgress({
  steps,
  currentStep,
  maxEnabledIndex = 0,
  onStepChange,
}) {
  const currentIndex = STEP_INDEX[currentStep] ?? 0;
  return (
    <ol className="grid grid-cols-1 gap-3 text-sm text-neutral-600 sm:grid-cols-3">
      {steps.map((step, index) => {
        const status =
          index < currentIndex
            ? "done"
            : index === currentIndex
              ? "active"
              : "pending";
        const isEnabled = index <= maxEnabledIndex;
        const handleClick = () => {
          if (!isEnabled || index === currentIndex) {
            return;
          }
          onStepChange?.(step.id);
        };
        return (
          <li key={step.id} className="w-full">
            <button
              type="button"
              onClick={handleClick}
              disabled={!isEnabled || index === currentIndex}
              className={clsx(
                "w-full rounded-2xl border px-4 py-3 text-left transition",
                status === "done"
                  ? "border-primary-200 bg-primary-50"
                  : status === "active"
                    ? "border-primary-600 bg-white shadow-sm"
                    : "border-neutral-200 bg-neutral-50",
                !isEnabled || index === currentIndex
                  ? "cursor-default"
                  : "cursor-pointer hover:shadow-sm hover:border-primary-300",
                !isEnabled && index !== currentIndex ? "opacity-60" : ""
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={clsx(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                    status === "done"
                      ? "bg-primary-600 text-white"
                      : status === "active"
                        ? "bg-primary-100 text-primary-700"
                        : "bg-neutral-200 text-neutral-600"
                  )}
                >
                  {index + 1}
                </span>
                <p
                  className={clsx(
                    "font-semibold",
                    status === "active"
                      ? "text-primary-700"
                      : "text-neutral-700"
                  )}
                >
                  {step.label}
                </p>
              </div>
              <p className="mt-1 text-xs">
                {status === "pending"
                  ? step.description
                  : status === "active"
                    ? "In progress"
                    : "Completed"}
              </p>
            </button>
          </li>
        );
      })}
    </ol>
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

// Global singleton to prevent duplicate refinement calls across all component instances
// This persists across component mounts/unmounts and HMR refreshes
const globalRefinementLock = {
  promises: new Map(), // jobId -> Promise
  lock: function(jobId, promise) {
    this.promises.set(jobId, promise);
    promise.finally(() => {
      if (this.promises.get(jobId) === promise) {
        this.promises.delete(jobId);
      }
    });
  },
  get: function(jobId) {
    return this.promises.get(jobId) ?? null;
  },
  isLocked: function(jobId) {
    return this.promises.has(jobId);
  }
};

export default function RefineJobPage() {
  const params = useParams();
  const { user } = useUser();
  const jobId = Array.isArray(params?.jobId) ? params.jobId[0] : params?.jobId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [isRefining, setIsRefining] = useState(false);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  const [refineError, setRefineError] = useState(null);
  const [summary, setSummary] = useState("");
  const [job, setJob] = useState(null);
  const [refinementInsights, setRefinementInsights] = useState(
    DEFAULT_REFINE_INSIGHTS
  );
  const [jobMetadata, setJobMetadata] = useState(null);
  const [originalDraft, setOriginalDraft] = useState(DEFAULT_JOB_STATE);
  const [refinedDraft, setRefinedDraft] = useState(DEFAULT_JOB_STATE);
  const [userDraftSnapshot, setUserDraftSnapshot] = useState(DEFAULT_JOB_STATE);
  const [initialOriginal, setInitialOriginal] = useState(DEFAULT_JOB_STATE);
  const [initialRefined, setInitialRefined] = useState(DEFAULT_JOB_STATE);
  const [viewMode, setViewMode] = useState("refined");
  const [isManualEditing, setIsManualEditing] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [channelRecommendations, setChannelRecommendations] = useState([]);
  const [channelUpdatedAt, setChannelUpdatedAt] = useState(null);
  const [channelFailure, setChannelFailure] = useState(null);
  const [isFetchingChannels, setIsFetchingChannels] = useState(false);
  const [jobAssets, setJobAssets] = useState([]);
  const [assetRun, setAssetRun] = useState(null);
  const [assetError, setAssetError] = useState(null);
  const [isGeneratingAssets, setIsGeneratingAssets] = useState(false);
  const [shouldPollAssets, setShouldPollAssets] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [finalJobSource, setFinalJobSource] = useState(null);
  const [currentStep, setCurrentStep] = useState(() =>
    normalizeFlowStepId(searchParams?.get("step"))
  );
  const [jobLogoUrl, setJobLogoUrl] = useState("");
  const [copilotConversation, setCopilotConversation] = useState([]);
  const [isCopilotChatting, setIsCopilotChatting] = useState(false);
  const [copilotError, setCopilotError] = useState(null);
  const [heroImage, setHeroImage] = useState(null);
  const [shouldGenerateHeroImage, setShouldGenerateHeroImage] = useState(false);
  const [isHeroImageLoading, setIsHeroImageLoading] = useState(false);
  const [shouldGenerateVideos, setShouldGenerateVideos] = useState(false);
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [videoGenerationError, setVideoGenerationError] = useState(null);
  const [generatedVideoItem, setGeneratedVideoItem] = useState(null);
  const [shouldPollVideo, setShouldPollVideo] = useState(false);
  const channelsInitializedRef = useRef(false);
  const jobLogoUrlRef = useRef("");
  const conversationVersionRef = useRef(0);
  const refinementStartedRef = useRef(false);
  const refinementPromiseRef = useRef(null);
  const refinementCancelledRef = useRef(false);
  const heroImageRequestRef = useRef(null);

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
      const intersection = available.filter((channel) => prevSet.has(channel));
      return intersection.length > 0 ? intersection : available;
    });
  }, []);

  const loadAssets = useCallback(async () => {
    if (!user?.authToken || !jobId) return;
    try {
      const response = await fetchJobAssets({
        authToken: user.authToken,
        jobId,
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

  const loadHeroImageState = useCallback(async () => {
    if (!user?.authToken || !jobId) return;
    try {
      // eslint-disable-next-line no-console
      console.log("[HeroImage] loadHeroImageState:start", { jobId });
      const response = await fetchHeroImage({
        authToken: user.authToken,
        jobId,
      });
      const hero = response.heroImage ?? null;
      // eslint-disable-next-line no-console
      console.log("[HeroImage] loadHeroImageState:received", {
        jobId,
        status: hero?.status ?? null,
      });
      setHeroImage(hero);
      // Removed auto-setting shouldGenerateHeroImage to true when hero image exists.
      // This flag should only be set when user explicitly opts in via HeroImageOptIn checkbox,
      // not automatically based on existence of a previous hero image.
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to load image", error);
    }
  }, [user?.authToken, jobId]);

  const handleHeroImageRequest = useCallback(
    async ({ forceRefresh = false } = {}) => {
      if (!user?.authToken || !jobId) return;
      if (heroImageRequestRef.current && !forceRefresh) {
        // eslint-disable-next-line no-console
        console.log("[HeroImage] requestHeroImage:reuse", {
          jobId,
          forceRefresh,
        });
        return heroImageRequestRef.current;
      }
      // eslint-disable-next-line no-console
      console.log("[HeroImage] requestHeroImage:start", {
        jobId,
        forceRefresh,
      });
      setIsHeroImageLoading(true);
      const promise = (async () => {
        try {
          const response = await requestHeroImage({
            authToken: user.authToken,
            jobId,
            forceRefresh: true,
          });
          // eslint-disable-next-line no-console
          console.log("[HeroImage] requestHeroImage:success", {
            jobId,
            status: response.heroImage?.status ?? null,
          });
          setHeroImage(response.heroImage ?? null);
          setShouldGenerateHeroImage(true);
          return response.heroImage ?? null;
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn("[HeroImage] requestHeroImage:error", {
            jobId,
            message: error?.message,
          });
          setHeroImage((prev) => ({
            ...(prev ?? {
              jobId,
              status: "FAILED",
            }),
            status: "FAILED",
            failure: {
              reason: "request_failed",
              message: error.message,
            },
          }));
          throw error;
        } finally {
          // eslint-disable-next-line no-console
          console.log("[HeroImage] requestHeroImage:complete", {
            jobId,
          });
          setIsHeroImageLoading(false);
          heroImageRequestRef.current = null;
        }
      })();
      heroImageRequestRef.current = promise;
      return promise;
    },
    [user?.authToken, jobId]
  );

  const hasManualStepChangeRef = useRef(false);
  const hasSyncedInitialQueryStepRef = useRef(false);
  const lastUrlStepRef = useRef(null);

  useEffect(() => {
    jobLogoUrlRef.current = normalizeLogoUrl(jobLogoUrl);
  }, [jobLogoUrl]);

  useEffect(() => {
    hasManualStepChangeRef.current = false;
    hasSyncedInitialQueryStepRef.current = false;
    lastUrlStepRef.current = null;
    refinementStartedRef.current = false;
    refinementPromiseRef.current = null;
  }, [jobId]);

  const maxEnabledIndex = useMemo(() => {
    const hasChannelAccess =
      Boolean(finalJobSource) ||
      channelRecommendations.length > 0 ||
      jobAssets.length > 0 ||
      Boolean(assetRun);
    if (!hasChannelAccess) {
      return 0;
    }
    const hasAssetAccess = jobAssets.length > 0 || Boolean(assetRun);
    return hasAssetAccess ? 2 : 1;
  }, [
    finalJobSource,
    channelRecommendations.length,
    jobAssets.length,
    assetRun,
  ]);

  const isStepTransitioning = useMemo(() => {
    if (currentStep === "channels" && (isFinalizing || isFetchingChannels)) {
      return true;
    }
    if (currentStep === "assets" && isGeneratingAssets) {
      return true;
    }
    return false;
  }, [currentStep, isFinalizing, isFetchingChannels, isGeneratingAssets]);

  const activeStage = useMemo(() => {
    if (currentStep === "channels") {
      return "channels";
    }
    if (currentStep === "assets") {
      return "assets";
    }
    return "refine";
  }, [currentStep]);

  const activeJobState = useMemo(
    () => (viewMode === "original" ? originalDraft : refinedDraft),
    [viewMode, originalDraft, refinedDraft]
  );
  const normalizedInitialOriginal = useMemo(
    () => normaliseJobDraft(initialOriginal),
    [initialOriginal]
  );
  const normalizedUserSnapshot = useMemo(
    () => normaliseJobDraft(userDraftSnapshot),
    [userDraftSnapshot]
  );
  const normalizedRefinedJob = useMemo(
    () => normaliseJobDraft(refinedDraft),
    [refinedDraft]
  );
  const normalizedOriginalJob = useMemo(() => {
    const hasInitial = jobHasContent(normalizedInitialOriginal);
    const hasUserSnapshot = jobHasContent(normalizedUserSnapshot);
    const isInitialSameAsRefined =
      JSON.stringify(normalizedInitialOriginal) ===
      JSON.stringify(normalizedRefinedJob);
    if (!hasInitial && hasUserSnapshot) {
      return normalizedUserSnapshot;
    }
    if (hasUserSnapshot && isInitialSameAsRefined) {
      return normalizedUserSnapshot;
    }
    return hasInitial ? normalizedInitialOriginal : normalizedUserSnapshot;
  }, [
    normalizedInitialOriginal,
    normalizedUserSnapshot,
    normalizedRefinedJob,
  ]);
  const diffEntries = useMemo(
    () => buildDiffEntries(normalizedOriginalJob, normalizedRefinedJob),
    [normalizedOriginalJob, normalizedRefinedJob]
  );
  const completenessScore = useMemo(
    () => calculateCompleteness(normalizedRefinedJob),
    [normalizedRefinedJob]
  );
  const chatTeaser = copilotError ?? (currentStep === "refine" ? summary : "");
  const optimizationInsights = useMemo(() => {
    const jobImprovementScore = job?.metadata?.improvementScore ?? null;
    const jobOriginalScore = job?.metadata?.originalScore ?? null;
    const improvementScore =
      jobImprovementScore ??
      jobMetadata?.improvementScore ??
      refinementInsights?.improvementScore ??
      DEFAULT_REFINE_INSIGHTS.improvementScore;
    const originalScore =
      jobOriginalScore ??
      jobMetadata?.originalScore ??
      refinementInsights?.originalScore ??
      DEFAULT_REFINE_INSIGHTS.originalScore;
    const interestLift = calculateInterestLift(
      improvementScore,
      originalScore,
      refinementInsights?.interestLift ?? DEFAULT_REFINE_INSIGHTS.interestLift
    );
    return {
      ...refinementInsights,
      improvementScore,
      originalScore,
      interestLift,
    };
  }, [job, jobMetadata, refinementInsights]);
  const heroImageStatus = heroImage?.status ?? "IDLE";
  const heroImageInFlight =
    isHeroImageLoading || ["PROMPTING", "GENERATING"].includes(heroImageStatus);
  const heroImagePreviewSrc = useMemo(() => {
    if (heroImage?.imageBase64) {
      const mime = heroImage?.imageMimeType ?? "image/png";
      return `data:${mime};base64,${heroImage.imageBase64}`;
    }
    return heroImage?.imageUrl ?? null;
  }, [heroImage?.imageBase64, heroImage?.imageUrl, heroImage?.imageMimeType]);
  const heroImageAsset = useMemo(() => {
    if (!shouldGenerateHeroImage) {
      return null;
    }
    const normalizedStatus = mapHeroImageStatus(
      heroImageStatus,
      heroImageInFlight
    );
    return {
      id: `hero-image-${jobId ?? "new"}`,
      formatId: "AI_HERO_IMAGE",
      channelId: "HERO_IMAGE",
      status: normalizedStatus,
      content: {
        imageUrl: heroImagePreviewSrc ?? null,
        failureMessage:
          heroImage?.failure?.message ?? heroImage?.failure?.reason ?? null,
        provider: heroImage?.imageProvider ?? "pending",
        model: heroImage?.imageModel ?? "pending",
        caption: heroImage?.caption ?? null,
        hashtags: heroImage?.captionHashtags ?? null,
      },
    };
  }, [
    shouldGenerateHeroImage,
    heroImageStatus,
    heroImageInFlight,
    heroImagePreviewSrc,
    heroImage,
    jobId,
  ]);
  const videoAsset = useMemo(() => {
    if (!shouldGenerateVideos) {
      return null;
    }

    // Show placeholder while generating
    if (isGeneratingVideos && !generatedVideoItem) {
      return {
        id: "video-placeholder",
        formatId: "AI_VIDEO",
        channelId: "VIDEO",
        status: "GENERATING",
        content: {
          videoUrl: null,
          caption: "Generating your video...",
          body: "Your video is being created. This may take a few minutes.",
          durationSeconds: 0,
          posterUrl: null,
        },
        provider: null,
        model: null,
      };
    }

    if (!generatedVideoItem) {
      return null;
    }

    const item = generatedVideoItem;
    const status = item.status === "ready" ? "READY" :
                   item.status === "generating" ? "GENERATING" :
                   item.status === "failed" ? "FAILED" : "PENDING";

    return {
      id: `video-${item.id}`,
      formatId: "AI_VIDEO",
      channelId: "VIDEO",
      status,
      content: {
        videoUrl: item.renderTask?.result?.videoUrl ?? null,
        caption: item.activeManifest?.caption?.text ?? null,
        body: item.activeManifest?.caption?.text ?? "Video ready",
        durationSeconds: item.renderTask?.metrics?.secondsGenerated ?? 0,
        posterUrl: item.renderTask?.result?.posterUrl ?? null,
      },
      provider: item.renderTask?.renderer ?? null,
      model: item.renderTask?.metrics?.model ?? null,
    };
  }, [shouldGenerateVideos, generatedVideoItem, isGeneratingVideos]);

  const assetsWithHero = useMemo(() => {
    const allAssets = [...(jobAssets ?? [])];

    // Add video asset if it exists
    if (videoAsset) {
      allAssets.unshift(videoAsset);
    }

    // Add hero image at the top if it exists
    if (heroImageAsset) {
      allAssets.unshift(heroImageAsset);
    }

    return allAssets;
  }, [heroImageAsset, videoAsset, jobAssets]);

  const triggerHeroImageIfNeeded = useCallback(() => {
    if (!shouldGenerateHeroImage) {
      // eslint-disable-next-line no-console
      console.log("[HeroImage] trigger:opt-out", { jobId });
      return null;
    }
    // eslint-disable-next-line no-console
    console.log("[HeroImage] trigger:opt-in", {
      jobId,
      status: heroImage?.status ?? null,
    });
    return handleHeroImageRequest({ forceRefresh: true });
  }, [shouldGenerateHeroImage, handleHeroImageRequest, jobId, heroImage?.status]);

  const triggerVideoGenerationIfNeeded = useCallback(async () => {
    if (!shouldGenerateVideos) {
      // eslint-disable-next-line no-console
      console.log("[Video] trigger:opt-out", { jobId });
      return;
    }

    if (!user?.authToken || !jobId) {
      // eslint-disable-next-line no-console
      console.log("[Video] trigger:skip", {
        jobId,
        hasAuth: Boolean(user?.authToken),
      });
      return;
    }

    // eslint-disable-next-line no-console
    console.log("[Video] trigger:opt-in", {
      jobId,
    });

    setIsGeneratingVideos(true);
    setVideoGenerationError(null);

    try {
      // eslint-disable-next-line no-console
      console.log("[Video] Creating single video for job");
      const created = await VideoLibraryApi.createItem(
        {
          jobId,
          channelId: "TIKTOK_LEAD", // Use a default channel - the video is universal
          recommendedMedium: "video",
        },
        { authToken: user.authToken }
      );
      // eslint-disable-next-line no-console
      console.log("[Video] Video created:", created.id);

      setGeneratedVideoItem(created);
      // Start polling to check video status
      setShouldPollVideo(true);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("[Video] Failed to create video:", error);
      setVideoGenerationError(error.message ?? "Failed to create video");
    }

    setIsGeneratingVideos(false);
  }, [shouldGenerateVideos, user?.authToken, jobId]);

  const pollVideoItem = useCallback(async () => {
    if (!user?.authToken || !generatedVideoItem) {
      return;
    }

    // eslint-disable-next-line no-console
    console.log("[Video] Polling video status", {
      videoId: generatedVideoItem.id,
    });

    try {
      const updated = await VideoLibraryApi.fetchItem(generatedVideoItem.id, {
        authToken: user.authToken,
      });

      setGeneratedVideoItem(updated);

      // Check if video is still generating
      const isPending = ["generating", "pending"].includes(updated.status?.toLowerCase());

      // Stop polling when video is ready or failed
      if (!isPending) {
        // eslint-disable-next-line no-console
        console.log("[Video] Video completed, stopping poll");
        setShouldPollVideo(false);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[Video] Poll error:", error);
    }
  }, [user?.authToken, generatedVideoItem]);

  const syncStepQuery = useCallback(
    (stepId, { replace = false } = {}) => {
      if (!pathname) {
        return false;
      }
      const normalized = normalizeFlowStepId(stepId);
      const currentParam = searchParams?.get("step");
      if (currentParam === normalized) {
        return false;
      }
      const params = new URLSearchParams(searchParams?.toString());
      params.set("step", normalized);
      const query = params.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      if (replace) {
        router.replace(href, { scroll: false });
      } else {
        router.push(href, { scroll: false });
      }
      return true;
    },
    [pathname, router, searchParams]
  );
  const handleGenerateAssets = async () => {
    if (
      !user?.authToken ||
      !jobId ||
      selectedChannels.length === 0 ||
      !finalJobSource
    ) {
      return;
    }
    // eslint-disable-next-line no-console
    console.log("[Assets] generate click", {
      jobId,
      selectedChannels,
      shouldGenerateVideos,
      finalJobSource,
      shouldGenerateHeroImage,
    });
    setIsGeneratingAssets(true);
    setAssetError(null);
    navigateToStep("assets", { force: true });
    triggerHeroImageIfNeeded();
    triggerVideoGenerationIfNeeded();
    try {
      const response = await generateJobAssets({
        authToken: user.authToken,
        jobId,
        channelIds: selectedChannels,
        source: finalJobSource,
      });
      setJobAssets(response.assets ?? []);
      setAssetRun(response.run ?? null);
      const hasPending = (response.assets ?? []).some((asset) =>
        ["PENDING", "GENERATING"].includes(asset.status)
      );
      setShouldPollAssets(hasPending);
    } catch (error) {
      setAssetError(error.message ?? "Failed to generate assets.");
      navigateToStep("channels", { force: true });
    } finally {
      setIsGeneratingAssets(false);
    }
  };

  const navigateToStep = useCallback(
    (
      stepId,
      { force = false, markManual = true, replaceHistory = false } = {}
    ) => {
      const normalized = normalizeFlowStepId(stepId);
      const targetIndex = STEP_INDEX[normalized];
      if (targetIndex === undefined) {
        return;
      }
      if (!force && targetIndex > maxEnabledIndex) {
        return;
      }
      if (markManual) {
        hasManualStepChangeRef.current = true;
      }
      setCurrentStep((prev) => (prev === normalized ? prev : normalized));
      const didSyncUrl = syncStepQuery(normalized, { replace: replaceHistory });
      if (didSyncUrl) {
        lastUrlStepRef.current = normalized;
      }
    },
    [maxEnabledIndex, syncStepQuery]
  );

  const handleStepChange = useCallback(
    (stepId) => {
      navigateToStep(stepId);
    },
    [navigateToStep]
  );

  useEffect(() => {
    const nextStepFromQuery = normalizeFlowStepId(searchParams?.get("step"));
    setCurrentStep((prev) =>
      prev === nextStepFromQuery ? prev : nextStepFromQuery
    );

    if (!hasSyncedInitialQueryStepRef.current) {
      hasSyncedInitialQueryStepRef.current = true;
      if (searchParams && searchParams.has("step")) {
        hasManualStepChangeRef.current = true;
      }
      return;
    }

    if (lastUrlStepRef.current === nextStepFromQuery) {
      lastUrlStepRef.current = null;
      return;
    }

    hasManualStepChangeRef.current = true;
  }, [searchParams]);

  const blockingSpinnerLabel = useMemo(() => {
    if (isFinalizing) {
      return "Preparing channel recommendations…";
    }
    if (currentStep === "channels" && isFetchingChannels) {
      return "Refreshing channel recommendations…";
    }
    if (isGeneratingAssets) {
      return "Generating campaign assets…";
    }
    return null;
  }, [isFinalizing, currentStep, isFetchingChannels, isGeneratingAssets]);

  useEffect(() => {
    // Don't navigate until initial data load is complete
    // This prevents redirecting to refine before channels/assets are loaded from Firestore
    if (!isInitialLoadComplete) {
      return;
    }
    const currentIndex = STEP_INDEX[currentStep] ?? 0;
    if (currentIndex > maxEnabledIndex && !isStepTransitioning) {
      const fallbackIndex = Math.min(maxEnabledIndex, FLOW_STEPS.length - 1);
      const fallbackStep = FLOW_STEPS[fallbackIndex]?.id ?? FLOW_STEPS[0].id;
      if (fallbackStep && fallbackStep !== currentStep) {
        navigateToStep(fallbackStep, {
          force: true,
          markManual: false,
          replaceHistory: true,
        });
      }
      return;
    }
    if (
      !hasManualStepChangeRef.current &&
      !isStepTransitioning &&
      currentIndex < maxEnabledIndex
    ) {
      const targetStep = FLOW_STEPS[maxEnabledIndex]?.id;
      if (targetStep && targetStep !== currentStep) {
        navigateToStep(targetStep, {
          force: true,
          markManual: false,
          replaceHistory: true,
        });
      }
    }
  }, [currentStep, maxEnabledIndex, isStepTransitioning, navigateToStep, isInitialLoadComplete]);

  useEffect(() => {
    if (!user?.authToken || !jobId) return undefined;
    let cancelled = false;
    const hydrateJobDraft = async () => {
      try {
        const response = await fetchJobDraft({
          authToken: user.authToken,
          jobId,
        });
        if (cancelled) return;
        setJob(response ?? null);
        if (response && "metadata" in response) {
          setJobMetadata(response.metadata ?? null);
        }
        const normalizedState = normaliseJobDraft(response?.state ?? {});
        setUserDraftSnapshot(normalizedState);
        const nextLogoFromState = normalizeLogoUrl(response?.state?.logoUrl);
        setJobLogoUrl((prev) => {
          if (nextLogoFromState === prev) {
            return prev;
          }
          return nextLogoFromState;
        });
      } catch (error) {
        console.warn("Failed to fetch job draft for branding assets", error);
      }
    };

    hydrateJobDraft();
    return () => {
      cancelled = true;
    };
  }, [user?.authToken, jobId]);

  useEffect(() => {
    const normalized = normalizeLogoUrl(jobLogoUrl);
    if (!normalized) {
      return;
    }
    const ensureLogo = (setter) => {
      setter((prev) => {
        if (normalizeLogoUrl(prev?.logoUrl)) {
          return prev;
        }
        return { ...prev, logoUrl: normalized };
      });
    };
    ensureLogo(setInitialOriginal);
    ensureLogo(setInitialRefined);
    ensureLogo(setOriginalDraft);
    ensureLogo(setRefinedDraft);
  }, [jobLogoUrl]);

  useEffect(() => {
    if (!user?.authToken || !jobId) return;

    let cancelled = false;

    const applyRefinementResponse = (response) => {
      const original = normaliseJobDraft(response.originalJob);
      const refined = normaliseJobDraft(response.refinedJob);
      console.log("[Refinement] Normalized drafts:", { original, refined });
      const fallbackLogo = normalizeLogoUrl(jobLogoUrlRef.current);
      const refinedLogo = normalizeLogoUrl(refined.logoUrl);
      const originalLogo = normalizeLogoUrl(original.logoUrl);
      const refinedWithBranding = {
        ...refined,
        logoUrl: refinedLogo || originalLogo || fallbackLogo,
      };
      const originalWithBranding = {
        ...original,
        logoUrl: originalLogo || refinedLogo || fallbackLogo,
      };
      const appliedLogo =
        normalizeLogoUrl(refinedWithBranding.logoUrl) ||
        normalizeLogoUrl(originalWithBranding.logoUrl);
      if (appliedLogo && appliedLogo !== jobLogoUrlRef.current) {
        setJobLogoUrl(appliedLogo);
      }
      setInitialOriginal(originalWithBranding);
      setInitialRefined(refinedWithBranding);
      setOriginalDraft(originalWithBranding);
      setRefinedDraft(refinedWithBranding);
      setSummary(response.summary ?? "");
      setRefinementInsights(deriveInsights(response.metadata, response.summary));
      setJobMetadata(response.metadata ?? null);
      setViewMode("refined");
      if (response.failure) {
        setRefineError(
          response.failure.message ?? response.failure.reason ?? null
        );
      }
    };

    const attachHandlers = (promise, { resetError = false } = {}) => {
      if (resetError) {
        setRefineError(null);
      }
      setIsRefining(true);
      promise
        .then((response) => {
          console.log("[Refinement] API response received:", response);
          if (cancelled) return;
          applyRefinementResponse(response);
        })
        .catch((error) => {
          console.error("[Refinement] Error occurred:", error);
          if (cancelled) return;
          setRefineError(error.message ?? "Failed to refine the job.");
        })
        .finally(() => {
          if (cancelled) return;
          console.log("[Refinement] Finally block - setting isRefining to false");
          setIsRefining(false);
          if (refinementPromiseRef.current === promise) {
            refinementPromiseRef.current = null;
          }
        });
    };

    const existingPromise = globalRefinementLock.get(jobId);
    if (existingPromise) {
      console.log("[Refinement] Reusing in-flight refinement for jobId:", jobId);
      refinementPromiseRef.current = existingPromise;
      attachHandlers(existingPromise);
      return () => {
        cancelled = true;
      };
    }

    console.log("[Refinement] Starting new refinement for", jobId);

    const refinementPromise = (async () => {
      console.log("[Refinement] Calling refineJob API...");
      return refineJob({
        authToken: user.authToken,
        jobId,
      });
    })();

    refinementPromiseRef.current = refinementPromise;
    globalRefinementLock.lock(jobId, refinementPromise);
    attachHandlers(refinementPromise, { resetError: true });

    return () => {
      cancelled = true;
    };
    // Only depend on jobId. Auth token changes (e.g., token refresh) should NOT re-trigger refinement.
    // The token is captured when the effect runs and used in the closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  // Initial hydration: load existing channel recommendations and assets from Firestore
  // This runs once on mount to determine maxEnabledIndex before step navigation kicks in
  useEffect(() => {
    if (!user?.authToken || !jobId) return;
    let cancelled = false;

    const hydrateInitialData = async () => {
      try {
        // Load existing channel recommendations (read-only, no LLM)
        const channelsResponse = await fetchExistingChannelRecommendations({
          authToken: user.authToken,
          jobId,
        });
        if (cancelled) return;

        if (channelsResponse.recommendations?.length > 0) {
          setChannelRecommendations(channelsResponse.recommendations);
          setChannelUpdatedAt(channelsResponse.updatedAt ?? null);
          setChannelFailure(channelsResponse.failure ?? null);
          syncSelectedChannels(channelsResponse.recommendations);
          // If we have channels, we likely have a finalized job
          setFinalJobSource("cached");
        }
      } catch (error) {
        // Silently fail - channels may not exist yet
        console.log("[Hydration] No existing channel recommendations:", error.message);
      }

      if (cancelled) return;
      setIsInitialLoadComplete(true);
    };

    hydrateInitialData();

    return () => {
      cancelled = true;
    };
  }, [user?.authToken, jobId, syncSelectedChannels]);

  useEffect(() => {
    if (!shouldPollAssets) return undefined;
    const interval = setInterval(() => {
      loadAssets();
    }, 5000);
    return () => clearInterval(interval);
  }, [shouldPollAssets, loadAssets]);

  useEffect(() => {
    if (!shouldPollVideo) return undefined;
    const interval = setInterval(() => {
      pollVideoItem();
    }, 5000);
    return () => clearInterval(interval);
  }, [shouldPollVideo, pollVideoItem]);

  const handleToggleChannel = useCallback((channelId) => {
    setSelectedChannels((prev) => {
      if (prev.includes(channelId)) {
        return prev.filter((id) => id !== channelId);
      }
      return [...prev, channelId];
    });
  }, []);

  const handleFinalize = async (modeOverride = null) => {
    if (!user?.authToken || !jobId) return;
    const nextMode = modeOverride ?? viewMode;
    setViewMode((prev) => (prev === nextMode ? prev : nextMode));
    setIsManualEditing(false);
    setIsFinalizing(true);
    setChannelFailure(null);
    channelsInitializedRef.current = false;
    navigateToStep("channels", { force: true });
    try {
      const activeDraft =
        nextMode === "original" ? originalDraft : refinedDraft;
      const baselineDraft =
        nextMode === "original" ? initialOriginal : initialRefined;
      const finalJob = normaliseJobDraft(activeDraft);
      const baseline = normaliseJobDraft(baselineDraft);
      const isEdited = JSON.stringify(baseline) !== JSON.stringify(finalJob);
      const submissionSource = isEdited ? "edited" : nextMode;

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
      if (shouldGenerateHeroImage) {
        await handleHeroImageRequest({ forceRefresh: true });
      } else {
        await loadHeroImageState();
      }
    } catch (error) {
      setChannelFailure({ reason: "finalize_failed", message: error.message });
      navigateToStep("refine", { force: true });
    } finally {
      setIsFinalizing(false);
    }
  };

  const loadChannelRecommendations = useCallback(async () => {
    if (!user?.authToken || !jobId) return;
    if (isFetchingChannels) {
      return;
    }
    setIsFetchingChannels(true);
    try {
      const response = await fetchChannelRecommendations({
        authToken: user.authToken,
        jobId,
      });
      const recommendations = response.recommendations ?? [];
      setChannelRecommendations(recommendations);
      setChannelUpdatedAt(response.updatedAt ?? null);
      setChannelFailure(response.failure ?? null);
      syncSelectedChannels(recommendations);
    } catch (error) {
      setChannelFailure({
        reason: "load_failed",
        message: error.message,
      });
    } finally {
      setIsFetchingChannels(false);
    }
  }, [user?.authToken, jobId, syncSelectedChannels, isFetchingChannels]);

  useEffect(() => {
    if (currentStep === "refine") {
      channelsInitializedRef.current = false;
      return;
    }
    if (
      currentStep === "channels" &&
      channelRecommendations.length === 0 &&
      !isFetchingChannels &&
      !channelFailure &&
      finalJobSource &&
      !channelsInitializedRef.current
    ) {
      channelsInitializedRef.current = true;
      loadChannelRecommendations();
    }
  }, [
    currentStep,
    channelRecommendations.length,
    isFetchingChannels,
    channelFailure,
    finalJobSource,
    loadChannelRecommendations,
  ]);

  const applyConversationUpdate = useCallback((messages) => {
    const normalized = applyClientMessageIds(messages ?? []);
    const version = deriveConversationVersion(normalized);
    const currentVersion = conversationVersionRef.current;
    if (Number.isFinite(version) && version < currentVersion) {
      return;
    }
    if (Number.isFinite(version)) {
      conversationVersionRef.current = version;
    }
    setCopilotConversation(normalized);
  }, []);

  const loadCopilotConversation = useCallback(async () => {
    if (!user?.authToken || !jobId) return;
    try {
      const response = await fetchCopilotConversation({
        authToken: user.authToken,
        jobId,
      });
      applyConversationUpdate(response.messages ?? []);
      setCopilotError(null);
    } catch (error) {
      setCopilotError(error.message ?? "Failed to load copilot chat.");
    }
  }, [user?.authToken, jobId, applyConversationUpdate]);

  useEffect(() => {
    conversationVersionRef.current = 0;
    setCopilotConversation([]);
    setHeroImage(null);
    setShouldGenerateHeroImage(false);
  }, [jobId]);

  useEffect(() => {
    loadCopilotConversation();
  }, [loadCopilotConversation]);

  useEffect(() => {
    loadHeroImageState();
  }, [loadHeroImageState]);

  const handleCopilotSend = useCallback(
    async (message, options = {}) => {
      const trimmed = message.trim();
      if (!trimmed || !user?.authToken || !jobId) {
        return;
      }
      const stage = options?.stage ?? activeStage;
      const clientMessageId = `client-${Date.now()}`;
      setIsCopilotChatting(true);
      setCopilotConversation((prev) => {
        const optimistic = [
          ...prev,
          {
            id: clientMessageId,
            role: "user",
            type: "user",
            content: trimmed,
            metadata: { clientMessageId, optimistic: true },
            createdAt: new Date(),
          },
        ];
        const version = deriveConversationVersion(optimistic);
        if (Number.isFinite(version)) {
          conversationVersionRef.current = version;
        }
        return optimistic;
      });
      try {
        const response = await sendCopilotAgentMessage({
          authToken: user.authToken,
          jobId,
          message: trimmed,
          clientMessageId,
          stage,
        });
        applyConversationUpdate(response.messages ?? []);
        if (
          response.updatedJobSnapshot &&
          typeof response.updatedJobSnapshot === "object"
        ) {
          const snapshot = response.updatedJobSnapshot;
          // eslint-disable-next-line no-console
          console.info("publish-copilot:apply-updated-snapshot", {
            keys: Object.keys(snapshot ?? {}),
            stage,
          });
          setOriginalDraft((prev) => mergeSnapshot(prev, snapshot));
          setInitialOriginal((prev) => mergeSnapshot(prev, snapshot));
        }
        if (
          stage === "refine" &&
          response.updatedRefinedSnapshot &&
          typeof response.updatedRefinedSnapshot === "object"
        ) {
          const refinedSnapshot = response.updatedRefinedSnapshot;
          setRefinedDraft((prev) => mergeSnapshot(prev, refinedSnapshot));
          setInitialRefined((prev) => mergeSnapshot(prev, refinedSnapshot));
        }
        const actions = Array.isArray(response.actions) ? response.actions : [];
        if (actions.length > 0) {
          actions.forEach((action) => {
            if (!action || typeof action !== "object") {
              return;
            }
            switch (action.type) {
              case "field_update": {
                const applyField = (setter) => {
                  setter((prev) => {
                    let next = deepClone(prev);
                    if (
                      action.jobSnapshot &&
                      typeof action.jobSnapshot === "object"
                    ) {
                      next = mergeSnapshot(next, action.jobSnapshot);
                    }
                    setDeep(next, action.fieldId, action.value);
                    return next;
                  });
                };
                applyField(setOriginalDraft);
                applyField(setInitialOriginal);
                if (stage === "refine") {
                  applyField(setRefinedDraft);
                  applyField(setInitialRefined);
                }
                break;
              }
              case "field_batch_update": {
                const applyFields = (setter) => {
                  setter((prev) => {
                    let next = mergeSnapshot(prev, action.jobSnapshot);
                    if (action.fields && typeof action.fields === "object") {
                      Object.entries(action.fields).forEach(
                        ([fieldId, value]) => {
                          setDeep(next, fieldId, value);
                        }
                      );
                    }
                    return next;
                  });
                };
                applyFields(setOriginalDraft);
                applyFields(setInitialOriginal);
                if (stage === "refine") {
                  applyFields(setRefinedDraft);
                  applyFields(setInitialRefined);
                }
                break;
              }
              case "refined_field_update": {
                const applyField = (setter) => {
                  setter((prev) => {
                    let next = deepClone(prev);
                    if (
                      action.refinedJob &&
                      typeof action.refinedJob === "object"
                    ) {
                      next = mergeSnapshot(next, action.refinedJob);
                    }
                    setDeep(next, action.fieldId, action.value);
                    return next;
                  });
                };
                applyField(setRefinedDraft);
                applyField(setInitialRefined);
                break;
              }
              case "refined_field_batch_update": {
                const applyFields = (setter) => {
                  setter((prev) => {
                    let next = mergeSnapshot(prev, action.refinedJob);
                    if (Array.isArray(action.fields)) {
                      action.fields.forEach((entry) => {
                        if (entry?.fieldId) {
                          const incomingValue =
                            action.refinedJob &&
                            action.refinedJob[entry.fieldId];
                          if (entry.mode === "clear") {
                            setDeep(next, entry.fieldId, "");
                          } else if (incomingValue !== undefined) {
                            setDeep(next, entry.fieldId, incomingValue);
                          }
                        }
                      });
                    } else if (
                      action.fields &&
                      typeof action.fields === "object"
                    ) {
                      Object.entries(action.fields).forEach(
                        ([fieldId, value]) => {
                          setDeep(next, fieldId, value);
                        }
                      );
                    }
                    return next;
                  });
                };
                applyFields(setRefinedDraft);
                applyFields(setInitialRefined);
                break;
              }
              case "channel_recommendations_update": {
                if (Array.isArray(action.recommendations)) {
                  const nextRecommendations = action.recommendations;
                  setChannelRecommendations(nextRecommendations);
                  setChannelUpdatedAt(new Date());
                  setChannelFailure(null);
                  syncSelectedChannels(nextRecommendations);
                } else {
                  loadChannelRecommendations();
                }
                break;
              }
              case "asset_update": {
                setJobAssets((prev) =>
                  prev.map((asset) =>
                    asset.id === action.assetId
                      ? {
                          ...asset,
                          content: {
                            ...(asset.content ?? {}),
                            ...(action.content ?? {}),
                          },
                          updatedAt: new Date().toISOString(),
                        }
                      : asset
                  )
                );
                break;
              }
              default:
                break;
            }
          });
        }
        setCopilotError(null);
      } catch (error) {
        setCopilotConversation((prev) =>
          prev.filter((entry) => entry.id !== clientMessageId)
        );
        setCopilotError(error.message ?? "Copilot message failed.");
      } finally {
        setIsCopilotChatting(false);
      }
    },
    [
      user?.authToken,
      jobId,
      applyConversationUpdate,
      activeStage,
      syncSelectedChannels,
      loadChannelRecommendations,
    ]
  );

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

  // Only show the "Polishing" spinner if:
  // 1. Refinement is actively running AND
  // 2. User is on the refine step (or initial load hasn't determined the right step yet)
  // This prevents showing the spinner when user refreshes on channels/assets step
  if (isRefining && (currentStep === "refine" || !isInitialLoadComplete)) {
    return <LoadingState label="Polishing your job details…" />;
  }

  // Show a brief loading state during initial hydration for non-refine steps
  if (!isInitialLoadComplete && currentStep !== "refine") {
    return <LoadingState label="Loading your progress…" />;
  }

  if (currentStep === "refine") {
    const proTipCopy =
      typeof summary === "string" && summary.trim().length > 0
        ? summary
        : "Listings with transparent salary ranges receive up to 40% more applications from qualified candidates.";
    const liftValue =
      typeof optimizationInsights.interestLift === "string" &&
      optimizationInsights.interestLift.length > 0
        ? optimizationInsights.interestLift
        : DEFAULT_REFINE_INSIGHTS.interestLift;
    return (
      <div className="space-y-6">
        <StepProgress
          steps={FLOW_STEPS}
          currentStep={currentStep}
          maxEnabledIndex={maxEnabledIndex}
          onStepChange={handleStepChange}
        />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm shadow-slate-200/60">
            <div className="space-y-8">
              <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-indigo-700">
                    Analysis complete
                  </span>
                  <div>
                    <h1 className="text-3xl font-semibold text-slate-900">
                      Refine &amp; Optimize
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm text-slate-500">
                      Our AI reviewed your draft against industry benchmarks.
                      Approve the upgraded fields to push straight into
                      distribution channels.
                    </p>
                  </div>
                  {refineError ? (
                    <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                      {refineError}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsManualEditing((prev) => !prev)}
                    className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                  >
                    {isManualEditing ? "Close editor" : "Edit manually"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFinalize("refined")}
                    disabled={isFinalizing}
                    className="rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-400/40 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
                  >
                    {isFinalizing
                      ? "Preparing channels…"
                      : "Approve improvements"}
                  </button>
                </div>
              </header>

              <div className="grid gap-6 lg:grid-cols-[360px,minmax(0,1fr)]">
                <aside className="space-y-6">
                  <OptimizationScoreCard insights={optimizationInsights} />
                  <InsightStats
                    interestLift={liftValue}
                    completeness={completenessScore}
                  />
                  <EnhancementsPanel
                    items={refinementInsights.keyImprovements}
                  />
                  {/* <ProTipCard copy={proTipCopy} /> */}
                </aside>
                <main className="space-y-5">
                  {diffEntries.map((diff) => (
                    <DiffFieldCard key={diff.id} diff={diff} />
                  ))}
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Prefer your original draft?
                        </p>
                        <p className="text-xs text-slate-500">
                          Continue with the unedited version while you iterate.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleFinalize("original")}
                        disabled={isFinalizing}
                        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Keep original
                      </button>
                    </div>
                  </div>
                  {isManualEditing ? (
                    <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      {summary ? (
                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-800">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-indigo-500">
                            Summary of improvements
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm">
                            {summary}
                          </p>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold uppercase tracking-wide">
                          <button
                            type="button"
                            onClick={() => setViewMode("refined")}
                            className={clsx(
                              "rounded-full px-4 py-2 transition",
                              viewMode === "refined"
                                ? "bg-indigo-600 text-white shadow"
                                : "text-slate-600 hover:text-indigo-600"
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
                                ? "bg-indigo-600 text-white shadow"
                                : "text-slate-600 hover:text-indigo-600"
                            )}
                          >
                            Original version
                          </button>
                        </div>
                        <span className="text-xs text-slate-500">
                          {viewMode === "refined"
                            ? "Editing AI optimized job"
                            : "Editing original draft"}
                        </span>
                      </div>
                      <JobEditorCard
                        title={
                          viewMode === "refined"
                            ? "Refined job"
                            : "Original job"
                        }
                        job={
                          viewMode === "refined" ? refinedDraft : originalDraft
                        }
                        onChange={
                          viewMode === "refined"
                            ? setRefinedDraft
                            : setOriginalDraft
                        }
                        showFieldRevert={viewMode === "refined"}
                        originalValues={initialOriginal}
                        refinedValues={initialRefined}
                      />
                      <div className="flex flex-wrap justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setIsManualEditing(false)}
                          className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                        >
                          Close editor
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFinalize(viewMode)}
                          disabled={isFinalizing}
                          className="rounded-full bg-indigo-600 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
                        >
                          {isFinalizing
                            ? "Preparing channels…"
                            : "Save & continue"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </main>
              </div>
            </div>
          </div>
          <div className="self-start">
            <WizardSuggestionPanel
              jobId={jobId}
              jobState={activeJobState}
              copilotConversation={copilotConversation}
              onSendMessage={handleCopilotSend}
              isSending={isCopilotChatting}
              nextStepTeaser={chatTeaser}
              isJobTabEnabled
              stage={activeStage}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold text-neutral-900">
          Refine & publish your job
        </h1>
        <p className="text-sm text-neutral-600">
          Follow the guided steps to polish the draft, pick channels, and
          generate creative assets.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <StepProgress
            steps={FLOW_STEPS}
            currentStep={currentStep}
            maxEnabledIndex={maxEnabledIndex}
            onStepChange={handleStepChange}
          />

          {blockingSpinnerLabel ? (
            <LoadingState label={blockingSpinnerLabel} />
          ) : (
            <>
              {currentStep === "channels" ? (
                <section className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm shadow-neutral-100">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-neutral-900">
                      Channel recommendations
                    </h2>
                    <p className="text-sm text-neutral-600">
                      We suggest these channels based on the final job profile.
                      Make edits in the previous step to refresh them.
                    </p>
                  </div>
                  <ChannelRecommendationList
                    recommendations={channelRecommendations}
                    updatedAt={channelUpdatedAt}
                    failure={channelFailure}
                    selectable
                    selectedChannels={selectedChannels}
                    onToggleChannel={handleToggleChannel}
                  />
                  <HeroImageOptIn
                    checked={shouldGenerateHeroImage}
                    onToggle={setShouldGenerateHeroImage}
                  />
                  <VideoOptIn
                    checked={shouldGenerateVideos}
                    onToggle={setShouldGenerateVideos}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
                    <button
                      type="button"
                      onClick={() => navigateToStep("refine")}
                      className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-600 transition hover:bg-neutral-50"
                    >
                      Back to refinement
                    </button>
                    <div className="flex flex-col items-end gap-1 text-xs text-neutral-500">
                      <p>
                        {selectedChannels.length > 0
                          ? `${selectedChannels.length} channel${selectedChannels.length > 1 ? "s" : ""} selected.`
                          : "Select at least one channel to continue."}
                      </p>
                      {shouldGenerateVideos && selectedChannels.length > 0 ? (
                        <p className="text-blue-600">
                          {isGeneratingVideos
                            ? `Generating ${selectedChannels.length} video${selectedChannels.length > 1 ? "s" : ""}…`
                            : `${selectedChannels.length} video${selectedChannels.length > 1 ? "s" : ""} will be created.`}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={handleGenerateAssets}
                        disabled={
                          isGeneratingAssets ||
                          selectedChannels.length === 0 ||
                          !finalJobSource
                        }
                        className="rounded-full bg-primary-600 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
                      >
                        {isGeneratingAssets
                          ? "Generating assets…"
                          : "Generate creative assets"}
                      </button>
                    </div>
                  </div>
                  {assetError ? (
                    <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                      {assetError}
                    </p>
                  ) : null}
                  {videoGenerationError ? (
                    <div className="rounded-2xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                      <p className="font-semibold">Video generation error:</p>
                      <p className="mt-1">{videoGenerationError}</p>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {currentStep === "assets" ? (
                <section className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm shadow-neutral-100">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-neutral-900">
                      Publishing assets
                    </h2>
                    <p className="text-sm text-neutral-600">
                      Monitor generation status and copy snippets for each
                      channel.
                    </p>
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
                  <div className="flex justify-start">
                    <button
                      type="button"
                      onClick={() => navigateToStep("channels")}
                      className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-600 transition hover:bg-neutral-50"
                    >
                      Back to channels
                    </button>
                  </div>
                  <AssetPreviewGrid
                    assets={assetsWithHero}
                    logoUrl={jobLogoUrl}
                  />
                </section>
              ) : null}
            </>
          )}
        </div>
        <div className="self-start">
          <WizardSuggestionPanel
            jobId={jobId}
            jobState={activeJobState}
            copilotConversation={copilotConversation}
            onSendMessage={handleCopilotSend}
            isSending={isCopilotChatting}
            nextStepTeaser={chatTeaser}
            isJobTabEnabled
            stage={activeStage}
          />
        </div>
      </div>
    </div>
  );
}
