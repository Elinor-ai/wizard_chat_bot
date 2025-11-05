import { useEffect, useState } from "react";
import { clsx } from "../../lib/cn";

const EXPERIENCE_LABELS = {
  entry: "Entry level",
  mid: "Mid level",
  senior: "Senior",
  lead: "Lead",
  executive: "Executive"
};

const EMPLOYMENT_TYPE_LABELS = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  temporary: "Temporary",
  seasonal: "Seasonal",
  intern: "Internship"
};

const WORK_MODEL_LABELS = {
  on_site: "On-site",
  hybrid: "Hybrid",
  remote: "Remote"
};

function formatPrimitive(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function renderSuggestionContent(message) {
  const { meta } = message;
  if (!meta) {
    return <p className="whitespace-pre-wrap">{message.content}</p>;
  }

  const { value } = meta;
  if (Array.isArray(value)) {
    const items = value
      .map((item, index) => {
        const formatted = formatPrimitive(item).trim();
        return { formatted, index };
      })
      .filter((item) => item.formatted.length > 0);

    if (items.length === 0) {
      return <p className="whitespace-pre-wrap">{message.content}</p>;
    }

    return (
      <ul className="list-disc space-y-1 whitespace-pre-wrap pl-5 text-sm text-neutral-700">
        {items.map(({ formatted, index }) => (
          <li key={`${message.id}-item-${index}`}>{formatted}</li>
        ))}
      </ul>
    );
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(
      ([, entryValue]) => formatPrimitive(entryValue).trim().length > 0
    );

    if (entries.length === 0) {
      return <p className="whitespace-pre-wrap">{message.content}</p>;
    }

    return (
      <dl className="space-y-1 text-sm text-neutral-700">
        {entries.map(([key, entryValue]) => (
          <div key={`${message.id}-entry-${key}`}>
            <dt className="font-semibold text-primary-700">{key}</dt>
            <dd className="whitespace-pre-wrap">
              {formatPrimitive(entryValue)}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  if (value !== undefined && value !== null) {
    return (
      <p className="whitespace-pre-wrap">{formatPrimitive(value)}</p>
    );
  }

  return <p className="whitespace-pre-wrap">{message.content}</p>;
}

function cleanString(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function labelExperienceLevel(value) {
  return value ? EXPERIENCE_LABELS[value] ?? value : null;
}

function labelEmploymentType(value) {
  return value ? EMPLOYMENT_TYPE_LABELS[value] ?? value : null;
}

function labelWorkModel(value) {
  return value ? WORK_MODEL_LABELS[value] ?? value : null;
}

function formatListItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const formatted = formatPrimitive(item).trim();
      return formatted.length > 0 ? formatted : null;
    })
    .filter(Boolean);
}

function resolvePreviewSource(state) {
  if (!state || typeof state !== "object") {
    return {};
  }
  if (state.confirmed && typeof state.confirmed === "object") {
    const entries = Object.entries(state.confirmed).filter(
      ([, value]) => value !== undefined && value !== null
    );
    if (entries.length > 0) {
      return state.confirmed;
    }
  }
  return state;
}

function JobPreview({ jobState }) {
  const source = resolvePreviewSource(jobState);

  const roleTitle = cleanString(source.roleTitle) || "Job title coming soon";
  const companyName = cleanString(source.companyName);
  const location = cleanString(source.location);
  const jobDescription = cleanString(source.jobDescription);

  const subtitle = [companyName, location].filter(Boolean).join(" • ");
  const tags = [
    labelExperienceLevel(source.seniorityLevel),
    labelEmploymentType(source.employmentType),
    labelWorkModel(source.workModel)
  ].filter(Boolean);

  const listSections = [
    {
      title: "Key responsibilities",
      items: formatListItems(source.coreDuties)
    },
    {
      title: "Must-have qualifications",
      items: formatListItems(source.mustHaves)
    },
    {
      title: "Benefits & perks",
      items: formatListItems(source.benefits)
    }
  ].filter((section) => section.items.length > 0);

  const detailItems = [
    { label: "Industry", value: cleanString(source.industry) },
    { label: "Postal code", value: cleanString(source.zipCode) },
    { label: "Salary range", value: cleanString(source.salary) },
    { label: "Pay cadence", value: cleanString(source.salaryPeriod) },
    { label: "Currency", value: cleanString(source.currency) }
  ].filter((item) => item.value);

  const hasExtendedContent =
    Boolean(subtitle) ||
    Boolean(jobDescription) ||
    tags.length > 0 ||
    listSections.length > 0 ||
    detailItems.length > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto rounded-2xl border border-neutral-200 bg-white/90 p-5 shadow-sm shadow-primary-100">
        <div className="space-y-6">
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">
              Job preview
            </p>
            <h3 className="text-xl font-semibold text-neutral-900">
              {roleTitle}
            </h3>
            {subtitle ? (
              <p className="text-sm text-neutral-600">{subtitle}</p>
            ) : null}
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

          {jobDescription ? (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Role overview
              </h4>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
                {jobDescription}
              </p>
            </section>
          ) : null}

          {listSections.map((section) => (
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

          {!hasExtendedContent ? (
            <section className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-500">
              Save your progress to see a polished preview of your hiring pack.
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function WizardSuggestionPanel({
  messages,
  isLoading,
  isSending,
  onRefresh,
  onSendMessage,
  onAcceptSuggestion,
  onToggleSuggestion,
  nextStepTeaser,
  jobState,
  isJobTabEnabled
}) {
  const [draftMessage, setDraftMessage] = useState("");
  const [acceptedMap, setAcceptedMap] = useState({});
  const [activeTab, setActiveTab] = useState("chat");

  useEffect(() => {
    setAcceptedMap((prev) => {
      const next = {};
      messages.forEach((message) => {
        if (message.kind === "suggestion") {
          next[message.id] = prev[message.id] ?? false;
        }
      });
      return next;
    });
  }, [messages]);

  useEffect(() => {
    if (!isJobTabEnabled && activeTab === "job") {
      setActiveTab("chat");
    }
  }, [activeTab, isJobTabEnabled]);

  const handleSubmit = () => {
    if (!draftMessage.trim()) return;
    onSendMessage(draftMessage);
    setDraftMessage("");
  };

  const handleTabChange = (tab) => {
    if (tab === "job" && !isJobTabEnabled) {
      return;
    }
    setActiveTab(tab);
  };

  const chatTabActive = activeTab === "chat";

  return (
    <aside className="flex h-full flex-col gap-4 rounded-3xl border border-primary-100 bg-primary-50/70 p-5 shadow-sm shadow-primary-100">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-600">
            LLM Copilot
          </h2>
          <p className="text-xs text-primary-500">
            Ask questions, review suggestions, and merge updates without
            overwriting the confirmed record.
          </p>
          {nextStepTeaser ? (
            <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-primary-500">
              {nextStepTeaser}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="rounded-full border border-primary-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isLoading ? "Thinking…" : "Refresh"}
        </button>
      </header>

      <div className="rounded-full bg-white/50 p-1 text-xs font-semibold uppercase tracking-wide text-primary-500">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => handleTabChange("chat")}
            className={clsx(
              "flex-1 rounded-full px-3 py-2 transition",
              chatTabActive
                ? "bg-primary-600 text-white shadow-sm"
                : "text-primary-600 hover:bg-white"
            )}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("job")}
            disabled={!isJobTabEnabled}
            className={clsx(
              "flex-1 rounded-full px-3 py-2 transition",
              activeTab === "job"
                ? "bg-primary-600 text-white shadow-sm"
                : isJobTabEnabled
                  ? "text-primary-600 hover:bg-white"
                  : "cursor-not-allowed text-neutral-400"
            )}
          >
            Job
          </button>
        </div>
      </div>

      {chatTabActive ? (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-primary-200 bg-white/60 p-4 text-xs text-primary-500">
                Complete the fields on this screen and I’ll suggest polished values tailored to each of them.
              </p>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={clsx(
                    "max-w-full rounded-3xl border px-4 py-3 text-sm shadow-sm",
                    message.role === "user"
                      ? "ml-auto border-primary-200 bg-primary-100 text-primary-800"
                      : "mr-auto border-primary-100 bg-white text-neutral-700"
                  )}
                >
                  {message.kind === "suggestion"
                    ? renderSuggestionContent(message)
                    : !["followUp", "skip"].includes(message.kind)
                      ? (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        )
                      : null}

                  {message.kind === "suggestion" && message.meta ? (
                    <div className="mt-3 space-y-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-primary-100 px-2 py-1 font-medium text-primary-700">
                          {message.meta.fieldId}
                        </span>
                        {typeof message.meta.confidence === "number" ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-700">
                            {(message.meta.confidence * 100).toFixed(0)}% confident
                          </span>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-wrap text-neutral-500">
                        {message.meta.rationale}
                      </p>
                      <div className="space-y-2 rounded-2xl border border-primary-200 bg-primary-50/60 px-3 py-2">
                        <p className="text-xs font-medium text-primary-700">
                          {acceptedMap[message.id]
                            ? "Added to your draft."
                            : "Apply this suggestion to your form."}
                        </p>
                        <button
                          type="button"
                          className="w-full rounded-full bg-primary-600 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500"
                          onClick={() => {
                            setAcceptedMap((prev) => ({
                              ...prev,
                              [message.id]: true
                            }));
                            if (onToggleSuggestion) {
                              onToggleSuggestion(message.meta, true);
                            } else {
                              onAcceptSuggestion(message.meta);
                            }
                          }}
                        >
                          {acceptedMap[message.id] ? "Apply again" : "Apply suggestion"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {message.kind === "followUp" ? (
                    <p className="mt-2 text-xs font-medium text-primary-600">
                      Follow-up: {message.content}
                    </p>
                  ) : null}

                  {message.kind === "skip" ? (
                    <p className="mt-2 text-xs text-neutral-500">{message.content}</p>
                  ) : null}

                  {message.kind === "error" ? (
                    <p className="mt-2 text-xs text-red-500">
                      {message.content ?? "Something went wrong. Please retry."}
                    </p>
                  ) : null}
                </article>
              ))
            )}
          </div>

          <div className="space-y-3 rounded-2xl border border-primary-100 bg-white/80 p-4">
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Ask your copilot
            </label>
            <textarea
              className="h-24 w-full resize-none rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              placeholder="e.g. Draft a benefits summary tailored to senior backend engineers."
              value={draftMessage}
              onChange={(event) => setDraftMessage(event.target.value)}
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSending}
              className="w-full rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
            >
              {isSending ? "Responding…" : "Send"}
            </button>
          </div>
        </>
      ) : (
        <div className="flex-1">
          <JobPreview jobState={jobState} />
        </div>
      )}
    </aside>
  );
}
