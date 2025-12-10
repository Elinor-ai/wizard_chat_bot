/**
 * @file use-wizard-suggestions.js
 * Custom hook for managing wizard field suggestions.
 * Extracted from use-wizard-controller.js for better modularity.
 */

import { useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { fetchStepSuggestions } from "../wizard-services";
import { normalizeSuggestedValueForField } from "../wizard-state";
import { findFieldDefinition, getDeep, setDeep, deepClone } from "../wizard-utils";
import { REQUIRED_STEPS, OPTIONAL_STEPS } from "../wizard-schema";

/**
 * Manage suggestions fetching and application.
 *
 * @param {Object} params
 * @param {Object} params.wizardState - Current wizard state
 * @param {Function} params.dispatch - State dispatch function
 * @param {string|null} params.userId - Current user ID
 * @param {Function} params.debug - Debug logging function
 * @param {Object} params.stateRef - Ref to current state
 * @returns {Object} Suggestions utilities and state
 */
export function useWizardSuggestions({
  wizardState,
  dispatch,
  userId,
  debug,
  stateRef,
}) {
  const suggestionsAbortRef = useRef(null);

  // Cancel any pending suggestions fetch
  const cancelSuggestions = useCallback(() => {
    if (suggestionsAbortRef.current) {
      suggestionsAbortRef.current.abort();
      suggestionsAbortRef.current = null;
    }
  }, []);

  // Fetch suggestions mutation
  const suggestionsMutation = useMutation({
    mutationFn: async ({ stepId, forceRefresh = false }) => {
      cancelSuggestions();

      const abortController = new AbortController();
      suggestionsAbortRef.current = abortController;

      const result = await fetchStepSuggestions({
        jobId: wizardState.jobId,
        stepId,
        state: stateRef.current,
        forceRefresh,
        signal: abortController.signal,
      });

      return { stepId, suggestions: result };
    },
    onSuccess: ({ stepId, suggestions }) => {
      if (!suggestions || typeof suggestions !== "object") {
        return;
      }

      dispatch({
        type: "SET_STEP_SUGGESTIONS",
        payload: {
          stepId,
          suggestions,
        },
      });

      debug?.("suggestions:loaded", { stepId, fieldCount: Object.keys(suggestions).length });
    },
    onError: (error) => {
      if (error.name === "AbortError") {
        debug?.("suggestions:cancelled");
        return;
      }
      debug?.("suggestions:error", { error: error.message });
    },
  });

  // Fetch suggestions for a step
  const fetchSuggestions = useCallback(
    (stepId, forceRefresh = false) => {
      if (!stepId) {
        return;
      }
      suggestionsMutation.mutate({ stepId, forceRefresh });
    },
    [suggestionsMutation]
  );

  // Apply a single suggestion to a field
  const applySuggestion = useCallback(
    (fieldId, suggestedValue) => {
      const fieldDef = findFieldDefinition(fieldId, [...REQUIRED_STEPS, ...OPTIONAL_STEPS]);
      if (!fieldDef) {
        debug?.("suggestions:apply:field_not_found", { fieldId });
        return;
      }

      const normalizedValue = normalizeSuggestedValueForField(suggestedValue, fieldDef);

      dispatch({
        type: "SET_FIELD_VALUE",
        payload: {
          fieldId,
          value: normalizedValue,
          source: "suggestion",
        },
      });

      debug?.("suggestions:applied", { fieldId });
    },
    [dispatch, debug]
  );

  // Apply all suggestions for a step
  const applyAllSuggestions = useCallback(
    (stepId) => {
      const stepSuggestions = wizardState.suggestions?.[stepId];
      if (!stepSuggestions || typeof stepSuggestions !== "object") {
        return;
      }

      const steps = [...REQUIRED_STEPS, ...OPTIONAL_STEPS];
      const step = steps.find((s) => s.id === stepId);
      if (!step) {
        return;
      }

      const updates = {};
      for (const field of step.fields) {
        const suggested = stepSuggestions[field.id];
        if (suggested !== undefined && suggested !== null) {
          const currentValue = getDeep(stateRef.current, field.id);
          // Only apply if field is empty or has no meaningful value
          const isEmpty =
            currentValue === undefined ||
            currentValue === null ||
            currentValue === "" ||
            (Array.isArray(currentValue) && currentValue.length === 0);
          if (isEmpty) {
            const normalizedValue = normalizeSuggestedValueForField(suggested, field);
            updates[field.id] = normalizedValue;
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        dispatch({
          type: "BATCH_SET_FIELD_VALUES",
          payload: {
            updates,
            source: "suggestion_batch",
          },
        });
        debug?.("suggestions:batch_applied", { stepId, count: Object.keys(updates).length });
      }
    },
    [wizardState.suggestions, dispatch, debug, stateRef]
  );

  // Clear suggestions for a step
  const clearSuggestions = useCallback(
    (stepId) => {
      dispatch({
        type: "CLEAR_STEP_SUGGESTIONS",
        payload: { stepId },
      });
    },
    [dispatch]
  );

  // Check if suggestions are available for a field
  const hasSuggestion = useCallback(
    (stepId, fieldId) => {
      const stepSuggestions = wizardState.suggestions?.[stepId];
      if (!stepSuggestions) {
        return false;
      }
      const suggested = stepSuggestions[fieldId];
      return suggested !== undefined && suggested !== null && suggested !== "";
    },
    [wizardState.suggestions]
  );

  // Get suggestion value for a field
  const getSuggestion = useCallback(
    (stepId, fieldId) => {
      return wizardState.suggestions?.[stepId]?.[fieldId] ?? null;
    },
    [wizardState.suggestions]
  );

  return {
    // State
    suggestions: wizardState.suggestions,
    // Actions
    fetchSuggestions,
    applySuggestion,
    applyAllSuggestions,
    clearSuggestions,
    cancelSuggestions,
    // Helpers
    hasSuggestion,
    getSuggestion,
    // Loading state
    isLoading: suggestionsMutation.isPending,
    error: suggestionsMutation.error,
  };
}
