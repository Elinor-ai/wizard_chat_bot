/**
 * @file job-lifecycle.js
 * Pure business logic for job lifecycle operations.
 * No I/O operations - just data transformations and computations.
 */

import {
  JobSchema,
  ConfirmedJobDetailsSchema,
  deriveJobStatusFromState,
} from "@wizard/core";

// =============================================================================
// CONSTANTS
// =============================================================================

export const ALLOWED_INTAKE_KEYS = [
  "roleTitle",
  "companyName",
  "logoUrl",
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
  "salary",
  "salaryPeriod",
  "currency",
];

export const ARRAY_FIELD_KEYS = new Set(["coreDuties", "mustHaves", "benefits"]);
export const ENUM_FIELD_KEYS = ["workModel", "employmentType", "seniorityLevel"];

export const REQUIRED_FIELD_PATHS = [
  "roleTitle",
  "companyName",
  "location",
  "seniorityLevel",
  "employmentType",
  "jobDescription",
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function deepMerge(base, update) {
  if (!isPlainObject(update)) {
    return update === undefined ? base : update;
  }

  const result = isPlainObject(base) ? { ...base } : {};

  const keys = new Set([
    ...Object.keys(isPlainObject(base) ? base : {}),
    ...Object.keys(update),
  ]);

  for (const key of keys) {
    const incoming = update[key];
    const existing = isPlainObject(base) ? base[key] : undefined;

    if (incoming === undefined) {
      continue;
    }

    if (isPlainObject(incoming) && isPlainObject(existing)) {
      const mergedChild = deepMerge(existing, incoming);
      if (
        mergedChild === undefined ||
        (isPlainObject(mergedChild) && Object.keys(mergedChild).length === 0)
      ) {
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

export function deepClone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function getDeep(target, path) {
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

export function setDeep(target, path, value) {
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

export function valueProvided(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return Boolean(value);
}

export function valueProvidedAt(state, path) {
  return valueProvided(getDeep(state, path));
}

export function sanitizeImportValue(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export function sanitizeMultilineValue(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

// =============================================================================
// JOB CREATION
// =============================================================================

export function createBaseJob({
  jobId,
  userId,
  companyId = null,
  companyProfile = null,
  now,
}) {
  const job = JobSchema.parse({
    id: jobId,
    ownerUserId: userId,
    orgId: null,
    companyId: companyId ?? null,
    status: "draft",
    stateMachine: {
      currentState: "DRAFT",
      previousState: null,
      history: [],
      requiredComplete: false,
      optionalComplete: false,
      lastTransitionAt: now,
      lockedByRequestId: null,
    },
    roleTitle: "",
    companyName: "",
    logoUrl: "",
    location: "",
    zipCode: "",
    jobDescription: "",
    coreDuties: [],
    mustHaves: [],
    benefits: [],
    salary: "",
    salaryPeriod: "",
    currency: "",
    confirmed: {},
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  });
  return applyCompanyDefaults(job, companyProfile);
}

// =============================================================================
// STATE MACHINE
// =============================================================================

export function normalizeStateMachine(rawState, now) {
  const fallback = {
    currentState: "DRAFT",
    previousState: null,
    history: [],
    requiredComplete: false,
    optionalComplete: false,
    lastTransitionAt: now,
    lockedByRequestId: null,
  };

  if (!isPlainObject(rawState)) {
    return fallback;
  }

  return {
    currentState:
      typeof rawState.currentState === "string"
        ? rawState.currentState
        : fallback.currentState,
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
    lastTransitionAt:
      rawState.lastTransitionAt ?? rawState.last_transition_at ?? now,
    lockedByRequestId:
      rawState.lockedByRequestId ?? rawState.locked_by_request_id ?? null,
  };
}

// =============================================================================
// INTAKE MERGING
// =============================================================================

export function normalizeIntakeValue(existingValue, incomingValue, key) {
  if (incomingValue === undefined) {
    return existingValue;
  }

  if (incomingValue === null) {
    if (Array.isArray(existingValue) || ARRAY_FIELD_KEYS.has(key)) {
      return [];
    }
    if (typeof existingValue === "string" || !ARRAY_FIELD_KEYS.has(key)) {
      return "";
    }
    return null;
  }

  return incomingValue;
}

export function mergeIntakeIntoJob(job, incomingState = {}, { now }) {
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
      nextJob[key] = normalizeIntakeValue(existingValue, incomingValue, key);
    }
  }

  nextJob.updatedAt = now;
  return nextJob;
}

// =============================================================================
// PROGRESS COMPUTATION
// =============================================================================

export function computeRequiredProgress(jobState) {
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
    started: completed > 0,
  };
}

export function applyRequiredProgress(job, progress, now) {
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
        reason: "Started filling required fields",
      });
      machine.currentState = "REQUIRED_IN_PROGRESS";
    }
    if (machine.currentState === "REQUIRED_IN_PROGRESS") {
      machine.history.push({
        from: "REQUIRED_IN_PROGRESS",
        to: "REQUIRED_COMPLETE",
        at: now,
        reason: "All required fields complete",
      });
      machine.currentState = "REQUIRED_COMPLETE";
    }
  } else if (progress.started && machine.currentState === "DRAFT") {
    machine.history.push({
      from: "DRAFT",
      to: "REQUIRED_IN_PROGRESS",
      at: now,
      reason: "Started filling required fields",
    });
    machine.currentState = "REQUIRED_IN_PROGRESS";
  }

  machine.lastTransitionAt = now;
  machine.previousState =
    machine.history.at(-1)?.from ?? machine.previousState ?? null;

  const optionalTouched =
    valueProvidedAt(nextJob, "workModel") ||
    valueProvidedAt(nextJob, "industry") ||
    valueProvidedAt(nextJob, "zipCode") ||
    valueProvidedAt(nextJob, "currency") ||
    valueProvidedAt(nextJob, "salary") ||
    valueProvidedAt(nextJob, "salaryPeriod") ||
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
        reason: "Optional context added",
      });
      machine.currentState = "OPTIONAL_IN_PROGRESS";
    } else if (machine.currentState === "OPTIONAL_IN_PROGRESS") {
      machine.history.push({
        from: "OPTIONAL_IN_PROGRESS",
        to: "OPTIONAL_COMPLETE",
        at: now,
        reason: "Optional context enriched",
      });
      machine.currentState = "OPTIONAL_COMPLETE";
    }
  }

  nextJob.stateMachine = machine;
  nextJob.status = deriveJobStatusFromState(machine.currentState);
  return nextJob;
}

// =============================================================================
// COMPANY DEFAULTS
// =============================================================================

export function applyCompanyDefaults(job, companyProfile) {
  if (!companyProfile) {
    return job;
  }
  const next = deepClone(job);
  const companyName = companyProfile.name ?? companyProfile.brand?.name ?? null;
  if (!valueProvided(next.companyName) && valueProvided(companyName)) {
    next.companyName = companyName;
  }

  const logoUrl =
    companyProfile.brand?.logoUrl ??
    companyProfile.logoUrl ??
    companyProfile.brand?.iconUrl ??
    null;
  if (!valueProvided(next.logoUrl) && valueProvided(logoUrl)) {
    next.logoUrl = logoUrl;
  }

  const locationHint = companyProfile.locationHint;
  const cityCountry = [companyProfile.hqCity, companyProfile.hqCountry]
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .join(", ");
  const derivedLocation =
    locationHint && locationHint.trim().length > 0 ? locationHint : cityCountry;
  if (!valueProvided(next.location) && valueProvided(derivedLocation)) {
    next.location = derivedLocation;
  }

  if (!valueProvided(next.industry) && valueProvided(companyProfile.industry)) {
    next.industry = companyProfile.industry;
  }

  if (!isPlainObject(next.confirmed)) {
    next.confirmed = {};
  }
  if (
    !valueProvided(next.confirmed.companyName) &&
    valueProvided(companyName)
  ) {
    next.confirmed.companyName = companyName;
  }
  if (!valueProvided(next.confirmed.logoUrl) && valueProvided(logoUrl)) {
    next.confirmed.logoUrl = logoUrl;
  }
  if (
    !valueProvided(next.confirmed.location) &&
    valueProvided(derivedLocation)
  ) {
    next.confirmed.location = derivedLocation;
  }
  if (
    !valueProvided(next.confirmed.industry) &&
    valueProvided(companyProfile.industry)
  ) {
    next.confirmed.industry = companyProfile.industry;
  }
  return next;
}

// =============================================================================
// FINAL JOB NORMALIZATION
// =============================================================================

export function normalizeFinalJobPayload(finalJob = {}) {
  const normalized = { ...finalJob };
  ENUM_FIELD_KEYS.forEach((key) => {
    if (normalized[key] === "") {
      delete normalized[key];
    }
  });
  if (typeof normalized.logoUrl === "string") {
    const trimmed = normalized.logoUrl.trim();
    if (trimmed.length === 0) {
      delete normalized.logoUrl;
    } else {
      normalized.logoUrl = trimmed;
    }
  }
  return normalized;
}

// =============================================================================
// IMPORT HELPERS
// =============================================================================

export function deriveCompanyDisplayName(company) {
  return (
    sanitizeImportValue(company?.name) ||
    sanitizeImportValue(company?.brand?.name) ||
    sanitizeImportValue(company?.primaryDomain) ||
    "Your company"
  );
}

export function deriveCompanyLocation(company) {
  const city = sanitizeImportValue(company?.hqCity);
  const country = sanitizeImportValue(company?.hqCountry);
  const parts = [city, country].filter(Boolean);
  return parts.join(", ");
}

export function buildImportedJobState({ company, companyJob }) {
  const state = {};
  const fallbackTitle = sanitizeImportValue(companyJob?.title) || "Imported role";
  state.roleTitle = fallbackTitle;
  state.companyName = deriveCompanyDisplayName(company);
  state.location =
    sanitizeImportValue(companyJob?.location) ||
    deriveCompanyLocation(company) ||
    "Remote";

  const normalizedDescription = sanitizeMultilineValue(companyJob?.description);
  const descriptionBlocks = [];
  if (normalizedDescription) {
    descriptionBlocks.push(normalizedDescription);
  } else {
    descriptionBlocks.push(
      `This role was imported from ${companyJob?.source ?? "an external job posting"} to speed up your workflow.`
    );
  }
  const normalizedUrl = sanitizeImportValue(companyJob?.url);
  if (normalizedUrl) {
    descriptionBlocks.push(`Original posting: ${normalizedUrl}`);
  }
  state.jobDescription = descriptionBlocks.join("\n\n").trim();

  const logoUrl =
    sanitizeImportValue(company?.logoUrl) ||
    sanitizeImportValue(company?.brand?.logoUrl) ||
    sanitizeImportValue(company?.brand?.iconUrl);
  if (logoUrl) {
    state.logoUrl = logoUrl;
  }
  const industry = sanitizeImportValue(company?.industry);
  if (industry) {
    state.industry = industry;
  }

  return state;
}

// =============================================================================
// SERIALIZATION HELPERS
// =============================================================================

export function extractIntakeFields(job) {
  return ALLOWED_INTAKE_KEYS.reduce((acc, key) => {
    acc[key] = job[key];
    return acc;
  }, {});
}
