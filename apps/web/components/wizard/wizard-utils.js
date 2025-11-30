import { OPTIONAL_STEPS, REQUIRED_STEPS } from "./wizard-schema";

export function setDeep(obj, path, value) {
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

export function getDeep(obj, path) {
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

export function deepClone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function arraysEqual(left = [], right = []) {
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

export function deepEqual(left, right) {
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

export function computeStateDiff(previousState = {}, nextState = {}) {
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

export function findFieldDefinition(fieldId) {
  for (const step of [...REQUIRED_STEPS, ...OPTIONAL_STEPS]) {
    const match = step.fields.find((field) => field.id === fieldId);
    if (match) {
      return match;
    }
  }
  return null;
}

const CORE_SUGGESTION_STEPS = REQUIRED_STEPS.slice(0, 3);
export const SUGGESTION_CORE_FIELD_IDS = CORE_SUGGESTION_STEPS.flatMap((step) =>
  step.fields.map((field) => field.id)
);
export const OPTIONAL_FIELD_IDS = OPTIONAL_STEPS.flatMap((step) =>
  step.fields.map((field) => field.id)
);

export function computeSuggestionsBaseHash(state) {
  if (!state) {
    return null;
  }
  const snapshot = SUGGESTION_CORE_FIELD_IDS.map((fieldId) => [
    fieldId,
    getDeep(state, fieldId),
  ]);
  try {
    return JSON.stringify(snapshot);
  } catch (_error) {
    return null;
  }
}

export function isFieldValueProvided(value, field) {
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

export function isStepComplete(step, data, hidden = {}) {
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

export function normalizeValueForField(field, proposal) {
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
