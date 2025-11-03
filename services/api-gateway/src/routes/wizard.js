import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { wrapAsync, httpError } from "@wizard/utils";
import { JobSchema, JobSuggestionSchema, deriveJobStatusFromState } from "@wizard/core";

const JOB_COLLECTION = "jobs";
const SUGGESTION_COLLECTION = "jobSuggestions";

const looseObjectSchema = z.object({}).catchall(z.unknown());

const ALLOWED_INTAKE_KEYS = [
  "roleTitle",
  "companyName",
  "location",
  "zipCode",
  "industry",
  "seniorityLevel",
  "employmentType",
  "workModel",
  "jobDescription",
  "coreDuties",
  "mustHaves",
  "benefits",
  "schedule",
  "compensation"
];

const REQUIRED_FIELD_PATHS = [
  "roleTitle",
  "companyName",
  "location",
  "seniorityLevel",
  "employmentType",
  "jobDescription"
];

const draftRequestSchema = z.object({
  jobId: z.string().optional(),
  state: looseObjectSchema.default({}),
  intent: looseObjectSchema.optional(),
  currentStepId: z.string()
});

const suggestionsRequestSchema = z.object({
  jobId: z.string(),
  state: looseObjectSchema.default({}),
  intent: looseObjectSchema.optional(),
  currentStepId: z.string(),
  updatedFieldId: z.string().optional(),
  updatedFieldValue: z.unknown().optional(),
  emptyFieldIds: z.array(z.string()).optional(),
  upcomingFieldIds: z.array(z.string()).optional()
});

const mergeRequestSchema = z.object({
  jobId: z.string(),
  fieldId: z.string(),
  value: z.unknown()
});

function requireUserId(req) {
  const userId = req.headers["x-user-id"];
  if (!userId || typeof userId !== "string") {
    throw httpError(401, "Missing x-user-id header");
  }
  return userId;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, update) {
  if (!isPlainObject(update)) {
    return update === undefined ? base : update;
  }

  const result = isPlainObject(base) ? { ...base } : {};

  const keys = new Set([
    ...Object.keys(isPlainObject(base) ? base : {}),
    ...Object.keys(update)
  ]);

  for (const key of keys) {
    const incoming = update[key];
    const existing = isPlainObject(base) ? base[key] : undefined;

    if (incoming === undefined) {
      continue;
    }

    if (isPlainObject(incoming) && isPlainObject(existing)) {
      const mergedChild = deepMerge(existing, incoming);
      if (mergedChild === undefined || (isPlainObject(mergedChild) && Object.keys(mergedChild).length === 0)) {
        delete result[key];
      } else {
        result[key] = mergedChild;
      }
    } else if (Array.isArray(incoming)) {
      result[key] = incoming.slice();
    } else {
      result[key] = incoming;
    }
  }

  return result;
}

function deepClone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function getDeep(target, path) {
  if (!path || !target) return path ? undefined : target;
  const parts = path.split(".");
  let current = target;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function setDeep(target, path, value) {
  if (!path) return;
  const parts = path.split(".");
  const last = parts.pop();
  let current = target;
  for (const part of parts) {
    if (!isPlainObject(current[part])) {
      current[part] = {};
    }
    current = current[part];
  }
  if (value === undefined) {
    delete current[last];
  } else {
    current[last] = value;
  }
}

function createBaseJob({ jobId, userId, now }) {
  return JobSchema.parse({
    id: jobId,
    ownerUserId: userId,
    orgId: null,
    status: "draft",
    stateMachine: {
      currentState: "DRAFT",
      previousState: null,
      history: [],
      requiredComplete: false,
      optionalComplete: false,
      lastTransitionAt: now,
      lockedByRequestId: null
    },
    roleTitle: "",
    companyName: "",
    location: "",
    zipCode: undefined,
    industry: undefined,
    seniorityLevel: "entry",
    employmentType: "full_time",
    workModel: undefined,
    jobDescription: "",
    coreDuties: [],
    mustHaves: [],
    benefits: [],
    schedule: { days: [], shiftTimes: [] },
    compensation: {},
    createdAt: now,
    updatedAt: now,
    archivedAt: null
  });
}

function mergeIntakeIntoJob(job, incomingState = {}, { now }) {
  const nextJob = deepClone(job);

  for (const key of ALLOWED_INTAKE_KEYS) {
    if (!(key in incomingState)) {
      continue;
    }
    const incomingValue = incomingState[key];
    const existingValue = nextJob[key];

    if (isPlainObject(incomingValue) && isPlainObject(existingValue)) {
      nextJob[key] = deepMerge(existingValue, incomingValue);
    } else {
      nextJob[key] = incomingValue;
    }
  }

  nextJob.updatedAt = now;
  return nextJob;
}

function computeRequiredProgress(jobState) {
  const total = REQUIRED_FIELD_PATHS.length;
  let completed = 0;

  for (const fieldPath of REQUIRED_FIELD_PATHS) {
    if (valueProvidedAt(jobState, fieldPath)) {
      completed += 1;
    }
  }

  return {
    total,
    completed,
    allComplete: completed === total,
    started: completed > 0
  };
}

function applyRequiredProgress(job, progress, now) {
  const nextJob = deepClone(job);
  const machine = normalizeStateMachine(nextJob.stateMachine, now);

  machine.history = Array.isArray(machine.history) ? machine.history : [];
  machine.requiredComplete = progress.allComplete;

  if (progress.allComplete) {
    if (machine.currentState === "DRAFT") {
      machine.history.push({
        from: "DRAFT",
        to: "REQUIRED_IN_PROGRESS",
        at: now,
        reason: "Started filling required fields"
      });
      machine.currentState = "REQUIRED_IN_PROGRESS";
    }
    if (machine.currentState === "REQUIRED_IN_PROGRESS") {
      machine.history.push({
        from: "REQUIRED_IN_PROGRESS",
        to: "REQUIRED_COMPLETE",
        at: now,
        reason: "All required fields complete"
      });
      machine.currentState = "REQUIRED_COMPLETE";
    }
  } else if (progress.started && machine.currentState === "DRAFT") {
    machine.history.push({
      from: "DRAFT",
      to: "REQUIRED_IN_PROGRESS",
      at: now,
      reason: "Started filling required fields"
    });
    machine.currentState = "REQUIRED_IN_PROGRESS";
  }

  machine.lastTransitionAt = now;
  machine.previousState = machine.history.at(-1)?.from ?? machine.previousState ?? null;

  const optionalTouched =
    valueProvidedAt(nextJob, "workModel") ||
    valueProvidedAt(nextJob, "industry") ||
    valueProvidedAt(nextJob, "zipCode") ||
    valueProvidedAt(nextJob, "compensation.currency") ||
    valueProvidedAt(nextJob, "compensation.salary.min") ||
    valueProvidedAt(nextJob, "compensation.salary.max") ||
    valueProvidedAt(nextJob, "schedule.days") ||
    valueProvidedAt(nextJob, "schedule.shiftTimes") ||
    valueProvidedAt(nextJob, "benefits") ||
    valueProvidedAt(nextJob, "coreDuties") ||
    valueProvidedAt(nextJob, "mustHaves");

  if (optionalTouched) {
    machine.optionalComplete = true;
    if (machine.currentState === "REQUIRED_COMPLETE") {
      machine.history.push({
        from: "REQUIRED_COMPLETE",
        to: "OPTIONAL_IN_PROGRESS",
        at: now,
        reason: "Optional context added"
      });
      machine.currentState = "OPTIONAL_IN_PROGRESS";
    } else if (machine.currentState === "OPTIONAL_IN_PROGRESS") {
      machine.history.push({
        from: "OPTIONAL_IN_PROGRESS",
        to: "OPTIONAL_COMPLETE",
        at: now,
        reason: "Optional context enriched"
      });
      machine.currentState = "OPTIONAL_COMPLETE";
    }
  }

  nextJob.stateMachine = machine;
  nextJob.status = deriveJobStatusFromState(machine.currentState);
  return nextJob;
}

function parseLocation(job = {}) {
  const locationRaw = typeof job.location === "string" ? job.location.trim() : "";
  const zip = typeof job.zipCode === "string" ? job.zipCode.trim() : "";
  const workModel = job.workModel ?? "on_site";

  const label =
    locationRaw.length > 0
      ? locationRaw
      : workModel === "remote"
      ? "Remote"
      : "On-site";

  return {
    label,
    zip,
    workModel
  };
}

function normaliseKey(value, fallback = "general") {
  if (!value) return fallback;
  return String(value).trim().toLowerCase() || fallback;
}

function buildMarketIntelligence(job = {}) {
  const roleKey = normaliseKey(job.roleTitle);
  const industryKey = normaliseKey(job.industry);

  const LOOKUP = {
    general: {
      salary: { min: 38000, max: 52000, currency: "USD" },
      benefits: ["Health insurance", "Paid time off", "Learning stipend"],
      duties: [
        "Own the daily rhythm so everything runs on-time.",
        "Coach teammates through tricky situations with calm confidence.",
        "Spot and surface improvements that keep customers thrilled."
      ],
      mustHaves: [
        "Reliable communicator who follows through without micromanagement.",
        "Comfortable working with modern productivity tools.",
        "Able to adapt quickly when priorities shift."
      ]
    },
    hospitality: {
      salary: { min: 24000, max: 32000, currency: "USD" },
      benefits: ["Staff meals", "Tip pooling", "Flexible scheduling"],
      duties: [
        "Lead the floor with energy and attention to detail.",
        "Train new teammates on service standards and safety rituals.",
        "Anticipate guest needs before they even ask."
      ],
      mustHaves: [
        "Warm, people-first style that turns guests into regulars.",
        "Experience juggling multiple tables or stations calmly.",
        "Food safety or hospitality certification preferred."
      ]
    },
    engineering: {
      salary: { min: 95000, max: 140000, currency: "USD" },
      benefits: ["Stock options", "Flexible remote culture", "Wellness budget"],
      duties: [
        "Design and ship features that improve the customer experience.",
        "Collaborate with product and design on clear technical handoffs.",
        "Review code and mentor teammates to raise the engineering bar."
      ],
      mustHaves: [
        "3+ years building production-grade applications.",
        "Comfortable owning features end-to-end in an agile environment.",
        "Experience with cloud-native tooling and CI/CD flows."
      ]
    }
  };

  const profile =
    LOOKUP[roleKey] ??
    LOOKUP[industryKey] ??
    LOOKUP.general;

  return {
    roleKey,
    salary: profile.salary,
    benefits: profile.benefits,
    duties: profile.duties,
    mustHaves: profile.mustHaves
  };
}

function normalizeStateMachine(rawState, now) {
  const fallback = {
    currentState: "DRAFT",
    previousState: null,
    history: [],
    requiredComplete: false,
    optionalComplete: false,
    lastTransitionAt: now,
    lockedByRequestId: null
  };

  if (!isPlainObject(rawState)) {
    return fallback;
  }

  return {
    currentState: typeof rawState.currentState === "string" ? rawState.currentState : fallback.currentState,
    previousState: rawState.previousState ?? fallback.previousState,
    history: Array.isArray(rawState.history) ? rawState.history.slice() : [],
    requiredComplete:
      typeof rawState.requiredComplete === "boolean"
        ? rawState.requiredComplete
        : Boolean(rawState.required_complete ?? fallback.requiredComplete),
    optionalComplete:
      typeof rawState.optionalComplete === "boolean"
        ? rawState.optionalComplete
        : Boolean(rawState.optional_complete ?? fallback.optionalComplete),
    lastTransitionAt: rawState.lastTransitionAt ?? rawState.last_transition_at ?? now,
    lockedByRequestId: rawState.lockedByRequestId ?? rawState.locked_by_request_id ?? null
  };
}


function collectVariants(finalResponse, now) {
  const variantsByField = new Map();

  const addVariant = (fieldId, value, defaults = {}) => {
    if (!fieldId || value === undefined) {
      return;
    }
    const bucket = variantsByField.get(fieldId) ?? [];
    bucket.push({
      id: defaults.id ?? `sugg_${uuid()}`,
      value,
      confidence:
        typeof defaults.confidence === "number" && defaults.confidence >= 0 && defaults.confidence <= 1
          ? defaults.confidence
          : 0.5,
      rationale: defaults.rationale,
      source: defaults.source
    });
    variantsByField.set(fieldId, bucket);
  };

  const improved = finalResponse.improved_value ?? finalResponse.improvedValue;
  if (improved?.fieldId && improved.value !== undefined) {
    addVariant(improved.fieldId, improved.value, {
      id: improved.id ?? `improved_${uuid()}`,
      confidence: improved.confidence ?? 0.6,
      rationale: improved.rationale,
      source: improved.source ?? "copilot"
    });
  }

  const autofillCandidates = Array.isArray(finalResponse.autofill_candidates)
    ? finalResponse.autofill_candidates
    : Array.isArray(finalResponse.autofillCandidates)
    ? finalResponse.autofillCandidates
    : [];
  for (const candidate of autofillCandidates) {
    if (!candidate?.fieldId) continue;
    addVariant(candidate.fieldId, candidate.value, {
      id: candidate.id ?? `autofill_${uuid()}`,
      confidence: candidate.confidence ?? 0.5,
      rationale: candidate.rationale,
      source: candidate.source ?? "copilot"
    });
  }

  const legacySuggestions = Array.isArray(finalResponse.suggestions)
    ? finalResponse.suggestions
    : [];
  for (const suggestion of legacySuggestions) {
    if (!suggestion?.fieldId) continue;
    const value =
      suggestion.value ?? suggestion.proposal ?? suggestion.text ?? suggestion;
    addVariant(suggestion.fieldId, value, {
      id: suggestion.id ?? `legacy_${uuid()}`,
      confidence: suggestion.confidence ?? 0.5,
      rationale: suggestion.rationale,
      source: suggestion.source ?? "legacy"
    });
  }

  return variantsByField;
}

function buildSuggestionTree(variantsByField, now) {
  const tree = {};

  for (const [fieldId, variants] of variantsByField.entries()) {
    if (!fieldId || !Array.isArray(variants) || variants.length === 0) continue;

    const parts = fieldId.split(".");
    let cursor = tree;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const segment = parts[index];
      if (!isPlainObject(cursor[segment])) {
        cursor[segment] = {};
      }
      cursor = cursor[segment];
    }
    const leafKey = parts[parts.length - 1];
    cursor[leafKey] = {
      variants: variants.map((variant) => ({
        id: variant.id ?? `sugg_${uuid()}`,
        value: variant.value,
        confidence:
          typeof variant.confidence === "number"
            ? Math.min(Math.max(variant.confidence, 0), 1)
            : 0.5,
        rationale: variant.rationale,
        source: variant.source
      })),
      updatedAt: now
    };
  }

  return tree;
}

async function persistJobSuggestions({
  firestore,
  jobId,
  logger,
  finalResponse,
  now
}) {
  const variantsByField = collectVariants(finalResponse, now);
  const fields = buildSuggestionTree(variantsByField, now);

  const skipRaw = [
    ...(Array.isArray(finalResponse.skip) ? finalResponse.skip : []),
    ...(Array.isArray(finalResponse.irrelevant_fields) ? finalResponse.irrelevant_fields : [])
  ];
  const skip = skipRaw
    .map((entry) => normaliseIrrelevantField(entry))
    .filter(Boolean);

  const followUpRaw = Array.isArray(finalResponse.followUpToUser)
    ? finalResponse.followUpToUser
    : Array.isArray(finalResponse.follow_up_to_user)
    ? finalResponse.follow_up_to_user
    : [];
  const followUpToUser = ensureUniqueMessages(followUpRaw);

  const payload = JobSuggestionSchema.parse({
    id: jobId,
    jobId,
    schema_version: "2",
    fields,
    followUpToUser,
    skip,
    nextStepTeaser:
      finalResponse.next_step_teaser ??
      finalResponse.nextStepTeaser ??
      undefined,
    updatedAt: now
  });

  await firestore.saveDocument(SUGGESTION_COLLECTION, jobId, payload);
  logger.info(
    { jobId, suggestions: variantsByField.size, skip: skip.length },
    "Persisted LLM suggestions"
  );
}

function clearSuggestionField(tree, fieldPath) {
  if (!fieldPath || !isPlainObject(tree)) {
    return false;
  }

  const parts = fieldPath.split(".");
  const stack = [];
  let cursor = tree;

  for (const part of parts) {
    if (!isPlainObject(cursor)) {
      return false;
    }
    stack.push({ parent: cursor, key: part });
    cursor = cursor[part];
    if (cursor === undefined) {
      return false;
    }
  }

  const last = stack.pop();
  if (!last) {
    return false;
  }
  const { parent, key } = last;
  if (!isPlainObject(parent) || parent[key] === undefined) {
    return false;
  }

  delete parent[key];

  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const { parent: ancestor, key: ancestorKey } = stack[index];
    if (!isPlainObject(ancestor[ancestorKey])) {
      break;
    }
    if (Object.keys(ancestor[ancestorKey]).length === 0) {
      delete ancestor[ancestorKey];
    } else {
      break;
    }
  }
  return true;
}

async function acknowledgeSuggestionField({
  firestore,
  jobId,
  fieldId,
  logger,
  now
}) {
  const existing = await firestore.getDocument(SUGGESTION_COLLECTION, jobId);
  if (!existing || !isPlainObject(existing.fields)) {
    return;
  }

  const fieldsClone = deepClone(existing.fields ?? {});
  const removed = clearSuggestionField(fieldsClone, fieldId);
  if (!removed) {
    return;
  }

  const payload = JobSuggestionSchema.parse({
    id: jobId,
    jobId,
    schema_version: existing.schema_version ?? "2",
    fields: fieldsClone,
    followUpToUser: Array.isArray(existing.followUpToUser) ? existing.followUpToUser : [],
    skip: Array.isArray(existing.skip) ? existing.skip : [],
    nextStepTeaser: existing.nextStepTeaser,
    updatedAt: now
  });

  await firestore.saveDocument(SUGGESTION_COLLECTION, jobId, payload);
  logger.info({ jobId, fieldId }, "Suggestion removed after merge");
}

function valueProvided(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return Boolean(value);
}

function valueProvidedAt(state, path) {
  return valueProvided(getDeep(state, path));
}

function normaliseTextSpacing(value) {
  return value
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .join("\n")
    .replace(/\s+\n/g, "\n")
    .trim();
}

const STEP_TEASERS = {
  "role-basics": "Next we’ll confirm the level and format so candidates know if it’s a match.",
  "role-details": "Great. Now let’s bring the role to life with a tight description.",
  "job-story": "Ready for extras? We’ll sprinkle in comp, schedules, and selling points.",
  "work-style": "Perfect. Want to clarify location details or how the role operates day-to-day?",
  compensation: "Dial in the offer so the right people lean in.",
  schedule: "Set expectations about the rhythm of the workday.",
  extras: "Almost done—let’s capture finishing touches that help you stand out."
};

function buildNextStepTeaser(stepId) {
  return STEP_TEASERS[stepId] ?? "Keep going—each answer trains your hiring copilot to do more for you.";
}

function capitaliseFirst(input) {
  if (!input) return input;
  return input.charAt(0).toUpperCase() + input.slice(1);
}

function ensureSentenceEnding(text) {
  if (!text) return text;
  if (text.length < 12) return text;
  if (/[.!?…]$/.test(text.trim())) {
    return text;
  }
  return `${text}.`;
}

function polishFreeformText(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  const normalised = normaliseTextSpacing(trimmed);
  const hasMultipleLines = normalised.includes("\n");

  if (hasMultipleLines) {
    const polishedLines = normalised
      .split("\n")
      .map((line) => ensureSentenceEnding(capitaliseFirst(line.trim())));
    const rebuilt = polishedLines.join("\n");
    return rebuilt !== rawValue ? rebuilt : null;
  }

  const capitalised = capitaliseFirst(normalised);
  const final = ensureSentenceEnding(capitalised);
  return final !== rawValue ? final : null;
}

function buildImprovedValueCandidate({ fieldId, rawValue }) {
  if (!fieldId || rawValue === undefined || rawValue === null) {
    return null;
  }
  const polished = polishFreeformText(rawValue);
  if (!polished) {
    return null;
  }
  return {
    fieldId,
    value: polished,
    rationale: "Smoothed the wording so candidates know exactly what you mean.",
    confidence: 0.55,
    source: "fallback",
    mode: "rewrite"
  };
}

function normaliseAutofillCandidate(candidate, defaults = {}) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const fieldId = candidate.fieldId ?? candidate.field_id ?? defaults.fieldId;
  if (!fieldId || typeof fieldId !== "string") {
    return null;
  }
  const value =
    candidate.value !== undefined
      ? candidate.value
      : candidate.proposal !== undefined
      ? candidate.proposal
      : defaults.value;

  if (value === undefined) {
    return null;
  }

  const confidence =
    typeof candidate.confidence === "number"
      ? candidate.confidence
      : typeof defaults.confidence === "number"
      ? defaults.confidence
      : 0.5;

  const rationale = candidate.rationale ?? defaults.rationale ?? "";
  const source = candidate.source ?? defaults.source ?? "fallback";
  const appliesToFutureStep =
    typeof candidate.appliesToFutureStep === "boolean"
      ? candidate.appliesToFutureStep
      : defaults.appliesToFutureStep ?? false;

  return {
    fieldId,
    value,
    confidence,
    rationale,
    source,
    appliesToFutureStep
  };
}

function normaliseImprovedValue(candidate, defaults = {}) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const fieldId = candidate.fieldId ?? candidate.field_id ?? defaults.fieldId;
  if (!fieldId || typeof fieldId !== "string") {
    return null;
  }
  const value =
    candidate.value !== undefined
      ? candidate.value
      : candidate.proposal !== undefined
      ? candidate.proposal
      : defaults.value;
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const confidence =
    typeof candidate.confidence === "number"
      ? candidate.confidence
      : typeof defaults.confidence === "number"
      ? defaults.confidence
      : 0.6;
  const rationale = candidate.rationale ?? defaults.rationale ?? "Polished for clarity.";
  const source = candidate.source ?? defaults.source ?? "copilot";
  const mode = candidate.mode ?? defaults.mode ?? "rewrite";

  return {
    fieldId,
    value,
    confidence,
    rationale,
    source,
    mode
  };
}

function normaliseIrrelevantField(entry, defaults = {}) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const fieldId = entry.fieldId ?? entry.field_id ?? defaults.fieldId;
  if (!fieldId || typeof fieldId !== "string") {
    return null;
  }
  const reason =
    entry.reason ??
    defaults.reason ??
    "Not relevant based on the information already provided.";

  return { fieldId, reason };
}

function mergeCandidateArrays(base = [], incoming = []) {
  const result = Array.isArray(base) ? base.slice() : [];
  if (!Array.isArray(incoming)) {
    return result;
  }
  for (const candidate of incoming) {
    if (!candidate) continue;
    const index = result.findIndex((item) => item.fieldId === candidate.fieldId);
    if (index >= 0) {
      result[index] = { ...result[index], ...candidate };
    } else {
      result.push(candidate);
    }
  }
  return result;
}

function mergeIrrelevantArrays(base = [], incoming = []) {
  const result = Array.isArray(base) ? base.slice() : [];
  if (!Array.isArray(incoming)) {
    return result;
  }
  for (const entry of incoming) {
    if (!entry) continue;
    const index = result.findIndex((item) => item.fieldId === entry.fieldId);
    if (index >= 0) {
      result[index] = { ...result[index], ...entry };
    } else {
      result.push(entry);
    }
  }
  return result;
}

function convertAutofillToLegacy(autofillCandidates) {
  const baseTimestamp = Date.now();
  return (autofillCandidates ?? []).map((candidate, index) => ({
    id: `suggestion-${candidate.fieldId}-${baseTimestamp + index}`,
    fieldId: candidate.fieldId,
    proposal: candidate.value,
    confidence: candidate.confidence ?? 0.5,
    rationale:
      candidate.rationale ??
      "Preset by the copilot so you can approve or tweak in one click."
  }));
}

function convertIrrelevantToLegacy(irrelevantFields) {
  return (irrelevantFields ?? []).map((entry) => ({
    fieldId: entry.fieldId,
    reason: entry.reason
  }));
}

function ensureUniqueMessages(messages = []) {
  const seen = new Set();
  const result = [];
  for (const message of messages) {
    if (!message || typeof message !== "string") continue;
    const trimmed = message.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function extractImprovedValue(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const candidate = raw.improved_value ?? raw.improvedValue ?? null;
  return normaliseImprovedValue(candidate);
}

function extractAutofillCandidates(raw) {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const candidatesRaw =
    raw.autofill_candidates ?? raw.autofillCandidates ?? raw.suggestions ?? [];
  if (!Array.isArray(candidatesRaw)) {
    return [];
  }
  const normalized = [];
  for (const candidate of candidatesRaw) {
    const normalised = normaliseAutofillCandidate(candidate);
    if (normalised) {
      normalized.push(normalised);
    }
  }
  return normalized;
}

function extractIrrelevantFields(raw) {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const entriesRaw =
    raw.irrelevant_fields ?? raw.irrelevantFields ?? raw.skip ?? [];
  if (!Array.isArray(entriesRaw)) {
    return [];
  }
  const normalized = [];
  for (const entry of entriesRaw) {
    const normalised = normaliseIrrelevantField(entry);
    if (normalised) {
      normalized.push(normalised);
    }
  }
  return normalized;
}

function mergeCopilotResponse(fallback, raw) {
  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const fallbackClone = {
    improved_value: fallback.improved_value ?? null,
    autofill_candidates: Array.isArray(fallback.autofill_candidates)
      ? fallback.autofill_candidates.slice()
      : [],
    irrelevant_fields: Array.isArray(fallback.irrelevant_fields)
      ? fallback.irrelevant_fields.slice()
      : [],
    next_step_teaser: fallback.next_step_teaser ?? null,
    followUpToUser: Array.isArray(fallback.followUpToUser)
      ? fallback.followUpToUser.slice()
      : [],
    suggestions: Array.isArray(fallback.suggestions) ? fallback.suggestions.slice() : [],
    skip: Array.isArray(fallback.skip) ? fallback.skip.slice() : []
  };

  const improved = extractImprovedValue(raw);
  if (improved) {
    fallbackClone.improved_value = improved;
  }

  const autofillCandidates = extractAutofillCandidates(raw);
  if (autofillCandidates.length > 0) {
    fallbackClone.autofill_candidates = mergeCandidateArrays(
      fallbackClone.autofill_candidates,
      autofillCandidates
    );
  }

  const irrelevantFields = extractIrrelevantFields(raw);
  if (irrelevantFields.length > 0) {
    fallbackClone.irrelevant_fields = mergeIrrelevantArrays(
      fallbackClone.irrelevant_fields,
      irrelevantFields
    );
  }

  const nextStep =
    typeof raw.next_step_teaser === "string"
      ? raw.next_step_teaser
      : typeof raw.nextStepTeaser === "string"
      ? raw.nextStepTeaser
      : null;
  if (nextStep && nextStep.trim().length > 0) {
    fallbackClone.next_step_teaser = nextStep.trim();
  }

  const followUpExtras = Array.isArray(raw.followUpToUser)
    ? raw.followUpToUser
    : Array.isArray(raw.follow_up_to_user)
    ? raw.follow_up_to_user
    : [];

  fallbackClone.followUpToUser = ensureUniqueMessages([
    ...fallbackClone.followUpToUser,
    ...followUpExtras,
    fallbackClone.next_step_teaser
  ]);

  fallbackClone.suggestions = convertAutofillToLegacy(fallbackClone.autofill_candidates);
  fallbackClone.skip = convertIrrelevantToLegacy(fallbackClone.irrelevant_fields);

  return fallbackClone;
}

function buildFallbackResponse({
  stepId,
  state,
  marketIntel,
  updatedFieldId,
  updatedFieldValue,
  emptyFieldIds = [],
  upcomingFieldIds = []
}) {
  const autofillMap = new Map();
  const irrelevantMap = new Map();
  const followUps = [];
  const emptyFieldSet = new Set(Array.isArray(emptyFieldIds) ? emptyFieldIds : []);
  const upcomingFieldSet = new Set(Array.isArray(upcomingFieldIds) ? upcomingFieldIds : []);

  function addAutofill(fieldId, value, { confidence = 0.5, rationale = "", source = "fallback" } = {}) {
    const candidate = normaliseAutofillCandidate({
      fieldId,
      value,
      confidence,
      rationale,
      source,
      appliesToFutureStep: upcomingFieldSet.has(fieldId) && !emptyFieldSet.has(fieldId)
    });
    if (candidate) {
      autofillMap.set(fieldId, candidate);
    }
  }

  function addIrrelevant(fieldId, reason) {
    const entry = normaliseIrrelevantField({ fieldId, reason });
    if (entry) {
      irrelevantMap.set(fieldId, entry);
    }
  }

  function addFollowUp(message) {
    if (message && typeof message === "string") {
      followUps.push(message);
    }
  }

  const normalizedStep = stepId ?? "";
  const roleTitle = typeof state.roleTitle === "string" ? state.roleTitle.trim() : "";

  if (normalizedStep === "work-style") {
    const locationMeta = parseLocation(state);

    if (!valueProvidedAt(state, "workModel")) {
      const inferredModel =
        locationMeta.workModel ??
        (typeof state.location === "string" && state.location.toLowerCase().includes("remote")
          ? "remote"
          : "on_site");
      addAutofill("workModel", inferredModel, {
        confidence: 0.55,
        rationale: "Keeps candidates aligned on whether they’ll be on-site, hybrid, or remote."
      });
    }

    if (!valueProvidedAt(state, "industry") && marketIntel.roleKey !== "general") {
      addAutofill("industry", marketIntel.roleKey.replace(/\b\w/g, (char) => char.toUpperCase()), {
        confidence: 0.45,
        rationale: "Helps your copilot tailor suggestions to the right talent pool."
      });
    }

    if (!valueProvidedAt(state, "zipCode") && locationMeta.zip) {
      addAutofill("zipCode", locationMeta.zip, {
        confidence: 0.5,
        rationale: "Zip codes sharpen salary suggestions and ad targeting."
      });
    }
  } else if (normalizedStep === "compensation") {
    if (!valueProvidedAt(state, "compensation.currency") && marketIntel.salary?.currency) {
      addAutofill("compensation.currency", marketIntel.salary.currency, {
        confidence: 0.6,
        rationale: "Sets expectations up front so candidates can compare offers quickly."
      });
    }
    if (!valueProvidedAt(state, "compensation.salary.min") && marketIntel.salary?.min) {
      addAutofill("compensation.salary.min", marketIntel.salary.min, {
        confidence: 0.62,
        rationale: "Baseline pulled from fresh market data for similar roles."
      });
    }
    if (!valueProvidedAt(state, "compensation.salary.max") && marketIntel.salary?.max) {
      addAutofill("compensation.salary.max", marketIntel.salary.max, {
        confidence: 0.6,
        rationale: "Upper range to stay competitive without overspending."
      });
    }
  } else if (normalizedStep === "schedule") {
    if (!valueProvidedAt(state, "schedule.days")) {
      addAutofill("schedule.days", "Monday\nTuesday\nWednesday\nThursday\nFriday", {
        confidence: 0.45,
        rationale: "Default weekday coverage—you can trim or extend as needed."
      });
    }
    if (!valueProvidedAt(state, "schedule.shiftTimes")) {
      addAutofill("schedule.shiftTimes", "08:00 - 16:00\n16:00 - 00:00", {
        confidence: 0.4,
        rationale: "Example shift blocks so candidates see the rhythm."
      });
    }
  } else if (normalizedStep === "extras") {
    if (!valueProvidedAt(state, "benefits") && Array.isArray(marketIntel.benefits)) {
      addAutofill("benefits", marketIntel.benefits.join("\n"), {
        confidence: 0.55,
        rationale: "Common perks candidates expect to see for this kind of role."
      });
    }
    if (!valueProvidedAt(state, "coreDuties") && Array.isArray(marketIntel.duties)) {
      addAutofill("coreDuties", marketIntel.duties.join("\n"), {
        confidence: 0.58,
        rationale: "Gives applicants a vivid snapshot of the day-to-day."
      });
    }
    if (!valueProvidedAt(state, "mustHaves") && Array.isArray(marketIntel.mustHaves)) {
      addAutofill("mustHaves", marketIntel.mustHaves.join("\n"), {
        confidence: 0.6,
        rationale: "Keeps the screening criteria tight without sounding robotic."
      });
    }
  }

  if (!roleTitle && normalizedStep === "extras") {
    addFollowUp("Want me to weave in culture or growth notes? Drop a hint and I’ll polish the wording.");
  }

  const improvedValue = buildImprovedValueCandidate({
    fieldId: updatedFieldId,
    rawValue: updatedFieldValue
  });

  const autofillCandidates = Array.from(autofillMap.values());
  const irrelevantFields = Array.from(irrelevantMap.values());
  const nextStepTeaser = buildNextStepTeaser(normalizedStep);

  const followUpMessages = ensureUniqueMessages([
    ...followUps,
    nextStepTeaser
  ]);

  return {
    improved_value: improvedValue,
    autofill_candidates: autofillCandidates,
    irrelevant_fields: irrelevantFields,
    next_step_teaser: nextStepTeaser,
    followUpToUser: followUpMessages,
    suggestions: convertAutofillToLegacy(autofillCandidates),
    skip: convertIrrelevantToLegacy(irrelevantFields)
  };
}

export function wizardRouter({ firestore, logger, llmClient }) {
  const router = Router();

  router.post(
    "/draft",
    wrapAsync(async (req, res) => {
      const userId = requireUserId(req);
      const payload = draftRequestSchema.parse(req.body ?? {});

      const jobId = payload.jobId ?? `job_${uuid()}`;
      const now = new Date();
      const existing = await firestore.getDocument(JOB_COLLECTION, jobId);

      let baseJob;
      if (existing) {
        const parsed = JobSchema.safeParse(existing);
        if (parsed.success) {
          baseJob = parsed.data;
        } else {
          logger.warn(
            { jobId, issues: parsed.error.issues },
            "Existing job failed schema validation; reinitialising base job"
          );
          baseJob = createBaseJob({
            jobId,
            userId: existing.ownerUserId ?? userId,
            now
          });
        }
      } else {
        baseJob = createBaseJob({ jobId, userId, now });
      }

      const mergedJob = mergeIntakeIntoJob(baseJob, payload.state ?? {}, { userId, now });
      const progress = computeRequiredProgress(mergedJob);
      const jobWithProgress = applyRequiredProgress(mergedJob, progress, now);
      const validatedJob = JobSchema.parse(jobWithProgress);

      const savedJob = await firestore.saveDocument(JOB_COLLECTION, jobId, validatedJob);

      logger.info(
        {
          jobId,
          userId,
          step: payload.currentStepId,
          state: savedJob.stateMachine?.currentState
        },
        "Job persisted"
      );

      res.json({
        jobId,
        status: savedJob.status,
        state: savedJob.stateMachine?.currentState ?? "DRAFT"
      });
    })
  );

  router.post(
    "/suggestions",
    wrapAsync(async (req, res) => {
      const userId = requireUserId(req);
      const payload = suggestionsRequestSchema.parse(req.body ?? {});

      const job = await firestore.getDocument(JOB_COLLECTION, payload.jobId);
      if (!job) {
        throw httpError(404, "Job not found");
      }

      const parsedJob = JobSchema.parse(job);
      const now = new Date();
      const mergedJob = mergeIntakeIntoJob(parsedJob, payload.state ?? {}, { userId, now });
      const progress = computeRequiredProgress(mergedJob);

      if (!progress.allComplete) {
        logger.info(
          { jobId: payload.jobId, currentStepId: payload.currentStepId },
          "Suggestions requested before required intake completed"
        );
        return res.json({
          improved_value: null,
          autofill_candidates: [],
          irrelevant_fields: [],
          next_step_teaser: buildNextStepTeaser(payload.currentStepId),
          followUpToUser: [
            "Finish the required setup first so I can tailor the optional fields for you."
          ],
          suggestions: [],
          skip: []
        });
      }

      const locationMeta = parseLocation(mergedJob);

      const context = {
        jobTitle: typeof mergedJob.roleTitle === "string" ? mergedJob.roleTitle : "",
        location: locationMeta.label,
        currentStepId: payload.currentStepId,
        state: mergedJob
      };

      const marketIntel = buildMarketIntelligence(context.state);

      const fallbackResponse = buildFallbackResponse({
        stepId: payload.currentStepId,
        state: context.state,
        marketIntel,
        updatedFieldId: payload.updatedFieldId,
        updatedFieldValue: payload.updatedFieldValue,
        emptyFieldIds: payload.emptyFieldIds ?? [],
        upcomingFieldIds: payload.upcomingFieldIds ?? []
      });

      let finalResponse = fallbackResponse;

      if (llmClient?.askSuggestions) {
        const llmPayload = {
          ...context,
          marketIntel,
          updatedFieldId: payload.updatedFieldId,
          updatedFieldValue: payload.updatedFieldValue,
          emptyFieldIds: payload.emptyFieldIds ?? [],
          upcomingFieldIds: payload.upcomingFieldIds ?? []
        };

        const llmRaw = await llmClient.askSuggestions(llmPayload);
        if (llmRaw) {
          finalResponse = mergeCopilotResponse(fallbackResponse, llmRaw);
        }
      }

      await persistJobSuggestions({
        firestore,
        jobId: payload.jobId,
        logger,
        finalResponse,
        now
      });

      res.json(finalResponse);
    })
  );

  router.post(
    "/suggestions/merge",
    wrapAsync(async (req, res) => {
      const userId = requireUserId(req);
      const payload = mergeRequestSchema.parse(req.body ?? {});

      const job = await firestore.getDocument(JOB_COLLECTION, payload.jobId);
      if (!job) {
        throw httpError(404, "Job not found");
      }

      const parsedJob = JobSchema.parse(job);
      const now = new Date();
      const nextJob = deepClone(parsedJob);

      setDeep(nextJob, payload.fieldId, payload.value);
      nextJob.updatedAt = now;

      const progress = computeRequiredProgress(nextJob);
      const jobWithProgress = applyRequiredProgress(nextJob, progress, now);
      const validatedJob = JobSchema.parse(jobWithProgress);

      await firestore.saveDocument(JOB_COLLECTION, payload.jobId, validatedJob);
      await acknowledgeSuggestionField({
        firestore,
        jobId: payload.jobId,
        fieldId: payload.fieldId,
        logger,
        now
      });

      res.json({ status: "ok" });
    })
  );

  return router;
}
