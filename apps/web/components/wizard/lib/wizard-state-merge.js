/**
 * @file wizard-state-merge.js
 * Pure utility functions for wizard state merging and validation.
 * Extracted from use-wizard-controller.js for better modularity.
 */

import { deepClone, getDeep, isFieldValueProvided } from "../wizard-utils";
import { REQUIRED_STEPS, OPTIONAL_STEPS } from "../wizard-schema";

/**
 * All wizard fields from required and optional steps.
 */
export const ALL_WIZARD_FIELDS = [...REQUIRED_STEPS, ...OPTIONAL_STEPS].flatMap(
  (step) => step.fields
);

/**
 * Deep merge two state snapshots with override semantics.
 * @param {Object} base - Base state object
 * @param {Object} override - Override values
 * @returns {Object} Merged state
 */
export function mergeStateSnapshots(base = {}, override = {}) {
  if (!override || typeof override !== "object") {
    return deepClone(base ?? {});
  }
  const result = deepClone(base ?? {});
  const stack = [{ target: result, source: override }];

  while (stack.length > 0) {
    const { target, source } = stack.pop();
    if (!source || typeof source !== "object") {
      // eslint-disable-next-line no-continue
      continue;
    }
    Object.keys(source).forEach((key) => {
      const value = source[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (
          !target[key] ||
          typeof target[key] !== "object" ||
          Array.isArray(target[key])
        ) {
          target[key] = {};
        }
        stack.push({ target: target[key], source: value });
      } else {
        target[key] = Array.isArray(value) ? value.slice() : value;
      }
    });
  }

  return result;
}

/**
 * Check if wizard state has any meaningful values filled in.
 * @param {Object} state - Wizard state
 * @returns {boolean} True if any field has a meaningful value
 */
export function hasMeaningfulWizardState(state) {
  if (!state || typeof state !== "object") {
    return false;
  }
  return ALL_WIZARD_FIELDS.some((field) =>
    isFieldValueProvided(getDeep(state, field.id), field)
  );
}
