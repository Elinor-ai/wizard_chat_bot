/**
 * @file use-wizard-refs.js
 * Custom hook for managing wizard refs and keeping them in sync with state.
 * Extracted from use-wizard-controller.js for better modularity.
 */

import { useCallback, useEffect, useRef } from "react";

/**
 * Create and manage all refs needed by the wizard controller.
 * Keeps refs synchronized with wizard state values.
 *
 * @param {Object} params
 * @param {Object} params.wizardState - Current wizard state
 * @param {boolean} params.isHydrated - Whether hydration is complete
 * @param {boolean} params.debugEnabled - Enable debug logging
 * @returns {Object} All wizard refs
 */
export function useWizardRefs({ wizardState, isHydrated, debugEnabled = false }) {
  // Refs for state synchronization
  const stateRef = useRef(wizardState.state);
  const conversationRef = useRef(wizardState.copilotConversation);
  const unsavedChangesRef = useRef(wizardState.unsavedChanges);
  const includeOptionalRef = useRef(wizardState.includeOptional);
  const currentStepIndexRef = useRef(wizardState.currentStepIndex);
  const maxVisitedIndexRef = useRef(wizardState.maxVisitedIndex);
  const companyIdRef = useRef(wizardState.companyId);
  const jobIdRef = useRef(wizardState.jobId);
  const isHydratedRef = useRef(isHydrated);

  // Refs for tracking UI state
  const currentStepIdRef = useRef(null);
  const previousFieldValuesRef = useRef({});
  const toastTimeoutRef = useRef(null);
  const draftPersistTimeoutRef = useRef(null);
  const suggestionsAbortRef = useRef(null);

  // Refs for hydration tracking
  const migratedJobIdRef = useRef(null);
  const hasNavigatedToJobRef = useRef(false);
  const jobBootstrapRef = useRef(false);

  // Debug helper
  const debug = useCallback(
    (...messages) => {
      if (debugEnabled) {
        // eslint-disable-next-line no-console
        console.log("[WizardController]", ...messages);
      }
    },
    [debugEnabled]
  );

  // Sync effects - keep refs updated with latest state
  useEffect(() => {
    stateRef.current = wizardState.state;
  }, [wizardState.state]);

  useEffect(() => {
    unsavedChangesRef.current = wizardState.unsavedChanges;
  }, [wizardState.unsavedChanges]);

  useEffect(() => {
    includeOptionalRef.current = wizardState.includeOptional;
  }, [wizardState.includeOptional]);

  useEffect(() => {
    currentStepIndexRef.current = wizardState.currentStepIndex;
  }, [wizardState.currentStepIndex]);

  useEffect(() => {
    maxVisitedIndexRef.current = wizardState.maxVisitedIndex;
  }, [wizardState.maxVisitedIndex]);

  useEffect(() => {
    companyIdRef.current = wizardState.companyId;
  }, [wizardState.companyId]);

  useEffect(() => {
    jobIdRef.current = wizardState.jobId;
  }, [wizardState.jobId]);

  useEffect(() => {
    isHydratedRef.current = isHydrated;
  }, [isHydrated]);

  useEffect(() => {
    conversationRef.current = wizardState.copilotConversation;
  }, [wizardState.copilotConversation]);

  // Cleanup effect for timeouts
  useEffect(
    () => () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      if (draftPersistTimeoutRef.current) {
        clearTimeout(draftPersistTimeoutRef.current);
      }
    },
    []
  );

  return {
    // State refs
    stateRef,
    conversationRef,
    unsavedChangesRef,
    includeOptionalRef,
    currentStepIndexRef,
    maxVisitedIndexRef,
    companyIdRef,
    jobIdRef,
    isHydratedRef,
    // UI refs
    currentStepIdRef,
    previousFieldValuesRef,
    toastTimeoutRef,
    draftPersistTimeoutRef,
    suggestionsAbortRef,
    // Hydration refs
    migratedJobIdRef,
    hasNavigatedToJobRef,
    jobBootstrapRef,
    // Helpers
    debug,
  };
}
