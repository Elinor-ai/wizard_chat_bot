import { deepClone, deepEqual, getDeep, setDeep } from "./wizard-utils";

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
    if (!message) {
      return latest;
    }
    const createdAt =
      message.createdAt instanceof Date
        ? message.createdAt.getTime()
        : typeof message.createdAt === "string"
          ? Date.parse(message.createdAt)
          : 0;
    if (!Number.isFinite(createdAt)) {
      return latest;
    }
    return Math.max(latest, createdAt);
  }, 0);
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

      const nextDraft = deepClone(state.state);
      if (value === undefined) {
        setDeep(nextDraft, fieldId, undefined);
      } else {
        setDeep(nextDraft, fieldId, value);
      }

      const nextAutofilled = deepClone(state.autofilledFields);
      const existing = getDeep(nextAutofilled, fieldId) ?? {};
      setDeep(nextAutofilled, fieldId, {
        ...existing,
        ...meta,
        value,
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

    case "SET_SUGGESTIONS_LOADING": {
      return {
        ...state,
        isFetchingSuggestions: Boolean(action.payload),
      };
    }

    case "SET_SUGGESTIONS_DONE": {
      const {
        hiddenFields = state.hiddenFields,
        autofilledFields = state.autofilledFields,
        assistantMessages = state.assistantMessages,
        copilotNextTeaser = state.copilotNextTeaser,
      } = action.payload ?? {};
      return {
        ...state,
        isFetchingSuggestions: false,
        hiddenFields,
        autofilledFields,
        assistantMessages,
        copilotNextTeaser,
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
      const incomingVersion =
        typeof action.payload?.version === "number"
          ? action.payload.version
          : resolveConversationVersion(messages);
      const currentVersion = Number.isFinite(state.copilotConversationVersion)
        ? state.copilotConversationVersion
        : 0;
      const shouldIgnore =
        Number.isFinite(incomingVersion) && incomingVersion < currentVersion;
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.log("[WizardState] copilot:update", {
          source: action.payload?.source ?? "unknown",
          incomingVersion,
          currentVersion,
          messageCount: messages.length,
          ignored: shouldIgnore,
        });
      }
      if (shouldIgnore) {
        return state;
      }
      return {
        ...state,
        copilotConversation: messages,
        copilotConversationVersion: Number.isFinite(incomingVersion)
          ? incomingVersion
          : currentVersion,
      };
    }

    case "RESET_STEP_CONTEXT": {
      return {
        ...state,
        hiddenFields: {},
        autofilledFields: {},
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
