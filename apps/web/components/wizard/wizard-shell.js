"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function arraysEqual(left = [], right = []) {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!deepEqual(left[index], right[index])) {
      return false;
    }
  }
  return true;
}

function deepEqual(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return arraysEqual(left, right);
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      if (!deepEqual(left[key], right[key])) {
        return false;
      }
    }
    return true;
  }
  return left === right;
}

function computeStateDiff(previousState = {}, nextState = {}) {
  const diff = {};
  const keys = new Set([
    ...Object.keys(previousState ?? {}),
    ...Object.keys(nextState ?? {}),
  ]);

  for (const key of keys) {
    const prevValue = previousState?.[key];
    const nextValue = nextState?.[key];

    if (isPlainObject(prevValue) && isPlainObject(nextValue)) {
      const nestedDiff = computeStateDiff(prevValue, nextValue);
      if (Object.keys(nestedDiff).length > 0) {
        diff[key] = nestedDiff;
      }
      continue;
    }

    if (Array.isArray(prevValue) && Array.isArray(nextValue)) {
      if (!arraysEqual(prevValue, nextValue)) {
        diff[key] = nextValue;
      }
      continue;
    }

    if (!deepEqual(prevValue, nextValue)) {
      diff[key] = nextValue === undefined ? null : nextValue;
    }
  }

  return diff;
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
        label: "What job title are you hiring for?",
        helper: "Use the title candidates expect to see in listings.",
        required: true,
        placeholder:
          "Assistant Manager / Operations Lead / Sushi Chef / Product Designer",
        type: "text",
        maxLength: 120,
      },
      {
        id: "companyName",
        label: "Which company is hiring for this role?",
        helper: "We reference this name throughout the job assets.",
        required: true,
        placeholder: "Acme Kitchens / Flow Logistics / Studio W",
        type: "text",
        maxLength: 120,
      },
      {
        id: "location",
        label: "Where is the role based?",
        helper: "Enter a city or region, or type “Remote” if the role is fully remote.",
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
        label: "What experience level are you targeting?",
        helper: "Pick the seniority that reflects day-one expectations.",
        required: true,
        type: "capsule",
        options: EXPERIENCE_LEVEL_OPTIONS,
      },
      {
        id: "employmentType",
        label: "What is the employment type?",
        helper: "Clarify whether this is full-time, part-time, contract, or another arrangement.",
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
        label: "How would you describe this role to a candidate?",
        helper: "Explain why the role matters, what success looks like, and the impact they’ll have.",
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
        label: "What is the primary work model?",
        helper: "Set expectations for on-site, hybrid, or remote working rhythms.",
        required: false,
        type: "capsule",
        options: WORK_MODEL_OPTIONS,
      },
      {
        id: "industry",
        label: "Which industry best describes this role?",
        helper: "Helps us suggest relevant benchmarks and examples.",
        required: false,
        placeholder: "Hospitality / Logistics / AI SaaS / Healthcare clinic",
        type: "text",
      },
      {
        id: "zipCode",
        label: "What is the ZIP or postal code for this role?",
        helper: "Improves location-specific benchmarks and distribution targeting.",
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
        id: "currency",
        label: "What currency should we display?",
        helper: "Use an ISO currency like USD, EUR, GBP, ILS, etc.",
        required: false,
        placeholder: "USD / GBP / EUR / ILS",
        type: "text",
        maxLength: 6,
      },
      {
        id: "salary",
        label: "What’s the salary or range you want to advertise?",
        helper: "Example: 60,000–72,000 or 30/hour. We’ll keep formatting consistent for you.",
        required: false,
        placeholder: "60,000 – 72,000 / 30 hourly / 3,500 monthly",
        type: "text"
      },
      {
        id: "salaryPeriod",
        label: "How should we frame the pay cadence?",
        helper: "Example: per year, per month, hourly, per shift.",
        required: false,
        placeholder: "per year / hourly / per shift",
        type: "text"
      }
    ]
  },
  {
    id: "extras",
    title: "Add the finishing touches.",
    subtitle: "This is where you hook the right-fit candidates.",
    fields: [
      {
        id: "benefits",
        label: "What benefits or perks do you offer?",
        helper: "List each on its own line—think about what differentiates your package.",
        required: false,
        placeholder:
          "Health insurance from day one\nPaid parental leave\nQuarterly team retreats",
        type: "textarea",
        rows: 4,
        asList: true,
      },
      {
        id: "coreDuties",
        label: "What are the core responsibilities for this role?",
        helper: "Use quick bullet points so candidates can scan responsibilities at a glance.",
        required: false,
        placeholder:
          "Lead daily standups and unblock the team\nReview and ship features every sprint\nCoach junior teammates through code reviews",
        type: "textarea",
        rows: 4,
        asList: true,
      },
      {
        id: "mustHaves",
        label: "What must-have qualifications should candidates bring?",
        helper: "Call out non-negotiable skills, experience, or certifications.",
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
  const router = useRouter();
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
  const stateRef = useRef(state);
  const previousFieldValuesRef = useRef({});
  const lastSuggestionSnapshotRef = useRef({});
  const [customCapsuleActive, setCustomCapsuleActive] = useState({});
  const [hoveredCapsules, setHoveredCapsules] = useState({});
  const [hasSeenUnlock, setHasSeenUnlock] = useState(false);
  const [unlockAction, setUnlockAction] = useState(null);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [activeToast, setActiveToast] = useState(null);
  const toastTimeoutRef = useRef(null);

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

  useEffect(() => {
    lastSuggestionSnapshotRef.current = {};
  }, [jobId, user?.id]);

  useEffect(() => {
    setUnsavedChanges(!deepEqual(committedState, state));
  }, [committedState, state]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleBeforeUnload = (event) => {
      if (!unsavedChanges) {
        return;
      }
      event.preventDefault();
      // Chrome requires returnValue to be set.
      // eslint-disable-next-line no-param-reassign
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [unsavedChanges]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    if (!unsavedChanges) {
      return undefined;
    }

    const confirmationMessage =
      "You have unsaved changes. Are you sure you want to leave without saving?";

    const handleAnchorClick = (event) => {
      const path =
        typeof event.composedPath === "function" ? event.composedPath() : [];

      let anchor =
        path.find((node) => node instanceof HTMLAnchorElement) ?? null;

      if (!anchor) {
        let element = event.target;
        while (element && element instanceof Element && element.tagName.toLowerCase() !== "a") {
          element = element.parentElement;
        }
        if (element instanceof HTMLAnchorElement) {
          anchor = element;
        }
      }

      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      if (anchor.target && anchor.target !== "_self") {
        return;
      }

      if (anchor.hasAttribute("download")) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }

      const destination = new URL(href, window.location.origin);
      const current = new URL(window.location.href);
      const isSameLocation =
        destination.origin === current.origin &&
        destination.pathname === current.pathname &&
        destination.search === current.search &&
        destination.hash === current.hash;

      if (isSameLocation) {
        return;
      }

      const shouldLeave = window.confirm(confirmationMessage);
      if (!shouldLeave) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const handlePopState = (event) => {
      const shouldLeave = window.confirm(confirmationMessage);
      if (!shouldLeave) {
        event.preventDefault?.();
        window.history.pushState(null, "", window.location.href);
      }
    };

    window.addEventListener("click", handleAnchorClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("click", handleAnchorClick, true);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [unsavedChanges]);

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

  const isLastStep = currentStepIndex === steps.length - 1;
  const totalSteps = steps.length;
  const showUnlockCtas =
    allRequiredStepsCompleteInState && includeOptional === false;

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

  const showToast = useCallback(
    (variant, message) => {
      if (!message) return;
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      setActiveToast({
        id: Date.now(),
        variant,
        message,
      });
      toastTimeoutRef.current = setTimeout(() => {
        setActiveToast(null);
      }, 4000);
    },
    []
  );

  useEffect(
    () => () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    },
    []
  );

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
      const targetStep =
        steps.find((step) => step.id === stepId) ??
        OPTIONAL_STEPS.find((step) => step.id === stepId) ??
        REQUIRED_STEPS.find((step) => step.id === stepId) ??
        null;
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
        const visibleFieldIds = targetStep
          ? targetStep.fields.map((field) => field.id)
          : [];

        if (visibleFieldIds.length === 0) {
          return;
        }

        const shouldForceFetch = Boolean(intentOverrides?.forceRefresh);
        const snapshotEntries = visibleFieldIds.map((fieldId) => {
          const rawValue =
            fieldId === updatedFieldId
              ? updatedValue
              : getDeep(workingState, fieldId);
          if (rawValue === undefined) {
            return [fieldId, { __defined: false }];
          }
          return [fieldId, { __defined: true, value: deepClone(rawValue) }];
        });
        const snapshotKey = JSON.stringify(snapshotEntries);
        if (
          !shouldForceFetch &&
          lastSuggestionSnapshotRef.current[stepId] === snapshotKey
        ) {
          return;
        }

        const response = await WizardApi.fetchSuggestions(
          {
            state: workingState,
            currentStepId: stepId,
            intent: { includeOptional, ...intentOverrides },
            updatedFieldId,
            updatedFieldValue: updatedValue,
            emptyFieldIds,
            upcomingFieldIds,
            visibleFieldIds
          },
          { userId: user.id, jobId: effectiveJobId }
        );

        setHiddenFields({});

        const failure = response.failure;
        setCopilotNextTeaser(
          failure
            ? "I hit a snag fetching fresh suggestions. Tap refresh to try again."
            : ""
        );

        const visibleFieldSet = new Set(visibleFieldIds);
        const suggestions = response.suggestions ?? [];
        lastSuggestionSnapshotRef.current[stepId] = snapshotKey;
        const enrichedSuggestions = suggestions
          .map((suggestion) => {
            if (visibleFieldIds.length > 0 && !visibleFieldSet.has(suggestion.fieldId)) {
              return null;
            }
            const fieldDefinition = findFieldDefinition(suggestion.fieldId);
            const existingValue = getDeep(workingState, suggestion.fieldId);
            if (fieldDefinition && isFieldValueProvided(existingValue, fieldDefinition)) {
              return null;
            }
            const normalized = normalizeValueForField(
              fieldDefinition,
              suggestion.value
            );
            if (normalized === undefined) {
              return null;
            }
            return {
              fieldId: suggestion.fieldId,
              value: normalized,
              rationale:
                suggestion.rationale ??
                "Suggested so candidates understand the opportunity immediately.",
              confidence: suggestion.confidence ?? 0.5,
              source: suggestion.source ?? "copilot"
            };
          })
          .filter(Boolean);

        const fieldOrderIndex = new Map(
          visibleFieldIds.map((fieldId, index) => [fieldId, index])
        );
        const orderedSuggestions = enrichedSuggestions
          .slice()
          .sort(
            (a, b) =>
              (fieldOrderIndex.get(a.fieldId) ?? Number.MAX_SAFE_INTEGER) -
              (fieldOrderIndex.get(b.fieldId) ?? Number.MAX_SAFE_INTEGER)
          );

        setAutofilledFields((prev) => {
          const next = deepClone(prev);
          if (visibleFieldIds.length > 0) {
            visibleFieldIds.forEach((fieldId) => {
              const hasSuggestion = orderedSuggestions.some(
                (candidate) => candidate.fieldId === fieldId
              );
              if (!hasSuggestion) {
                const existing = getDeep(next, fieldId);
                if (existing && !existing.accepted) {
                  setDeep(next, fieldId, undefined);
                }
              }
            });
          }
          orderedSuggestions.forEach((suggestion) => {
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
              suggestedAt: Date.now()
            });
          });
          return next;
        });

        setAssistantMessages((prev) => {
          const base = prev.filter((message) => {
            if (
              message.kind === "suggestion" &&
              (message.meta?.stepId ?? stepId) === stepId
            ) {
              return false;
            }
            if (!failure && message.kind === "error" && message.meta?.type === "suggestion-failure") {
              return false;
            }
            return true;
          });
          const suggestionMessages = orderedSuggestions.map(
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
                rationale: candidate.rationale,
                value: candidate.value,
                mode: "autofill",
                stepId
              }
            })
          );

          return [...base, ...suggestionMessages];
        });

        if (failure) {
          setAssistantMessages((prev) => {
            const base = prev.filter(
              (message) => !(message.kind === "error" && message.meta?.type === "suggestion-failure")
            );
            return [
              ...base,
              {
                id: `suggestion-failure-${Date.now()}`,
                role: "assistant",
                kind: "error",
                content:
                  failure.error
                    ? `I couldn't refresh suggestions (${failure.reason}). ${failure.error}`
                    : `I couldn't refresh suggestions (${failure.reason}). Please try again soon.`,
                meta: { type: "suggestion-failure" }
              }
            ];
          });
        }
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

  useEffect(() => {
    setHiddenFields({});
    setAutofilledFields({});
    setCopilotNextTeaser("");
    setAssistantMessages((prev) =>
      prev.filter(
        (message) =>
          !["followUp", "skip", "improved"].includes(message.kind)
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
      const diff = computeStateDiff(committedState, state);
      const hasChanges = Object.keys(diff).length > 0;
      const creatingJob = !jobId;

      if (!creatingJob && !hasChanges) {
        showToast("info", "No new changes to save.");
        return { savedId: jobId, intent, noChanges: true };
      }

      try {
        const wizardMeta = {
          required_completed: progressCompletedCount === totalProgressFields,
          required_completed_count: progressCompletedCount,
          optional_sections_completed: optionalSectionsCompleted,
          unlock_screen_seen: hasSeenUnlock,
          unlock_screen_action: unlockAction,
        };

        const response = await persistMutation.mutateAsync({
          state: creatingJob ? state : diff,
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
        showToast("success", "Draft saved successfully.");

        return { savedId: response?.jobId ?? jobId, intent };
      } catch (error) {
        showToast("error", error.message ?? "Failed to save your changes.");
        return null;
      }
    },
    [
      announceAuthRequired,
      currentStep?.id,
      jobId,
      includeOptional,
      committedState,
      progressCompletedCount,
      totalProgressFields,
      optionalSectionsCompleted,
      hasSeenUnlock,
      unlockAction,
      persistMutation,
      state,
      showToast,
      user,
    ]
  );

  const onFieldChange = useCallback(
    (fieldId, value, options = {}) => {
      const { preserveSuggestionMeta = false } = options;
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

    },
    []
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
    const shouldForceRefresh = !result.noChanges;

    goToStep(nextIndex);
    await fetchSuggestionsForStep({
      stepId: nextStep?.id ?? stepId,
      intentOverrides: {
        ...result.intent,
        forceRefresh: shouldForceRefresh || undefined
      },
      jobIdOverride: result.savedId,
    });
  };

  const handleBack = async () => {
    if (currentStepIndex === 0) {
      return;
    }

    if (unsavedChanges) {
      showToast("warning", "Save your changes before leaving this step.");
      return;
    }

    const previousIndex = currentStepIndex - 1;
    goToStep(previousIndex);
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

    const shouldForceRefresh = !result.noChanges;

    await fetchSuggestionsForStep({
      stepId,
      intentOverrides: {
        ...result.intent,
        forceRefresh: shouldForceRefresh || undefined
      },
      jobIdOverride: result.savedId,
    });
  };

  const handleAddOptional = useCallback(async () => {
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

    const result = await persistCurrentDraft({ includeOptional: true }, currentStep?.id);
    if (!result) {
      return;
    }

    setHasSeenUnlock(true);
    setUnlockAction("continue");
    setIncludeOptional(true);
    setCommittedState(() => deepClone(state));
    setUnsavedChanges(false);

    const nextIndex = REQUIRED_STEPS.length;
    const optionalFlowSteps = [...REQUIRED_STEPS, ...OPTIONAL_STEPS];
    const nextStep = optionalFlowSteps[nextIndex] ?? OPTIONAL_STEPS[0];
    const shouldForceRefresh = !result.noChanges;

    goToStep(nextIndex);
    await fetchSuggestionsForStep({
      stepId: nextStep?.id ?? OPTIONAL_STEPS[0]?.id,
      intentOverrides: {
        includeOptional: true,
        forceRefresh: shouldForceRefresh || undefined
      },
      jobIdOverride: result.savedId ?? jobId ?? undefined,
    });
  }, [
    allRequiredStepsCompleteInState,
    currentStep?.id,
    fetchSuggestionsForStep,
    goToStep,
    jobId,
    persistCurrentDraft,
    setAssistantMessages,
    setCommittedState,
    setHasSeenUnlock,
    setIncludeOptional,
    setUnlockAction,
    setUnsavedChanges,
    state,
  ]);

  const handleSkipOptional = useCallback(async () => {
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

    const result = await persistCurrentDraft(
      { includeOptional: false, publishNow: true },
      currentStep?.id
    );
    if (!result) {
      return;
    }

    setHasSeenUnlock(true);
    setUnlockAction("skip");
    setCommittedState(() => deepClone(state));
    setUnsavedChanges(false);

    router.push("/assets");
  }, [
    allRequiredStepsCompleteInState,
    currentStep?.id,
    persistCurrentDraft,
    router,
    setAssistantMessages,
    setCommittedState,
    setHasSeenUnlock,
    setUnlockAction,
    setUnsavedChanges,
    state,
  ]);

  const handleAcceptSuggestion = useCallback(
    async (suggestion) => {
      if (!user) {
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
    },
    [announceAuthRequired, onFieldChange, user]
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

      if (unsavedChanges) {
        showToast("warning", "Save your changes before switching screens.");
        return;
      }

      goToStep(index);
      await fetchSuggestionsForStep({
        stepId: targetStep.id,
      });
    },
    [
      currentStepIndex,
      currentRequiredStepCompleteInState,
      allRequiredStepsCompleteInState,
      isCurrentStepRequired,
      unsavedChanges,
      showToast,
      fetchSuggestionsForStep,
      goToStep,
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

  const visibleAssistantMessages = useMemo(() => {
    const activeStepId = currentStep?.id;
    if (!activeStepId) {
      return assistantMessages;
    }
    return assistantMessages.filter((message) => {
      if (message.kind !== "suggestion") {
        return true;
      }
      return message.meta?.stepId === activeStepId;
    });
  }, [assistantMessages, currentStep?.id]);

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
            Changes stay local until you press “Save & Continue.” Skip anything
            that doesn’t apply—you can always return before saving.
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

            const isCapsuleField = field.type === "capsule";
            const FieldContainer = isCapsuleField ? "div" : "label";

            return (
              <FieldContainer
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

                {isCapsuleField ? (
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
                ) : field.type === "select" ? (
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
              </FieldContainer>
            );
          })}
        </form>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <button
            type="button"
            onClick={handleBack}
            disabled={currentStepIndex === 0}
            className="self-start rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 transition hover:border-primary-500 hover:text-primary-600 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
          >
            Back
          </button>
          {showUnlockCtas ? (
            <div className="flex flex-col items-end gap-2 text-right">
              <p className="text-xs font-medium text-neutral-500">
                Required complete. Continue to improve (recommended) or publish now.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={handleAddOptional}
                  disabled={persistMutation.isPending}
                  className="rounded-full bg-primary-600 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
                >
                  {persistMutation.isPending
                    ? "Saving..."
                    : "Continue — Boost my result (recommended)"}
                </button>
                <button
                  type="button"
                  onClick={handleSkipOptional}
                  disabled={persistMutation.isPending}
                  className="rounded-full border border-neutral-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-600 transition hover:border-primary-400 hover:text-primary-600 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
                >
                  {persistMutation.isPending
                    ? "Saving..."
                    : "Publish now and skip"}
                </button>
              </div>
            </div>
          ) : isLastStep ? (
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
                (isCurrentStepRequired && !currentRequiredStepCompleteInState) ||
                persistMutation.isPending
              }
              className="rounded-full bg-primary-600 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
            >
              {persistMutation.isPending ? "Saving..." : "Save & Continue"}
            </button>
          )}
        </div>
      </div>

      <WizardSuggestionPanel
        messages={visibleAssistantMessages}
        onRefresh={() =>
          fetchSuggestionsForStep({
            stepId: currentStep?.id,
            intentOverrides: { forceRefresh: true }
          })
        }
        onSendMessage={handleSendMessage}
        onAcceptSuggestion={handleAcceptSuggestion}
        onToggleSuggestion={handleSuggestionToggle}
        isLoading={isFetchingSuggestions}
        isSending={isChatting}
        nextStepTeaser={copilotNextTeaser}
        jobState={committedState}
        isJobTabEnabled={allRequiredStepsCompleteInState}
      />
    </div>
  );
}
