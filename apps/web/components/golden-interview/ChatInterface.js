"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import DOMPurify from "isomorphic-dompurify";
import { GoldenInterviewApi } from "../../lib/api-client";
import { useUser } from "../user-context";
import { getComponent } from "./registry";
import { clsx } from "../../lib/cn";

// =============================================================================
// CONSTANTS
// =============================================================================

const STEPS = [
  { id: "opening", label: "Overview", icon: "bulb" },
  { id: "compensation", label: "Rewards", icon: "chart" },
  { id: "culture", label: "Culture", icon: "heart" },
  { id: "growth", label: "Growth", icon: "rocket" },
  { id: "closing", label: "Review", icon: "check" },
];

const PHASE_TO_STEP_INDEX = {
  opening: 0,
  context: 0,
  compensation: 1,
  financial: 1,
  benefits: 1,
  stability: 1,
  culture: 2,
  team: 2,
  values: 2,
  humans_and_culture: 2,
  environment: 2,
  growth: 3,
  career: 3,
  development: 3,
  role_reality: 3,
  closing: 4,
  review: 4,
  complete: 4,
  unique_value: 4,
};

// Mandatory fields that cannot be skipped
// Must match backend MANDATORY_FIELDS in golden-schema.js
const MANDATORY_FIELDS = [
  "role_overview.job_title",
  "role_overview.company_name",
  "role_overview.employment_type",
  "role_overview.location_type",
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ChatInterface({
  companyId = null,
  companyName = null,
}) {
  const { user } = useUser();
  const router = useRouter();
  const authToken = user?.authToken;

  // Session state
  const [sessionId, setSessionId] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState(null);

  // Current interaction state
  const [currentTool, setCurrentTool] = useState(null);
  const [currentMessage, setCurrentMessage] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [dynamicValue, setDynamicValue] = useState(null);

  // Refine suggestions state
  const [refineResult, setRefineResult] = useState(null);
  const [showRewriteInput, setShowRewriteInput] = useState(false);
  const [rewriteValue, setRewriteValue] = useState("");

  // Interview progress state
  const [currentPhase, setCurrentPhase] = useState("opening");
  const [contextExplanation, setContextExplanation] = useState("");
  const [completionPercentage, setCompletionPercentage] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [currentlyAskingField, setCurrentlyAskingField] = useState(null);

  const inputRef = useRef(null);

  // Check if current field is mandatory (skip button should be hidden)
  const isCurrentFieldMandatory = MANDATORY_FIELDS.includes(currentlyAskingField);
  const initRef = useRef(false);

  // Derived state
  const currentStepIndex = PHASE_TO_STEP_INDEX[currentPhase] ?? 0;

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  useEffect(() => {
    if (!authToken || initRef.current) return;
    initRef.current = true;

    const initSession = async () => {
      setIsInitializing(true);
      setError(null);

      try {
        const initialData = companyId ? { companyId } : {};
        const response = await GoldenInterviewApi.startSession({
          authToken,
          initialData,
        });

        setSessionId(response.sessionId);

        // Map snake_case API response to camelCase state
        if (response.interview_phase) {
          setCurrentPhase(response.interview_phase);
        }
        if (response.context_explanation) {
          setContextExplanation(response.context_explanation);
        }
        if (response.completion_percentage !== undefined) {
          setCompletionPercentage(response.completion_percentage);
        }
        if (response.message) {
          setCurrentMessage(response.message);
        }
        if (response.ui_tool) {
          setCurrentTool(response.ui_tool);
        }
        // ALWAYS update currentlyAskingField to avoid stale state
        setCurrentlyAskingField(response.currently_asking_field ?? null);
        // DEBUG: Log the currently asking field on session start
        console.log("[ChatInterface] Session start - currently_asking_field:", response.currently_asking_field, "| isMandatory:", MANDATORY_FIELDS.includes(response.currently_asking_field));
      } catch (err) {
        console.error("Failed to start session:", err);
        setError(err.message || "Failed to start interview. Please try again.");
      } finally {
        setIsInitializing(false);
      }
    };

    initSession();
  }, [authToken, companyId]);

  // Focus input when ready
  useEffect(() => {
    if (!isInitializing && !currentTool && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isInitializing, currentTool]);

  // ==========================================================================
  // MESSAGE HANDLING
  // ==========================================================================

  const sendMessage = useCallback(
    async (messageContent, value = null, skipAction = null) => {
      if (!sessionId || !authToken) return;

      setInputValue("");
      setDynamicValue(null);
      setCurrentTool(null);
      setRefineResult(null);
      setIsTyping(true);
      setError(null);

      try {
        const response = await GoldenInterviewApi.sendMessage(
          {
            sessionId,
            userMessage: messageContent || undefined,
            uiResponse: value !== null ? value : undefined,
            skipAction: skipAction || undefined,
          },
          { authToken }
        );

        // Check if we got refine suggestions (backend wants us to pause)
        if (response.refine_result?.suggestions?.length > 0) {
          setRefineResult(response.refine_result);
          // Keep the current tool visible so user can see what they answered
          // Don't update message - show suggestions UI instead
          return;
        }

        // Check if validation failed (can_proceed = false)
        if (response.refine_result?.can_proceed === false) {
          setError(response.refine_result.validation_issue || response.message || "Please provide a valid response.");
          // Keep current tool so user can retry
          return;
        }

        // Map snake_case API response to camelCase state
        if (response.interview_phase) {
          setCurrentPhase(response.interview_phase);
        }
        if (response.context_explanation) {
          setContextExplanation(response.context_explanation);
        }
        if (response.completion_percentage !== undefined) {
          setCompletionPercentage(response.completion_percentage);
        }
        if (response.message) {
          setCurrentMessage(response.message);
        }
        if (response.ui_tool) {
          setCurrentTool(response.ui_tool);
        }
        // ALWAYS update currentlyAskingField (even if null/undefined) to avoid stale state
        setCurrentlyAskingField(response.currently_asking_field ?? null);
        // DEBUG: Log the currently asking field to understand skip button behavior
        console.log("[ChatInterface] Turn response - currently_asking_field:", response.currently_asking_field, "| isMandatory:", MANDATORY_FIELDS.includes(response.currently_asking_field));
        // Check if interview is complete
        if (response.is_complete || response.interview_phase === "complete") {
          setIsComplete(true);
        }
      } catch (err) {
        console.error("Failed to send message:", err);
        setError(err.message || "Failed to send message. Please try again.");
      } finally {
        setIsTyping(false);
      }
    },
    [sessionId, authToken]
  );

  const handleSkip = useCallback(() => {
    // Send explicit machine-readable skip signal (not locale-dependent text)
    sendMessage(null, null, { isSkip: true, reason: "unknown" });
  }, [sendMessage]);

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    sendMessage(inputValue.trim());
  };

  const handleDynamicSubmit = () => {
    if (dynamicValue === null || dynamicValue === undefined) return;
    sendMessage(null, dynamicValue);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && inputValue.trim()) {
      e.preventDefault();
      sendMessage(inputValue.trim());
    }
  };

  // Handle selecting a suggestion from refine result
  const handleSelectSuggestion = useCallback(async (suggestionValue) => {
    if (!refineResult || !sessionId || !authToken) return;

    setRefineResult(null);
    setShowRewriteInput(false);
    setRewriteValue("");
    setIsTyping(true);
    setError(null);

    try {
      // Re-submit with the improved value, marking as accepted (skip refine check)
      const response = await GoldenInterviewApi.sendMessage(
        {
          sessionId,
          userMessage: suggestionValue,
          acceptRefinedValue: true, // Tell backend to skip golden_refine
        },
        { authToken }
      );

      // Process normal response
      if (response.interview_phase) setCurrentPhase(response.interview_phase);
      if (response.context_explanation) setContextExplanation(response.context_explanation);
      if (response.completion_percentage !== undefined) setCompletionPercentage(response.completion_percentage);
      if (response.message) setCurrentMessage(response.message);
      if (response.ui_tool) setCurrentTool(response.ui_tool);
      // ALWAYS update currentlyAskingField to avoid stale state
      setCurrentlyAskingField(response.currently_asking_field ?? null);
      if (response.is_complete || response.interview_phase === "complete") setIsComplete(true);
    } catch (err) {
      console.error("Failed to submit suggestion:", err);
      setError(err.message || "Failed to submit. Please try again.");
    } finally {
      setIsTyping(false);
    }
  }, [refineResult, sessionId, authToken]);

  // Handle keeping the original value
  const handleKeepOriginal = useCallback(async () => {
    if (!refineResult?.original_value || !sessionId || !authToken) return;

    setRefineResult(null);
    setShowRewriteInput(false);
    setRewriteValue("");
    setIsTyping(true);
    setError(null);

    try {
      // Re-submit with original value, marking as accepted (skip refine check)
      const response = await GoldenInterviewApi.sendMessage(
        {
          sessionId,
          userMessage: refineResult.original_value,
          acceptRefinedValue: true, // Tell backend to skip golden_refine
        },
        { authToken }
      );

      // Process normal response
      if (response.interview_phase) setCurrentPhase(response.interview_phase);
      if (response.context_explanation) setContextExplanation(response.context_explanation);
      if (response.completion_percentage !== undefined) setCompletionPercentage(response.completion_percentage);
      if (response.message) setCurrentMessage(response.message);
      if (response.ui_tool) setCurrentTool(response.ui_tool);
      // ALWAYS update currentlyAskingField to avoid stale state
      setCurrentlyAskingField(response.currently_asking_field ?? null);
      if (response.is_complete || response.interview_phase === "complete") setIsComplete(true);
    } catch (err) {
      console.error("Failed to keep original:", err);
      setError(err.message || "Failed to submit. Please try again.");
    } finally {
      setIsTyping(false);
    }
  }, [refineResult, sessionId, authToken]);

  // Handle submitting a rewritten answer from suggestions view
  const handleRewriteSubmit = useCallback(async () => {
    if (!rewriteValue.trim() || !sessionId || !authToken) return;

    const newValue = rewriteValue.trim();
    setRefineResult(null);
    setShowRewriteInput(false);
    setRewriteValue("");
    setIsTyping(true);
    setError(null);

    try {
      // Submit the new value - go through refine again (user might still make a mistake)
      const response = await GoldenInterviewApi.sendMessage(
        {
          sessionId,
          userMessage: newValue,
          // Don't set acceptRefinedValue - let it go through refine check again
        },
        { authToken }
      );

      // Check if we got refine suggestions again
      if (response.refine_result?.suggestions?.length > 0) {
        setRefineResult(response.refine_result);
        return;
      }

      // Check if validation failed
      if (response.refine_result?.can_proceed === false) {
        setError(response.refine_result.validation_issue || "Please provide a valid response.");
        return;
      }

      // Process normal response
      if (response.interview_phase) setCurrentPhase(response.interview_phase);
      if (response.context_explanation) setContextExplanation(response.context_explanation);
      if (response.completion_percentage !== undefined) setCompletionPercentage(response.completion_percentage);
      if (response.message) setCurrentMessage(response.message);
      if (response.ui_tool) setCurrentTool(response.ui_tool);
      // ALWAYS update currentlyAskingField to avoid stale state
      setCurrentlyAskingField(response.currently_asking_field ?? null);
      if (response.is_complete || response.interview_phase === "complete") setIsComplete(true);
    } catch (err) {
      console.error("Failed to submit rewrite:", err);
      setError(err.message || "Failed to submit. Please try again.");
    } finally {
      setIsTyping(false);
    }
  }, [rewriteValue, sessionId, authToken]);

  // ==========================================================================
  // RENDER HELPERS
  // ==========================================================================

  const renderDynamicInput = () => {
    if (!currentTool) return null;

    const Component = getComponent(currentTool.type);
    if (!Component) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          <span className="font-medium">Unknown input type:</span>{" "}
          {currentTool.type}
        </div>
      );
    }

    // All components follow the same pattern:
    // - Config props (items, rows, segments, etc.) come from LLM via currentTool.props
    // - value prop captures the user's response (null → undefined to trigger component defaults)
    // - onChange updates the response
    return (
      <Component
        {...(currentTool.props || {})}
        value={dynamicValue ?? undefined}
        onChange={setDynamicValue}
      />
    );
  };

  const renderSuggestionsUI = () => {
    if (!refineResult?.suggestions?.length) return null;

    return (
      <div className="rounded-xl border border-primary-100 bg-gradient-to-br from-primary-50/50 to-violet-50/50 p-6">
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100">
            <SparklesIcon className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">We have a few suggestions</h3>
            <p className="text-sm text-slate-500">
              {refineResult.reasoning || "Here are some ways to improve your response"}
            </p>
          </div>
        </div>

        {/* Original Value */}
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Your answer
          </div>
          <div className="text-sm text-slate-700">{refineResult.original_value}</div>
        </div>

        {/* Suggestions */}
        <div className="mb-4 space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Suggested improvements
          </div>
          {refineResult.suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => handleSelectSuggestion(suggestion.value)}
              className="group w-full rounded-lg border border-slate-200 bg-white p-4 text-left transition-all hover:border-primary-300 hover:bg-primary-50/50 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="font-medium text-slate-800 group-hover:text-primary-700">
                    {suggestion.value}
                  </div>
                  {suggestion.why_better && (
                    <div className="mt-1 text-xs text-slate-500">
                      {suggestion.why_better}
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0 rounded-full bg-slate-100 p-1.5 group-hover:bg-primary-100">
                  <svg className="h-4 w-4 text-slate-400 group-hover:text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </div>
              </div>
              {suggestion.improvement_type && (
                <div className="mt-2">
                  <span className="inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                    {suggestion.improvement_type}
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Rewrite Input Section */}
        {showRewriteInput ? (
          <div className="mb-4 space-y-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Write a different answer
            </div>
            <textarea
              value={rewriteValue}
              onChange={(e) => setRewriteValue(e.target.value)}
              placeholder="Type your new answer here..."
              rows={3}
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 transition-all focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleRewriteSubmit}
                disabled={!rewriteValue.trim()}
                className="flex-1 rounded-lg bg-gradient-to-r from-primary-600 to-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit
              </button>
              <button
                onClick={() => {
                  setShowRewriteInput(false);
                  setRewriteValue("");
                }}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowRewriteInput(true)}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-4 py-3 text-sm font-medium text-slate-500 transition-all hover:bg-slate-100 hover:border-slate-400 hover:text-slate-600"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Write a different answer
          </button>
        )}

        {/* Keep Original Button */}
        <button
          onClick={handleKeepOriginal}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 hover:border-slate-300"
        >
          Keep my original answer
        </button>
      </div>
    );
  };

  // ==========================================================================
  // LOADING STATE
  // ==========================================================================

  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F7FC]">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-xl shadow-primary-500/25 flex items-center justify-center">
              <BulbIcon className="h-10 w-10 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-white shadow-md flex items-center justify-center">
              <div className="h-3 w-3 rounded-full bg-primary-500 animate-pulse" />
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-slate-800">
              Preparing Your Interview
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Setting up your personalized experience...
            </p>
          </div>
          <div className="h-1.5 w-48 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-primary-500 to-primary-600" />
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // ERROR STATE
  // ==========================================================================

  if (!sessionId && error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F7FC] p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-8 text-center shadow-xl shadow-slate-200/50">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-red-50">
            <svg
              className="h-7 w-7 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-slate-900">
            Unable to Start
          </h2>
          <p className="mb-6 text-sm text-slate-500">{error}</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/25 transition-all hover:shadow-xl hover:shadow-primary-500/30"
            >
              Try Again
            </button>
            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-xl border border-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // INTERVIEW COMPLETE STATE
  // ==========================================================================

  if (isComplete) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F7FC] p-4">
        <div className="w-full max-w-lg rounded-2xl border border-green-100 bg-white p-8 text-center shadow-xl shadow-slate-200/50">
          {/* Success Icon */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-500 shadow-lg shadow-green-500/25">
            <CheckIcon className="h-10 w-10 text-white" />
          </div>

          {/* Title & Message */}
          <h2 className="mb-3 text-2xl font-bold text-slate-900">
            Interview Complete!
          </h2>
          <p className="mb-2 text-base text-slate-600">
            {currentMessage || "Great work! We've captured everything we need about this role."}
          </p>
          <p className="mb-8 text-sm text-slate-400">
            Your Golden Schema has been saved and is ready to use.
          </p>

          {/* Progress Summary */}
          <div className="mb-8 rounded-xl bg-slate-50 p-4">
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">
                  {completionPercentage}%
                </div>
                <div className="text-xs text-slate-400">Complete</div>
              </div>
              <div className="h-10 w-px bg-slate-200" />
              <div className="text-center">
                <div className="text-3xl font-bold text-primary-600">
                  {STEPS.length}
                </div>
                <div className="text-xs text-slate-400">Phases Covered</div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-500/25 transition-all hover:shadow-xl hover:shadow-primary-500/30"
            >
              Go to Dashboard
            </button>
            <button
              onClick={() => router.push("/wizard")}
              className="rounded-xl border border-slate-200 px-8 py-3 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50 hover:border-slate-300"
            >
              Create Job Posting
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // MAIN RENDER
  // ==========================================================================

  return (
    <div className="min-h-screen bg-[#F8F7FC]">
      {/* ================================================================== */}
      {/* TOP BAR WITH PROGRESS STEPPER */}
      {/* ================================================================== */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          {/* Brand Row */}
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-600">
                <BulbIcon className="h-4 w-4 text-white" />
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-800">
                  Golden Interview
                </span>
                {companyName && (
                  <span className="ml-2 text-xs text-slate-400">
                    for {companyName}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Progress Stepper */}
          {/* <div className="pb-4">
            <nav className="flex items-center justify-between">
              {STEPS.map((step, index) => {
                const isActive = index === currentStepIndex;
                const isCompleted = index < currentStepIndex;
                const isUpcoming = index > currentStepIndex;
                const StepIcon = getStepIcon(step.icon);

                return (
                  <div
                    key={step.id}
                    className={clsx(
                      "relative flex flex-1 items-center",
                      index < STEPS.length - 1 && "after:absolute after:left-[calc(50%+20px)] after:right-0 after:top-4 after:h-0.5 after:rounded-full",
                      isCompleted ? "after:bg-primary-500" : "after:bg-slate-200"
                    )}
                  >
                    <div className="relative z-10 flex flex-col items-center gap-1.5">
                      <div
                        className={clsx(
                          "flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300",
                          isActive && "bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30 ring-4 ring-primary-100",
                          isCompleted && "bg-primary-500 text-white",
                          isUpcoming && "bg-slate-100 text-slate-400"
                        )}
                      >
                        {isCompleted ? (
                          <CheckIcon className="h-4 w-4" />
                        ) : (
                          <StepIcon className="h-4 w-4" />
                        )}
                      </div>
                      <span
                        className={clsx(
                          "text-xs font-medium transition-colors",
                          isActive && "text-primary-600",
                          isCompleted && "text-slate-600",
                          isUpcoming && "text-slate-400"
                        )}
                      >
                        {step.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </nav>
          </div> */}
        </div>
      </header>

      {/* ================================================================== */}
      {/* MAIN CONTENT - SPLIT PANEL */}
      {/* ================================================================== */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* ============================================================ */}
          {/* LEFT PANEL - INTERACTION CARD */}
          {/* ============================================================ */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8">
            {/* Step Badge */}
            {/* <div className="mb-6 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-600">
                {(() => {
                  const StepIcon = getStepIcon(
                    STEPS[currentStepIndex]?.icon || "bulb"
                  );
                  return <StepIcon className="h-3.5 w-3.5" />;
                })()}
                Step {currentStepIndex + 1} of {STEPS.length}
              </span>
              {completionPercentage > 0 && (
                <span className="text-xs text-slate-400">
                  {completionPercentage}% complete
                </span>
              )}
            </div> */}

            {/* Question / Message */}
            <div
              className="mb-8 text-lg text-slate-600 [&>h3]:text-2xl [&>h3]:font-bold [&>h3]:leading-tight [&>h3]:text-slate-900 [&>h3]:mb-3 [&>h3]:block"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(
                  currentMessage || "Let's get started with your interview",
                  {
                    ALLOWED_TAGS: ["h3", "b", "strong", "span", "em"],
                    ALLOWED_ATTR: ["class"],
                  }
                ),
              }}
            />

            {/* Typing Indicator */}
            {isTyping && (
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                  <BulbIcon className="h-5 w-5 text-primary-500" />
                </div>
                <div className="flex gap-1.5 rounded-xl bg-slate-100 px-4 py-3">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
                {error}
                <button
                  onClick={() => setError(null)}
                  className="ml-2 font-medium underline hover:no-underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Suggestions UI - shown when refine_result has suggestions */}
            {refineResult?.suggestions?.length > 0 && (
              <div className="space-y-6">
                {renderSuggestionsUI()}
              </div>
            )}

            {/* Dynamic Input OR Text Input - hidden when showing suggestions */}
            {!isTyping && !refineResult?.suggestions?.length && (
              <div className="space-y-6">
                {currentTool ? (
                  <>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 sm:p-6">
                      {renderDynamicInput()}
                    </div>

                    {/* Action Buttons */}
                    <div className={clsx(
                      "flex flex-col-reverse gap-3 sm:flex-row sm:items-center",
                      isCurrentFieldMandatory ? "sm:justify-end" : "sm:justify-between"
                    )}>
                      {/* Skip button - hidden for mandatory fields */}
                      {!isCurrentFieldMandatory && (
                        <button
                          onClick={handleSkip}
                          className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 hover:border-slate-300"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 5l7 7-7 7M5 5l7 7-7 7"
                            />
                          </svg>
                          Skip for now
                        </button>
                      )}
                      <button
                        onClick={handleDynamicSubmit}
                        disabled={
                          dynamicValue === null || dynamicValue === undefined
                        }
                        className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-500/25 transition-all hover:shadow-xl hover:shadow-primary-500/30 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed"
                      >
                        Continue
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M14 5l7 7m0 0l-7 7m7-7H3"
                          />
                        </svg>
                      </button>
                    </div>
                  </>
                ) : (
                  <form onSubmit={handleTextSubmit}>
                    <div className="relative">
                      <textarea
                        ref={inputRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type your response here..."
                        rows={3}
                        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 transition-all focus:border-primary-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary-100"
                      />
                    </div>
                    <div className={clsx(
                      "mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center",
                      isCurrentFieldMandatory ? "sm:justify-end" : "sm:justify-between"
                    )}>
                      {/* Skip button - hidden for mandatory fields */}
                      {!isCurrentFieldMandatory && (
                        <button
                          type="button"
                          onClick={handleSkip}
                          className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 hover:border-slate-300"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 5l7 7-7 7M5 5l7 7-7 7"
                            />
                          </svg>
                          Skip for now
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={!inputValue.trim()}
                        className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-500/25 transition-all hover:shadow-xl hover:shadow-primary-500/30 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed"
                      >
                        Continue
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M14 5l7 7m0 0l-7 7m7-7H3"
                          />
                        </svg>
                      </button>
                    </div>
                    <p className="mt-3 text-center text-xs text-slate-400">
                      Press{" "}
                      <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">
                        Enter
                      </kbd>{" "}
                      to submit
                    </p>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* ============================================================ */}
          {/* RIGHT PANEL - CONTEXT & PROGRESS */}
          {/* ============================================================ */}
          <div className="hidden lg:block">
            <div className="sticky top-32 space-y-6">
              {/* Decorative Gradient Card */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-primary-500 to-violet-500 p-6 text-white shadow-xl shadow-primary-500/25">
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-10">
                  <svg
                    className="h-full w-full"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <pattern
                        id="grid"
                        width="10"
                        height="10"
                        patternUnits="userSpaceOnUse"
                      >
                        <path
                          d="M 10 0 L 0 0 0 10"
                          fill="none"
                          stroke="white"
                          strokeWidth="0.5"
                        />
                      </pattern>
                    </defs>
                    <rect width="100" height="100" fill="url(#grid)" />
                  </svg>
                </div>

                {/* Content */}
                <div className="relative">
                  <div className="mb-4 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                      <BulbIcon className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-semibold opacity-90">
                      Why we ask this
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed opacity-90">
                    {contextExplanation ||
                      "Every question helps us understand what makes this role special and attract the perfect candidates."}
                  </p>
                </div>
              </div>

              {/* Progress Stats Card */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg shadow-slate-200/50">
                <h3 className="mb-4 text-sm font-semibold text-slate-800">
                  Interview Progress
                </h3>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-3xl font-bold text-primary-600">
                      {completionPercentage}%
                    </span>
                    <span className="text-xs text-slate-400">complete</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all duration-500"
                      style={{ width: `${Math.max(completionPercentage, 3)}%` }}
                    />
                  </div>
                </div>

                {/* Current Phase */}
                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                    Current Phase
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const currentStep = STEPS[currentStepIndex];
                      const StepIcon = getStepIcon(currentStep?.icon || "bulb");
                      return (
                        <>
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100">
                            <StepIcon className="h-4 w-4 text-primary-600" />
                          </div>
                          <span className="font-semibold text-slate-800">
                            {currentStep?.label || "Overview"}
                          </span>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Tips Card */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg shadow-slate-200/50">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <svg
                    className="h-4 w-4 text-amber-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Quick Tip
                </h3>
                <p className="text-sm leading-relaxed text-slate-500">
                  Be specific and honest in your responses. The more detail you
                  provide, the better we can help you find the perfect match.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getStepIcon(iconName) {
  const icons = {
    bulb: BulbIcon,
    chart: ChartIcon,
    heart: HeartIcon,
    rocket: RocketIcon,
    check: CheckIcon,
  };
  return icons[iconName] || BulbIcon;
}

// =============================================================================
// ICON COMPONENTS
// =============================================================================

function BulbIcon({ className }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  );
}

function ChartIcon({ className }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  );
}

function HeartIcon({ className }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
      />
    </svg>
  );
}

function RocketIcon({ className }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
      />
    </svg>
  );
}

function CheckIcon({ className }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

function UserIcon({ className }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  );
}

function SparklesIcon({ className }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
      />
    </svg>
  );
}
