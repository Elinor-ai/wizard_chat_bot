/* eslint-disable react/no-array-index-key */
"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WizardApi } from "../../lib/api-client";
import { clsx } from "../../lib/cn";
import { WizardSuggestionPanel } from "./wizard-suggestion-panel";
import { useUser } from "../user-context";

const WORK_MODEL_OPTIONS = [
  { value: "on_site", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" }
];

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "temp", label: "Temporary" },
  { value: "intern", label: "Internship" }
];

const SALARY_PERIOD_OPTIONS = [
  { value: "hour", label: "Per hour" },
  { value: "month", label: "Per month" },
  { value: "year", label: "Per year" }
];

const APPLY_METHOD_OPTIONS = [
  { value: "internal_form", label: "Internal form" },
  { value: "external_link", label: "External link" },
  { value: "both", label: "Internal form + external link" }
];

const EXPERIENCE_LEVEL_OPTIONS = [
  { value: "entry", label: "Entry level" },
  { value: "mid", label: "Mid level" },
  { value: "senior", label: "Senior" }
];

const REQUIRED_STEPS = [
  {
    id: "role-basics",
    title: "Role basics",
    fields: [
      {
        id: "title",
        label: "Job title",
        required: true,
        placeholder: "e.g. Senior Backend Engineer",
        type: "text",
        maxLength: 120
      },
      {
        id: "roleCategory",
        label: "Role category / department",
        required: true,
        placeholder: "e.g. Engineering, Customer Success",
        type: "text"
      }
    ]
  },
  {
    id: "location-model",
    title: "Location & model",
    fields: [
      {
        id: "location.city",
        label: "Primary city",
        required: true,
        placeholder: "e.g. Tel Aviv",
        type: "text"
      },
      {
        id: "location.country",
        label: "Country (ISO-2)",
        required: true,
        placeholder: "e.g. IL",
        type: "text",
        maxLength: 2
      },
      {
        id: "workModel",
        label: "Work model",
        required: true,
        type: "select",
        options: WORK_MODEL_OPTIONS
      }
    ]
  },
  {
    id: "employment-overview",
    title: "Employment overview",
    fields: [
      {
        id: "employmentType",
        label: "Employment type",
        required: true,
        type: "select",
        options: EMPLOYMENT_TYPE_OPTIONS
      },
      {
        id: "description",
        label: "Role summary",
        required: true,
        placeholder: "Outline mission, responsibilities, and key outcomes.",
        type: "textarea",
        rows: 5
      }
    ]
  }
];

const OPTIONAL_STEPS = [
  {
    id: "requirements-skills",
    title: "Requirements & skills",
    fields: [
      {
        id: "requirements.mustHave",
        label: "Must-have skills",
        required: false,
        placeholder: "List essential qualifications, one per line.",
        type: "textarea",
        rows: 4
      },
      {
        id: "requirements.niceToHave",
        label: "Nice-to-have skills",
        required: false,
        placeholder: "Optional stretch skills or bonuses.",
        type: "textarea",
        rows: 4
      },
      {
        id: "experienceLevel",
        label: "Target experience level",
        required: false,
        type: "select",
        options: EXPERIENCE_LEVEL_OPTIONS
      },
      {
        id: "language",
        label: "Primary language tag",
        required: false,
        placeholder: "e.g. en-US, he-IL",
        type: "text"
      }
    ]
  },
  {
    id: "compensation-benefits",
    title: "Compensation & benefits",
    fields: [
      {
        id: "salary.currency",
        label: "Currency (ISO-4217)",
        required: false,
        placeholder: "e.g. USD",
        type: "text",
        maxLength: 3
      },
      {
        id: "salary.min",
        label: "Minimum compensation",
        required: false,
        placeholder: "e.g. 24000",
        type: "number",
        valueAs: "number"
      },
      {
        id: "salary.max",
        label: "Maximum compensation",
        required: false,
        placeholder: "e.g. 31000",
        type: "number",
        valueAs: "number"
      },
      {
        id: "salary.period",
        label: "Compensation period",
        required: false,
        type: "select",
        options: SALARY_PERIOD_OPTIONS
      },
      {
        id: "salary.overtime",
        label: "Overtime eligible",
        required: false,
        type: "select",
        options: [
          { value: "true", label: "Yes" },
          { value: "false", label: "No" }
        ],
        valueAs: "boolean"
      },
      {
        id: "benefits",
        label: "Benefits",
        required: false,
        placeholder: "List benefits (comma separated or one per line).",
        type: "textarea",
        rows: 4
      }
    ]
  },
  {
    id: "schedule-availability",
    title: "Schedule & logistics",
    fields: [
      {
        id: "schedule",
        label: "Schedule / shifts",
        required: false,
        placeholder: "e.g. Sunday-Thursday, core hours 09:00-18:00",
        type: "textarea",
        rows: 3
      },
      {
        id: "licenses",
        label: "Required licenses",
        required: false,
        placeholder: "List any mandatory certifications or licenses.",
        type: "textarea",
        rows: 3
      },
      {
        id: "location.radiusKm",
        label: "Hiring radius (km)",
        required: false,
        placeholder: "e.g. 25",
        type: "number",
        valueAs: "number"
      }
    ]
  },
  {
    id: "application-flow",
    title: "Application flow",
    fields: [
      {
        id: "applyMethod",
        label: "How should candidates apply?",
        required: false,
        type: "select",
        options: APPLY_METHOD_OPTIONS
      },
      {
        id: "applicationFormId",
        label: "Internal form ID",
        required: false,
        placeholder: "Reference to your internal form (optional).",
        type: "text"
      },
      {
        id: "externalApplyUrl",
        label: "External apply URL",
        required: false,
        placeholder: "https://careers.company.com/jobs/backend-senior",
        type: "text"
      }
    ]
  },
  {
    id: "brand-voice",
    title: "Brand & tone",
    fields: [
      {
        id: "brand.logoUrl",
        label: "Logo URL",
        required: false,
        placeholder: "https://cdn.company.com/logo.svg",
        type: "text"
      },
      {
        id: "brand.color",
        label: "Primary brand color",
        required: false,
        placeholder: "#4338ca",
        type: "text"
      },
      {
        id: "brand.tone",
        label: "Voice & tone guidance",
        required: false,
        placeholder: "e.g. Confident, data-driven, people-first.",
        type: "textarea",
        rows: 3
      },
      {
        id: "industry",
        label: "Industry",
        required: false,
        placeholder: "e.g. Technology, Hospitality",
        type: "text"
      },
      {
        id: "notesCompliance",
        label: "Compliance notes / legal copy",
        required: false,
        placeholder: "Add equal opportunity statements or legal requirements.",
        type: "textarea",
        rows: 3
      }
    ]
  },
  {
    id: "location-precision",
    title: "Location precision",
    fields: [
      {
        id: "location.geo.latitude",
        label: "Latitude",
        required: false,
        placeholder: "e.g. 32.0853",
        type: "number",
        valueAs: "number",
        step: "any"
      },
      {
        id: "location.geo.longitude",
        label: "Longitude",
        required: false,
        placeholder: "e.g. 34.7818",
        type: "number",
        valueAs: "number",
        step: "any"
      }
    ]
  }
];

function findFieldDefinition(fieldId) {
  for (const step of [...REQUIRED_STEPS, ...OPTIONAL_STEPS]) {
    const match = step.fields.find((field) => field.id === fieldId);
    if (match) {
      return match;
    }
  }
  return null;
}

function isFieldValueProvided(value, field) {
  if (field?.valueAs === "boolean") {
    return value === true || value === false;
  }
  if (field?.type === "number" || field?.valueAs === "number") {
    return value !== undefined && value !== null && value !== "";
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return value !== undefined && value !== null;
}

function isStepComplete(step, data) {
  const requiredFields = step.fields.filter((field) => field.required);
  const optionalFields = step.fields.filter((field) => !field.required);

  if (requiredFields.length > 0) {
    return requiredFields.every((field) =>
      isFieldValueProvided(data[field.id], field)
    );
  }

  if (optionalFields.length > 0) {
    return optionalFields.some((field) =>
      isFieldValueProvided(data[field.id], field)
    );
  }

  return false;
}

export function WizardShell() {
  const { user } = useUser();
  const [state, setState] = useState({});
  const [committedState, setCommittedState] = useState({});
  const [draftId, setDraftId] = useState(null);
  const [includeOptional, setIncludeOptional] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [maxVisitedIndex, setMaxVisitedIndex] = useState(0);
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

  const allRequiredStepsCompleteInState = useMemo(
    () => REQUIRED_STEPS.every((step) => isStepComplete(step, state)),
    [state]
  );

  const isCurrentStepRequired = currentStepIndex < REQUIRED_STEPS.length;

  const currentRequiredStepCompleteInState = useMemo(() => {
    if (!currentStep) return false;
    if (!isCurrentStepRequired) return true;
    return isStepComplete(currentStep, state);
  }, [currentStep, isCurrentStepRequired, state]);

  const stepMetrics = useMemo(() => {
    return steps.map((step) => {
      const requiredFieldsInStep = step.fields.filter((field) => field.required);
      const optionalFieldsInStep = step.fields.filter((field) => !field.required);
      const requiredCompletedCount = requiredFieldsInStep.reduce(
        (count, field) =>
          count + (isFieldValueProvided(committedState[field.id], field) ? 1 : 0),
        0
      );
      const optionalCompletedCount = optionalFieldsInStep.reduce(
        (count, field) =>
          count + (isFieldValueProvided(committedState[field.id], field) ? 1 : 0),
        0
      );

      const stepComplete =
        (requiredFieldsInStep.length > 0 &&
          requiredCompletedCount === requiredFieldsInStep.length) ||
        (requiredFieldsInStep.length === 0 &&
          optionalFieldsInStep.length > 0 &&
          optionalCompletedCount > 0);

      return {
        stepId: step.id,
        requiredCount: requiredFieldsInStep.length,
        requiredCompletedCount,
        optionalCount: optionalFieldsInStep.length,
        optionalCompletedCount,
        stepComplete
      };
    });
  }, [committedState, steps]);

  const showOptionalDecision =
    !includeOptional && currentStepIndex === REQUIRED_STEPS.length - 1;
  const isLastStep = currentStepIndex === steps.length - 1;
  const totalSteps = steps.length;

  const requiredStepsCompleted = useMemo(
    () =>
      REQUIRED_STEPS.reduce(
        (count, step) => count + (isStepComplete(step, committedState) ? 1 : 0),
        0
      ),
    [committedState]
  );

  const requiredProgress =
    REQUIRED_STEPS.length === 0
      ? 0
      : Math.round((requiredStepsCompleted / REQUIRED_STEPS.length) * 100);

  const optionalStepsCompleted = useMemo(
    () =>
      OPTIONAL_STEPS.reduce(
        (count, step) => count + (isStepComplete(step, committedState) ? 1 : 0),
        0
      ),
    [committedState]
  );

  const optionalProgress =
    OPTIONAL_STEPS.length === 0
      ? 0
      : Math.round((optionalStepsCompleted / OPTIONAL_STEPS.length) * 100);

  const showOptionalProgress = includeOptional || optionalStepsCompleted > 0;

  const persistMutation = useMutation({
    mutationFn: ({ state: draftState, userId, jobId, intent, currentStepId }) =>
      WizardApi.persistDraft(draftState, {
        userId,
        jobId,
        intent,
        currentStepId
      })
  });

  const goToStep = useCallback((nextIndex) => {
    setCurrentStepIndex(nextIndex);
    setMaxVisitedIndex((prev) => Math.max(prev, nextIndex));
  }, []);

  useEffect(() => {
    if (totalSteps === 0) {
      return;
    }
    if (currentStepIndex >= totalSteps) {
      goToStep(totalSteps - 1);
    }
    setMaxVisitedIndex((prev) => Math.min(prev, totalSteps - 1));
  }, [currentStepIndex, goToStep, totalSteps]);

  useEffect(() => {
    if (steps.length === 0) return;
    const highestCompletedIndex = steps.reduce(
      (max, step, index) =>
        isStepComplete(step, committedState) ? Math.max(max, index) : max,
      0
    );
    setMaxVisitedIndex((prev) => {
      const target = Math.max(prev, highestCompletedIndex, currentStepIndex);
      return target === prev ? prev : target;
    });
  }, [committedState, currentStepIndex, steps]);

  useEffect(() => {
    if (includeOptional) return;
    const hasOptionalData = OPTIONAL_STEPS.some((step) =>
      isStepComplete(step, committedState)
    );
    if (hasOptionalData) {
      setIncludeOptional(true);
    }
  }, [committedState, includeOptional]);

  const onFieldChange = useCallback((fieldId, value) => {
    setState((prev) => {
      const next = { ...prev };
      if (value === "" || value === null || value === undefined) {
        delete next[fieldId];
      } else {
        next[fieldId] = value;
      }
      return next;
    });
  }, []);

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

        setCommittedState(() => ({ ...state }));

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

    if (isCurrentStepRequired && !currentRequiredStepCompleteInState) {
      setAssistantMessages((prev) => [
        ...prev,
        {
          id: `validation-${Date.now()}`,
          role: "assistant",
          kind: "error",
          content: "Please complete all required fields before continuing."
        }
      ]);
      return;
    }

    const stepId = currentStep?.id;
    const result = await persistCurrentDraft({}, stepId);
    if (!result) {
      return;
    }

    const nextIndex = currentStepIndex + 1;
    const nextStep = steps[nextIndex] ?? steps[steps.length - 1];

    goToStep(nextIndex);
    await fetchSuggestionsForStep(nextStep?.id ?? stepId, result.intent, result.savedId);
  };

  const handleBack = async () => {
    if (currentStepIndex === 0) {
      return;
    }

    const stepId = currentStep?.id;
    const result = await persistCurrentDraft({}, stepId);
    if (!result) {
      return;
    }

    const previousIndex = currentStepIndex - 1;
    const previousStep = steps[previousIndex] ?? steps[0];
    goToStep(previousIndex);
    await fetchSuggestionsForStep(previousStep?.id ?? stepId, result.intent, result.savedId);
  };

  const handleSubmit = async (submissionIntent = {}) => {
    if (currentStepIndex < REQUIRED_STEPS.length && !currentRequiredStepCompleteInState) {
      setAssistantMessages((prev) => [
        ...prev,
        {
          id: `submit-validation-${Date.now()}`,
          role: "assistant",
          kind: "error",
          content: "Fill every required field before submitting."
        }
      ]);
      return;
    }

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
    if (!allRequiredStepsCompleteInState) {
      setAssistantMessages((prev) => [
        ...prev,
        {
          id: `optional-block-${Date.now()}`,
          role: "assistant",
          kind: "error",
          content: "Complete all required screens before unlocking optional details."
        }
      ]);
      return;
    }

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
    goToStep(nextIndex);
    await fetchSuggestionsForStep(nextStep?.id ?? "compensation-benefits", nextIntent, result.savedId);
  };

  const handleAcceptSuggestion = async (suggestion) => {
    if (!user || !draftId) {
      announceAuthRequired();
      return;
    }

    const fieldDef = findFieldDefinition(suggestion.fieldId);
    let value;

    if (fieldDef?.valueAs === "boolean") {
      if (typeof suggestion.proposal === "boolean") {
        value = suggestion.proposal;
      } else if (typeof suggestion.proposal === "string") {
        value = suggestion.proposal === "true";
      } else {
        value = Boolean(suggestion.proposal);
      }
    } else if (fieldDef?.type === "number" || fieldDef?.valueAs === "number") {
      if (typeof suggestion.proposal === "number") {
        value = suggestion.proposal;
      } else if (
        typeof suggestion.proposal === "string" &&
        suggestion.proposal.trim().length > 0 &&
        !Number.isNaN(Number(suggestion.proposal))
      ) {
        value = Number(suggestion.proposal);
      } else {
        value = undefined;
      }
    } else if (typeof suggestion.proposal === "string") {
      value = suggestion.proposal;
    } else if (typeof suggestion.proposal === "number") {
      value = String(suggestion.proposal);
    } else {
      value = JSON.stringify(suggestion.proposal);
    }

    onFieldChange(suggestion.fieldId, value);

    try {
      await WizardApi.mergeSuggestion(
        {
          jobId: draftId,
          fieldId: suggestion.fieldId,
          value: suggestion.proposal
        },
        { userId: user.id }
      );
      setCommittedState((prev) => {
        const next = { ...prev };
        if (value === undefined) {
          delete next[suggestion.fieldId];
        } else {
          next[suggestion.fieldId] = value;
        }
        return next;
      });
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

  const handleStepNavigation = useCallback(
    async (index) => {
      if (index === currentStepIndex) return;
      const targetStep = steps[index];
      if (!targetStep) return;

      if (isCurrentStepRequired && !currentRequiredStepCompleteInState && index > currentStepIndex) {
        setAssistantMessages((prev) => [
          ...prev,
          {
            id: `nav-block-${Date.now()}`,
            role: "assistant",
            kind: "error",
            content: "Complete the current screen before moving forward."
          }
        ]);
        return;
      }

      if (index >= REQUIRED_STEPS.length && !allRequiredStepsCompleteInState) {
        setAssistantMessages((prev) => [
          ...prev,
          {
            id: `optional-nav-block-${Date.now()}`,
            role: "assistant",
            kind: "error",
            content: "Optional screens unlock after all required screens are complete."
          }
        ]);
        return;
      }

      const result = await persistCurrentDraft({}, currentStep?.id);
      if (!result) {
        return;
      }

      goToStep(index);
      await fetchSuggestionsForStep(targetStep.id, result.intent, result.savedId);
    },
    [
      currentStep?.id,
      currentStepIndex,
      currentRequiredStepCompleteInState,
      allRequiredStepsCompleteInState,
      isCurrentStepRequired,
      fetchSuggestionsForStep,
      goToStep,
      persistCurrentDraft,
      steps
    ]
  );

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
          {steps.map((step, index) => {
            const isActive = index === currentStepIndex;
            const isUnlocked = index <= maxVisitedIndex;
            const isDisabled = !isActive && !isUnlocked;
            const metrics = stepMetrics[index] ?? {
              requiredCount: 0,
              requiredCompletedCount: 0,
              optionalCount: 0,
              optionalCompletedCount: 0,
              stepComplete: false
            };

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => handleStepNavigation(index)}
                disabled={isDisabled}
                className={clsx(
                  "rounded-full border px-3 py-1 transition",
                  isActive
                    ? "border-primary-400 bg-primary-50 text-primary-600"
                    : isDisabled
                      ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-300"
                      : metrics.stepComplete
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-primary-300 hover:text-primary-600"
                )}
                aria-current={isActive ? "step" : undefined}
              >
                <span className="font-semibold">
                  {index + 1}. {step.title}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-2 rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            <span>
              Step {currentStepIndex + 1} of {totalSteps}
            </span>
            <span>Required flow {requiredProgress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-neutral-200">
            <div
              className="h-2 rounded-full bg-primary-500 transition-all"
              style={{ width: `${requiredProgress}%` }}
            />
          </div>
          {REQUIRED_STEPS.length > 0 ? (
            <p className="text-[11px] font-medium text-neutral-400">
              {requiredStepsCompleted} / {REQUIRED_STEPS.length} required screens complete
            </p>
          ) : null}

          {showOptionalProgress ? (
            <div className="space-y-1 rounded-xl border border-dashed border-primary-100 bg-white/80 p-3">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-primary-500">
                <span>Optional flow</span>
                <span>{optionalProgress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-primary-100">
                <div
                  className="h-2 rounded-full bg-primary-500 transition-all"
                  style={{ width: `${optionalProgress}%` }}
                />
              </div>
              {OPTIONAL_STEPS.length > 0 ? (
                <p className="text-[11px] font-medium text-neutral-400">
                  {optionalStepsCompleted} / {OPTIONAL_STEPS.length} optional screens with saved input
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <form className="grid gap-4">
          {currentStep.fields.map((field) => {
            const skipReason = skippedFields[field.id];
            const rawValue = state[field.id];
            let inputValue;

            if (field.valueAs === "boolean") {
              inputValue =
                rawValue === true ? "true" : rawValue === false ? "false" : "";
            } else if (field.type === "number" || field.valueAs === "number") {
              inputValue = rawValue ?? "";
            } else {
              inputValue = rawValue ?? "";
            }

            const handleChange = (event) => {
              const { value } = event.target;

              if (field.valueAs === "boolean") {
                if (value === "") {
                  onFieldChange(field.id, undefined);
                } else {
                  onFieldChange(field.id, value === "true");
                }
                return;
              }

              if (field.type === "number" || field.valueAs === "number") {
                if (value === "") {
                  onFieldChange(field.id, undefined);
                } else {
                  const numeric = Number(value);
                  onFieldChange(field.id, Number.isNaN(numeric) ? undefined : numeric);
                }
                return;
              }

              if (field.id === "location.country") {
                onFieldChange(field.id, value.toUpperCase().slice(0, 2));
                return;
              }

              onFieldChange(field.id, value);
            };

            const sharedInputClasses = clsx(
              "rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100",
              skipReason ? "bg-neutral-100 text-neutral-400" : ""
            );

            return (
              <label
                key={field.id}
                className="flex flex-col gap-2 text-sm font-medium text-neutral-700"
              >
                <span>
                  {field.label}
                  {field.required ? <span className="ml-1 text-primary-600">*</span> : null}
                </span>

                {field.type === "select" ? (
                  <select
                    className={clsx(sharedInputClasses, "cursor-pointer")}
                    value={inputValue}
                    onChange={handleChange}
                    disabled={Boolean(skipReason)}
                    title={skipReason ? `Skipped: ${skipReason}` : undefined}
                  >
                    <option value="">{field.placeholder ?? "Select an option"}</option>
                    {(field.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === "textarea" ? (
                  <textarea
                    className={sharedInputClasses}
                    placeholder={field.placeholder}
                    value={inputValue}
                    onChange={handleChange}
                    rows={field.rows ?? 3}
                    disabled={Boolean(skipReason)}
                    title={skipReason ? `Skipped: ${skipReason}` : undefined}
                  />
                ) : (
                  <input
                    className={sharedInputClasses}
                    type={field.type === "number" ? "number" : "text"}
                    placeholder={field.placeholder}
                    value={
                      field.type === "number" && inputValue === ""
                        ? ""
                        : inputValue
                    }
                    onChange={handleChange}
                    maxLength={field.maxLength}
                    step={field.step}
                    disabled={Boolean(skipReason)}
                    title={skipReason ? `Skipped: ${skipReason}` : undefined}
                    autoComplete="off"
                  />
                )}

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
              Optional screens cover compensation, application flow, branding, and precise location
              targeting. Add them now to unlock richer enrichment and downstream automations?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleAddOptional}
                disabled={!allRequiredStepsCompleteInState || persistMutation.isPending}
                className="rounded-full border border-primary-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-600 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
              >
                Add optional flow
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSubmit({
                    includeOptional: false,
                    optionalCompleted: false
                  })
                }
                disabled={!allRequiredStepsCompleteInState || persistMutation.isPending}
                className="rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
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
                disabled={
                  persistMutation.isPending ||
                  (currentStepIndex < REQUIRED_STEPS.length && !currentRequiredStepCompleteInState)
                }
                className="rounded-full bg-primary-600 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
              >
                {persistMutation.isPending ? "Saving…" : "Submit for Generation"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                disabled={(isCurrentStepRequired && !currentRequiredStepCompleteInState) || persistMutation.isPending}
                className="rounded-full bg-primary-600 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
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
