import {
  deepClone,
  deepEqual,
  findFieldDefinition,
  getDeep,
  setDeep,
} from "./wizard-utils";

export const INTRO_ASSISTANT_MESSAGE = {
  id: "intro",
  role: "assistant",
  kind: "info",
  content:
    "Hi! I’m your recruiting copilot. Ask for market data, salary bands, or copy tweaks any time.",
};

function withUnsavedChanges(nextState, patch) {
  if (
    Object.prototype.hasOwnProperty.call(patch, "state") ||
    Object.prototype.hasOwnProperty.call(patch, "committedState")
  ) {
    return {
      ...nextState,
      unsavedChanges: !deepEqual(nextState.state, nextState.committedState),
    };
  }
  return nextState;
}

function applyPatch(state, patch) {
  const merged = {
    ...state,
    ...patch,
  };
  return withUnsavedChanges(merged, patch);
}

export function normalizeSuggestedValueForField(fieldOrFieldId, suggestedValue) {
  if (suggestedValue === undefined || suggestedValue === null) {
    return suggestedValue;
  }

  const field =
    typeof fieldOrFieldId === "string" || !fieldOrFieldId
      ? findFieldDefinition(fieldOrFieldId)
      : fieldOrFieldId;
  const options = Array.isArray(field?.options) ? field.options : [];
  if (options.length === 0) {
    return suggestedValue;
  }

  const normalizeString = (input) =>
    typeof input === "string" || typeof input === "number" || typeof input === "boolean"
      ? String(input).trim().toLowerCase().replace(/[\s-]+/g, "_")
      : null;

  const tryMatch = (candidate) => {
    const normalizedCandidate = normalizeString(candidate);
    if (!normalizedCandidate) {
      return null;
    }

    const byValue = options.find(
      (option) =>
        normalizeString(option.value) === normalizedCandidate ||
        option.value === candidate
    );
    if (byValue) {
      return byValue.value;
    }

    const byLabel = options.find(
      (option) =>
        typeof option.label === "string" &&
        normalizeString(option.label) === normalizedCandidate
    );
    if (byLabel) {
      return byLabel.value;
    }

    return null;
  };

  const directMatch = tryMatch(suggestedValue);
  if (directMatch !== null) {
    return directMatch;
  }

  if (Array.isArray(suggestedValue)) {
    for (const entry of suggestedValue) {
      const match = tryMatch(entry);
      if (match !== null) {
        return match;
      }
    }
  }

  if (suggestedValue && typeof suggestedValue === "object") {
    const candidateKeys = ["value", "label", "option", "name", "title"];
    for (const key of candidateKeys) {
      const keyValue = suggestedValue[key];
      if (keyValue && typeof keyValue === "object" && key === "option") {
        const nestedMatch = tryMatch(keyValue.value ?? keyValue.label);
        if (nestedMatch !== null) {
          return nestedMatch;
        }
      }
      const match = tryMatch(keyValue);
      if (match !== null) {
        return match;
      }
    }

    for (const value of Object.values(suggestedValue)) {
      const match = tryMatch(value);
      if (match !== null) {
        return match;
      }
    }
  }

  return suggestedValue;
}

export function createInitialWizardState() {
  return {
    state: {},
    committedState: {},
    jobId: null,
    companyId: null,
    importContext: null,
    includeOptional: false,
    currentStepIndex: 0,
    maxVisitedIndex: 0,
    assistantMessages: [INTRO_ASSISTANT_MESSAGE],
    isChatting: false,
    isFetchingSuggestions: false,
    suggestions: {
      status: "idle",
      baseHash: null,
      byFieldId: {},
      lastError: null,
      lastFetchedAt: null,
    },
    hiddenFields: {},
    autofilledFields: {},
    copilotNextTeaser: "",
    customCapsuleActive: {},
    hoveredCapsules: {},
    hasSeenUnlock: false,
    unlockAction: null,
    unsavedChanges: false,
    activeToast: null,
    numberDrafts: {},
    copilotConversation: [],
    copilotConversationVersion: 0,
  };
}

function resolveConversationVersion(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 0;
  }
  return messages.reduce((latest, message) => {
    const timestamp = getMessageTimestamp(message);
    if (!Number.isFinite(timestamp)) {
      return latest;
    }
    return Math.max(latest, timestamp);
  }, 0);
}

function getMessageTimestamp(message) {
  if (!message) return null;
  const createdAt = message.createdAt;
  if (createdAt instanceof Date) {
    return createdAt.getTime();
  }
  if (typeof createdAt === "string") {
    const parsed = Date.parse(createdAt);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof createdAt === "number") {
    return createdAt;
  }
  return null;
}

function mergeConversationMessages(existing = [], incoming = []) {
  const seen = new Set();
  const merged = [];
  const push = (message) => {
    if (!message || !message.id) return;
    if (seen.has(message.id)) return;
    seen.add(message.id);
    merged.push(message);
  };

  existing.forEach(push);
  incoming.forEach(push);

  merged.sort((a, b) => {
    const aTs = getMessageTimestamp(a);
    const bTs = getMessageTimestamp(b);
    if (aTs === bTs) return 0;
    if (aTs === null) return -1;
    if (bTs === null) return 1;
    return aTs - bTs;
  });

  return merged;
}

export function wizardReducer(state, action) {
  switch (action.type) {
    case "FIELD_CHANGE": {
      const {
        fieldId,
        value,
        preserveSuggestionMeta = false,
        timestamp = Date.now(),
      } = action.payload ?? {};
      if (!fieldId) {
        return state;
      }

      const nextDraft = deepClone(state.state);
      if (value === "" || value === null || value === undefined) {
        setDeep(nextDraft, fieldId, undefined);
      } else {
        setDeep(nextDraft, fieldId, value);
      }

      const nextAutofilled = deepClone(state.autofilledFields);
      if (preserveSuggestionMeta) {
        const existing = getDeep(nextAutofilled, fieldId);
        if (existing) {
          setDeep(nextAutofilled, fieldId, {
            ...existing,
            lastTouchedAt: timestamp,
          });
        }
      } else {
        setDeep(nextAutofilled, fieldId, undefined);
      }

      return applyPatch(state, {
        state: nextDraft,
        autofilledFields: nextAutofilled,
      });
    }

    case "APPLY_SUGGESTION": {
      const { fieldId, value, meta = {}, appliedAt = Date.now() } =
        action.payload ?? {};
      if (!fieldId) {
        return state;
      }

      const normalizedValue = normalizeSuggestedValueForField(fieldId, value);
      const nextDraft = deepClone(state.state);
      if (normalizedValue === undefined) {
        setDeep(nextDraft, fieldId, undefined);
      } else {
        setDeep(nextDraft, fieldId, normalizedValue);
      }

      const nextAutofilled = deepClone(state.autofilledFields);
      const existing = getDeep(nextAutofilled, fieldId) ?? {};
      setDeep(nextAutofilled, fieldId, {
        ...existing,
        ...meta,
        value: normalizedValue,
        accepted: true,
        appliedAt,
      });

      return applyPatch(state, {
        state: nextDraft,
        autofilledFields: nextAutofilled,
      });
    }

    case "REJECT_SUGGESTION": {
      const {
        fieldId,
        fallbackValue,
        rejectedAt = Date.now(),
        preserveDraft = false,
      } = action.payload ?? {};
      if (!fieldId) {
        return state;
      }

      const nextDraft = preserveDraft
        ? state.state
        : deepClone(state.state);
      if (!preserveDraft) {
        if (fallbackValue === undefined) {
          setDeep(nextDraft, fieldId, undefined);
        } else {
          setDeep(nextDraft, fieldId, fallbackValue);
        }
      }

      const nextAutofilled = deepClone(state.autofilledFields);
      const existing = getDeep(nextAutofilled, fieldId);
      if (existing) {
        setDeep(nextAutofilled, fieldId, {
          ...existing,
          accepted: false,
          lastRejectedAt: rejectedAt,
        });
      }

      return applyPatch(state, {
        state: preserveDraft ? state.state : nextDraft,
        autofilledFields: nextAutofilled,
      });
    }

    case "SAVE_SUCCESS": {
      const {
        committedState = state.state,
        jobId = state.jobId,
        includeOptional = state.includeOptional,
        companyId = state.companyId,
      } = action.payload ?? {};
      return applyPatch(state, {
        committedState: deepClone(committedState),
        jobId,
        includeOptional,
        companyId,
      });
    }

    case "STEP_NEXT": {
      const nextIndex = Math.min(
        state.currentStepIndex + 1,
        action.payload?.maxIndex ?? state.currentStepIndex + 1
      );
      return applyPatch(state, {
        currentStepIndex: nextIndex,
        maxVisitedIndex: Math.max(state.maxVisitedIndex, nextIndex),
      });
    }

    case "STEP_BACK": {
      const prevIndex = Math.max(state.currentStepIndex - 1, 0);
      return applyPatch(state, {
        currentStepIndex: prevIndex,
        maxVisitedIndex: Math.max(state.maxVisitedIndex, prevIndex),
      });
    }

    case "STEP_GOTO": {
      const targetIndex = action.payload?.index;
      if (typeof targetIndex !== "number") {
        return state;
      }
      return applyPatch(state, {
        currentStepIndex: targetIndex,
        maxVisitedIndex: Math.max(state.maxVisitedIndex, targetIndex),
      });
    }

    case "SET_MAX_VISITED_INDEX": {
      const { index } = action.payload ?? {};
      if (typeof index !== "number") {
        return state;
      }
      return applyPatch(state, {
        maxVisitedIndex: Math.max(state.maxVisitedIndex, index),
      });
    }

    case "UNLOCK_OPTIONAL": {
      const { unlockAction = "continue" } = action.payload ?? {};
      return applyPatch(state, {
        includeOptional: true,
        hasSeenUnlock: true,
        unlockAction,
      });
    }

    case "SKIP_OPTIONAL": {
      const { unlockAction = "skip" } = action.payload ?? {};
      return applyPatch(state, {
        includeOptional: false,
        hasSeenUnlock: true,
        unlockAction,
      });
    }

    case "SET_TOAST": {
      return {
        ...state,
        activeToast: action.payload ?? null,
      };
    }

    case "CLEAR_TOAST": {
      return {
        ...state,
        activeToast: null,
      };
    }

    case "SET_SUGGESTIONS_BASE_HASH": {
      const payload =
        action.payload && typeof action.payload === "object"
          ? action.payload
          : {};
      const { baseHash = null } = payload;
      return {
        ...state,
        suggestions: {
          ...state.suggestions,
          baseHash,
        },
      };
    }

    case "MARK_SUGGESTIONS_STALE": {
      const payload =
        action.payload && typeof action.payload === "object"
          ? action.payload
          : {};
      const { baseHash = state.suggestions.baseHash, preserveAutofill = false } =
        payload;
      return {
        ...state,
        isFetchingSuggestions: false,
        suggestions: {
          ...state.suggestions,
          status: "stale",
          baseHash,
          byFieldId: {},
          lastError: null,
          lastFetchedAt: null,
        },
        autofilledFields: preserveAutofill ? state.autofilledFields : {},
      };
    }

    case "SET_SUGGESTIONS_LOADING": {
      const payload =
        action.payload && typeof action.payload === "object"
          ? action.payload
          : {};
      const { baseHash = state.suggestions.baseHash } = payload;
      return {
        ...state,
        isFetchingSuggestions: true,
        suggestions: {
          ...state.suggestions,
          status: "loading",
          baseHash,
          lastError: null,
        },
      };
    }

    case "SET_SUGGESTIONS_RESULT": {
      const payload =
        action.payload && typeof action.payload === "object"
          ? action.payload
          : {};
      const {
        baseHash = state.suggestions.baseHash,
        byFieldId = {},
        autofilledFields = state.autofilledFields,
        hiddenFields = state.hiddenFields,
        assistantMessages = state.assistantMessages,
        copilotNextTeaser = state.copilotNextTeaser,
        fetchedAt = Date.now(),
      } = payload;
      return {
        ...state,
        isFetchingSuggestions: false,
        suggestions: {
          ...state.suggestions,
          status: "ready",
          baseHash,
          byFieldId,
          lastError: null,
          lastFetchedAt: fetchedAt,
        },
        hiddenFields,
        autofilledFields,
        assistantMessages,
        copilotNextTeaser,
      };
    }

    case "SET_SUGGESTIONS_ERROR": {
      const payload =
        action.payload && typeof action.payload === "object"
          ? action.payload
          : {};
      const {
        baseHash = state.suggestions.baseHash,
        error = null,
        assistantMessages = state.assistantMessages,
      } = payload;
      return {
        ...state,
        isFetchingSuggestions: false,
        suggestions: {
          ...state.suggestions,
          status: "error",
          baseHash,
          lastError: error,
        },
        assistantMessages,
      };
    }

    case "SET_ASSISTANT_MESSAGES": {
      return {
        ...state,
        assistantMessages: action.payload ?? [],
      };
    }

    case "PUSH_ASSISTANT_MESSAGE": {
      if (!action.payload) {
        return state;
      }
      return {
        ...state,
        assistantMessages: [...state.assistantMessages, action.payload],
      };
    }

    case "SET_CHAT_STATUS": {
      return {
        ...state,
        isChatting: Boolean(action.payload),
      };
    }

    case "SET_COPILOT_CONVERSATION": {
      const messages = Array.isArray(action.payload)
        ? action.payload
        : Array.isArray(action.payload?.messages)
          ? action.payload.messages
          : [];
      const source = action.payload?.source ?? "unknown";
      const incomingVersion =
        typeof action.payload?.version === "number"
          ? action.payload.version
          : resolveConversationVersion(messages);
      const currentVersion = Number.isFinite(state.copilotConversationVersion)
        ? state.copilotConversationVersion
        : 0;
      const mergedMessages = mergeConversationMessages(
        state.copilotConversation,
        messages
      );
      const mergedVersion = Math.max(
        currentVersion,
        Number.isFinite(incomingVersion)
          ? incomingVersion
          : resolveConversationVersion(mergedMessages)
      );
      return {
        ...state,
        copilotConversation: mergedMessages,
        copilotConversationVersion: mergedVersion,
      };
    }

    case "RESET_STEP_CONTEXT": {
      return {
        ...state,
        hiddenFields: {},
        copilotNextTeaser: "",
      };
    }

    case "SET_CUSTOM_CAPSULE_ACTIVE": {
      return {
        ...state,
        customCapsuleActive: action.payload ?? {},
      };
    }

    case "SET_HOVERED_CAPSULES": {
      return {
        ...state,
        hoveredCapsules: action.payload ?? {},
      };
    }

    case "PATCH_STATE": {
      return applyPatch(state, action.payload ?? {});
    }

    default:
      return state;
  }
}
