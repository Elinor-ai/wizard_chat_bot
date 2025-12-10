/**
 * @file use-wizard-progress.js
 * Custom hook for tracking wizard field completion progress.
 * Extracted from use-wizard-controller.js for better modularity.
 */

import { useMemo } from "react";
import { REQUIRED_STEPS, OPTIONAL_STEPS, PROGRESS_TRACKING_FIELDS } from "../wizard-schema";
import { getDeep, isFieldValueProvided, isStepComplete } from "../wizard-utils";

/**
 * Calculate completion progress for wizard fields.
 *
 * @param {Object} params
 * @param {Object} params.state - Current wizard state values
 * @param {boolean} params.includeOptional - Whether to include optional steps
 * @returns {Object} Progress information
 */
export function useWizardProgress({ state, includeOptional }) {
  const steps = useMemo(
    () => (includeOptional ? [...REQUIRED_STEPS, ...OPTIONAL_STEPS] : REQUIRED_STEPS),
    [includeOptional]
  );

  // Calculate field-level completion for progress tracking
  const fieldProgress = useMemo(() => {
    const result = {};
    for (const fieldId of PROGRESS_TRACKING_FIELDS) {
      const value = getDeep(state, fieldId);
      // Find field definition
      let fieldDef = null;
      for (const step of [...REQUIRED_STEPS, ...OPTIONAL_STEPS]) {
        fieldDef = step.fields.find((f) => f.id === fieldId);
        if (fieldDef) break;
      }
      result[fieldId] = isFieldValueProvided(value, fieldDef);
    }
    return result;
  }, [state]);

  // Calculate step-level completion
  const stepCompletion = useMemo(() => {
    return steps.map((step, index) => ({
      stepIndex: index,
      stepId: step.id,
      isComplete: isStepComplete(step, state),
      fieldCount: step.fields.length,
      completedFields: step.fields.filter((field) => {
        const value = getDeep(state, field.id);
        return isFieldValueProvided(value, field);
      }).length,
    }));
  }, [steps, state]);

  // Overall progress percentage
  const overallProgress = useMemo(() => {
    const totalFields = steps.reduce((sum, step) => sum + step.fields.length, 0);
    const completedFields = stepCompletion.reduce(
      (sum, step) => sum + step.completedFields,
      0
    );
    return totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0;
  }, [steps, stepCompletion]);

  // Check if all required steps are complete
  const requiredComplete = useMemo(() => {
    return REQUIRED_STEPS.every((step) => isStepComplete(step, state));
  }, [state]);

  // Check if all steps (including optional if enabled) are complete
  const allComplete = useMemo(() => {
    return steps.every((step) => isStepComplete(step, state));
  }, [steps, state]);

  return {
    fieldProgress,
    stepCompletion,
    overallProgress,
    requiredComplete,
    allComplete,
    steps,
  };
}
