import { useEffect, useState } from "react";
import { clsx } from "../../lib/cn";

export function WizardSuggestionPanel({
  state,
  messages,
  isLoading,
  isSending,
  onRefresh,
  onSendMessage,
  onAcceptSuggestion,
  onToggleSuggestion,
  nextStepTeaser
}) {
  const [draftMessage, setDraftMessage] = useState("");
  const [acceptedMap, setAcceptedMap] = useState({});

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

  const handleSubmit = () => {
    if (!draftMessage.trim()) return;
    onSendMessage(draftMessage);
    setDraftMessage("");
  };

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

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-primary-200 bg-white/60 p-4 text-xs text-primary-500">
            Provide more context to unlock targeted recommendations for salary,
            benefits, and interview flow.
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
              {!["followUp", "skip"].includes(message.kind) ? (
                <p className="whitespace-pre-wrap">{message.content}</p>
              ) : null}

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
                  <div className="flex items-center justify-between gap-2 rounded-2xl border border-primary-200 bg-primary-50/60 px-3 py-2">
                    <label className="flex items-center gap-2 text-sm font-semibold text-primary-700">
                      <input
                        type="checkbox"
                        className="h-[18px] w-[18px] rounded border border-primary-400 text-primary-600 focus:ring-primary-500"
                        checked={acceptedMap[message.id] ?? false}
                        onChange={(event) => {
                          const isChecked = event.target.checked;
                          setAcceptedMap((prev) => ({
                            ...prev,
                            [message.id]: isChecked
                          }));
                          if (onToggleSuggestion) {
                            onToggleSuggestion(message.meta, isChecked);
                          } else if (isChecked) {
                            onAcceptSuggestion(message.meta);
                          }
                        }}
                      />
                      <span>
                        {acceptedMap[message.id]
                          ? "Looks good"
                          : "Skip this suggestion"}
                      </span>
                    </label>
                    <div className="flex items-center gap-3 text-base">
                      <button
                        type="button"
                        className="transition hover:scale-110"
                        onClick={() => {
                          setAcceptedMap((prev) => ({
                            ...prev,
                            [message.id]: true
                          }));
                          onAcceptSuggestion(message.meta);
                        }}
                        title="Apply again"
                      >
                        🔄
                      </button>
                    </div>
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
                  Something went wrong. Please retry.
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

      <footer className="rounded-2xl border border-primary-200 bg-white/70 p-4 text-[11px] text-neutral-500">
        <p className="font-semibold text-neutral-700">Current job snapshot</p>
        <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded-xl bg-neutral-100 p-3 text-[10px] text-neutral-600">
{JSON.stringify(state, null, 2)}
        </pre>
      </footer>
    </aside>
  );
}
