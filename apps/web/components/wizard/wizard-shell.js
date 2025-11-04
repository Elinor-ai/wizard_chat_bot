"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WizardApi } from "../../lib/api-client";
import { clsx } from "../../lib/cn";
import { WizardSuggestionPanel } from "./wizard-suggestion-panel";
import { useUser } from "../user-context";

function setDeep(obj, path, value) {
  const segments = path.split(".");
  const last = segments.pop();
  let cursor = obj;
  for (const segment of segments) {
    if (!cursor[segment] || typeof cursor[segment] !== "object") {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }
  if (value === undefined) {
    if (cursor && typeof cursor === "object") {
      delete cursor[last];
    }
  } else {
    cursor[last] = value;
  }
}

function getDeep(obj, path) {
  const segments = path.split(".");
  let cursor = obj;
  for (const segment of segments) {
    if (cursor == null || typeof cursor !== "object") {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function deepClone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

const WORK_MODEL_OPTIONS = [
  { value: "on_site", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
  { value: "seasonal", label: "Seasonal" },
  { value: "intern", label: "Internship" },
];

const EXPERIENCE_LEVEL_OPTIONS = [
  { value: "entry", label: "Entry level" },
  { value: "mid", label: "Mid level" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "executive", label: "Executive" },
];

const PROGRESS_TRACKING_FIELDS = [
  "roleTitle",
  "companyName",
  "location",
  "seniorityLevel",
  "employmentType",
  "jobDescription",
];

const REQUIRED_FIELD_IDS = [
  "roleTitle",
  "companyName",
  "location",
  "seniorityLevel",
  "employmentType",
  "jobDescription",
];

const REQUIRED_STEPS = [
  {
    id: "role-basics",
    title: "Let’s capture the headline details.",
    subtitle: "Nothing is published yet—we’re collecting the essentials.",
    fields: [
      {
        id: "roleTitle",
        label: "What role title will candidates recognise?",
        helper:
          "Plain titles win more clicks than clever ones, so keep it simple.",
        required: true,
        placeholder:
          "Assistant Manager / Operations Lead / Sushi Chef / Product Designer",
        type: "text",
        maxLength: 120,
      },
      {
        id: "companyName",
        label: "Who will they be working for?",
        helper:
          "Helps us ground the story in your brand from the very first sentence.",
        required: true,
        placeholder: "Acme Kitchens / Flow Logistics / Studio W",
        type: "text",
        maxLength: 120,
      },
      {
        id: "location",
        label: "Where will most of the work happen?",
        helper:
          'City, region, or "Remote"—whatever helps candidates picture the commute.',
        required: true,
        placeholder: "Austin, TX / Remote across EU / Tel Aviv HQ",
        type: "text",
      },
    ],
  },
  {
    id: "role-details",
    title: "Set the level and format.",
    subtitle: "We’ll use this to tailor compensation ranges and messaging.",
    fields: [
      {
        id: "seniorityLevel",
        label: "What level are you hiring for?",
        helper:
          "Sets expectations so the right folks lean in—and the wrong ones bow out.",
        required: true,
        type: "capsule",
        options: EXPERIENCE_LEVEL_OPTIONS,
      },
      {
        id: "employmentType",
        label: "How is the role scoped?",
        helper: "Keeps everything compliant and transparent from the start.",
        required: true,
        type: "capsule",
        options: EMPLOYMENT_TYPE_OPTIONS,
      },
    ],
  },
  {
    id: "job-story",
    title: "Tell the story in your own words.",
    subtitle: "We’ll polish the copy, but your voice sets the tone.",
    fields: [
      {
        id: "jobDescription",
        label: "What’s the mission for this hire?",
        helper:
          "Write like you’re DM’ing a teammate—why this role matters and what success looks like.",
        required: true,
        placeholder:
          "Lead the evening service, coach a 6-person crew, and keep guest experiences seamless even on peak nights.",
        type: "textarea",
        rows: 6,
      },
    ],
  },
];

const OPTIONAL_STEPS = [
  {
    id: "work-style",
    title: "Clarify how the work happens.",
    subtitle: "Add context so candidates can picture the environment.",
    fields: [
      {
        id: "workModel",
        label: "Where will they spend most days?",
        helper:
          "Clear expectations on hybrid/remote beats surprises halfway through interviews.",
        required: false,
        type: "capsule",
        options: WORK_MODEL_OPTIONS,
      },
      {
        id: "industry",
        label: "Which industry or team best describes this role?",
        helper:
          "Optional, but helps us suggest tailored benefits and must-haves.",
        required: false,
        placeholder: "Hospitality / Logistics / AI SaaS / Healthcare clinic",
        type: "text",
      },
      {
        id: "zipCode",
        label: "Do you want to add a ZIP or postal code?",
        helper: "Helpful for hyper-local salary benchmarks and targeting.",
        required: false,
        placeholder: "78701 / 94107 / 100-0001",
        type: "text",
        maxLength: 12,
      },
    ],
  },
  {
    id: "compensation",
    title: "Dial in compensation.",
    subtitle: "Keep it transparent so the right people raise their hand.",
    fields: [
      {
        id: "compensation.currency",
        label: "What currency should we display?",
        helper: "USD, EUR, GBP, ILS—you name it.",
        required: false,
        placeholder: "USD / GBP / EUR / ILS",
        type: "text",
        maxLength: 6,
      },
      {
        id: "compensation.salary.min",
        label: "What’s a realistic starting point?",
        helper: "Listing a floor keeps expectations aligned from day one.",
        required: false,
        placeholder: "48000 / 22 (hourly) / 3200 (monthly)",
        type: "number",
        valueAs: "number",
      },
      {
        id: "compensation.salary.max",
        label: "And what’s the top end of the range?",
        helper: "Signals growth without locking you into overpaying.",
        required: false,
        placeholder: "56000 / 28 (hourly) / 4200 (monthly)",
        type: "number",
        valueAs: "number",
      },
    ],
  },
  {
    id: "schedule",
    title: "Map the rhythm of the workweek.",
    subtitle: "Clarity here dramatically reduces no-shows.",
    fields: [
      {
        id: "schedule.days",
        label: "Which days are in rotation?",
        helper: "List each one—candidates appreciate the transparency.",
        required: false,
        placeholder: "Monday\nTuesday\nWednesday\nThursday\nFriday",
        type: "textarea",
        rows: 3,
        asList: true,
      },
      {
        id: "schedule.shiftTimes",
        label: "Any shift windows worth calling out?",
        helper:
          "Ex: 08:00-16:00, 16:00-00:00, or simply “Flexible core hours”.",
        required: false,
        placeholder: "08:00 - 16:00\n16:00 - 00:00",
        type: "textarea",
        rows: 3,
        asList: true,
      },
    ],
  },
  {
    id: "extras",
    title: "Add the finishing touches.",
    subtitle: "This is where you hook the right-fit candidates.",
    fields: [
      {
        id: "benefits",
        label: "Any benefits or perks worth highlighting?",
        helper: "List each on its own line—treat it like your highlight reel.",
        required: false,
        placeholder:
          "Health insurance from day one\nPaid parental leave\nQuarterly team retreats",
        type: "textarea",
        rows: 4,
        asList: true,
      },
      {
        id: "coreDuties",
        label: "What will they own day-to-day?",
        helper: "Quick bullet points make it easy to scan.",
        required: false,
        placeholder:
          "Lead daily standups and unblock the team\nReview and ship features every sprint\nCoach junior teammates through code reviews",
        type: "textarea",
        rows: 4,
        asList: true,
      },
      {
        id: "mustHaves",
        label: "Non-negotiables or dealbreakers?",
        helper: "Be honest so you attract the right humans.",
        required: false,
        placeholder:
          "Comfortable owning customer-critical projects\nAble to collaborate across time zones\nExperience with modern analytics tooling",
        type: "textarea",
        rows: 3,
        asList: true,
      },
    ],
  },
];

const OPTIONAL_STEP_BANNERS = {
  "work-style":
    "💡 Candidates are 2.8× more likely to apply when they understand your remote policy and team structure",
  compensation:
    "💡 Jobs with salary ranges get 72% more applications and reduce back-and-forth by 3 days on average",
  schedule:
    "💡 Clarity on hours and flexibility increases match quality by 54% and reduces mis-aligned applications",
  extras:
    "💡 Clear application instructions and timeline reduce candidate drop-off by 41% and speed up hiring",
};

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

function isStepComplete(step, data, hidden = {}) {
  const isHidden = (fieldId) => Boolean(getDeep(hidden, fieldId));
  const requiredFields = step.fields.filter(
    (field) => field.required && !isHidden(field.id)
  );
  const optionalFields = step.fields.filter(
    (field) => !field.required && !isHidden(field.id)
  );

  if (requiredFields.length > 0) {
    return requiredFields.every((field) =>
      isFieldValueProvided(getDeep(data, field.id), field)
    );
  }

  if (optionalFields.length > 0) {
    return optionalFields.some((field) =>
      isFieldValueProvided(getDeep(data, field.id), field)
    );
  }

  return step.fields.length > 0;
}

function normalizeValueForField(field, proposal) {
  if (!field) return proposal;

  if (field.asList) {
    if (Array.isArray(proposal)) {
      return proposal;
    }
    if (typeof proposal === "string") {
      const entries = proposal
        .split(/\n|,/)
        .map((part) => part.trim())
        .filter(Boolean);
      return entries.length > 0 ? entries : undefined;
    }
    if (proposal === null || proposal === undefined) {
      return undefined;
    }
    return [String(proposal)];
  }

  if (field.valueAs === "boolean") {
    if (typeof proposal === "boolean") return proposal;
    if (typeof proposal === "string") {
      if (proposal.toLowerCase() === "true") return true;
      if (proposal.toLowerCase() === "false") return false;
    }
    return Boolean(proposal);
  }

  if (field.type === "number" || field.valueAs === "number") {
    if (proposal === "" || proposal === null || proposal === undefined) {
      return undefined;
    }
    if (typeof proposal === "number") return proposal;
    if (typeof proposal === "string" && proposal.trim().length > 0) {
      const numeric = Number(proposal);
      return Number.isNaN(numeric) ? undefined : numeric;
    }
    return undefined;
  }

  if (typeof proposal === "string" || typeof proposal === "number") {
    return proposal;
  }

  if (proposal === null || proposal === undefined) {
    return undefined;
  }

  return proposal;
}

export function WizardShell() {
  const { user } = useUser();
  const [state, setState] = useState({});
  const [committedState, setCommittedState] = useState({});
  const [jobId, setJobId] = useState(null);
  const [includeOptional, setIncludeOptional] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [maxVisitedIndex, setMaxVisitedIndex] = useState(0);
  const [assistantMessages, setAssistantMessages] = useState([
    {
      id: "intro",
      role: "assistant",
      kind: "info",
      content:
        "Hi! I’m your recruiting copilot. Ask for market data, salary bands, or copy tweaks any time.",
    },
  ]);
  const [isChatting, setIsChatting] = useState(false);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [hiddenFields, setHiddenFields] = useState({});
  const [autofilledFields, setAutofilledFields] = useState({});
  const [copilotNextTeaser, setCopilotNextTeaser] = useState("");
  const suggestionDebounceRef = useRef(null);
  const persistDraftDebounceRef = useRef(null);
  const stateRef = useRef(state);
  const previousFieldValuesRef = useRef({});
  const [customCapsuleActive, setCustomCapsuleActive] = useState({});
  const [hoveredCapsules, setHoveredCapsules] = useState({});
  const [hasSeenUnlock, setHasSeenUnlock] = useState(false);
  const [unlockAction, setUnlockAction] = useState(null);
  const [unlockScreenLoggedFor, setUnlockScreenLoggedFor] = useState(null);

  const steps = useMemo(
    () =>
      includeOptional ? [...REQUIRED_STEPS, ...OPTIONAL_STEPS] : REQUIRED_STEPS,
    [includeOptional]
  );

  const currentStep = steps[currentStepIndex];
  const currentOptionalBanner = useMemo(() => {
    if (!currentStep) return null;
    return OPTIONAL_STEP_BANNERS[currentStep.id] ?? null;
  }, [currentStep]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const allRequiredStepsCompleteInState = useMemo(
    () =>
      REQUIRED_STEPS.every((step) => isStepComplete(step, state, hiddenFields)),
    [hiddenFields, state]
  );

  const isCurrentStepRequired = currentStepIndex < REQUIRED_STEPS.length;

  const currentRequiredStepCompleteInState = useMemo(() => {
    if (!currentStep) return false;
    if (!isCurrentStepRequired) return true;
    return isStepComplete(currentStep, state, hiddenFields);
  }, [currentStep, hiddenFields, isCurrentStepRequired, state]);

  const stepMetrics = useMemo(() => {
    return steps.map((step) => {
      const isHidden = (fieldId) => Boolean(getDeep(hiddenFields, fieldId));
      const requiredFieldsInStep = step.fields.filter(
        (field) => field.required && !isHidden(field.id)
      );
      const optionalFieldsInStep = step.fields.filter(
        (field) => !field.required && !isHidden(field.id)
      );
      const requiredCompletedCount = requiredFieldsInStep.reduce(
        (count, field) =>
          count +
          (isFieldValueProvided(getDeep(committedState, field.id), field)
            ? 1
            : 0),
        0
      );
      const optionalCompletedCount = optionalFieldsInStep.reduce(
        (count, field) =>
          count +
          (isFieldValueProvided(getDeep(committedState, field.id), field)
            ? 1
            : 0),
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
        stepComplete,
      };
    });
  }, [committedState, hiddenFields, steps]);

  const progressCompletedCount = useMemo(() => {
    return PROGRESS_TRACKING_FIELDS.reduce((count, fieldId) => {
      const def = findFieldDefinition(fieldId);
      return (
        count + (isFieldValueProvided(getDeep(state, fieldId), def) ? 1 : 0)
      );
    }, 0);
  }, [state]);

  const totalProgressFields = PROGRESS_TRACKING_FIELDS.length;
  const progressPercent =
    totalProgressFields === 0
      ? 0
      : Math.round((progressCompletedCount / totalProgressFields) * 100);

  const optionalSectionStatus = useMemo(() => {
    return OPTIONAL_STEPS.map((step) => {
      const visibleFields = step.fields.filter(
        (field) => !getDeep(hiddenFields, field.id)
      );
      const completed = visibleFields.every((field) =>
        isFieldValueProvided(getDeep(state, field.id), field)
      );
      return {
        id: step.id,
        completed,
      };
    });
  }, [hiddenFields, state]);

  const optionalSectionsCompleted = useMemo(
    () => optionalSectionStatus.filter((section) => section.completed).length,
    [optionalSectionStatus]
  );

  const optionalProgressPct = OPTIONAL_STEPS.length
    ? Math.round((optionalSectionsCompleted / OPTIONAL_STEPS.length) * 100)
    : 0;

  const capsuleClassName = useCallback((isActive, isHovered) => {
    const baseClasses =
      "px-5 py-2.5 rounded-full border-2 text-sm font-semibold transition-all duration-150 transform focus:outline-none focus:ring-2 focus:ring-[#667eea]/20 cursor-pointer";

    if (isActive) {
      return clsx(
        baseClasses,
        "-translate-y-0.5 border-[#667eea] bg-[#667eea] text-white shadow-sm shadow-[#667eea]/50"
      );
    }

    return clsx(
      baseClasses,
      "border-[#e5e7eb] bg-white text-[#374151]",
      isHovered
        ? "-translate-y-0.5 border-[#667eea] bg-[#f5f7ff] shadow-sm shadow-[#667eea]/20"
        : "translate-y-0"
    );
  }, []);

  const shouldShowUnlockScreen = useMemo(() => {
    if (includeOptional || hasSeenUnlock) {
      return false;
    }
    return REQUIRED_FIELD_IDS.every((fieldId) => {
      const definition = findFieldDefinition(fieldId);
      return isFieldValueProvided(getDeep(state, fieldId), definition);
    });
  }, [hasSeenUnlock, includeOptional, state]);

  const persistMutation = useMutation({
    mutationFn: ({
      state: jobState,
      userId,
      jobId: jobIdInput,
      intent,
      currentStepId,
      wizardMeta,
    }) =>
      WizardApi.persistJob(jobState, {
        userId,
        jobId: jobIdInput,
        intent,
        currentStepId,
        wizardMeta,
      }),
  });

  const canRevisitOptional = !includeOptional && hasSeenUnlock;
  const optionalActionsDisabled =
    !allRequiredStepsCompleteInState || persistMutation.isPending;
  const isLastStep = currentStepIndex === steps.length - 1;
  const totalSteps = steps.length;

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
        isStepComplete(step, committedState, hiddenFields)
          ? Math.max(max, index)
          : max,
      0
    );
    setMaxVisitedIndex((prev) => {
      const target = Math.max(prev, highestCompletedIndex, currentStepIndex);
      return target === prev ? prev : target;
    });
  }, [committedState, currentStepIndex, hiddenFields, steps]);

  useEffect(() => {
    if (includeOptional) return;
    const hasOptionalData = OPTIONAL_STEPS.some((step) =>
      isStepComplete(step, committedState, hiddenFields)
    );
    if (hasOptionalData) {
      setIncludeOptional(true);
      setHasSeenUnlock(true);
      setUnlockAction("continue");
    }
  }, [committedState, hiddenFields, includeOptional]);

  const announceAuthRequired = useCallback(() => {
    setAssistantMessages((prev) => [
      ...prev,
      {
        id: `auth-${Date.now()}`,
        role: "assistant",
        kind: "error",
        content: "Please sign in to continue working on this job.",
      },
    ]);
  }, []);

  const fetchSuggestionsForStep = useCallback(
    async ({
      stepId = currentStep?.id,
      intentOverrides = {},
      jobIdOverride,
      updatedFieldId,
      updatedValue,
    } = {}) => {
      if (!user || !stepId) {
        if (!user) {
          announceAuthRequired();
        }
        return;
      }

      const effectiveJobId = jobIdOverride ?? jobId;
      if (!effectiveJobId) {
        return;
      }

      const workingState = stateRef.current ?? {};
      const targetStep = steps.find((step) => step.id === stepId) ?? null;
      const emptyFieldIds = [];
      if (targetStep) {
        for (const field of targetStep.fields) {
          const value = getDeep(workingState, field.id);
          if (!isFieldValueProvided(value, field)) {
            emptyFieldIds.push(field.id);
          }
        }
      }

      const stepIndex = steps.findIndex((step) => step.id === stepId);
      const upcomingFieldIds =
        stepIndex === -1
          ? []
          : steps
              .slice(stepIndex + 1)
              .flatMap((step) => step.fields.map((field) => field.id));

      const isOptionalStep = OPTIONAL_STEPS.some((step) => step.id === stepId);
      if (!isOptionalStep) {
        return;
      }

      const requiredComplete = REQUIRED_FIELD_IDS.every((fieldId) => {
        const fieldDefinition = findFieldDefinition(fieldId);
        return isFieldValueProvided(
          getDeep(workingState, fieldId),
          fieldDefinition
        );
      });

      if (!requiredComplete) {
        return;
      }

      setIsFetchingSuggestions(true);
      try {
        const response = await WizardApi.fetchSuggestions(
          {
            state: workingState,
            currentStepId: stepId,
            intent: { includeOptional, ...intentOverrides },
            updatedFieldId,
            updatedFieldValue: updatedValue,
            emptyFieldIds,
            upcomingFieldIds,
          },
          { userId: user.id, jobId: effectiveJobId }
        );

        const hiddenMap = {};
        (response.irrelevantFields ?? []).forEach((item) => {
          if (item?.fieldId) {
            setDeep(
              hiddenMap,
              item.fieldId,
              item.reason ?? "Not needed based on what you’ve already shared."
            );
          }
        });
        setHiddenFields(hiddenMap);
        if ((response.irrelevantFields ?? []).length > 0) {
          setAutofilledFields((prev) => {
            const next = deepClone(prev);
            (response.irrelevantFields ?? []).forEach((item) => {
              if (item?.fieldId) {
                setDeep(next, item.fieldId, undefined);
              }
            });
            return next;
          });
        }

        const autofillCandidates = response.autofillCandidates ?? [];
        setCopilotNextTeaser(response.nextStepTeaser ?? "");

        const freshSuggestions = [];
        autofillCandidates.forEach((candidate) => {
          if (!candidate?.fieldId) return;
          if (getDeep(hiddenMap, candidate.fieldId)) return;

          const fieldDefinition = findFieldDefinition(candidate.fieldId);
          const normalized = normalizeValueForField(
            fieldDefinition,
            candidate.value
          );

          if (normalized !== undefined) {
            freshSuggestions.push({
              fieldId: candidate.fieldId,
              value: normalized,
              rationale:
                candidate?.rationale ??
                "Suggested so candidates understand the opportunity immediately.",
              confidence: candidate?.confidence ?? 0.5,
              source: candidate?.source ?? "copilot",
            });
          }
        });

        if (freshSuggestions.length > 0) {
          setAutofilledFields((prev) => {
            const next = deepClone(prev);
            freshSuggestions.forEach((suggestion) => {
              const existing = getDeep(next, suggestion.fieldId);
              if (existing?.accepted) {
                return;
              }
              setDeep(next, suggestion.fieldId, {
                ...existing,
                value: suggestion.value,
                rationale: suggestion.rationale,
                confidence: suggestion.confidence,
                source: suggestion.source,
                accepted: false,
                suggestedAt: Date.now(),
              });
            });
            return next;
          });
        }

        setAssistantMessages((prev) => {
          const base = prev.filter(
            (message) =>
              !["suggestion", "followUp", "skip", "improved"].includes(
                message.kind
              )
          );

          const suggestionMessages = (response.autofillCandidates ?? []).map(
            (candidate, index) => ({
              id: `autofill-${candidate.fieldId}-${Date.now()}-${index}`,
              role: "assistant",
              kind: "suggestion",
              content:
                typeof candidate.value === "string" ||
                typeof candidate.value === "number"
                  ? String(candidate.value)
                  : JSON.stringify(candidate.value),
              meta: {
                fieldId: candidate.fieldId,
                confidence: candidate.confidence ?? 0.5,
                rationale:
                  candidate.rationale ??
                  "Suggested by your copilot so you can approve in one click.",
                value: candidate.value,
                mode: "autofill",
              },
            })
          );

          const improvedMessages =
            response.improvedValue && response.improvedValue.fieldId
              ? [
                  {
                    id: `improved-${response.improvedValue.fieldId}-${Date.now()}`,
                    role: "assistant",
                    kind: "suggestion",
                    content:
                      typeof response.improvedValue.value === "string"
                        ? response.improvedValue.value
                        : JSON.stringify(response.improvedValue.value),
                    meta: {
                      fieldId: response.improvedValue.fieldId,
                      confidence: response.improvedValue.confidence ?? 0.6,
                      rationale:
                        response.improvedValue.rationale ??
                        "Reworded for clarity and candidate appeal.",
                      value: response.improvedValue.value,
                      mode: response.improvedValue.mode ?? "rewrite",
                    },
                  },
                ]
              : [];

          const followUpsRaw = [
            ...(response.followUps ?? []),
            response.nextStepTeaser ?? "",
          ];
          const followUpUnique = [];
          const followUpSeen = new Set();
          for (const text of followUpsRaw) {
            if (!text || typeof text !== "string") continue;
            const trimmed = text.trim();
            if (!trimmed || followUpSeen.has(trimmed)) continue;
            followUpSeen.add(trimmed);
            followUpUnique.push(trimmed);
          }

          const followUps = followUpUnique.map((text, index) => ({
            id: `follow-up-${Date.now()}-${index}`,
            role: "assistant",
            kind: "followUp",
            content: text,
          }));

          const hiddenMessages = (response.irrelevantFields ?? []).map(
            (item, index) => {
              const fieldDef = findFieldDefinition(item.fieldId);
              const friendlyLabel = fieldDef?.label ?? item.fieldId;
              const explanation =
                item.reason ??
                "Not relevant for this role, so we tucked it away for you.";
              return {
                id: `hidden-${item.fieldId}-${Date.now()}-${index}`,
                role: "assistant",
                kind: "skip",
                content: `I’ve removed “${friendlyLabel}” — ${explanation}`,
                meta: { ...item, friendlyLabel },
              };
            }
          );

          return [
            ...base,
            ...improvedMessages,
            ...suggestionMessages,
            ...followUps,
            ...hiddenMessages,
          ];
        });
      } catch (error) {
        setAssistantMessages((prev) => [
          ...prev,
          {
            id: `suggestion-error-${Date.now()}`,
            role: "assistant",
            kind: "error",
            content: error.message ?? "Failed to load suggestions.",
          },
        ]);
      } finally {
        setIsFetchingSuggestions(false);
      }
    },
    [announceAuthRequired, currentStep?.id, jobId, includeOptional, steps, user]
  );

  const scheduleRealtimeSuggestions = useCallback(
    (fieldId, value) => {
      if (!currentStep?.id) return;
      const isOptionalStep = OPTIONAL_STEPS.some(
        (step) => step.id === currentStep.id
      );
      if (!isOptionalStep) {
        return;
      }
      if (suggestionDebounceRef.current) {
        clearTimeout(suggestionDebounceRef.current);
      }
      suggestionDebounceRef.current = setTimeout(() => {
        fetchSuggestionsForStep({
          stepId: currentStep.id,
          updatedFieldId: fieldId,
          updatedValue: value,
        });
      }, 450);
    },
    [currentStep?.id, fetchSuggestionsForStep]
  );

  useEffect(() => {
    setHiddenFields({});
    setAutofilledFields({});
    setCopilotNextTeaser("");
    if (suggestionDebounceRef.current) {
      clearTimeout(suggestionDebounceRef.current);
      suggestionDebounceRef.current = null;
    }
    if (persistDraftDebounceRef.current) {
      clearTimeout(persistDraftDebounceRef.current);
      persistDraftDebounceRef.current = null;
    }
    setAssistantMessages((prev) =>
      prev.filter(
        (message) =>
          !["suggestion", "followUp", "skip", "improved"].includes(message.kind)
      )
    );
  }, [currentStepIndex]);

  const persistCurrentDraft = useCallback(
    async (intentOverrides = {}, stepId = currentStep?.id) => {
      if (!user) {
        announceAuthRequired();
        return null;
      }

      const intent = { includeOptional, ...intentOverrides };

      try {
        const wizardMeta = {
          required_completed: progressCompletedCount === totalProgressFields,
          required_completed_count: progressCompletedCount,
          optional_sections_completed: optionalSectionsCompleted,
          unlock_screen_seen: hasSeenUnlock,
          unlock_screen_action: unlockAction,
        };

        const response = await persistMutation.mutateAsync({
          state,
          userId: user.id,
          jobId,
          intent,
          currentStepId: stepId,
          wizardMeta,
        });

        if (response?.jobId) {
          setJobId(response.jobId);
        }

        setCommittedState(() => deepClone(state));

        return { savedId: response?.jobId ?? jobId, intent };
      } catch (error) {
        setAssistantMessages((prev) => [
          ...prev,
          {
            id: `persist-error-${Date.now()}`,
            role: "assistant",
            kind: "error",
            content: error.message ?? "Failed to save the job.",
          },
        ]);
        return null;
      }
    },
    [
      announceAuthRequired,
      currentStep?.id,
      jobId,
      includeOptional,
      progressCompletedCount,
      totalProgressFields,
      optionalSectionsCompleted,
      hasSeenUnlock,
      unlockAction,
      persistMutation,
      state,
      user,
    ]
  );

  const scheduleAutosave = useCallback(() => {
    if (!user) {
      return;
    }
    if (persistDraftDebounceRef.current) {
      clearTimeout(persistDraftDebounceRef.current);
    }
    persistDraftDebounceRef.current = setTimeout(() => {
      persistCurrentDraft({ event: "autosave" }, currentStep?.id).catch(
        () => {}
      );
    }, 1500);
  }, [currentStep?.id, persistCurrentDraft, user]);

  const onFieldChange = useCallback(
    (fieldId, value, options = {}) => {
      const { preserveSuggestionMeta = false, skipRealtime = false } = options;
      setState((prev) => {
        const next = deepClone(prev);
        if (value === "" || value === null || value === undefined) {
          setDeep(next, fieldId, undefined);
        } else {
          setDeep(next, fieldId, value);
        }
        return next;
      });

      setAutofilledFields((prev) => {
        const next = deepClone(prev);
        if (preserveSuggestionMeta) {
          const existing = getDeep(next, fieldId);
          if (existing) {
            setDeep(next, fieldId, {
              ...existing,
              lastTouchedAt: Date.now(),
            });
          }
        } else {
          setDeep(next, fieldId, undefined);
        }
        return next;
      });

      if (!skipRealtime) {
        scheduleRealtimeSuggestions(fieldId, value);
      }
      scheduleAutosave();
    },
    [scheduleAutosave, scheduleRealtimeSuggestions]
  );

  useEffect(() => {
    if (!shouldShowUnlockScreen) {
      return;
    }
    const logKey = jobId ?? "__no_job__";
    if (unlockScreenLoggedFor === logKey) {
      return;
    }
    setUnlockScreenLoggedFor(logKey);
    (async () => {
      await persistCurrentDraft(
        { event: "unlock_screen_viewed" },
        currentStep?.id
      );
    })().catch(() => {});
  }, [
    currentStep?.id,
    jobId,
    persistCurrentDraft,
    shouldShowUnlockScreen,
    unlockScreenLoggedFor,
  ]);

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
          content: "Please complete all required fields before continuing.",
        },
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
    await fetchSuggestionsForStep({
      stepId: nextStep?.id ?? stepId,
      intentOverrides: result.intent,
      jobIdOverride: result.savedId,
    });
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
    await fetchSuggestionsForStep({
      stepId: previousStep?.id ?? stepId,
      intentOverrides: result.intent,
      jobIdOverride: result.savedId,
    });
  };

  const handleSubmit = async (submissionIntent = {}) => {
    if (
      currentStepIndex < REQUIRED_STEPS.length &&
      !currentRequiredStepCompleteInState
    ) {
      setAssistantMessages((prev) => [
        ...prev,
        {
          id: `submit-validation-${Date.now()}`,
          role: "assistant",
          kind: "error",
          content: "Fill every required field before submitting.",
        },
      ]);
      return;
    }

    const stepId = currentStep?.id;
    const result = await persistCurrentDraft(
      {
        optionalCompleted: includeOptional,
        ...submissionIntent,
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
        content: "Draft saved. Copilot will continue enriching your inputs.",
      },
    ]);

    await fetchSuggestionsForStep({
      stepId,
      intentOverrides: result.intent,
      jobIdOverride: result.savedId,
    });
  };

  const handleAddOptional = async (
    intentOverrides = {},
    { markUnlock = false } = {}
  ) => {
    if (!allRequiredStepsCompleteInState) {
      setAssistantMessages((prev) => [
        ...prev,
        {
          id: `optional-block-${Date.now()}`,
          role: "assistant",
          kind: "error",
          content:
            "Complete all required screens before unlocking optional details.",
        },
      ]);
      return;
    }

    const stepId = currentStep?.id;
    const result = await persistCurrentDraft(intentOverrides, stepId);
    if (!result) {
      return;
    }

    if (markUnlock) {
      setHasSeenUnlock(true);
      setUnlockAction("continue");
    }

    const nextIntent = {
      ...result.intent,
      ...intentOverrides,
      includeOptional: true,
    };
    setIncludeOptional(true);
    const nextIndex = REQUIRED_STEPS.length;
    const optionalFlowSteps = [...REQUIRED_STEPS, ...OPTIONAL_STEPS];
    const nextStep = optionalFlowSteps[nextIndex];
    goToStep(nextIndex);
    await fetchSuggestionsForStep({
      stepId: nextStep?.id ?? "compensation",
      intentOverrides: nextIntent,
      jobIdOverride: result.savedId,
    });
  };

  const handleSkipOptional = async () => {
    if (!allRequiredStepsCompleteInState) {
      setAssistantMessages((prev) => [
        ...prev,
        {
          id: `optional-skip-block-${Date.now()}`,
          role: "assistant",
          kind: "error",
          content: "Complete all required screens before finishing up.",
        },
      ]);
      return;
    }

    setHasSeenUnlock(true);
    setUnlockAction("skip");
    await handleSubmit({
      includeOptional: false,
      optionalCompleted: false,
      event: "unlock_screen_skip",
    });
  };

  const handleAcceptSuggestion = useCallback(
    async (suggestion) => {
      if (!user || !jobId) {
        announceAuthRequired();
        return;
      }

      const fieldDef = findFieldDefinition(suggestion.fieldId);
      const proposal =
        suggestion.value !== undefined ? suggestion.value : suggestion.proposal;
      const value = normalizeValueForField(fieldDef, proposal);

      const currentValue = getDeep(stateRef.current ?? {}, suggestion.fieldId);
      setDeep(previousFieldValuesRef.current, suggestion.fieldId, {
        __stored: true,
        value: currentValue,
      });

      onFieldChange(suggestion.fieldId, value, {
        preserveSuggestionMeta: true,
        skipRealtime: true,
      });

      setAutofilledFields((prev) => {
        const next = deepClone(prev);
        const existing = getDeep(next, suggestion.fieldId) ?? {};
        setDeep(next, suggestion.fieldId, {
          ...existing,
          accepted: true,
          value,
          rationale:
            suggestion.rationale ??
            existing.rationale ??
            "Suggested so candidates understand the opportunity immediately.",
          confidence: suggestion.confidence ?? existing.confidence ?? 0.5,
          appliedAt: Date.now(),
        });
        return next;
      });

      try {
        await WizardApi.mergeSuggestion(
          {
            jobId,
            fieldId: suggestion.fieldId,
            value,
          },
          { userId: user.id }
        );
        setCommittedState((prev) => {
          const next = deepClone(prev);
          if (value === undefined) {
            setDeep(next, suggestion.fieldId, undefined);
          } else {
            setDeep(next, suggestion.fieldId, value);
          }
          return next;
        });
        await fetchSuggestionsForStep({
          stepId: currentStep?.id,
          updatedFieldId: suggestion.fieldId,
          updatedValue: value,
        });
      } catch (error) {
        const storedOriginalValue = getDeep(
          previousFieldValuesRef.current,
          suggestion.fieldId
        );
        const fallbackValue =
          storedOriginalValue && storedOriginalValue.__stored
            ? storedOriginalValue.value
            : getDeep(committedState, suggestion.fieldId);

        onFieldChange(suggestion.fieldId, fallbackValue ?? undefined, {
          preserveSuggestionMeta: false,
          skipRealtime: true,
        });

        setAutofilledFields((prev) => {
          const next = deepClone(prev);
          const existing = getDeep(next, suggestion.fieldId);
          if (existing) {
            setDeep(next, suggestion.fieldId, {
              ...existing,
              accepted: false,
              lastRejectedAt: Date.now(),
            });
          }
          return next;
        });

        setDeep(previousFieldValuesRef.current, suggestion.fieldId, undefined);

        setAssistantMessages((prev) => [
          ...prev,
          {
            id: `merge-error-${Date.now()}`,
            role: "assistant",
            kind: "error",
            content: error.message ?? "Failed to merge the suggestion.",
          },
        ]);
      }
    },
    [
      announceAuthRequired,
      committedState,
      jobId,
      fetchSuggestionsForStep,
      onFieldChange,
      user,
    ]
  );

  const handleSuggestionToggle = useCallback(
    async (meta, accepted) => {
      if (!meta?.fieldId) {
        return;
      }
      if (accepted) {
        await handleAcceptSuggestion(meta);
        return;
      }

      const previousEntry = getDeep(
        previousFieldValuesRef.current,
        meta.fieldId
      );
      const fallback =
        previousEntry && previousEntry.__stored
          ? previousEntry.value
          : getDeep(committedState, meta.fieldId);

      onFieldChange(meta.fieldId, fallback ?? undefined, {
        preserveSuggestionMeta: false,
        skipRealtime: true,
      });

      setAutofilledFields((prev) => {
        const next = deepClone(prev);
        const existing = getDeep(next, meta.fieldId);
        if (existing) {
          setDeep(next, meta.fieldId, {
            ...existing,
            accepted: false,
            lastRejectedAt: Date.now(),
          });
        }
        return next;
      });

      setDeep(previousFieldValuesRef.current, meta.fieldId, undefined);

      await fetchSuggestionsForStep({
        stepId: currentStep?.id,
        updatedFieldId: meta.fieldId,
        updatedValue: fallback ?? undefined,
      });
    },
    [
      committedState,
      currentStep?.id,
      fetchSuggestionsForStep,
      handleAcceptSuggestion,
      onFieldChange,
    ]
  );

  const handleStepNavigation = useCallback(
    async (index) => {
      if (index === currentStepIndex) return;
      const targetStep = steps[index];
      if (!targetStep) return;

      if (
        isCurrentStepRequired &&
        !currentRequiredStepCompleteInState &&
        index > currentStepIndex
      ) {
        setAssistantMessages((prev) => [
          ...prev,
          {
            id: `nav-block-${Date.now()}`,
            role: "assistant",
            kind: "error",
            content: "Complete the current screen before moving forward.",
          },
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
            content:
              "Optional screens unlock after all required screens are complete.",
          },
        ]);
        return;
      }

      const result = await persistCurrentDraft({}, currentStep?.id);
      if (!result) {
        return;
      }

      goToStep(index);
      await fetchSuggestionsForStep({
        stepId: targetStep.id,
        intentOverrides: result.intent,
        jobIdOverride: result.savedId,
      });
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
      steps,
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
      content: trimmed,
    };

    setAssistantMessages((prev) => [...prev, userMessage]);
    setIsChatting(true);

    try {
      const response = await WizardApi.sendChatMessage(
        {
          jobId: jobId ?? undefined,
          userMessage: trimmed,
          intent: { currentStepId: currentStep?.id },
        },
        { userId: user.id }
      );

      setAssistantMessages((prev) => [
        ...prev,
        {
          id: `chat-${Date.now()}`,
          role: "assistant",
          kind: "reply",
          content: response.assistantMessage,
        },
      ]);
    } catch (error) {
      setAssistantMessages((prev) => [
        ...prev,
        {
          id: `chat-error-${Date.now()}`,
          role: "assistant",
          kind: "error",
          content:
            error.message ?? "I ran into an issue processing that request.",
        },
      ]);
    } finally {
      setIsChatting(false);
    }
  };

  if (!user) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-10 text-center text-neutral-600 shadow-sm shadow-neutral-100">
        Please sign in to build a job brief. Once authenticated, your wizard
        progress will be saved to Firestore and synced across the console.
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
              stepComplete: false,
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
                {metrics.stepComplete ? (
                  <span className="ml-1 text-emerald-600">✓</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="space-y-3 rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-neutral-800">
              {includeOptional
                ? "Optional enhancements"
                : "Required questions completed"}
            </span>
            <span className="text-xs font-medium text-primary-500">
              {includeOptional
                ? `${optionalSectionsCompleted} of ${OPTIONAL_STEPS.length} sections complete`
                : `${progressCompletedCount} of ${totalProgressFields} complete`}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-200">
            <div
              className={clsx(
                "h-full rounded-full transition-all duration-200",
                includeOptional
                  ? "bg-gradient-to-r from-[#667eea] to-[#764ba2]"
                  : "bg-[#4caf50]"
              )}
              style={{
                width: `${Math.min(
                  100,
                  Math.max(
                    includeOptional ? optionalProgressPct : progressPercent,
                    includeOptional
                      ? optionalSectionsCompleted > 0
                        ? 6
                        : 0
                      : progressCompletedCount > 0
                        ? 6
                        : 0
                  )
                )}%`,
              }}
            />
          </div>
          <p className="text-xs text-neutral-500">
            We autosave as you go. Skip anything that doesn’t apply—you can
            always come back.
          </p>
        </div>

        {currentStep ? (
          <div className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm shadow-neutral-100">
            <h1 className="text-xl font-semibold text-neutral-800">
              {currentStep.title}
            </h1>
            {currentStep.subtitle ? (
              <p className="text-sm text-neutral-500">{currentStep.subtitle}</p>
            ) : null}
          </div>
        ) : null}

        {currentOptionalBanner ? (
          <div className="rounded-md border-l-4 border-[#ffd54f] bg-[#fff9e6] p-3 text-sm text-[#f57f17]">
            {currentOptionalBanner}
          </div>
        ) : null}

        <form className="grid gap-4">
          {currentStep.fields.map((field) => {
            const hiddenReason = getDeep(hiddenFields, field.id);
            const rawValue = getDeep(state, field.id);
            const highlightMeta = getDeep(autofilledFields, field.id);
            const effectiveValue = rawValue;
            const isListField = field.asList === true;
            const isSuggestedValue = Boolean(highlightMeta?.accepted);
            let inputValue;

            if (hiddenReason) {
              return null;
            }

            if (field.valueAs === "boolean") {
              inputValue =
                effectiveValue === true
                  ? "true"
                  : effectiveValue === false
                    ? "false"
                    : "";
            } else if (field.type === "number" || field.valueAs === "number") {
              inputValue = effectiveValue ?? "";
            } else if (isListField) {
              if (Array.isArray(effectiveValue)) {
                inputValue = effectiveValue.join("\n");
              } else if (typeof effectiveValue === "string") {
                inputValue = effectiveValue;
              } else {
                inputValue = "";
              }
            } else {
              inputValue = effectiveValue ?? "";
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
                  onFieldChange(
                    field.id,
                    Number.isNaN(numeric) ? undefined : numeric
                  );
                }
                return;
              }

              if (isListField) {
                const entries = value
                  .split(/\n|,/)
                  .map((part) => part.trim())
                  .filter(Boolean);
                onFieldChange(
                  field.id,
                  entries.length > 0 ? entries : undefined
                );
                return;
              }

              onFieldChange(field.id, value);
            };

            const sharedInputClasses = clsx(
              "rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100",
              isSuggestedValue ? "border-primary-300 bg-primary-50" : ""
            );
            const hoveredValue = hoveredCapsules[field.id];
            const customOptionActive =
              Boolean(customCapsuleActive[field.id]) ||
              (effectiveValue !== undefined &&
                effectiveValue !== null &&
                !(field.options ?? []).some(
                  (option) => option.value === effectiveValue
                ));

            return (
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
                {field.helper ? (
                  <span className="text-xs font-normal text-neutral-500">
                    {field.helper}
                  </span>
                ) : null}
                {isSuggestedValue ? (
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                    Suggested by your copilot
                  </span>
                ) : null}
                {isSuggestedValue && highlightMeta?.rationale ? (
                  <span className="text-xs text-primary-400">
                    {highlightMeta.rationale}
                  </span>
                ) : null}

                {field.type === "capsule" ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-3">
                      {(field.options ?? []).map((option) => {
                        const optionValue = option.value;
                        const isActive = effectiveValue === optionValue;
                        const isHovered = hoveredValue === optionValue;
                        return (
                          <button
                            type="button"
                            key={optionValue}
                            className={capsuleClassName(isActive, isHovered)}
                            onClick={() => {
                              setCustomCapsuleActive((prev) => ({
                                ...prev,
                                [field.id]: false,
                              }));
                              onFieldChange(field.id, optionValue);
                            }}
                            onMouseEnter={() =>
                              setHoveredCapsules((prev) => ({
                                ...prev,
                                [field.id]: optionValue,
                              }))
                            }
                            onMouseLeave={() =>
                              setHoveredCapsules((prev) => {
                                if (prev[field.id] !== optionValue) {
                                  return prev;
                                }
                                const next = { ...prev };
                                delete next[field.id];
                                return next;
                              })
                            }
                          >
                            {option.label}
                          </button>
                        );
                      })}
                      {field.allowCustom ? (
                        <button
                          type="button"
                          className={capsuleClassName(
                            customOptionActive,
                            hoveredValue === "__custom__"
                          )}
                          onClick={() => {
                            setCustomCapsuleActive((prev) => ({
                              ...prev,
                              [field.id]: true,
                            }));
                            if (
                              (field.options ?? []).some(
                                (option) => option.value === effectiveValue
                              )
                            ) {
                              onFieldChange(field.id, "");
                            }
                          }}
                          onMouseEnter={() =>
                            setHoveredCapsules((prev) => ({
                              ...prev,
                              [field.id]: "__custom__",
                            }))
                          }
                          onMouseLeave={() =>
                            setHoveredCapsules((prev) => {
                              if (prev[field.id] !== "__custom__") {
                                return prev;
                              }
                              const next = { ...prev };
                              delete next[field.id];
                              return next;
                            })
                          }
                        >
                          {field.customLabel ?? "Other"}
                        </button>
                      ) : null}
                    </div>
                    {field.allowCustom &&
                    (customCapsuleActive[field.id] ||
                      (effectiveValue &&
                        !(field.options ?? []).some(
                          (option) => option.value === effectiveValue
                        ))) ? (
                      <input
                        className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                        placeholder={field.placeholder ?? "Type to customise"}
                        value={effectiveValue ?? ""}
                        onChange={(event) => {
                          onFieldChange(field.id, event.target.value);
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}

                {field.type === "capsule" ? null : field.type === "select" ? (
                  <select
                    className={clsx(sharedInputClasses, "cursor-pointer")}
                    value={inputValue}
                    onChange={handleChange}
                    disabled={false}
                  >
                    <option value="">
                      {field.placeholder ?? "Select an option"}
                    </option>
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
                    disabled={false}
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
                    disabled={false}
                    autoComplete="off"
                  />
                )}
              </label>
            );
          })}
        </form>

        {shouldShowUnlockScreen ? (
          <div className="space-y-6 rounded-2xl bg-gradient-to-r from-[#667eea] to-[#764ba2] p-8 text-center text-white shadow-lg shadow-primary-400/30">
            <div className="flex justify-center">
              <span
                role="img"
                aria-label="Celebration"
                className="text-6xl leading-none"
              >
                🎉
              </span>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">
                Your job post is ready to publish!
              </h2>
              <p className="text-sm text-white/80">
                Take 5 more minutes to answer 4 quick questions and get 3.4×
                more qualified applications.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                { value: "3.4×", label: "More applications" },
                { value: "67%", label: "Higher quality matches" },
                { value: "~5min", label: "Time to complete" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl bg-white/95 px-4 py-5 text-center shadow-sm shadow-primary-900/10"
                >
                  <p className="text-[36px] font-bold text-[#5b4cde]">
                    {item.value}
                  </p>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 text-left">
              {[
                {
                  emoji: "🏢",
                  title: "Work environment",
                  description: "Remote/hybrid, team size, collaboration — ~60s",
                },
                {
                  emoji: "💰",
                  title: "Compensation details",
                  description: "Salary, benefits, equity — ~90s",
                },
                {
                  emoji: "📅",
                  title: "Work schedule",
                  description: "Hours, flexibility, time zone — ~45s",
                },
                {
                  emoji: "✨",
                  title: "Final polish",
                  description: "Instructions, timeline, next steps — ~90s",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="flex gap-4 rounded-2xl bg-white/95 px-4 py-4 text-neutral-700 shadow-sm shadow-primary-900/10"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f2f0ff] text-lg">
                    {item.emoji}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#4d3edf]">
                      {item.title}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-sm font-medium text-white/80">
              💡 Join 73% of top employers who fill roles faster by completing
              these boosters.
            </p>

            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  handleAddOptional(
                    { event: "unlock_screen_continue" },
                    { markUnlock: true }
                  )
                }
                disabled={optionalActionsDisabled}
                className="rounded-full bg-[#5b4cde] px-6 py-3 text-base font-semibold text-white transition hover:bg-[#4c3ac9] disabled:cursor-not-allowed disabled:bg-[#9086f0]"
              >
                Continue to boost my results →
              </button>
              <button
                type="button"
                onClick={handleSkipOptional}
                disabled={optionalActionsDisabled}
                className="text-sm font-semibold text-white/80 transition hover:text-white disabled:cursor-not-allowed disabled:text-white/40"
              >
                I’ll publish now and skip these sections
              </button>
            </div>
          </div>
        ) : (
          <>
            {canRevisitOptional ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-primary-200 bg-white p-4 text-xs text-primary-600">
                <span>
                  {unlockAction === "skip"
                    ? "Optional boosters are paused. Reopen them whenever you’re ready."
                    : "Optional boosters unlocked—dive back in anytime."}
                </span>
                <button
                  type="button"
                  onClick={() => handleAddOptional()}
                  disabled={optionalActionsDisabled}
                  className="rounded-full border border-primary-400 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-primary-500 transition hover:bg-primary-50 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
                >
                  Open optional screens
                </button>
              </div>
            ) : null}

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
                <div className="flex flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleSubmit({
                        includeOptional: true,
                        optionalCompleted: true,
                      })
                    }
                    disabled={
                      persistMutation.isPending ||
                      (currentStepIndex < REQUIRED_STEPS.length &&
                        !currentRequiredStepCompleteInState)
                    }
                    className="rounded-full bg-primary-600 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
                  >
                    {persistMutation.isPending
                      ? "Saving..."
                      : "Generate my hiring pack"}
                  </button>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                    We’ll never publish without your approval.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={
                    (isCurrentStepRequired &&
                      !currentRequiredStepCompleteInState) ||
                    persistMutation.isPending
                  }
                  className="rounded-full bg-primary-600 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
                >
                  Save and continue
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <WizardSuggestionPanel
        state={state}
        messages={assistantMessages}
        onRefresh={() => fetchSuggestionsForStep({ stepId: currentStep?.id })}
        onSendMessage={handleSendMessage}
        onAcceptSuggestion={handleAcceptSuggestion}
        onToggleSuggestion={handleSuggestionToggle}
        isLoading={isFetchingSuggestions}
        isSending={isChatting}
        nextStepTeaser={copilotNextTeaser}
      />
    </div>
  );
}
