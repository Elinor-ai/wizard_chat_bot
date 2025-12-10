/**
 * @file use-wizard-draft.js
 * Custom hook for wizard draft persistence to localStorage.
 * Extracted from use-wizard-controller.js for better modularity.
 */

import { useCallback, useEffect, useRef } from "react";
import { saveDraft, clearDraft } from "../draft-storage";

const DRAFT_PERSIST_DEBOUNCE_MS = 1000;

/**
 * Manage draft persistence to localStorage with debouncing.
 *
 * @param {Object} params
 * @param {Object} params.wizardState - Current wizard state
 * @param {string|null} params.userId - Current user ID
 * @param {boolean} params.isHydrated - Whether hydration is complete
 * @param {Function} params.debug - Debug logging function
 * @returns {Object} Draft persistence utilities
 */
export function useWizardDraft({ wizardState, userId, isHydrated, debug }) {
  const draftPersistTimeoutRef = useRef(null);
  const lastSavedDraftRef = useRef(null);

  // Persist draft to localStorage (debounced)
  const persistDraft = useCallback(() => {
    if (!userId || !isHydrated) {
      return;
    }

    const draftPayload = {
      state: wizardState.state,
      includeOptional: wizardState.includeOptional,
      currentStepIndex: wizardState.currentStepIndex,
      maxVisitedIndex: wizardState.maxVisitedIndex,
      companyId: wizardState.companyId,
    };

    // Avoid saving identical drafts
    const serialized = JSON.stringify(draftPayload);
    if (serialized === lastSavedDraftRef.current) {
      return;
    }

    saveDraft({
      userId,
      jobId: wizardState.jobId ?? null,
      ...draftPayload,
    });

    lastSavedDraftRef.current = serialized;
    debug?.("draft:saved", { jobId: wizardState.jobId });
  }, [
    userId,
    isHydrated,
    wizardState.state,
    wizardState.includeOptional,
    wizardState.currentStepIndex,
    wizardState.maxVisitedIndex,
    wizardState.companyId,
    wizardState.jobId,
    debug,
  ]);

  // Debounced draft persistence
  const scheduleDraftPersist = useCallback(() => {
    if (draftPersistTimeoutRef.current) {
      clearTimeout(draftPersistTimeoutRef.current);
    }
    draftPersistTimeoutRef.current = setTimeout(() => {
      persistDraft();
    }, DRAFT_PERSIST_DEBOUNCE_MS);
  }, [persistDraft]);

  // Clear draft from localStorage
  const clearCurrentDraft = useCallback(() => {
    if (!userId) {
      return;
    }
    clearDraft({
      userId,
      jobId: wizardState.jobId ?? null,
    });
    lastSavedDraftRef.current = null;
    debug?.("draft:cleared", { jobId: wizardState.jobId });
  }, [userId, wizardState.jobId, debug]);

  // Auto-persist when state changes (debounced)
  useEffect(() => {
    if (!isHydrated || !userId) {
      return;
    }
    scheduleDraftPersist();
  }, [
    isHydrated,
    userId,
    wizardState.state,
    wizardState.includeOptional,
    wizardState.currentStepIndex,
    scheduleDraftPersist,
  ]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (draftPersistTimeoutRef.current) {
        clearTimeout(draftPersistTimeoutRef.current);
      }
    },
    []
  );

  return {
    persistDraft,
    scheduleDraftPersist,
    clearCurrentDraft,
  };
}
