import { useMutation } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  // OPTIONAL_STEP_BANNERS,
  OPTIONAL_STEPS,
  PROGRESS_TRACKING_FIELDS,
  REQUIRED_FIELD_IDS,
  REQUIRED_STEPS,
  TOAST_VARIANT_CLASSES,
} from "./wizard-schema";
import {
  computeStateDiff,
  deepClone,
  findFieldDefinition,
  getDeep,
  isFieldValueProvided,
  isStepComplete,
  normalizeValueForField,
  setDeep,
} from "./wizard-utils";
import { createInitialWizardState, wizardReducer } from "./wizard-state";
import {
  fetchJobDraft,
  fetchStepSuggestions,
  persistJobDraft,
  fetchCopilotConversation,
  sendCopilotAgentMessage,
} from "./wizard-services";
import { loadDraft, saveDraft, clearDraft } from "./draft-storage";

const TOAST_TIMEOUT_MS = 4000;
const CONVERSATION_CACHE_PREFIX = "wizard/copilotConversation/";

function getMessageTimestamp(message) {
  if (!message) {
    return null;
  }
  const { createdAt } = message;
  if (createdAt instanceof Date) {
    return createdAt.getTime();
  }
  if (typeof createdAt === "number") {
    return createdAt;
  }
  if (typeof createdAt === "string") {
    const parsed = Date.parse(createdAt);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function deriveConversationVersion(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 0;
  }
  let latest = 0;
  for (const message of messages) {
    const timestamp = getMessageTimestamp(message);
    if (Number.isFinite(timestamp)) {
      latest = Math.max(latest, timestamp);
    }
  }
  return latest || Date.now();
}

function applyClientMessageIds(messages = []) {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages.map((message) => {
    const clientId = message?.metadata?.clientMessageId;
    if (
      message?.role === "user" &&
      typeof clientId === "string" &&
      clientId.length > 0
    ) {
      return {
        ...message,
        id: clientId,
      };
    }
    return message;
  });
}

function getConversationCacheKey(jobId) {
  if (!jobId) return null;
  return `${CONVERSATION_CACHE_PREFIX}${jobId}`;
}

function serializeConversationPayload(messages = [], version = 0) {
  return {
    version,
    messages: messages.map((message) => ({
      ...message,
      createdAt:
        message?.createdAt instanceof Date
          ? message.createdAt.toISOString()
          : message?.createdAt ?? null,
    })),
  };
}

function deserializeConversationPayload(payload) {
  if (!payload || !Array.isArray(payload.messages)) {
    return null;
  }
  const messages = payload.messages.map((message) => ({
    ...message,
    createdAt:
      typeof message.createdAt === "string"
        ? new Date(message.createdAt)
        : message.createdAt,
  }));
  const version = Number(payload.version) || deriveConversationVersion(messages);
  return { messages, version };
}

function loadConversationFromCache(jobId) {
  if (typeof window === "undefined" || !jobId) {
    return null;
  }
  try {
    const cacheKey = getConversationCacheKey(jobId);
    if (!cacheKey) return null;
    const stored = window.sessionStorage.getItem(cacheKey);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return deserializeConversationPayload(parsed);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Failed to parse cached conversation", error);
    return null;
  }
}

function saveConversationToCache(jobId, messages, version) {
  if (typeof window === "undefined" || !jobId) {
    return;
  }
  try {
    const cacheKey = getConversationCacheKey(jobId);
    if (!cacheKey) return;
    const payload = serializeConversationPayload(messages, version);
    window.sessionStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Failed to cache conversation", error);
  }
}

function previewContent(content, limit = 80) {
  if (typeof content !== "string") {
    return "";
  }
  const trimmed = content.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit - 3)}...`;
}

function summarizeConversationMessages(messages = []) {
  return messages.map((message) => ({
    id: message?.id,
    role: message?.role,
    createdAt:
      message?.createdAt instanceof Date
        ? message.createdAt.toISOString()
        : message?.createdAt ?? null,
    preview: previewContent(message?.content ?? "", 60),
  }));
}

export function useWizardController({ user, initialJobId = null }) {
  const router = useRouter();
  const [wizardState, dispatch] = useReducer(
    wizardReducer,
    {
      userId: user?.id ?? null,
      jobId: initialJobId ?? null,
    },
    (seed) => {
      const next = createInitialWizardState();
      if (
        typeof window === "undefined" ||
        !seed?.userId
      ) {
        return next;
      }
      const draft = loadDraft({
        userId: seed.userId,
        jobId: seed.jobId ?? null,
      });
      if (draft) {
        next.state = deepClone(draft.state ?? {});
        next.committedState = deepClone(next.state);
        next.jobId = seed.jobId ?? null;
        next.includeOptional = Boolean(draft.includeOptional);
        next.currentStepIndex = draft.currentStepIndex ?? 0;
        next.maxVisitedIndex =
          draft.maxVisitedIndex ??
          Math.max(draft.currentStepIndex ?? 0, 0);
      }
      if (typeof window !== "undefined" && seed?.jobId) {
        const cachedConversation = loadConversationFromCache(seed.jobId);
        if (cachedConversation) {
          next.copilotConversation = cachedConversation.messages;
          next.copilotConversationVersion = cachedConversation.version;
        }
      }
      return next;
    }
  );
  const [isHydrated, setIsHydrated] = useState(false);

  const suggestionsAbortRef = useRef(null);
  const stateRef = useRef(wizardState.state);
  const conversationRef = useRef(wizardState.copilotConversation);
  const previousFieldValuesRef = useRef({});
  const lastSuggestionSnapshotRef = useRef({});
  const toastTimeoutRef = useRef(null);
  const draftPersistTimeoutRef = useRef(null);
  const hydrationKey = `${user?.id ?? "anon"}:${initialJobId ?? "new"}`;
  const migratedJobIdRef = useRef(initialJobId ?? null);
  const lastHydratedKeyRef = useRef(null);
  const hasNavigatedToJobRef = useRef(false);
  const debugEnabled = process.env.NODE_ENV !== "production";
  const debug = useCallback(
    (...messages) => {
      if (debugEnabled) {
        // eslint-disable-next-line no-console
        console.log("[WizardController]", ...messages);
      }
    },
    [debugEnabled]
  );

  useEffect(() => {
    stateRef.current = wizardState.state;
  }, [wizardState.state]);

  useEffect(() => {
    conversationRef.current = wizardState.copilotConversation;
  }, [wizardState.copilotConversation]);

  useEffect(() => {
    if (!wizardState.jobId) {
      return;
    }
    const cached = loadConversationFromCache(wizardState.jobId);
    if (
      cached &&
      cached.messages.length > 0 &&
      cached.version > (wizardState.copilotConversationVersion || 0) &&
      wizardState.copilotConversation.length === 0
    ) {
      dispatch({
        type: "SET_COPILOT_CONVERSATION",
        payload: {
          messages: cached.messages,
          version: cached.version,
          source: "cache",
        },
      });
    }
  }, [
    dispatch,
    wizardState.copilotConversation.length,
    wizardState.copilotConversationVersion,
    wizardState.jobId,
  ]);

  useEffect(() => {
    if (!wizardState.jobId) {
      return;
    }
    saveConversationToCache(
      wizardState.jobId,
      wizardState.copilotConversation,
      wizardState.copilotConversationVersion
    );
  }, [
    wizardState.copilotConversation,
    wizardState.copilotConversationVersion,
    wizardState.jobId,
  ]);

  useEffect(() => {
    lastSuggestionSnapshotRef.current = {};
  }, [wizardState.jobId, user?.id]);

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleBeforeUnload = (event) => {
      if (!wizardState.unsavedChanges) {
        return;
      }
      event.preventDefault();
      // eslint-disable-next-line no-param-reassign
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [wizardState.unsavedChanges]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    if (!wizardState.unsavedChanges) {
      return undefined;
    }

    const confirmationMessage =
      "You have unsaved changes. Are you sure you want to leave without saving?";

    const handleAnchorClick = (event) => {
      const path =
        typeof event.composedPath === "function" ? event.composedPath() : [];

      let anchor =
        path.find((node) => node instanceof HTMLAnchorElement) ?? null;

      if (!anchor) {
        let element = event.target;
        while (
          element &&
          element instanceof Element &&
          element.tagName.toLowerCase() !== "a"
        ) {
          element = element.parentElement;
        }
        if (element instanceof HTMLAnchorElement) {
          anchor = element;
        }
      }

      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      if (anchor.target && anchor.target !== "_self") {
        return;
      }

      if (anchor.hasAttribute("download")) {
        return;
      }

      if (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        return;
      }

      const destination = new URL(href, window.location.origin);
      const current = new URL(window.location.href);
      const isSameLocation =
        destination.origin === current.origin &&
        destination.pathname === current.pathname &&
        destination.search === current.search &&
        destination.hash === current.hash;

      if (isSameLocation) {
        return;
      }

      const shouldLeave = window.confirm(confirmationMessage);
      if (!shouldLeave) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const handlePopState = (event) => {
      const shouldLeave = window.confirm(confirmationMessage);
      if (!shouldLeave) {
        event.preventDefault?.();
        window.history.pushState(null, "", window.location.href);
      }
    };

    window.addEventListener("click", handleAnchorClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("click", handleAnchorClick, true);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [wizardState.unsavedChanges]);

  const steps = useMemo(
    () =>
      wizardState.includeOptional
        ? [...REQUIRED_STEPS, ...OPTIONAL_STEPS]
        : REQUIRED_STEPS,
    [wizardState.includeOptional]
  );

  const currentStep = steps[wizardState.currentStepIndex] ?? null;
  const totalSteps = steps.length;
  const isCurrentStepRequired =
    wizardState.currentStepIndex < REQUIRED_STEPS.length;
  const isLastStep = wizardState.currentStepIndex === totalSteps - 1;

useEffect(() => {
  if (initialJobId) {
    return;
  }

  if (!wizardState.jobId) {
    hasNavigatedToJobRef.current = false;
    return;
  }

  if (wizardState.isChatting) {
    debug("router:delay-job-navigation", {
      jobId: wizardState.jobId,
    });
    return;
  }

  if (hasNavigatedToJobRef.current) {
    return;
  }

  hasNavigatedToJobRef.current = true;
  debug("router:navigate-to-job", { jobId: wizardState.jobId });
  router.replace(`/wizard/${wizardState.jobId}`);
}, [debug, initialJobId, router, wizardState.isChatting, wizardState.jobId]);

  useEffect(() => {
    if (initialJobId || !user?.id) {
      return;
    }
    const nextJobId = wizardState.jobId;
    if (!nextJobId) {
      return;
    }
    if (migratedJobIdRef.current === nextJobId) {
      return;
    }
    debug("draft:migrate-to-job", { jobId: nextJobId });
    saveDraft({
      userId: user.id,
      jobId: nextJobId,
      state: wizardState.state,
      includeOptional: wizardState.includeOptional,
      currentStepIndex: wizardState.currentStepIndex,
      maxVisitedIndex: wizardState.maxVisitedIndex,
    });
    clearDraft({ userId: user.id, jobId: null });
    migratedJobIdRef.current = nextJobId;
  }, [
    initialJobId,
    user?.id,
    wizardState.jobId,
    wizardState.state,
    wizardState.includeOptional,
    wizardState.currentStepIndex,
    wizardState.maxVisitedIndex,
  ]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    if (initialJobId && !user?.authToken) {
      return;
    }

    if (lastHydratedKeyRef.current === hydrationKey) {
      return;
    }
    lastHydratedKeyRef.current = hydrationKey;

    let cancelled = false;

    const hydrate = async () => {
      debug("hydrate:start", { userId: user.id, initialJobId });
      setIsHydrated(false);

      if (!initialJobId) {
        const localDraft = loadDraft({ userId: user.id, jobId: null });
        if (localDraft) {
          debug("hydrate:local-new-found", localDraft);
          dispatch({
            type: "PATCH_STATE",
            payload: {
              state: deepClone(localDraft.state ?? {}),
              committedState: {},
              jobId: null,
              includeOptional: Boolean(localDraft.includeOptional),
              currentStepIndex: localDraft.currentStepIndex ?? 0,
              maxVisitedIndex:
                localDraft.maxVisitedIndex ??
                Math.max(localDraft.currentStepIndex ?? 0, 0),
            },
          });
        } else {
          debug("hydrate:local-new-missing");
          dispatch({
            type: "PATCH_STATE",
            payload: {
              state: {},
              committedState: {},
              jobId: null,
              includeOptional: false,
              currentStepIndex: 0,
              maxVisitedIndex: 0,
            },
          });
        }
        if (!cancelled) {
          setIsHydrated(true);
          debug("hydrate:complete-new");
        }
        return;
      }

      try {
        const serverJob = await fetchJobDraft({
          authToken: user.authToken,
          jobId: initialJobId,
        });
        if (cancelled) {
          return;
        }

        const includeOptional = Boolean(serverJob.includeOptional);
        const serverState = deepClone(serverJob.state ?? {});
        const localDraft = loadDraft({ userId: user.id, jobId: initialJobId });
        const baseIndex =
          localDraft?.currentStepIndex ??
          determineStepIndex(serverState, includeOptional);
        const baseVisited =
          localDraft?.maxVisitedIndex ??
          Math.max(baseIndex, wizardState.maxVisitedIndex);
        const basePayload = {
          jobId: serverJob.jobId,
          state: serverState,
          committedState: serverState,
          includeOptional,
          currentStepIndex: baseIndex,
          maxVisitedIndex: baseVisited,
        };

        let mergedPayload = basePayload;
        const serverUpdatedAt =
          serverJob.updatedAt instanceof Date
            ? serverJob.updatedAt.getTime()
            : 0;
        if (
          localDraft &&
          localDraft.updatedAt &&
          localDraft.updatedAt > serverUpdatedAt
        ) {
          debug("hydrate:local-overrides-server", {
            localUpdatedAt: localDraft.updatedAt,
            serverUpdatedAt,
          });
          mergedPayload = {
            ...basePayload,
            state: deepClone(localDraft.state ?? basePayload.state),
            includeOptional:
              typeof localDraft.includeOptional === "boolean"
                ? localDraft.includeOptional
                : basePayload.includeOptional,
            currentStepIndex:
              localDraft.currentStepIndex ?? basePayload.currentStepIndex,
            maxVisitedIndex:
              localDraft.maxVisitedIndex ??
              Math.max(
                localDraft.currentStepIndex ?? 0,
                basePayload.maxVisitedIndex
              ),
          };
        }

        dispatch({
          type: "PATCH_STATE",
          payload: mergedPayload,
        });
        debug("hydrate:server-loaded", { mergedPayload });
      } catch (error) {
        if (!cancelled) {
          dispatch({
            type: "SET_TOAST",
            payload: {
              id: Date.now(),
              variant: "error",
              message:
                error?.message ??
                "Failed to load the draft. Please try again shortly.",
            },
          });
        }
        debug("hydrate:error", error);
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
          debug("hydrate:finally");
        }
      }
    };

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [hydrationKey, initialJobId, user?.authToken, user?.id]);

  useEffect(() => {
    if (totalSteps === 0) {
      return;
    }
    const maxIndex = totalSteps - 1;
    const clampedIndex = Math.min(wizardState.currentStepIndex, maxIndex);
    const clampedVisited = Math.min(wizardState.maxVisitedIndex, maxIndex);
    if (
      clampedIndex !== wizardState.currentStepIndex ||
      clampedVisited !== wizardState.maxVisitedIndex
    ) {
      dispatch({
        type: "PATCH_STATE",
        payload: {
          currentStepIndex: clampedIndex,
          maxVisitedIndex: clampedVisited,
        },
      });
    }
  }, [
    totalSteps,
    wizardState.currentStepIndex,
    wizardState.maxVisitedIndex,
  ]);

  useEffect(() => {
    if (steps.length === 0) return;
    const highestCompletedIndex = steps.reduce(
      (max, step, index) =>
        isStepComplete(step, wizardState.committedState, wizardState.hiddenFields)
          ? Math.max(max, index)
          : max,
      0
    );
    const target = Math.max(
      wizardState.currentStepIndex,
      highestCompletedIndex
    );
    if (target > wizardState.maxVisitedIndex) {
      dispatch({ type: "SET_MAX_VISITED_INDEX", payload: { index: target } });
    }
  }, [
    steps,
    wizardState.committedState,
    wizardState.hiddenFields,
    wizardState.currentStepIndex,
    wizardState.maxVisitedIndex,
  ]);

  useEffect(() => {
    dispatch({ type: "RESET_STEP_CONTEXT" });
    const filteredMessages = wizardState.assistantMessages.filter(
      (message) => !["followUp", "skip", "improved"].includes(message.kind)
    );
    if (filteredMessages.length !== wizardState.assistantMessages.length) {
      dispatch({
        type: "SET_ASSISTANT_MESSAGES",
        payload: filteredMessages,
      });
    }
  }, [wizardState.currentStepIndex, wizardState.assistantMessages.length]);

  useEffect(() => {
    debug("copilot:state:update", {
      jobId: wizardState.jobId,
      version: wizardState.copilotConversationVersion,
      messageCount: wizardState.copilotConversation.length,
      messages: summarizeConversationMessages(wizardState.copilotConversation),
    });
  }, [
    debug,
    wizardState.copilotConversation,
    wizardState.copilotConversationVersion,
    wizardState.jobId,
  ]);

  const allRequiredStepsCompleteInState = useMemo(
    () =>
      REQUIRED_STEPS.every((step) =>
        isStepComplete(step, wizardState.state, wizardState.hiddenFields)
      ),
    [wizardState.hiddenFields, wizardState.state]
  );

  const currentRequiredStepCompleteInState = useMemo(() => {
    if (!currentStep) return false;
    if (!isCurrentStepRequired) return true;
    return isStepComplete(currentStep, wizardState.state, wizardState.hiddenFields);
  }, [
    currentStep,
    isCurrentStepRequired,
    wizardState.hiddenFields,
    wizardState.state,
  ]);

  const stepMetrics = useMemo(() => {
    return steps.map((step) => {
      const isHidden = (fieldId) => Boolean(getDeep(wizardState.hiddenFields, fieldId));
      const requiredFields = step.fields.filter(
        (field) => field.required && !isHidden(field.id)
      );
      const optionalFields = step.fields.filter(
        (field) => !field.required && !isHidden(field.id)
      );
      const requiredCompletedCount = requiredFields.reduce(
        (count, field) =>
          count +
          (isFieldValueProvided(
            getDeep(wizardState.committedState, field.id),
            field
          )
            ? 1
            : 0),
        0
      );
      const optionalCompletedCount = optionalFields.reduce(
        (count, field) =>
          count +
          (isFieldValueProvided(
            getDeep(wizardState.committedState, field.id),
            field
          )
            ? 1
            : 0),
        0
      );

      const stepComplete =
        (requiredFields.length > 0 &&
          requiredCompletedCount === requiredFields.length) ||
        (requiredFields.length === 0 &&
          optionalFields.length > 0 &&
          optionalCompletedCount > 0);

      return {
        stepId: step.id,
        requiredCount: requiredFields.length,
        requiredCompletedCount,
        optionalCount: optionalFields.length,
        optionalCompletedCount,
        stepComplete,
      };
    });
  }, [steps, wizardState.committedState, wizardState.hiddenFields]);

  const progressCompletedCount = useMemo(() => {
    return PROGRESS_TRACKING_FIELDS.reduce((count, fieldId) => {
      const def = findFieldDefinition(fieldId);
      return (
        count +
        (isFieldValueProvided(getDeep(wizardState.state, fieldId), def)
          ? 1
          : 0)
      );
    }, 0);
  }, [wizardState.state]);

  const optionalSectionStatus = useMemo(() => {
    return OPTIONAL_STEPS.map((step) => {
      const visibleFields = step.fields.filter(
        (field) => !getDeep(wizardState.hiddenFields, field.id)
      );
      const completed = visibleFields.every((field) =>
        isFieldValueProvided(getDeep(wizardState.state, field.id), field)
      );
      return {
        id: step.id,
        completed,
      };
    });
  }, [wizardState.hiddenFields, wizardState.state]);

  const optionalSectionsCompleted = useMemo(
    () => optionalSectionStatus.filter((section) => section.completed).length,
    [optionalSectionStatus]
  );

  const optionalProgressPct = OPTIONAL_STEPS.length
    ? Math.round((optionalSectionsCompleted / OPTIONAL_STEPS.length) * 100)
    : 0;

  const showUnlockCtas =
    allRequiredStepsCompleteInState && wizardState.includeOptional === false;

  // const currentOptionalBanner = useMemo(() => {
  //   if (!currentStep) return null;
  //   return OPTIONAL_STEP_BANNERS[currentStep.id] ?? null;
  // }, [currentStep]);

  const activeToastClassName = wizardState.activeToast
    ? TOAST_VARIANT_CLASSES[wizardState.activeToast.variant] ?? null
    : null;

  const visibleAssistantMessages = useMemo(() => {
    const activeStepId = currentStep?.id;
    if (!activeStepId) {
      return wizardState.assistantMessages;
    }
    return wizardState.assistantMessages.filter((message) => {
      if (message.kind !== "suggestion") {
        return true;
      }
      return message.meta?.stepId === activeStepId;
    });
  }, [currentStep?.id, wizardState.assistantMessages]);

  const persistMutation = useMutation({
    mutationFn: persistJobDraft,
  });

  const loadCopilotConversation = useCallback(async () => {
    if (!user?.authToken || !wizardState.jobId) return;
    debug("copilot:load:start", {
      jobId: wizardState.jobId,
    });
    try {
      const response = await fetchCopilotConversation({
        authToken: user.authToken,
        jobId: wizardState.jobId,
      });
      const normalizedMessages = applyClientMessageIds(response.messages ?? []);
      const version = deriveConversationVersion(normalizedMessages);
      debug("copilot:load:success", {
        jobId: wizardState.jobId,
        version,
        messageCount: normalizedMessages.length,
        messages: summarizeConversationMessages(normalizedMessages),
      });
      dispatch({
        type: "SET_COPILOT_CONVERSATION",
        payload: {
          messages: normalizedMessages,
          version,
          source: "load",
        },
      });
    } catch (error) {
      debug("copilot:load:error", {
        jobId: wizardState.jobId,
        error: error?.message,
      });
      dispatch({
        type: "PUSH_ASSISTANT_MESSAGE",
        payload: {
          id: `copilot-chat-${Date.now()}`,
          role: "assistant",
          kind: "error",
          content:
            error?.message ??
            "I couldn't load the copilot conversation. Please try again shortly.",
        },
      });
    }
  }, [
    debug,
    dispatch,
    user?.authToken,
    user?.id,
    wizardState.jobId,
  ]);

  const announceAuthRequired = useCallback(() => {
    dispatch({
      type: "PUSH_ASSISTANT_MESSAGE",
      payload: {
        id: `auth-${Date.now()}`,
        role: "assistant",
        kind: "error",
        content: "Please sign in to continue working on this job.",
      },
    });
  }, []);

  const showToast = useCallback((variant, message) => {
    if (!message) return;
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    dispatch({
      type: "SET_TOAST",
      payload: {
        id: Date.now(),
        variant,
        message,
      },
    });
    toastTimeoutRef.current = setTimeout(() => {
      dispatch({ type: "CLEAR_TOAST" });
      toastTimeoutRef.current = null;
    }, TOAST_TIMEOUT_MS);
  }, []);

  const goToStep = useCallback((index) => {
    dispatch({ type: "STEP_GOTO", payload: { index } });
  }, []);

  const fetchSuggestionsForStep = useCallback(
    async ({
      stepId = currentStep?.id,
      intentOverrides = {},
      jobIdOverride,
      updatedFieldId,
      updatedValue,
    } = {}) => {
      if (!user || !stepId) {
        if (!user) {
          announceAuthRequired();
        }
        return;
      }

      const effectiveJobId = jobIdOverride ?? wizardState.jobId;
      if (!effectiveJobId) {
        return;
      }

      const workingState = stateRef.current ?? {};
      const targetStep =
        steps.find((step) => step.id === stepId) ??
        OPTIONAL_STEPS.find((step) => step.id === stepId) ??
        REQUIRED_STEPS.find((step) => step.id === stepId) ??
        null;

      const emptyFieldIds = [];
      if (targetStep) {
        for (const field of targetStep.fields) {
          const value = getDeep(workingState, field.id);
          if (!isFieldValueProvided(value, field)) {
            emptyFieldIds.push(field.id);
          }
        }
      }

      const stepIndex = steps.findIndex((step) => step.id === stepId);
      const upcomingFieldIds =
        stepIndex === -1
          ? []
          : steps
              .slice(stepIndex + 1)
              .flatMap((step) => step.fields.map((field) => field.id));

      const isOptionalStep = OPTIONAL_STEPS.some((step) => step.id === stepId);
      if (!isOptionalStep) {
        return;
      }

      const requiredComplete = REQUIRED_FIELD_IDS.every((fieldId) => {
        const fieldDefinition = findFieldDefinition(fieldId);
        return isFieldValueProvided(
          getDeep(workingState, fieldId),
          fieldDefinition
        );
      });

      if (!requiredComplete) {
        return;
      }

      if (suggestionsAbortRef.current) {
        suggestionsAbortRef.current.abort();
      }

      const visibleFieldIds = targetStep
        ? targetStep.fields.map((field) => field.id)
        : [];
      if (visibleFieldIds.length === 0) {
        return;
      }

      const shouldForceFetch = Boolean(intentOverrides?.forceRefresh);
      const snapshotEntries = visibleFieldIds.map((fieldId) => {
        const rawValue =
          fieldId === updatedFieldId
            ? updatedValue
            : getDeep(workingState, fieldId);
        if (rawValue === undefined) {
          return [fieldId, { __defined: false }];
        }
        return [fieldId, { __defined: true, value: deepClone(rawValue) }];
      });
      const snapshotKey = JSON.stringify(snapshotEntries);
      if (
        !shouldForceFetch &&
        lastSuggestionSnapshotRef.current[stepId] === snapshotKey
      ) {
        return;
      }

      const controller = new AbortController();
      suggestionsAbortRef.current = controller;
      dispatch({ type: "SET_SUGGESTIONS_LOADING", payload: true });

      try {
        if (!user?.authToken) {
          announceAuthRequired();
          return;
        }
        const response = await fetchStepSuggestions({
          authToken: user.authToken,
          jobId: effectiveJobId,
          stepId,
          state: workingState,
          includeOptional: wizardState.includeOptional,
          intentOverrides,
          updatedFieldId,
          updatedValue,
          emptyFieldIds,
          upcomingFieldIds,
          visibleFieldIds,
          signal: controller.signal,
        });

        lastSuggestionSnapshotRef.current[stepId] = snapshotKey;

        const failure = response.failure;
        const visibleFieldSet = new Set(visibleFieldIds);
        const suggestions = response.suggestions ?? [];

        const enrichedSuggestions = suggestions
          .map((suggestion) => {
            if (
              visibleFieldIds.length > 0 &&
              !visibleFieldSet.has(suggestion.fieldId)
            ) {
              return null;
            }
            const fieldDefinition = findFieldDefinition(suggestion.fieldId);
            const existingValue = getDeep(workingState, suggestion.fieldId);
            if (
              fieldDefinition &&
              isFieldValueProvided(existingValue, fieldDefinition)
            ) {
              return null;
            }
            const normalized = normalizeValueForField(
              fieldDefinition,
              suggestion.value
            );
            if (normalized === undefined) {
              return null;
            }
            return {
              fieldId: suggestion.fieldId,
              value: normalized,
              rationale:
                suggestion.rationale ??
                "Suggested so candidates understand the opportunity immediately.",
              confidence: suggestion.confidence ?? 0.5,
              source: suggestion.source ?? "copilot",
            };
          })
          .filter(Boolean);

        const fieldOrderIndex = new Map(
          visibleFieldIds.map((fieldId, index) => [fieldId, index])
        );
        const orderedSuggestions = enrichedSuggestions
          .slice()
          .sort(
            (a, b) =>
              (fieldOrderIndex.get(a.fieldId) ?? Number.MAX_SAFE_INTEGER) -
              (fieldOrderIndex.get(b.fieldId) ?? Number.MAX_SAFE_INTEGER)
          );

        const nextAutofilledFields = deepClone(
          wizardState.autofilledFields
        );
        if (visibleFieldIds.length > 0) {
          visibleFieldIds.forEach((fieldId) => {
            const hasSuggestion = orderedSuggestions.some(
              (candidate) => candidate.fieldId === fieldId
            );
            if (!hasSuggestion) {
              const existing = getDeep(nextAutofilledFields, fieldId);
              if (existing && !existing.accepted) {
                setDeep(nextAutofilledFields, fieldId, undefined);
              }
            }
          });
        }
        orderedSuggestions.forEach((suggestion) => {
          const existing = getDeep(nextAutofilledFields, suggestion.fieldId);
          if (existing?.accepted) {
            return;
          }
          setDeep(nextAutofilledFields, suggestion.fieldId, {
            ...existing,
            value: suggestion.value,
            rationale: suggestion.rationale,
            confidence: suggestion.confidence,
            source: suggestion.source,
            accepted: false,
            suggestedAt: Date.now(),
          });
        });

        const baseAssistantMessages = wizardState.assistantMessages.filter(
          (message) => {
            if (
              message.kind === "suggestion" &&
              message.meta?.stepId === stepId
            ) {
              return false;
            }
            if (
              !failure &&
              message.kind === "error" &&
              message.meta?.type === "suggestion-failure"
            ) {
              return false;
            }
            return true;
          }
        );

        const suggestionMessages = orderedSuggestions.map(
          (candidate, index) => ({
            id: `autofill-${candidate.fieldId}-${Date.now()}-${index}`,
            role: "assistant",
            kind: "suggestion",
            content:
              typeof candidate.value === "string" ||
              typeof candidate.value === "number"
                ? String(candidate.value)
                : JSON.stringify(candidate.value),
            meta: {
              fieldId: candidate.fieldId,
              confidence: candidate.confidence ?? 0.5,
              rationale: candidate.rationale,
              value: candidate.value,
              mode: "autofill",
              stepId,
            },
          })
        );

        let nextAssistantMessages = [...baseAssistantMessages, ...suggestionMessages];

        if (failure) {
          nextAssistantMessages = nextAssistantMessages.filter(
            (message) =>
              !(
                message.kind === "error" &&
                message.meta?.type === "suggestion-failure"
              )
          );
          nextAssistantMessages = [
            ...nextAssistantMessages,
            {
              id: `suggestion-failure-${Date.now()}`,
              role: "assistant",
              kind: "error",
              content: failure.error
                ? `I couldn't refresh suggestions (${failure.reason}). ${failure.error}`
                : `I couldn't refresh suggestions (${failure.reason}). Please try again soon.`,
              meta: { type: "suggestion-failure" },
            },
          ];
        }

        dispatch({
          type: "SET_SUGGESTIONS_DONE",
          payload: {
            hiddenFields: {},
            autofilledFields: nextAutofilledFields,
            assistantMessages: nextAssistantMessages,
            copilotNextTeaser: failure
              ? "I hit a snag fetching fresh suggestions. Tap refresh to try again."
              : "",
          },
        });
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }
        dispatch({
          type: "PUSH_ASSISTANT_MESSAGE",
          payload: {
            id: `suggestion-error-${Date.now()}`,
            role: "assistant",
            kind: "error",
            content: error?.message ?? "Failed to load suggestions.",
          },
        });
      } finally {
        if (suggestionsAbortRef.current === controller) {
          suggestionsAbortRef.current = null;
        }
        dispatch({ type: "SET_SUGGESTIONS_LOADING", payload: false });
      }
    },
    [
      announceAuthRequired,
      currentStep?.id,
      steps,
      user,
      wizardState.autofilledFields,
      wizardState.includeOptional,
      wizardState.jobId,
      wizardState.assistantMessages,
    ]
  );

  const persistCurrentDraft = useCallback(
    async (intentOverrides = {}, stepId = currentStep?.id) => {
      if (!user?.authToken) {
        announceAuthRequired();
        return null;
      }

      const intent = { includeOptional: wizardState.includeOptional, ...intentOverrides };
      const diff = computeStateDiff(
        wizardState.committedState,
        wizardState.state
      );
      const hasChanges = Object.keys(diff).length > 0;
      const creatingJob = !wizardState.jobId;

      if (!creatingJob && !hasChanges) {
        showToast("info", "No new changes to save.");
        return { savedId: wizardState.jobId, intent, noChanges: true };
      }

      try {
        const wizardMeta = {
          required_completed:
            progressCompletedCount === PROGRESS_TRACKING_FIELDS.length,
          required_completed_count: progressCompletedCount,
          optional_sections_completed: optionalSectionsCompleted,
          unlock_screen_seen: wizardState.hasSeenUnlock,
          unlock_screen_action: wizardState.unlockAction,
        };

        const response = await persistMutation.mutateAsync({
          state: creatingJob ? wizardState.state : diff,
          authToken: user.authToken,
          jobId: wizardState.jobId,
          intent,
          stepId,
          wizardMeta,
        });

        dispatch({
          type: "SAVE_SUCCESS",
          payload: {
            committedState: wizardState.state,
            jobId: response?.jobId ?? wizardState.jobId,
            includeOptional: intent.includeOptional,
          },
        });
        debug("persist:success", {
          jobId: response?.jobId ?? wizardState.jobId,
          intent,
          creatingJob,
        });

        showToast("success", "Draft saved successfully.");

        return {
          savedId: response?.jobId ?? wizardState.jobId,
          intent,
          noChanges: !hasChanges,
        };
      } catch (error) {
        debug("persist:error", error);
        showToast("error", error.message ?? "Failed to save your changes.");
        return null;
      }
    },
    [
      announceAuthRequired,
      currentStep?.id,
      optionalSectionsCompleted,
      progressCompletedCount,
      showToast,
      user,
      wizardState.committedState,
      wizardState.hasSeenUnlock,
      wizardState.includeOptional,
      wizardState.jobId,
      wizardState.state,
      wizardState.unlockAction,
      persistMutation,
    ]
  );

  useEffect(() => {
    if (!user?.id || !isHydrated) {
      return;
    }

    const targetJobId = wizardState.jobId ?? initialJobId ?? null;
    const hasDraftContent =
      targetJobId !== null ||
      Object.keys(wizardState.state ?? {}).length > 0;
    if (!hasDraftContent) {
      return;
    }

    if (draftPersistTimeoutRef.current) {
      clearTimeout(draftPersistTimeoutRef.current);
    }

    draftPersistTimeoutRef.current = window.setTimeout(() => {
      debug("draft:autosave", {
        jobId: targetJobId,
        step: wizardState.currentStepIndex,
        hasState: Object.keys(wizardState.state ?? {}).length,
      });
      saveDraft({
        userId: user.id,
        jobId: targetJobId,
        state: wizardState.state,
        includeOptional: wizardState.includeOptional,
        currentStepIndex: wizardState.currentStepIndex,
        maxVisitedIndex: wizardState.maxVisitedIndex,
      });
    }, 400);

    return () => {
      if (draftPersistTimeoutRef.current) {
        clearTimeout(draftPersistTimeoutRef.current);
        draftPersistTimeoutRef.current = null;
      }
    };
  }, [
    user?.id,
    isHydrated,
    wizardState.state,
    wizardState.includeOptional,
    wizardState.currentStepIndex,
    wizardState.maxVisitedIndex,
    wizardState.jobId,
    initialJobId,
  ]);

  const persistUnsavedChangesIfNeeded = useCallback(async () => {
    if (!wizardState.unsavedChanges) {
      return true;
    }
    const result = await persistCurrentDraft({}, currentStep?.id);
    return Boolean(result);
  }, [currentStep?.id, persistCurrentDraft, wizardState.unsavedChanges]);

  const onFieldChange = useCallback(
    (fieldId, value, options = {}) => {
      const { preserveSuggestionMeta = false } = options;
      dispatch({
        type: "FIELD_CHANGE",
        payload: {
          fieldId,
          value,
          preserveSuggestionMeta,
          timestamp: Date.now(),
        },
      });
    },
    []
  );

  const handleNext = useCallback(async () => {
    if (wizardState.currentStepIndex >= steps.length - 1) {
      return;
    }

    if (isCurrentStepRequired && !currentRequiredStepCompleteInState) {
      dispatch({
        type: "PUSH_ASSISTANT_MESSAGE",
        payload: {
          id: `validation-${Date.now()}`,
          role: "assistant",
          kind: "error",
          content: "Please complete all required fields before continuing.",
        },
      });
      return;
    }

    const stepId = currentStep?.id;
    const result = await persistCurrentDraft({}, stepId);
    if (!result) {
      return;
    }

    const nextIndex = wizardState.currentStepIndex + 1;
    const nextStep = steps[nextIndex] ?? steps[steps.length - 1];
    const shouldForceRefresh = !result.noChanges;

    goToStep(nextIndex);
    await fetchSuggestionsForStep({
      stepId: nextStep?.id ?? stepId,
      intentOverrides: {
        ...result.intent,
        forceRefresh: shouldForceRefresh || undefined,
      },
      jobIdOverride: result.savedId,
    });
  }, [
    currentRequiredStepCompleteInState,
    currentStep?.id,
    fetchSuggestionsForStep,
    goToStep,
    isCurrentStepRequired,
    persistCurrentDraft,
    steps,
    wizardState.currentStepIndex,
  ]);

  const handleBack = useCallback(async () => {
    if (wizardState.currentStepIndex === 0) {
      return;
    }

    const persisted = await persistUnsavedChangesIfNeeded();
    if (!persisted) {
      return;
    }

    const previousIndex = wizardState.currentStepIndex - 1;
    goToStep(previousIndex);
    await fetchSuggestionsForStep({
      stepId: steps[previousIndex]?.id,
    });
  }, [
    fetchSuggestionsForStep,
    goToStep,
    persistUnsavedChangesIfNeeded,
    steps,
    wizardState.currentStepIndex,
  ]);

  const handleSubmit = useCallback(
    async (submissionIntent = {}, options = {}) => {
      const { skipSuggestionRefresh = false } = options ?? {};
      if (
        wizardState.currentStepIndex < REQUIRED_STEPS.length &&
        !currentRequiredStepCompleteInState
      ) {
        dispatch({
          type: "PUSH_ASSISTANT_MESSAGE",
          payload: {
            id: `submit-validation-${Date.now()}`,
            role: "assistant",
            kind: "error",
            content: "Fill every required field before submitting.",
          },
        });
        return null;
      }

      const stepId = currentStep?.id;
      const result = await persistCurrentDraft(
        {
          optionalCompleted: wizardState.includeOptional,
          ...submissionIntent,
        },
        stepId
      );

      if (!result) {
        return null;
      }

      const shouldForceRefresh = !result.noChanges;

      if (!skipSuggestionRefresh) {
        await fetchSuggestionsForStep({
          stepId,
          intentOverrides: {
            ...result.intent,
            forceRefresh: shouldForceRefresh || undefined,
          },
          jobIdOverride: result.savedId,
        });
      }

      return result;
    },
    [
      currentRequiredStepCompleteInState,
      currentStep?.id,
      fetchSuggestionsForStep,
      persistCurrentDraft,
      wizardState.currentStepIndex,
      wizardState.includeOptional,
    ]
  );

  const handleGenerateHiringPack = useCallback(async () => {
    const result = await handleSubmit(
      {
        includeOptional: true,
        optionalCompleted: true,
      },
      { skipSuggestionRefresh: true }
    );

    if (!result) {
      return;
    }

    const targetJobId = result.savedId ?? wizardState.jobId;
    if (!targetJobId) {
      showToast("error", "Unable to determine job for refinement.");
      return;
    }

    if (user?.id) {
      clearDraft({ userId: user.id, jobId: targetJobId });
    }

    router.push(`/wizard/${targetJobId}/refine`);
  }, [handleSubmit, router, showToast, user?.id, wizardState.jobId]);

  const handleAddOptional = useCallback(async () => {
    if (!allRequiredStepsCompleteInState) {
      dispatch({
        type: "PUSH_ASSISTANT_MESSAGE",
        payload: {
          id: `optional-block-${Date.now()}`,
          role: "assistant",
          kind: "error",
          content:
            "Complete all required screens before unlocking optional details.",
        },
      });
      return;
    }

    const result = await persistCurrentDraft(
      { includeOptional: true },
      currentStep?.id
    );
    if (!result) {
      return;
    }

    dispatch({ type: "UNLOCK_OPTIONAL", payload: { unlockAction: "continue" } });

    const nextIndex = REQUIRED_STEPS.length;
    const optionalFlowSteps = [...REQUIRED_STEPS, ...OPTIONAL_STEPS];
    const nextStep = optionalFlowSteps[nextIndex] ?? OPTIONAL_STEPS[0];
    const shouldForceRefresh = !result.noChanges;

    goToStep(nextIndex);
    await fetchSuggestionsForStep({
      stepId: nextStep?.id ?? OPTIONAL_STEPS[0]?.id,
      intentOverrides: {
        includeOptional: true,
        forceRefresh: shouldForceRefresh || undefined,
      },
      jobIdOverride: result.savedId ?? wizardState.jobId ?? undefined,
    });
  }, [
    allRequiredStepsCompleteInState,
    currentStep?.id,
    fetchSuggestionsForStep,
    goToStep,
    persistCurrentDraft,
    wizardState.jobId,
  ]);

  const handleSkipOptional = useCallback(async () => {
    if (!allRequiredStepsCompleteInState) {
      dispatch({
        type: "PUSH_ASSISTANT_MESSAGE",
        payload: {
          id: `optional-skip-block-${Date.now()}`,
          role: "assistant",
          kind: "error",
          content: "Complete all required screens before finishing up.",
        },
      });
      return;
    }

    const result = await handleSubmit(
      {
        includeOptional: false,
        optionalCompleted: false,
      },
      { skipSuggestionRefresh: true }
    );

    if (!result) {
      return;
    }

    dispatch({ type: "SKIP_OPTIONAL", payload: { unlockAction: "skip" } });

    const targetJobId = result.savedId ?? wizardState.jobId;
    if (!targetJobId) {
      showToast("error", "Unable to determine job for refinement.");
      return;
    }

    if (user?.id) {
      clearDraft({ userId: user.id, jobId: targetJobId });
    }

    router.push(`/wizard/${targetJobId}/refine`);
  }, [
    allRequiredStepsCompleteInState,
    dispatch,
    handleSubmit,
    router,
    user?.id,
    showToast,
    wizardState.jobId,
  ]);

  const handleStepNavigation = useCallback(
    async (index) => {
      if (index === wizardState.currentStepIndex) return;
      const targetStep = steps[index];
      if (!targetStep) return;

      if (
        isCurrentStepRequired &&
        !currentRequiredStepCompleteInState &&
        index > wizardState.currentStepIndex
      ) {
        dispatch({
          type: "PUSH_ASSISTANT_MESSAGE",
          payload: {
            id: `nav-block-${Date.now()}`,
            role: "assistant",
            kind: "error",
            content: "Complete the current screen before moving forward.",
          },
        });
        return;
      }

      if (index >= REQUIRED_STEPS.length && !allRequiredStepsCompleteInState) {
        dispatch({
          type: "PUSH_ASSISTANT_MESSAGE",
          payload: {
            id: `optional-nav-block-${Date.now()}`,
            role: "assistant",
            kind: "error",
            content:
              "Optional screens unlock after all required screens are complete.",
          },
        });
        return;
      }

      const persisted = await persistUnsavedChangesIfNeeded();
      if (!persisted) {
        return;
      }

      goToStep(index);
      await fetchSuggestionsForStep({
        stepId: targetStep.id,
      });
    },
    [
      allRequiredStepsCompleteInState,
      currentRequiredStepCompleteInState,
      fetchSuggestionsForStep,
      goToStep,
      isCurrentStepRequired,
      persistUnsavedChangesIfNeeded,
      steps,
      wizardState.currentStepIndex,
    ]
  );

  const handleAcceptSuggestion = useCallback(
    async (suggestion) => {
      if (!user?.authToken) {
        announceAuthRequired();
        return;
      }

      const fieldDef = findFieldDefinition(suggestion.fieldId);
      const proposal =
        suggestion.value !== undefined ? suggestion.value : suggestion.proposal;
      const value = normalizeValueForField(fieldDef, proposal);

      const currentValue = getDeep(stateRef.current ?? {}, suggestion.fieldId);
      setDeep(previousFieldValuesRef.current, suggestion.fieldId, {
        __stored: true,
        value: currentValue,
      });

      dispatch({
        type: "APPLY_SUGGESTION",
        payload: {
          fieldId: suggestion.fieldId,
          value,
          meta: {
            rationale:
              suggestion.rationale ??
              "Suggested so candidates understand the opportunity immediately.",
            confidence: suggestion.confidence ?? 0.5,
            source: suggestion.source ?? "copilot",
          },
          appliedAt: Date.now(),
        },
      });
    },
    [announceAuthRequired, user]
  );

  const handleSuggestionToggle = useCallback(
    async (meta, accepted) => {
      if (!meta?.fieldId) {
        return;
      }
      if (accepted) {
        await handleAcceptSuggestion(meta);
        return;
      }

      const previousEntry = getDeep(
        previousFieldValuesRef.current,
        meta.fieldId
      );
      const fallback =
        previousEntry && previousEntry.__stored
          ? previousEntry.value
          : getDeep(wizardState.committedState, meta.fieldId);

      onFieldChange(meta.fieldId, fallback ?? undefined, {
        preserveSuggestionMeta: false,
        skipRealtime: true,
      });

      dispatch({
        type: "REJECT_SUGGESTION",
        payload: {
          fieldId: meta.fieldId,
          fallbackValue: fallback ?? undefined,
          rejectedAt: Date.now(),
        },
      });

      setDeep(previousFieldValuesRef.current, meta.fieldId, undefined);

      await fetchSuggestionsForStep({
        stepId: currentStep?.id,
        updatedFieldId: meta.fieldId,
        updatedValue: fallback ?? undefined,
      });
    },
    [
      currentStep?.id,
      fetchSuggestionsForStep,
      handleAcceptSuggestion,
      onFieldChange,
      wizardState.committedState,
    ]
  );

  const handleSendMessage = useCallback(
    async (message) => {
      const trimmed = message.trim();
      if (!trimmed) return;

      if (!user) {
        announceAuthRequired();
        return;
      }

      debug("copilot:send:start", {
        jobId: wizardState.jobId,
        messagePreview: previewContent(trimmed, 80),
      });
      dispatch({ type: "SET_CHAT_STATUS", payload: true });

      const previousMessages = conversationRef.current ?? [];
      const clientMessageId = `client-${Date.now()}`;
      const optimisticCreatedAt = new Date();
      const optimisticMessage = {
        id: clientMessageId,
        role: "user",
        type: "user",
        content: trimmed,
        metadata: {
          optimistic: true,
          clientMessageId,
        },
        createdAt: optimisticCreatedAt,
      };
      const optimisticMessages = [...previousMessages, optimisticMessage];
      const optimisticVersion = deriveConversationVersion(optimisticMessages);
      dispatch({
        type: "SET_COPILOT_CONVERSATION",
        payload: {
          messages: optimisticMessages,
          version: optimisticVersion,
          source: "optimistic",
        },
      });
      debug("copilot:send:optimistic", {
        clientMessageId,
        jobId: wizardState.jobId,
        previousCount: previousMessages.length,
        nextCount: optimisticMessages.length,
        preview: previewContent(trimmed, 80),
      });

      try {
        let ensuredJobId = wizardState.jobId;
        if (!ensuredJobId) {
          const persisted = await persistCurrentDraft({}, currentStep?.id);
          if (!persisted?.savedId) {
            throw new Error(
              "I couldn’t save your draft yet. Please enter at least one field and try again."
            );
          }
          ensuredJobId = persisted.savedId;
          await loadCopilotConversation();
        }

        const response = await sendCopilotAgentMessage({
          authToken: user.authToken,
          jobId: ensuredJobId,
          message: trimmed,
          currentStepId: currentStep?.id,
          clientMessageId,
        });
        const normalizedMessages = applyClientMessageIds(response.messages ?? []);
        const version = deriveConversationVersion(normalizedMessages);
        debug("copilot:send:success", {
          jobId: ensuredJobId,
          version,
          clientMessageId,
          messageCount: normalizedMessages.length,
          messages: summarizeConversationMessages(normalizedMessages),
        });

        dispatch({
          type: "SET_COPILOT_CONVERSATION",
          payload: {
            messages: normalizedMessages,
            version,
            source: "send",
          },
        });

        if (Array.isArray(response.actions)) {
          response.actions.forEach((action) => {
            if (action?.type === "field_update" && action.fieldId) {
              onFieldChange(action.fieldId, action.value, {
                preserveSuggestionMeta: false,
              });
            }
          });
        }
      } catch (error) {
        debug("copilot:send:error", {
          jobId: wizardState.jobId,
          error: error?.message,
          clientMessageId,
        });
        const fallbackMessages = conversationRef.current?.filter(
          (entry) => entry.metadata?.optimistic !== true
        ) ?? [];
        dispatch({
          type: "SET_COPILOT_CONVERSATION",
          payload: {
            messages: fallbackMessages,
            version: deriveConversationVersion(fallbackMessages),
            source: "optimistic-revert",
          },
        });
        dispatch({
          type: "PUSH_ASSISTANT_MESSAGE",
          payload: {
            id: `chat-error-${Date.now()}`,
            role: "assistant",
            kind: "error",
            content:
              error?.message ?? "I ran into an issue processing that request.",
          },
        });
      } finally {
        dispatch({ type: "SET_CHAT_STATUS", payload: false });
      }
    },
    [
      announceAuthRequired,
      currentStep?.id,
      debug,
      loadCopilotConversation,
      onFieldChange,
      persistCurrentDraft,
      user,
      wizardState.jobId,
    ]
  );

  const setCustomCapsuleActive = useCallback(
    (fieldId, isActive) => {
      const next = { ...wizardState.customCapsuleActive };
      if (isActive) {
        next[fieldId] = true;
      } else {
        delete next[fieldId];
      }
      dispatch({
        type: "SET_CUSTOM_CAPSULE_ACTIVE",
        payload: next,
      });
    },
    [wizardState.customCapsuleActive]
  );

  const setHoveredCapsule = useCallback(
    (fieldId, value) => {
      dispatch({
        type: "SET_HOVERED_CAPSULES",
        payload: {
          ...wizardState.hoveredCapsules,
          [fieldId]: value,
        },
      });
    },
    [wizardState.hoveredCapsules]
  );

  const clearHoveredCapsule = useCallback(
    (fieldId, expectedValue) => {
      const currentValue = wizardState.hoveredCapsules[fieldId];
      if (currentValue !== expectedValue) {
        return;
      }
      const next = { ...wizardState.hoveredCapsules };
      delete next[fieldId];
      dispatch({
        type: "SET_HOVERED_CAPSULES",
        payload: next,
      });
    },
    [wizardState.hoveredCapsules]
  );

  useEffect(() => {
    loadCopilotConversation();
  }, [loadCopilotConversation]);

  return {
    user,
    state: wizardState.state,
    committedState: wizardState.committedState,
    jobId: wizardState.jobId,
    includeOptional: wizardState.includeOptional,
    steps,
    currentStep,
    currentStepIndex: wizardState.currentStepIndex,
    totalSteps,
    maxVisitedIndex: wizardState.maxVisitedIndex,
    stepMetrics,
    progressCompletedCount,
    totalProgressFields: PROGRESS_TRACKING_FIELDS.length,
    optionalSectionsCompleted,
    optionalProgressPct,
    allRequiredStepsCompleteInState,
    currentRequiredStepCompleteInState,
    isCurrentStepRequired,
    isLastStep,
    showUnlockCtas,
    // currentOptionalBanner,
    assistantMessages: wizardState.assistantMessages,
    visibleAssistantMessages,
    copilotConversation: wizardState.copilotConversation,
    isChatting: wizardState.isChatting,
    isFetchingSuggestions: wizardState.isFetchingSuggestions,
    hiddenFields: wizardState.hiddenFields,
    autofilledFields: wizardState.autofilledFields,
    copilotNextTeaser: wizardState.copilotNextTeaser,
    customCapsuleActive: wizardState.customCapsuleActive,
    hoveredCapsules: wizardState.hoveredCapsules,
    hasSeenUnlock: wizardState.hasSeenUnlock,
    unlockAction: wizardState.unlockAction,
    unsavedChanges: wizardState.unsavedChanges,
    activeToast: wizardState.activeToast,
    activeToastClassName,
    numberDrafts: wizardState.numberDrafts,
    isSaving: persistMutation.isPending,
    onFieldChange,
    handleNext,
    handleBack,
    handleStepNavigation,
    handleAddOptional,
    handleSkipOptional,
    handleSubmit,
    handleGenerateHiringPack,
    handleSendMessage,
    handleAcceptSuggestion,
    handleSuggestionToggle,
    fetchSuggestionsForStep,
    setCustomCapsuleActive,
    setHoveredCapsule,
    clearHoveredCapsule,
    showToast,
    goToStep,
    isHydrated,
  };
}

function determineStepIndex(intakeState = {}, includeOptional = false) {
  const stepList = includeOptional
    ? [...REQUIRED_STEPS, ...OPTIONAL_STEPS]
    : REQUIRED_STEPS;
  const firstIncomplete = stepList.findIndex((step) =>
    step.fields.some((field) => !isFieldValueProvided(getDeep(intakeState, field.id), field))
  );
  if (firstIncomplete === -1) {
    return Math.max(stepList.length - 1, 0);
  }
  return firstIncomplete;
}
