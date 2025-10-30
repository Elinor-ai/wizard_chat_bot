/* eslint-disable react/no-array-index-key */
"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { WizardApi } from "../../lib/api-client";
import { clsx } from "../../lib/cn";
import { WizardSuggestionPanel } from "./wizard-suggestion-panel";
import { useUser } from "../user-context";

const steps = [
  {
    id: "core-details",
    title: "Core details",
    fields: [
      {
        id: "title",
        label: "Job title",
        required: true,
        placeholder: "Senior Backend Engineer"
      },
      {
        id: "location",
        label: "Location",
        required: true,
        placeholder: "Remote (USA)"
      },
      {
        id: "employmentType",
        label: "Employment type",
        required: true,
        placeholder: "Full-time"
      }
    ]
  },
  {
    id: "compensation",
    title: "Compensation",
    fields: [
      {
        id: "salaryRange",
        label: "Salary range",
        required: false,
        placeholder: "$140k – $190k + equity"
      },
      {
        id: "benefits",
        label: "Benefits",
        required: false,
        placeholder: "Healthcare, 401k match, wellness stipend"
      }
    ]
  },
  {
    id: "requirements",
    title: "Requirements",
    fields: [
      {
        id: "mustHaves",
        label: "Must-haves",
        required: true,
        placeholder: "8+ years building distributed systems"
      },
      {
        id: "niceToHaves",
        label: "Nice-to-haves",
        required: false,
        placeholder: "Experience with event-driven architectures"
      }
    ]
  }
];

export function WizardShell() {
  const { user } = useUser();
  const [state, setState] = useState({});
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [draftId, setDraftId] = useState(null);
  const [assistantMessages, setAssistantMessages] = useState([
    {
      id: "intro",
      role: "assistant",
      kind: "info",
      content:
        "Hi! I’m your recruiting copilot. Ask for market data, salary bands, or copy tweaks any time."
    }
  ]);
  const [isChatting, setIsChatting] = useState(false);

  const suggestionQuery = useQuery({
    queryKey: ["wizard", "suggestions", draftId, user?.id],
    queryFn: () => {
      if (!user) {
        throw new Error("User not authenticated");
      }
      return WizardApi.fetchSuggestions(
        { state },
        { userId: user.id, jobId: draftId }
      );
    },
    enabled: false,
    staleTime: 5_000
  });

  const persistMutation = useMutation({
    mutationFn: (payload) =>
      WizardApi.persistDraft(payload.state, {
        userId: payload.userId,
        jobId: payload.jobId
      })
  });

  const currentStep = steps[currentStepIndex];

  const onFieldChange = (fieldId, value) => {
    setState((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((index) => index + 1);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((index) => index - 1);
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      setAssistantMessages((prev) => [
        ...prev,
        {
          id: `auth-${Date.now()}`,
          role: "assistant",
          kind: "error",
          content: "Please sign in to submit this draft."
        }
      ]);
      return;
    }

    try {
      const result = await persistMutation.mutateAsync({
        state,
        userId: user.id,
        jobId: draftId
      });
      setDraftId(result.draftId);
      setAssistantMessages((prev) => [
        ...prev,
        {
          id: `saved-${Date.now()}`,
          role: "assistant",
          kind: "info",
          content: "Draft saved to Firestore. Check the Assets tab for the generated description."
        }
      ]);
      suggestionQuery.refetch();
    } catch (error) {
      setAssistantMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          kind: "error",
          content: error.message ?? "Failed to save the draft."
        }
      ]);
    }
  };

  useEffect(() => {
    if (!suggestionQuery.data?.suggestions) {
      return;
    }
    setAssistantMessages((prev) => {
      const preserved = prev.filter((message) => message.kind !== "suggestion");
      const suggestionMessages = suggestionQuery.data.suggestions.map(
        (suggestion) => ({
          id: suggestion.id,
          role: "assistant",
          kind: "suggestion",
          content: suggestion.proposal,
          meta: suggestion
        })
      );
      return [...preserved, ...suggestionMessages];
    });
  }, [suggestionQuery.data]);

  const handleAcceptSuggestion = async (suggestion) => {
    if (!user) {
      return;
    }
    await WizardApi.mergeSuggestion(suggestion, {
      userId: user.id,
      jobId: draftId
    });
    setState((prev) => ({
      ...prev,
      [suggestion.fieldId]: suggestion.proposal
    }));
    setAssistantMessages((prev) => [
      ...prev,
      {
        id: `${suggestion.id}-ack`,
        role: "assistant",
        kind: "ack",
        content: `Merged the suggestion into ${suggestion.fieldId}.`
      }
    ]);
    suggestionQuery.refetch();
  };

  const handleSendMessage = async (message) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    if (!user) {
      setAssistantMessages((prev) => [
        ...prev,
        {
          id: `auth-${Date.now()}`,
          role: "assistant",
          kind: "error",
          content: "Please sign in to chat with the copilot."
        }
      ]);
      return;
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      kind: "user",
      content: trimmed
    };

    const historyPayload = [...assistantMessages, userMessage]
      .filter((msg) => msg.role === "assistant" || msg.role === "user")
      .map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content
      }));

    setAssistantMessages((prev) => [...prev, userMessage]);
    setIsChatting(true);
    try {
      const response = await WizardApi.sendChatMessage(
        {
          message: trimmed,
          history: historyPayload
        },
        { userId: user.id }
      );
      setAssistantMessages((prev) => [
        ...prev,
        {
          id: response.id,
          role: "assistant",
          kind: "reply",
          content: response.reply
        }
      ]);
    } catch (error) {
      setAssistantMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          kind: "error",
          content:
            "I ran into an issue processing that request. Please try again."
        }
      ]);
    } finally {
      setIsChatting(false);
    }
  };

  if (!user) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-10 text-center text-neutral-600 shadow-sm shadow-neutral-100">
        Please sign in to build a job brief. Once authenticated, your wizard
        drafts will be saved to Firestore and synced across the console.
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
        <nav className="flex flex-wrap items-center gap-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
          {steps.map((step, index) => (
            <span
              key={step.id}
              className={clsx(
                "rounded-full border px-3 py-1",
                index === currentStepIndex
                  ? "border-primary-400 bg-primary-50 text-primary-600"
                  : "border-neutral-200 bg-neutral-50"
              )}
            >
              {index + 1}. {step.title}
            </span>
          ))}
        </nav>

        <form className="grid gap-4">
          {currentStep.fields.map((field) => (
            <label
              key={field.id}
              className="flex flex-col gap-2 text-sm font-medium text-neutral-700"
            >
              <span>
                {field.label}
                {field.required ? (
                  <span className="ml-1 text-primary-600">*</span>
                ) : null}
              </span>
              <textarea
                className="rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                placeholder={field.placeholder}
                value={state[field.id] ?? ""}
                onChange={(event) => onFieldChange(field.id, event.target.value)}
                rows={field.id === "title" ? 1 : 3}
              />
            </label>
          ))}
        </form>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            disabled={currentStepIndex === 0}
            className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 transition hover:border-primary-500 hover:text-primary-600 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
          >
            Back
          </button>
          {currentStepIndex < steps.length - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              className="rounded-full bg-primary-600 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={persistMutation.isPending}
              className="rounded-full bg-primary-600 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
            >
              {persistMutation.isPending ? "Saving…" : "Submit for Generation"}
            </button>
          )}
        </div>
      </div>

      <WizardSuggestionPanel
        state={state}
        messages={assistantMessages}
        onRefresh={() => suggestionQuery.refetch()}
        onSendMessage={handleSendMessage}
        onAcceptSuggestion={handleAcceptSuggestion}
        isLoading={suggestionQuery.isFetching}
        isSending={isChatting}
      />
    </div>
  );
}
