/* eslint-disable react/no-array-index-key */
"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WizardApi } from "../../lib/api-client";
import { clsx } from "../../lib/cn";
import { WizardSuggestionPanel } from "./wizard-suggestion-panel";
import { useUser } from "../user-context";

const REQUIRED_STEPS = [
  {
    id: "core-details",
    title: "Core details",
    fields: [
      {
        id: "title",
        label: "Job title",
        required: true,
        placeholder: "Provide the job title."
      },
      {
        id: "location",
        label: "Location",
        required: true,
        placeholder: "Specify the primary location (e.g., Remote, NY, USA)."
      },
      {
        id: "employmentType",
        label: "Employment type",
        required: true,
        placeholder: "Indicate employment type (full-time, part-time, etc.)."
      }
    ]
  },
  {
    id: "requirements",
    title: "Minimum requirements",
    fields: [
      {
        id: "mustHaves",
        label: "Must-haves",
        required: true,
        placeholder: "List essential requirements, one per line."
      },
      {
        id: "roleCategory",
        label: "Role category",
        required: true,
        placeholder: "Describe the role category or department."
      }
    ]
  }
];

const OPTIONAL_STEPS = [
  {
    id: "salary",
    title: "Compensation",
    fields: [
      {
        id: "salary_min",
        label: "Minimum monthly salary (£)",
        required: false,
        placeholder: "e.g. 2100"
      },
      {
        id: "salary_max",
        label: "Maximum monthly salary (£)",
        required: false,
        placeholder: "e.g. 2600"
      },
      {
        id: "benefits",
        label: "Benefits",
        required: false,
        placeholder: "Highlight benefits offered, one per line."
      }
    ]
  },
  {
    id: "additional",
    title: "Additional context",
    fields: [
      {
        id: "hybrid_details",
        label: "Hybrid/on-site details",
        required: false,
        placeholder: "Explain hybrid expectations or note on-site requirements."
      },
      {
        id: "niceToHaves",
        label: "Nice-to-haves",
        required: false,
        placeholder: "Add preferred qualifications or bonus skills."
      },
      {
        id: "experienceLevel",
        label: "Experience level",
        required: false,
        placeholder: "Indicate target experience level (e.g., mid, senior)."
      }
    ]
  }
];

export function WizardShell() {
  const { user } = useUser();
  const [state, setState] = useState({});
  const [draftId, setDraftId] = useState(null);
  const [includeOptional, setIncludeOptional] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
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
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [skippedFields, setSkippedFields] = useState({});

  const steps = useMemo(
    () => (includeOptional ? [...REQUIRED_STEPS, ...OPTIONAL_STEPS] : REQUIRED_STEPS),
    [includeOptional]
  );

  const currentStep = steps[currentStepIndex];
  const showOptionalDecision =
    !includeOptional && currentStepIndex === REQUIRED_STEPS.length - 1;
  const isLastStep = currentStepIndex === steps.length - 1;

  const persistMutation = useMutation({
    mutationFn: ({ state: draftState, userId, jobId, intent, currentStepId }) =>
      WizardApi.persistDraft(draftState, {
        userId,
        jobId,
        intent,
        currentStepId
      })
  });

  const onFieldChange = (fieldId, value) => {
    setState((prev) => ({ ...prev, [fieldId]: value }));
  };

  useEffect(() => {
    setSkippedFields({});
    setAssistantMessages((prev) =>
      prev.filter((message) => !["suggestion", "followUp", "skip"].includes(message.kind))
    );
  }, [currentStepIndex]);

  const announceAuthRequired = useCallback(() => {
    setAssistantMessages((prev) => [
      ...prev,
      {
        id: `auth-${Date.now()}`,
        role: "assistant",
        kind: "error",
        content: "Please sign in to continue working on this draft."
      }
    ]);
  }, []);

  const fetchSuggestionsForStep = useCallback(
    async (stepId = currentStep?.id, intentOverrides = {}, jobIdOverride) => {
      if (!user || !stepId) {
        if (!user) {
          announceAuthRequired();
        }
        return;
      }

      const effectiveJobId = jobIdOverride ?? draftId;
      if (!effectiveJobId) {
        return;
      }

      setIsFetchingSuggestions(true);
      try {
        const response = await WizardApi.fetchSuggestions(
          {
            state,
            currentStepId: stepId,
            intent: { includeOptional, ...intentOverrides }
          },
          { userId: user.id, jobId: effectiveJobId }
        );

        const skipMap = {};
        (response.skip ?? []).forEach((item) => {
          skipMap[item.fieldId] = item.reason;
        });
        setSkippedFields(skipMap);

        setAssistantMessages((prev) => {
          const base = prev.filter(
            (message) => !["suggestion", "followUp", "skip"].includes(message.kind)
          );

          const suggestionMessages = (response.suggestions ?? []).map((suggestion) => ({
            id: suggestion.id,
            role: "assistant",
            kind: "suggestion",
            content:
              typeof suggestion.proposal === "string" || typeof suggestion.proposal === "number"
                ? String(suggestion.proposal)
                : JSON.stringify(suggestion.proposal),
            meta: suggestion
          }));

          const followUps = (response.followUpToUser ?? []).map((text, index) => ({
            id: `follow-up-${Date.now()}-${index}`,
            role: "assistant",
            kind: "followUp",
            content: text
          }));

          const skipMessages = (response.skip ?? []).map((item, index) => ({
            id: `skip-${item.fieldId}-${index}`,
            role: "assistant",
            kind: "skip",
            content: `Skipped ${item.fieldId}: ${item.reason}`,
            meta: item
          }));

          return [...base, ...suggestionMessages, ...followUps, ...skipMessages];
        });
      } catch (error) {
        setAssistantMessages((prev) => [
          ...prev,
          {
            id: `suggestion-error-${Date.now()}`,
            role: "assistant",
            kind: "error",
            content: error.message ?? "Failed to load suggestions."
          }
        ]);
      } finally {
        setIsFetchingSuggestions(false);
      }
    },
    [announceAuthRequired, currentStep?.id, draftId, includeOptional, state, user]
  );

  const persistCurrentDraft = useCallback(
    async (intentOverrides = {}, stepId = currentStep?.id) => {
      if (!user) {
        announceAuthRequired();
        return null;
      }

      const intent = { includeOptional, ...intentOverrides };

      try {
        const response = await persistMutation.mutateAsync({
          state,
          userId: user.id,
          jobId: draftId,
          intent,
          currentStepId: stepId
        });

        if (response?.draftId) {
          setDraftId(response.draftId);
        }

        return { savedId: response?.draftId ?? draftId, intent };
      } catch (error) {
        setAssistantMessages((prev) => [
          ...prev,
          {
            id: `persist-error-${Date.now()}`,
            role: "assistant",
            kind: "error",
            content: error.message ?? "Failed to save the draft."
          }
        ]);
        return null;
      }
    },
    [announceAuthRequired, currentStep?.id, draftId, includeOptional, persistMutation, state, user]
  );

  const handleNext = async () => {
    if (currentStepIndex >= steps.length - 1) {
      return;
    }

    const stepId = currentStep?.id;
    const result = await persistCurrentDraft({}, stepId);
    if (!result) {
      return;
    }

    const nextIndex = currentStepIndex + 1;
    const nextStep = steps[nextIndex] ?? steps[steps.length - 1];

    setCurrentStepIndex(nextIndex);
    await fetchSuggestionsForStep(nextStep?.id ?? stepId, result.intent, result.savedId);
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((index) => index - 1);
    }
  };

  const handleSubmit = async (submissionIntent = {}) => {
    const stepId = currentStep?.id;
    const result = await persistCurrentDraft(
      {
        optionalCompleted: includeOptional,
        ...submissionIntent
      },
      stepId
    );

    if (!result) {
      return;
    }

    setAssistantMessages((prev) => [
      ...prev,
      {
        id: `saved-${Date.now()}`,
        role: "assistant",
        kind: "info",
        content: "Draft saved. Copilot will continue enriching your inputs."
      }
    ]);

    await fetchSuggestionsForStep(stepId, result.intent, result.savedId);
  };

  const handleAddOptional = async () => {
    const stepId = currentStep?.id;
    const result = await persistCurrentDraft({}, stepId);
    if (!result) {
      return;
    }

    const nextIntent = { ...result.intent, includeOptional: true };
    setIncludeOptional(true);
    const nextIndex = REQUIRED_STEPS.length;
    const optionalFlowSteps = [...REQUIRED_STEPS, ...OPTIONAL_STEPS];
    const nextStep = optionalFlowSteps[nextIndex];
    setCurrentStepIndex(nextIndex);
    await fetchSuggestionsForStep(nextStep?.id ?? "salary", nextIntent, result.savedId);
  };

  const handleAcceptSuggestion = async (suggestion) => {
    if (!user || !draftId) {
      announceAuthRequired();
      return;
    }

    const value =
      typeof suggestion.proposal === "string" || typeof suggestion.proposal === "number"
        ? String(suggestion.proposal)
        : JSON.stringify(suggestion.proposal);

    setState((prev) => ({
      ...prev,
      [suggestion.fieldId]: value
    }));

    try {
      await WizardApi.mergeSuggestion(
        {
          jobId: draftId,
          fieldId: suggestion.fieldId,
          value: suggestion.proposal
        },
        { userId: user.id }
      );
      await fetchSuggestionsForStep(currentStep?.id);
    } catch (error) {
      setAssistantMessages((prev) => [
        ...prev,
        {
          id: `merge-error-${Date.now()}`,
          role: "assistant",
          kind: "error",
          content: error.message ?? "Failed to merge the suggestion."
        }
      ]);
    }
  };

  const handleSendMessage = async (message) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    if (!user) {
      announceAuthRequired();
      return;
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      kind: "user",
      content: trimmed
    };

    setAssistantMessages((prev) => [...prev, userMessage]);
    setIsChatting(true);

    try {
      const response = await WizardApi.sendChatMessage(
        {
          jobId: draftId ?? undefined,
          userMessage: trimmed,
          intent: { currentStepId: currentStep?.id }
        },
        { userId: user.id }
      );

      setAssistantMessages((prev) => [
        ...prev,
        {
          id: `chat-${Date.now()}`,
          role: "assistant",
          kind: "reply",
          content: response.assistantMessage
        }
      ]);
    } catch (error) {
      setAssistantMessages((prev) => [
        ...prev,
        {
          id: `chat-error-${Date.now()}`,
          role: "assistant",
          kind: "error",
          content: error.message ?? "I ran into an issue processing that request."
        }
      ]);
    } finally {
      setIsChatting(false);
    }
  };

  if (!user) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-10 text-center text-neutral-600 shadow-sm shadow-neutral-100">
        Please sign in to build a job brief. Once authenticated, your wizard drafts will be saved
        to Firestore and synced across the console.
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
          {currentStep.fields.map((field) => {
            const skipReason = skippedFields[field.id];
            return (
              <label
                key={field.id}
                className="flex flex-col gap-2 text-sm font-medium text-neutral-700"
              >
                <span>
                  {field.label}
                  {field.required ? <span className="ml-1 text-primary-600">*</span> : null}
                </span>
                <textarea
                  className={clsx(
                    "rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100",
                    skipReason ? "bg-neutral-100 text-neutral-400" : ""
                  )}
                  placeholder={field.placeholder}
                  value={state[field.id] ?? ""}
                  onChange={(event) => onFieldChange(field.id, event.target.value)}
                  rows={field.id === "title" ? 1 : 3}
                  disabled={Boolean(skipReason)}
                  title={skipReason ? `Skipped: ${skipReason}` : undefined}
                />
                {skipReason ? (
                  <span className="text-xs font-medium text-amber-600">
                    Skipped: {skipReason}
                  </span>
                ) : null}
              </label>
            );
          })}
        </form>

        {showOptionalDecision ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-primary-50/50 p-4 text-sm">
            <p className="text-neutral-600">
              Optional details unlock richer enrichment and campaign recommendations. Would you like
              to add them now?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleAddOptional}
                className="rounded-full border border-primary-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-600 transition hover:bg-primary-100"
              >
                Add optional fields
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSubmit({
                    includeOptional: false,
                    optionalCompleted: false
                  })
                }
                className="rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500"
              >
                Generate now
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              disabled={currentStepIndex === 0}
              className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 transition hover:border-primary-500 hover:text-primary-600 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
            >
              Back
            </button>
            {isLastStep ? (
              <button
                type="button"
                onClick={() =>
                  handleSubmit({
                    includeOptional: true,
                    optionalCompleted: true
                  })
                }
                disabled={persistMutation.isPending}
                className="rounded-full bg-primary-600 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
              >
                {persistMutation.isPending ? "Saving…" : "Submit for Generation"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="rounded-full bg-primary-600 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500"
              >
                Next
              </button>
            )}
          </div>
        )}
      </div>

      <WizardSuggestionPanel
        state={state}
        messages={assistantMessages}
        onRefresh={() => fetchSuggestionsForStep(currentStep?.id)}
        onSendMessage={handleSendMessage}
        onAcceptSuggestion={handleAcceptSuggestion}
        isLoading={isFetchingSuggestions}
        isSending={isChatting}
      />
    </div>
  );
}
