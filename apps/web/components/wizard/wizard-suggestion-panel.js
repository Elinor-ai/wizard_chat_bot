import { useEffect, useMemo, useRef, useState } from "react";
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
  copilotConversation = [],
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
  const conversationMessages = Array.isArray(copilotConversation)
    ? copilotConversation
    : [];
  const scrollContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const chatTabActive = activeTab === "chat";

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [draftMessage]);

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

  useEffect(() => {
    if (!chatTabActive) return;
    const node = scrollContainerRef.current;
    if (node) {
      node.scrollTo({
        top: node.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [chatTabActive, messages.length, conversationMessages.length, isSending]);

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

  const suggestionMessages = useMemo(
    () => messages.filter((message) => message.kind === "suggestion"),
    [messages]
  );

  return (
    <aside className="flex h-full min-h-[520px] max-h-[calc(100vh-48px)] flex-col gap-4 overflow-hidden rounded-3xl border border-primary-100 bg-neutral-50 p-5 shadow-lg shadow-primary-50">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-700">
            Chat CoPilot
          </h2>
          <p className="text-xs text-neutral-500">
            Ask questions, review suggestions, and merge updates without
            overwriting the confirmed record.
          </p>
          {nextStepTeaser ? (
            <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-primary-500">
              {nextStepTeaser}
            </p>
          ) : null}
        </div>
      </header>

      <div className="rounded-full bg-neutral-100 p-1 text-xs font-semibold uppercase tracking-wide text-primary-500">
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
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <section className="space-y-3 rounded-3xl border border-neutral-100 bg-white px-4 py-4 shadow-inner shadow-white">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Suggestions for this step
              </p>
              <span className="text-[11px] font-semibold text-neutral-400">
                {suggestionMessages.length} active
              </span>
            </div>
            {suggestionMessages.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-neutral-200 bg-white p-4 text-xs text-neutral-500">
                Complete the fields on this screen and I’ll suggest polished values tailored to each of them.
              </p>
            ) : (
              <div className="space-y-3">
                {suggestionMessages.map((message) => (
                  <article
                    key={message.id}
                    className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700 shadow-sm"
                  >
                    {renderSuggestionContent(message)}
                    {message.meta ? (
                      <div className="mt-3 space-y-3 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-primary-50 px-2 py-1 font-medium text-primary-600">
                            {message.meta.fieldId}
                          </span>
                          {typeof message.meta.confidence === "number" ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                              {(message.meta.confidence * 100).toFixed(0)}% confident
                            </span>
                          ) : null}
                        </div>
                        {message.meta.rationale ? (
                          <p className="whitespace-pre-wrap text-neutral-500">
                            {message.meta.rationale}
                          </p>
                        ) : null}
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
                          Apply suggestion
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-neutral-100 bg-white shadow-md shadow-primary-50">
            <header className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Conversation
                </p>
                <p className="text-[11px] text-neutral-400">
                  Ask anything about this job or apply edits directly.
                </p>
              </div>
              {isSending ? (
                <span className="text-[11px] font-semibold uppercase tracking-wide text-primary-500">
                  Typing…
                </span>
              ) : null}
            </header>
            <div
              ref={scrollContainerRef}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-white px-4 py-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-200 hover:scrollbar-thumb-neutral-300"
            >
              {conversationMessages.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-neutral-200 bg-white p-4 text-xs text-neutral-500">
                  Ask your copilot for definitions, rewrites, or next steps.
                </p>
              ) : (
                conversationMessages.map((message) => (
                  <div
                    key={message.id}
                    className={clsx(
                      "flex w-full",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <article
                      className={clsx(
                        "max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm transition",
                        message.role === "user"
                          ? "rounded-br-lg bg-primary-600 text-white"
                          : message.role === "assistant"
                            ? "rounded-bl-lg border border-neutral-200 bg-neutral-100 text-neutral-800"
                            : "rounded-bl-lg border border-neutral-200 bg-neutral-100 text-neutral-600"
                      )}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      {message.metadata?.actions?.length ? (
                        <div className="mt-2 text-xs text-primary-100">
                          Applied {message.metadata.actions.length} update
                          {message.metadata.actions.length > 1 ? "s" : ""} to the form.
                        </div>
                      ) : null}
                    </article>
                  </div>
                ))
              )}
            </div>
            <footer className="border-t border-neutral-100 bg-white/95 px-3 py-2">
              <div className="flex items-center gap-2">
                <textarea
                  ref={textareaRef}
                  className="flex-1 resize-none rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 max-h-28 overflow-y-auto"
                  placeholder="Ask your copilot..."
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSubmit();
                    }
                  }}
                  rows={2}
                />
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSending || !draftMessage.trim()}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-600 text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
                  aria-label="Send message"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m22 2-7 20-4-9-9-4Z" />
                    <path d="m22 2-11 11" />
                  </svg>
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto rounded-3xl border border-neutral-100 bg-neutral-50 px-2 py-2 pr-1">
          <JobPreview jobState={jobState} />
        </div>
      )}
    </aside>
  );
}
