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
  { value: "temp", label: "Temporary" },
  { value: "intern", label: "Internship" },
];

const SALARY_PERIOD_OPTIONS = [
  { value: "hour", label: "Per hour" },
  { value: "month", label: "Per month" },
  { value: "year", label: "Per year" },
];

const SALARY_VISIBILITY_OPTIONS = [
  { value: "show_full", label: "Show full range" },
  { value: "show_min", label: "Show starting point" },
  { value: "show_competitive", label: "List as “competitive pay”" },
  { value: "hide", label: "Keep pay hidden for now" },
];

const APPLY_METHOD_OPTIONS = [
  { value: "internal_form", label: "Internal form" },
  { value: "external_link", label: "External link" },
  { value: "both", label: "Internal form + external link" },
];

const EXPERIENCE_LEVEL_OPTIONS = [
  { value: "entry", label: "Entry level" },
  { value: "mid", label: "Mid level" },
  { value: "senior", label: "Senior" },
];

const JOB_FAMILY_OPTIONS = [
  { value: "Front-of-house service", label: "Front-of-house service" },
  { value: "Warehouse operations", label: "Warehouse operations" },
  { value: "Resident care", label: "Resident care" },
  { value: "Customer support", label: "Customer support" },
  { value: "Growth marketing", label: "Growth marketing" },
  { value: "Sales & revenue", label: "Sales & revenue" }
];

const COUNTRY_CAPSULE_OPTIONS = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "UK", label: "United Kingdom" },
  { value: "DE", label: "Germany" },
  { value: "AU", label: "Australia" },
  { value: "IL", label: "Israel" }
];

const PROGRESS_TRACKING_FIELDS = [
  "core.job_title",
  "core.job_family",
  "core.seniority_level",
  "location.city",
  "location.country",
  "location.work_model",
  "role_description.recruiter_input"
];

const REQUIRED_STEPS = [
  {
    id: "role-setup",
    title: "Let’s set up the role.",
    subtitle: "Nothing is published yet. We’re just collecting the essentials.",
    fields: [
      {
        id: "core.job_title",
        label: "What title will candidates recognise?",
        helper:
          "Plain titles get more clicks than clever ones, which means more qualified applicants for you.",
        required: true,
        placeholder:
          "Store Manager / Line Cook / Delivery Driver / Office Coordinator / Sales Lead",
        type: "text",
        maxLength: 120,
      },
      {
        id: "core.job_family",
        label: "Which team or area does this role support?",
        helper:
          "Helps us highlight the right responsibilities and target the right talent pools.",
        required: true,
        type: "capsule",
        options: JOB_FAMILY_OPTIONS,
        allowCustom: true,
        customLabel: "Something else"
      },
      {
        id: "core.seniority_level",
        label: "What level are you hiring for?",
        helper:
          "Sets salary benchmarks and messaging, so you don’t waste time with the wrong seniority.",
        required: true,
        type: "capsule",
        options: EXPERIENCE_LEVEL_OPTIONS,
      },
      {
        id: "location.city",
        label: "Where will most of the work happen?",
        helper:
          "Pin the main city so pay ranges and job ads stay relevant for your candidates.",
        required: true,
        placeholder: "Austin / Haifa / Berlin / Cape Town / Manchester",
        type: "text",
      },
      {
        id: "location.country",
        label: "Which country’s rules do we need to respect?",
        helper:
          "Use a two-letter country code so we load the right compliance and benefits guidance.",
        required: true,
        type: "capsule",
        options: COUNTRY_CAPSULE_OPTIONS,
        allowCustom: true,
        customLabel: "Other country"
      },
      {
        id: "location.work_model",
        label: "Where will they spend most shifts?",
        helper:
          "We’ll keep messaging honest about on-site vs. remote so you get fewer misaligned applicants.",
        required: true,
        type: "capsule",
        options: WORK_MODEL_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label
        })),
      },
      {
        id: "role_description.recruiter_input",
        label: "What do you need this person to take care of?",
        helper:
          "Describe the mission in your own words—we’ll polish it so candidates feel the purpose.",
        required: true,
        placeholder:
          "Keep evening service running smoothly, coach the five-person crew, and jump in wherever guests need help.",
        type: "textarea",
        rows: 5,
      },
    ],
  },
  {
    id: "role-story",
    title: "Why this role is important.",
    subtitle: "We’ll only show what you approve before anything goes live.",
    fields: [
      {
        id: "role_description.problem_being_solved",
        label: "Why do you need this role right now?",
        helper:
          "Share the story you’d tell a teammate—this is what convinces great people to apply.",
        required: true,
        placeholder:
          "We’re opening a second evening shift and need someone to keep service fast while the new team ramps.",
        type: "textarea",
        rows: 4,
      },
      {
        id: "role_description.first_30_60_90_days.days_30",
        label: "In the first month they should be able to...",
        helper:
          "Setting a 30-day target helps new hires ramp faster and gives them a clear win.",
        required: false,
        placeholder:
          "Shadow each shift lead, learn our POS and safety routines, and run the floor with support.",
        type: "textarea",
        rows: 3,
      },
      {
        id: "role_description.first_30_60_90_days.days_60",
        label: "By 60 days, doing great looks like...",
        helper:
          "Paint the trajectory so candidates can picture themselves thriving here.",
        required: false,
        placeholder:
          "Own two evening shifts a week, coach newer teammates, and keep ticket times under six minutes.",
        type: "textarea",
        rows: 3,
      },
      {
        id: "role_description.first_30_60_90_days.days_90",
        label: "After a few months, they should be able to...",
        helper:
          "Helps you attract people who love growing with a team—not just clocking in.",
        required: false,
        placeholder:
          "Lead the weekend crew, flag process improvements, and keep guest satisfaction above 95%.",
        type: "textarea",
        rows: 3,
      },
      {
        id: "team_context.reporting_structure.reports_to",
        label: "Who will they report to or shadow most often?",
        helper:
          "Names or titles make the opportunity feel real and supportive.",
        required: false,
        placeholder:
          "Evening Service Manager / Head Nurse / Warehouse Supervisor / VP Marketing",
        type: "text",
      },
      {
        id: "team_context.collaboration_style",
        label: "Who will they work closely with most of the day?",
        helper:
          "Let candidates know the crew size and rhythm so they can picture the vibe.",
        required: false,
        placeholder:
          "Six-person front-of-house pod, daily huddles with logistics, weekly syncs with marketing.",
        type: "textarea",
        rows: 3,
      },
    ],
  },
  {
    id: "pay-schedule",
    title: "Pay, schedule, and what a typical day looks like.",
    subtitle:
      "Transparent expectations mean fewer no-shows and faster hires. We’ll only show what you approve.",
    fields: [
      {
        id: "core.employment_type",
        label: "What type of employment is this?",
        helper:
          "Clarifies benefits and compliance so you’re never surprised later.",
        required: true,
        placeholder: "Select employment type",
        type: "select",
        options: EMPLOYMENT_TYPE_OPTIONS,
      },
      {
        id: "compensation.salary_range.currency",
        label: "What currency should we list?",
        helper:
          "Keeps the salary clear for candidates and aligns with your payroll.",
        required: false,
        placeholder: "USD / GBP / EUR / ILS / ZAR",
        type: "text",
        maxLength: 3,
      },
      {
        id: "compensation.salary_range.min",
        label: "What’s a realistic starting pay?",
        helper:
          "Filters out mismatched applicants before they ever hit your calendar.",
        required: false,
        placeholder: "18 (hourly) / 3200 (monthly) / 55000 (annual)",
        type: "number",
        valueAs: "number",
      },
      {
        id: "compensation.salary_range.max",
        label: "What’s the top of the range you’d consider?",
        helper:
          "Keeps you competitive without overpaying, and signals growth to candidates.",
        required: false,
        placeholder: "24 (hourly) / 3800 (monthly) / 72000 (annual)",
        type: "number",
        valueAs: "number",
      },
      {
        id: "compensation.salary_range.period",
        label: "Is that per hour, month, or year?",
        helper: "Choose the cadence you actually use when talking pay.",
        required: false,
        type: "select",
        options: SALARY_PERIOD_OPTIONS,
      },
      {
        id: "compensation.salary_range.display_strategy",
        label: "How much of the pay range should we show in job ads?",
        helper:
          "Pick what candidates will see—the copilot keeps the full range for campaigns and reporting.",
        required: false,
        type: "select",
        options: SALARY_VISIBILITY_OPTIONS,
      },
      {
        id: "compensation.salary_range.overtime_eligible",
        label: "Should they expect overtime pay?",
        helper:
          "Being upfront about overtime avoids awkward conversations after they join.",
        required: false,
        type: "select",
        options: [
          { value: "true", label: "Yes, overtime is part of the role" },
          { value: "false", label: "No, overtime isn’t expected" },
        ],
        valueAs: "boolean",
      },
      {
        id: "role_description.day_to_day",
        label: "What does a typical shift or day include?",
        helper:
          "When people can picture the work, you get better-fit applicants and fewer early exits.",
        required: false,
        placeholder:
          "Greet guests, stage orders, coach newer teammates, close out the POS, share feedback with logistics.",
        type: "textarea",
        rows: 4,
        asList: true,
      },
      {
        id: "compensation.bonus_structure.type",
        label: "Do you offer bonuses we should mention?",
        helper:
          "Select the bonus style so we pitch it accurately—add details in the next field if needed.",
        required: false,
        type: "select",
        options: [
          { value: "performance", label: "Performance based" },
          { value: "signing", label: "Signing bonus" },
          { value: "annual", label: "Annual bonus" },
          { value: "quarterly", label: "Quarterly bonus" },
        ],
      },
      {
        id: "compensation.bonus_structure.potential",
        label: "How would you describe that bonus potential?",
        helper:
          "Share ranges or examples so we can sell the upside without overpromising.",
        required: false,
        placeholder:
          "Up to 10% quarterly when team hits targets / $2,000 signing bonus paid over 6 months",
        type: "textarea",
        rows: 2,
      },
      {
        id: "compensation.equity.offered",
        label: "Any equity or profit sharing on the table?",
        helper:
          "Helps attract growth-minded candidates and keeps messaging compliant.",
        required: false,
        type: "select",
        options: [
          { value: "true", label: "Yes, we offer equity or profit share" },
          { value: "false", label: "No equity or profit share" },
        ],
        valueAs: "boolean",
      },
      {
        id: "compensation.equity.type",
        label: "What kind of equity is it?",
        helper:
          "Mention the format so candidates know what to expect (options, RSUs, phantom units, etc.).",
        required: false,
        type: "select",
        options: [
          { value: "stock_options", label: "Stock options" },
          { value: "rsu", label: "Restricted stock units (RSUs)" },
          { value: "phantom", label: "Phantom equity / profit share" },
          { value: "none", label: "Not applicable" },
        ],
      },
      {
        id: "compensation.equity.range",
        label: "Any equity range or context worth noting?",
        helper:
          "Share the typical grant or how it vests so we can set expectations.",
        required: false,
        placeholder:
          "0.05%–0.1% options with 4-year vesting / 5% profit share after probation",
        type: "textarea",
        rows: 2,
      },
      {
        id: "benefits.standout_benefits",
        label: "Any perks or extras worth highlighting?",
        helper:
          "This is where you win hearts—meals, stipends, wellness, tips, training.",
        required: false,
        placeholder:
          "Shared tips each shift, paid certifications, commuter stipend, wellness days, growth budget",
        type: "textarea",
        rows: 3,
        asList: true,
      },
      {
        id: "requirements.hard_requirements.dealbreakers",
        label: "Any schedule or physical deal-breakers to flag?",
        helper:
          "Setting expectations now keeps you from interviewing people who will say no later.",
        required: false,
        placeholder:
          "Rotating weekends\nComfortable lifting 25kg\nOn-call every third week\nTravel 20% within region",
        type: "textarea",
        rows: 3,
        asList: true,
      },
    ],
  },
];

const OPTIONAL_STEPS = [
  {
    id: "right-fit",
    title: "Who’s the right fit?",
    subtitle:
      "This helps you avoid interviewing the wrong people and keeps your team focused.",
    fields: [
      {
        id: "requirements.hard_requirements.technical_skills.must_have",
        label: "What must every qualified person already have?",
        helper:
          "Think licenses, tools, or experience they need on day one—no second guessing.",
        required: false,
        placeholder:
          "Forklift licence\nComfort with EHR systems\nFood safety level 2\nExperience leading store opens",
        type: "textarea",
        rows: 4,
        asList: true,
      },
      {
        id: "requirements.hard_requirements.certifications",
        label: "Any licences or certifications they must hold?",
        helper:
          "Keeps compliance tight and saves you from late-stage surprises.",
        required: false,
        placeholder: "CDL-B\nCNA licence\nCPR + First Aid\nSecurity clearance level 1",
        type: "textarea",
        rows: 3,
        asList: true,
      },
      {
        id: "requirements.hard_requirements.legal.work_authorization",
        label: "Work authorisation or background requirements?",
        helper:
          "Mention work permits, background checks, or driving record needs upfront.",
        required: false,
        placeholder:
          "Eligible to work in Australia\nClean driving record\nAble to pass background + drug screen",
        type: "textarea",
        rows: 3,
        asList: true,
      },
      {
        id: "requirements.hard_requirements.legal.other_notes",
        label: "Anything else they should know before applying?",
        helper:
          "Probation periods, union membership, or other callouts go here.",
        required: false,
        placeholder: "90-day probation period\nUnion dues after first month",
        type: "textarea",
        rows: 3,
      },
      {
        id: "requirements.preferred_qualifications.skills",
        label: "Nice-to-haves that make someone shine?",
        helper:
          "We’ll pitch these as bonus points so you attract the overachievers without scaring others off.",
        required: false,
        placeholder:
          "Speaks Spanish or French\nExperience with Salesforce\nComfort presenting to leadership",
        type: "textarea",
        rows: 4,
        asList: true,
      },
    ],
  },
  {
    id: "apply-flow",
    title: "How should people apply (and what happens next)?",
    subtitle:
      "We’ll never publish without your approval. This simply keeps candidates confident.",
    fields: [
      {
        id: "application_process.apply_method",
        label: "Where should great applicants apply?",
        helper:
          "Pick the path you prefer—your copilot routes qualified leads straight to you.",
        required: false,
        type: "select",
        options: APPLY_METHOD_OPTIONS,
      },
      {
        id: "application_process.internal_form_id",
        label: "Internal form or ATS reference (optional)",
        helper:
          "Drop an identifier or link so we sync seamlessly with your existing process.",
        required: false,
        placeholder: "greenhouse_job_872 / forms.gle/your-form / Notion intake link",
        type: "text",
      },
      {
        id: "application_process.external_url",
        label: "External apply link (optional)",
        helper:
          "We only share this after you’ve approved the hiring pack.",
        required: false,
        placeholder:
          "https://company.com/careers/store-manager or https://indeed.com/job/123",
        type: "text",
      },
      {
        id: "application_process.steps",
        label: "What happens after they apply?",
        helper:
          "List the steps or interview stages so candidates know you have a plan.",
        required: false,
        placeholder:
          "Phone screen → On-site shadow → Manager interview → Offer call",
        type: "textarea",
        rows: 3,
        asList: true,
      },
      {
        id: "application_process.total_timeline",
        label: "How long does the whole process usually take?",
        helper:
          "Setting expectations up front keeps candidates engaged and reduces drop-off.",
        required: false,
        placeholder:
          "1 week for frontline roles / 3 weeks for leadership / Fast-track for seasonal hires",
        type: "textarea",
        rows: 2,
      },
      {
        id: "application_process.start_date.target",
        label: "When would you ideally like them to start?",
        helper:
          "Concrete dates or just \"ASAP\" both work—this helps you forecast staffing.",
        required: false,
        placeholder:
          "Within 2 weeks / 1 November 2024 / Before holiday peak / ASAP",
        type: "text",
      },
      {
        id: "application_process.start_date.flexibility",
        label: "How flexible is that start date?",
        helper:
          "Tell us if there’s wiggle room so we can frame urgency the right way.",
        required: false,
        placeholder:
          "Can start earlier for the right person / Firm date because of training / Flexible within the month",
        type: "textarea",
        rows: 2,
      },
    ],
  },
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

  if (field.id === "location.country" && typeof proposal === "string") {
    return proposal.toUpperCase().slice(0, 2);
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
        "Hi! I’m your recruiting copilot. Ask for market data, salary bands, or copy tweaks any time.",
    },
  ]);
  const [isChatting, setIsChatting] = useState(false);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [hiddenFields, setHiddenFields] = useState({});
  const [autofilledFields, setAutofilledFields] = useState({});
  const [copilotNextTeaser, setCopilotNextTeaser] = useState("");
  const suggestionDebounceRef = useRef(null);
  const stateRef = useRef(state);
  const previousFieldValuesRef = useRef({});
  const [customCapsuleActive, setCustomCapsuleActive] = useState({});

  const steps = useMemo(
    () =>
      includeOptional ? [...REQUIRED_STEPS, ...OPTIONAL_STEPS] : REQUIRED_STEPS,
    [includeOptional]
  );

  const currentStep = steps[currentStepIndex];

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const allRequiredStepsCompleteInState = useMemo(
    () => REQUIRED_STEPS.every((step) => isStepComplete(step, state, hiddenFields)),
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
      return count + (isFieldValueProvided(getDeep(state, fieldId), def) ? 1 : 0);
    }, 0);
  }, [state]);

  const totalProgressFields = PROGRESS_TRACKING_FIELDS.length;
  const progressPercent =
    totalProgressFields === 0
      ? 0
      : Math.round((progressCompletedCount / totalProgressFields) * 100);

  const capsuleClassName = useCallback(
    (isActive) =>
      clsx(
        "px-5 py-2.5 rounded-full border-2 text-sm font-semibold transition-all duration-150",
        isActive
          ? "border-[#667eea] bg-[#667eea] text-white shadow-sm shadow-[#667eea]/50"
          : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#667eea] hover:bg-[#f5f7ff] hover:-translate-y-0.5"
      ),
    []
  );

  const showOptionalDecision =
    !includeOptional && currentStepIndex === REQUIRED_STEPS.length - 1;
  const isLastStep = currentStepIndex === steps.length - 1;
  const totalSteps = steps.length;

    const persistMutation = useMutation({
    mutationFn: ({ state: draftState, userId, jobId, intent, currentStepId }) =>
      WizardApi.persistDraft(draftState, {
        userId,
        jobId,
        intent,
        currentStepId,
      }),
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
    }
  }, [committedState, hiddenFields, includeOptional]);

  const announceAuthRequired = useCallback(() => {
    setAssistantMessages((prev) => [
      ...prev,
      {
        id: `auth-${Date.now()}`,
        role: "assistant",
        kind: "error",
        content: "Please sign in to continue working on this draft.",
      },
    ]);
  }, []);

  const fetchSuggestionsForStep = useCallback(
    async ({
      stepId = currentStep?.id,
      intentOverrides = {},
      jobIdOverride,
      updatedFieldId,
      updatedValue
    } = {}) => {
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
          const normalized = normalizeValueForField(fieldDefinition, candidate.value);

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
                meta: { ...item, friendlyLabel }
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
    [announceAuthRequired, currentStep?.id, draftId, includeOptional, steps, user]
  );


  const scheduleRealtimeSuggestions = useCallback(
    (fieldId, value) => {
      if (!currentStep?.id) return;
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

  const onFieldChange = useCallback(
    (fieldId, value, options = {}) => {
      const {
        preserveSuggestionMeta = false,
        skipRealtime = false,
      } = options;
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
    },
    [scheduleRealtimeSuggestions]
  );

  useEffect(() => {
    setHiddenFields({});
    setAutofilledFields({});
    setCopilotNextTeaser("");
    if (suggestionDebounceRef.current) {
      clearTimeout(suggestionDebounceRef.current);
      suggestionDebounceRef.current = null;
    }
    setAssistantMessages((prev) =>
      prev.filter(
        (message) =>
          !["suggestion", "followUp", "skip", "improved"].includes(
            message.kind
          )
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
        const response = await persistMutation.mutateAsync({
          state,
          userId: user.id,
          jobId: draftId,
          intent,
          currentStepId: stepId,
        });

        if (response?.draftId) {
          setDraftId(response.draftId);
        }

        setCommittedState(() => deepClone(state));

        return { savedId: response?.draftId ?? draftId, intent };
      } catch (error) {
        setAssistantMessages((prev) => [
          ...prev,
          {
            id: `persist-error-${Date.now()}`,
            role: "assistant",
            kind: "error",
            content: error.message ?? "Failed to save the draft.",
          },
        ]);
        return null;
      }
    },
    [
      announceAuthRequired,
      currentStep?.id,
      draftId,
      includeOptional,
      persistMutation,
      state,
      user,
    ]
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

  const handleAddOptional = async () => {
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
    await fetchSuggestionsForStep({
      stepId: nextStep?.id ?? "pay-schedule",
      intentOverrides: nextIntent,
      jobIdOverride: result.savedId,
    });
  };

  const handleAcceptSuggestion = useCallback(
    async (suggestion) => {
      if (!user || !draftId) {
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
        confidence:
          suggestion.confidence ?? existing.confidence ?? 0.5,
        appliedAt: Date.now(),
      });
      return next;
    });

    try {
      await WizardApi.mergeSuggestion(
        {
          jobId: draftId,
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
    [announceAuthRequired, committedState, draftId, fetchSuggestionsForStep, onFieldChange, user]
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
          jobId: draftId ?? undefined,
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
        drafts will be saved to Firestore and synced across the console.
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
              </button>
            );
          })}
        </nav>

        <div className="space-y-3 rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-neutral-800">
              {progressCompletedCount} of {totalProgressFields} complete
            </span>
            <span className="text-xs font-medium text-primary-500">
              {progressPercent}% done
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#667eea] to-[#764ba2] transition-all duration-200"
              style={{ width: `${Math.min(100, Math.max(progressPercent, progressCompletedCount > 0 ? 6 : 0))}%` }}
            />
          </div>
          <p className="text-xs text-neutral-500">
            We autosave as you go. Skip anything that doesn’t apply—you can always come back.
          </p>
        </div>

        {currentStep ? (
          <div className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm shadow-neutral-100">
            <h1 className="text-xl font-semibold text-neutral-800">
              {currentStep.title}
            </h1>
            {currentStep.subtitle ? (
              <p className="text-sm text-neutral-500">
                {currentStep.subtitle}
              </p>
            ) : null}
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

              if (field.id === "location.country") {
                onFieldChange(field.id, value.toUpperCase().slice(0, 2));
                return;
              }

              onFieldChange(field.id, value);
            };

            const sharedInputClasses = clsx(
              "rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100",
              isSuggestedValue ? "border-primary-300 bg-primary-50" : ""
            );

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
                        return (
                          <button
                            type="button"
                            key={optionValue}
                            className={capsuleClassName(isActive)}
                            onClick={() => {
                              setCustomCapsuleActive((prev) => ({
                                ...prev,
                                [field.id]: false
                              }));
                              const nextValue =
                                field.id === "location.country"
                                  ? optionValue.toUpperCase()
                                  : optionValue;
                              onFieldChange(field.id, nextValue);
                            }}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                      {field.allowCustom ? (
                        <button
                          type="button"
                          className={capsuleClassName(
                            Boolean(customCapsuleActive[field.id]) ||
                              (effectiveValue &&
                                !(field.options ?? []).some(
                                  (option) => option.value === effectiveValue
                                ))
                          )}
                          onClick={() => {
                            setCustomCapsuleActive((prev) => ({
                              ...prev,
                              [field.id]: true
                            }));
                            if (
                              (field.options ?? []).some(
                                (option) => option.value === effectiveValue
                              )
                            ) {
                              onFieldChange(field.id, "");
                            }
                          }}
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
                          const nextValue =
                            field.id === "location.country"
                              ? event.target.value.toUpperCase().slice(0, 2)
                              : event.target.value;
                          onFieldChange(field.id, nextValue);
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

        {showOptionalDecision ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-primary-50/50 p-4 text-sm">
            <p className="text-neutral-600">
              Optional questions unlock richer campaigns and smarter screening,
              but you can skip them and finish whenever you’re ready.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleAddOptional}
                disabled={
                  !allRequiredStepsCompleteInState || persistMutation.isPending
                }
                className="rounded-full border border-primary-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-600 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
              >
                Add optional questions
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSubmit({
                    includeOptional: false,
                    optionalCompleted: false,
                  })
                }
                disabled={
                  !allRequiredStepsCompleteInState || persistMutation.isPending
                }
                className="rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
              >
                Skip optional questions
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
