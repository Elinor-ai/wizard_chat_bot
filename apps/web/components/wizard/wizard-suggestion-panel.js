import { useCallback, useEffect, useRef, useState } from "react";
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
  intern: "Internship",
  gig: "Gig / Freelance"
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

function TypingIndicatorBubble() {
  return (
    <div className="flex w-full justify-start">
      <article className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-100 px-4 py-3 text-sm text-neutral-600 shadow-sm">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          Typing
        </span>
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((index) => (
            <span
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              className="h-2 w-2 rounded-full bg-primary-300 opacity-80 animate-bounce"
              style={{ animationDelay: `${index * 0.15}s` }}
            />
          ))}
        </div>
      </article>
    </div>
  );
}

const CHAT_DRAFT_STORAGE_PREFIX = "wizard/chatDraft/";
const CHAT_FOCUS_STORAGE_PREFIX = "wizard/chatFocus/";

function normalizeStageKey(stage) {
  if (!stage || typeof stage !== "string") {
    return "wizard";
  }
  return stage.trim().toLowerCase();
}

function getDraftStorageKey(jobId, stage) {
  const normalizedStage = normalizeStageKey(stage);
  return `${CHAT_DRAFT_STORAGE_PREFIX}${normalizedStage}/${jobId ?? "new"}`;
}

function getFocusStorageKey(jobId, stage) {
  const normalizedStage = normalizeStageKey(stage);
  return `${CHAT_FOCUS_STORAGE_PREFIX}${normalizedStage}/${jobId ?? "new"}`;
}

function readDraftFromStorage(storageKey) {
  if (typeof window === "undefined" || !storageKey) {
    return "";
  }
  try {
    return window.sessionStorage.getItem(storageKey) ?? "";
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Failed to read chat draft", error);
    return "";
  }
}

function persistDraft(storageKey, value) {
  if (typeof window === "undefined" || !storageKey) {
    return;
  }
  try {
    if (value) {
      window.sessionStorage.setItem(storageKey, value);
    } else {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Failed to persist chat draft", error);
  }
}

const PANEL_STYLE = {
  minHeight: "520px",
  maxHeight: "880px",
  height: "calc(100vh - 48px)"
};

export function WizardSuggestionPanel({
  jobId,
  copilotConversation = [],
  isSending,
  onSendMessage,
  nextStepTeaser,
  jobState,
  isJobTabEnabled,
  stage = "wizard"
}) {
  const draftStorageKey = getDraftStorageKey(jobId, stage);
  const focusStorageKey = getFocusStorageKey(jobId, stage);
  const [draftMessage, setDraftMessage] = useState(() =>
    readDraftFromStorage(draftStorageKey)
  );
  const lastStorageKeyRef = useRef(draftStorageKey);
  const [activeTab, setActiveTab] = useState("chat");
  const conversationMessages = Array.isArray(copilotConversation)
    ? copilotConversation
    : [];
  const scrollContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const shouldMaintainFocusRef = useRef(false);
  const chatTabActive = activeTab === "chat";

  const focusTextarea = useCallback(() => {
    if (!textareaRef.current) return;
    textareaRef.current.focus();
    const cursorPos = draftMessage.length;
    try {
      textareaRef.current.setSelectionRange(cursorPos, cursorPos);
    } catch (error) {
      // Ignore selection errors (e.g., non-text inputs)
    }
  }, [draftMessage.length]);

  useEffect(() => {
    const prevKey = lastStorageKeyRef.current;
    if (prevKey === draftStorageKey) {
      return;
    }

    let nextDraft = draftMessage;
    if (typeof window !== "undefined") {
      const stored = window.sessionStorage.getItem(draftStorageKey);
      if (stored !== null) {
        nextDraft = stored;
      } else if (prevKey) {
        const prevValue = window.sessionStorage.getItem(prevKey);
        if (prevValue !== null) {
          nextDraft = prevValue;
          window.sessionStorage.setItem(draftStorageKey, prevValue);
        }
      }
    }
    lastStorageKeyRef.current = draftStorageKey;
    setDraftMessage(nextDraft);
  }, [draftStorageKey]);

  useEffect(() => {
    persistDraft(draftStorageKey, draftMessage);
  }, [draftMessage, draftStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let storedFocus = false;
    try {
      storedFocus = window.sessionStorage.getItem(focusStorageKey) === "1";
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to read chat focus flag", error);
    }
    shouldMaintainFocusRef.current = storedFocus;
    if (storedFocus) {
      focusTextarea();
    }

    return () => {
      if (!shouldMaintainFocusRef.current) {
        try {
          window.sessionStorage.removeItem(focusStorageKey);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn("Failed to clear chat focus flag", error);
        }
        return;
      }
      try {
        window.sessionStorage.setItem(focusStorageKey, "1");
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("Failed to persist chat focus", error);
      }
    };
  }, [focusStorageKey, focusTextarea]);

  useEffect(() => {
    if (!shouldMaintainFocusRef.current) {
      return;
    }
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    if (document.activeElement === textarea) {
      return;
    }
    focusTextarea();
  }, [conversationMessages.length, chatTabActive, focusTextarea]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    // eslint-disable-next-line no-console
    console.log("[WizardSuggestionPanel] conversation:update", {
      count: conversationMessages.length,
      ids: conversationMessages.map((message) => message.id),
    });
  }, [conversationMessages]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [draftMessage]);

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
  }, [chatTabActive, conversationMessages.length, isSending]);

  const handleSubmit = () => {
    if (isSending) return;
    if (!draftMessage.trim()) return;
    const trimmed = draftMessage.trim();
    onSendMessage(trimmed, { stage });
    setDraftMessage("");
  };

  const handleTextareaFocus = useCallback(() => {
    shouldMaintainFocusRef.current = true;
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.sessionStorage.setItem(focusStorageKey, "1");
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to persist chat focus flag", error);
    }
  }, [focusStorageKey]);

  const handleTextareaBlur = useCallback(() => {
    shouldMaintainFocusRef.current = false;
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.sessionStorage.removeItem(focusStorageKey);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to clear chat focus flag", error);
    }
  }, [focusStorageKey]);

  const handleTabChange = (tab) => {
    if (tab === "job" && !isJobTabEnabled) {
      return;
    }
    setActiveTab(tab);
  };

  return (
    <aside
      className="flex flex-col gap-4 overflow-hidden rounded-3xl border border-primary-100 bg-neutral-50 p-5 shadow-lg shadow-primary-50"
      style={PANEL_STYLE}
    >
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
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-neutral-100 bg-white shadow-md shadow-primary-50">
            <header className="border-b border-neutral-100 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Conversation
              </p>
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
                        <div className="mt-2 text-xs text-primary-300">
                          Applied {message.metadata.actions.length} update
                          {message.metadata.actions.length > 1 ? "s" : ""} to the form.
                        </div>
                      ) : null}
                    </article>
                  </div>
                ))
              )}
              {isSending ? <TypingIndicatorBubble /> : null}
            </div>
            <footer className="border-t border-neutral-100 bg-white/95 px-3 py-2">
              <div className="flex items-center gap-2">
                <textarea
                  ref={textareaRef}
                  className="flex-1 resize-none rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 max-h-28 overflow-y-auto"
                  placeholder="Ask your copilot..."
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  onFocus={handleTextareaFocus}
                  onBlur={handleTextareaBlur}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (!isSending) {
                        handleSubmit();
                      }
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
      ) : (
        <div className="flex-1 overflow-y-auto rounded-3xl border border-neutral-100 bg-neutral-50 px-2 py-2 pr-1">
          <JobPreview jobState={jobState} />
        </div>
      )}
    </aside>
  );
}
