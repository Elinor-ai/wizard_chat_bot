import { JobSchema, deriveJobStatusFromState } from "@wizard/core";

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
  "currency"
];

export const ARRAY_FIELD_KEYS = new Set(["coreDuties", "mustHaves", "benefits"]);
export const ENUM_FIELD_KEYS = ["workModel", "employmentType", "seniorityLevel"];

export const REQUIRED_FIELD_PATHS = [
  "roleTitle",
  "companyName",
  "location",
  "seniorityLevel",
  "employmentType",
  "jobDescription"
];

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

function normalizeIntakeValue(existingValue, incomingValue, key) {
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

  if (!rawState) {
    return fallback;
  }

  return {
    currentState: rawState.currentState ?? rawState.current_state ?? fallback.currentState,
    previousState: rawState.previousState ?? rawState.previous_state ?? fallback.previousState,
    history: Array.isArray(rawState.history) ? rawState.history : fallback.history,
    requiredComplete:
      rawState.requiredComplete ?? rawState.required_complete ?? fallback.requiredComplete,
    optionalComplete:
      rawState.optionalComplete ??
      rawState.optional_complete ??
      fallback.optionalComplete,
    lastTransitionAt: rawState.lastTransitionAt ?? rawState.last_transition_at ?? now,
    lockedByRequestId: rawState.lockedByRequestId ?? rawState.locked_by_request_id ?? null
  };
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
    started: completed > 0
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

export function createBaseJob({ jobId, userId, now }) {
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
    logoUrl: "",
    location: "",
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
    archivedAt: null
  });
}

export function buildJobSnapshot(job) {
  return ALLOWED_INTAKE_KEYS.reduce((acc, key) => {
    acc[key] = job?.[key];
    return acc;
  }, {});
}
