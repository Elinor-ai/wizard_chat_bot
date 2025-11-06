"use client";

import { clsx } from "../../lib/cn";
import { useUser } from "../user-context";
import { WizardSuggestionPanel } from "./wizard-suggestion-panel";
import { OPTIONAL_STEPS } from "./wizard-schema";
import { getDeep } from "./wizard-utils";
import { useWizardController } from "./use-wizard-controller";

function capsuleClassName(isActive, isHovered) {
  const baseClasses =
    "px-5 py-2.5 rounded-full border-2 text-sm font-semibold transition-all duration-150 transform focus:outline-none focus:ring-2 focus:ring-[#667eea]/20 cursor-pointer";

  if (isActive) {
    return clsx(
      baseClasses,
      "-translate-y-0.5 border-[#667eea] bg-[#667eea] text-white shadow-sm shadow-[#667eea]/50"
    );
  }

  return clsx(
    baseClasses,
    "border-[#e5e7eb] bg-white text-[#374151]",
    isHovered
      ? "-translate-y-0.5 border-[#667eea] bg-[#f5f7ff] shadow-sm shadow-[#667eea]/20"
      : "translate-y-0"
  );
}

export function WizardShell() {
  const { user } = useUser();
  const controller = useWizardController({ user });

  if (!user) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-10 text-center text-neutral-600 shadow-sm shadow-neutral-100">
        Please sign in to build a job brief. Once authenticated, your wizard
        progress will be saved to Firestore and synced across the console.
      </div>
    );
  }

  const {
    steps,
    currentStep,
    currentStepIndex,
    maxVisitedIndex,
    stepMetrics,
    includeOptional,
    progressCompletedCount,
    totalProgressFields,
    optionalSectionsCompleted,
    optionalProgressPct,
    showUnlockCtas,
    currentOptionalBanner,
    onFieldChange,
    state,
    hiddenFields,
    autofilledFields,
    customCapsuleActive,
    setCustomCapsuleActive,
    hoveredCapsules,
    setHoveredCapsule,
    clearHoveredCapsule,
    handleStepNavigation,
    handleNext,
    handleBack,
    handleAddOptional,
    handleSkipOptional,
    handleGenerateHiringPack,
    handleSendMessage,
    handleAcceptSuggestion,
    handleSuggestionToggle,
    fetchSuggestionsForStep,
    visibleAssistantMessages,
    isFetchingSuggestions,
    isChatting,
    copilotNextTeaser,
    committedState,
    allRequiredStepsCompleteInState,
    currentRequiredStepCompleteInState,
    isCurrentStepRequired,
    isLastStep,
    isSaving,
    activeToast,
    activeToastClassName,
  } = controller;

  const optionalStepCount = OPTIONAL_STEPS.length;
  const progressPercent =
    totalProgressFields === 0
      ? 0
      : Math.round((progressCompletedCount / totalProgressFields) * 100);
  const isGeneratingPack = isSaving;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
        {activeToast ? (
          <div
            className={clsx(
              "rounded-xl border px-4 py-3 text-sm font-medium shadow-sm",
              activeToastClassName ??
                "border-neutral-200 bg-neutral-50 text-neutral-700"
            )}
          >
            {activeToast.message}
          </div>
        ) : null}

        <nav className="flex flex-wrap items-center gap-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
          {steps.map((step, index) => {
            const isActive = index === currentStepIndex;
            const isUnlocked = index <= maxVisitedIndex;
            const isDisabled = !isActive && !isUnlocked;
            const metrics = stepMetrics[index] ?? {
              requiredCount: 0,
              requiredCompletedCount: 0,
              optionalCount: 0,
              optionalCompletedCount: 0,
              stepComplete: false,
            };

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => handleStepNavigation(index)}
                disabled={isDisabled}
                className={clsx(
                  "rounded-full border px-3 py-1 transition",
                  isActive
                    ? "border-primary-400 bg-primary-50 text-primary-600"
                    : isDisabled
                      ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-300"
                      : metrics.stepComplete
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-primary-300 hover:text-primary-600"
                )}
                aria-current={isActive ? "step" : undefined}
              >
                <span className="font-semibold">
                  {index + 1}. {step.title}
                </span>
                {metrics.stepComplete ? (
                  <span className="ml-1 text-emerald-600">✓</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="space-y-3 rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-neutral-800">
              {includeOptional
                ? "Optional enhancements"
                : "Required questions completed"}
            </span>
            <span className="text-xs font-medium text-primary-500">
              {includeOptional
                ? `${optionalSectionsCompleted} of ${optionalStepCount} sections complete`
                : `${progressCompletedCount} of ${totalProgressFields} complete`}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-200">
            <div
              className={clsx(
                "h-full rounded-full transition-all duration-200",
                includeOptional
                  ? "bg-gradient-to-r from-[#667eea] to-[#764ba2]"
                  : "bg-[#4caf50]"
              )}
              style={{
                width: `${Math.min(
                  100,
                  Math.max(
                    includeOptional ? optionalProgressPct : progressPercent,
                    includeOptional
                      ? optionalSectionsCompleted > 0
                        ? 6
                        : 0
                      : progressCompletedCount > 0
                        ? 6
                        : 0
                  )
                )}%`,
              }}
            />
          </div>
          <p className="text-xs text-neutral-500">
            Changes stay local until you press “Save & Continue.” Skip anything
            that doesn’t apply—you can always return before saving.
          </p>
        </div>

        {currentStep ? (
          <div className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm shadow-neutral-100">
            <h1 className="text-xl font-semibold text-neutral-800">
              {currentStep.title}
            </h1>
            {currentStep.subtitle ? (
              <p className="text-sm text-neutral-500">{currentStep.subtitle}</p>
            ) : null}
          </div>
        ) : null}

        {currentOptionalBanner ? (
          <div className="rounded-md border-l-4 border-[#ffd54f] bg-[#fff9e6] p-3 text-sm text-[#f57f17]">
            {currentOptionalBanner}
          </div>
        ) : null}

        {currentStep ? (
          <form className="grid gap-4">
            {currentStep.fields.map((field) => {
              const hiddenReason = getDeep(hiddenFields, field.id);
              if (hiddenReason) {
                return null;
              }

              const rawValue = getDeep(state, field.id);
              const highlightMeta = getDeep(autofilledFields, field.id);
              const effectiveValue = rawValue;
              const isListField = field.asList === true;
              const isSuggestedValue = Boolean(highlightMeta?.accepted);
              const hoveredValue = hoveredCapsules[field.id];
              const customOptionActive =
                Boolean(customCapsuleActive[field.id]) ||
                (effectiveValue !== undefined &&
                  effectiveValue !== null &&
                  !(field.options ?? []).some(
                    (option) => option.value === effectiveValue
                  ));

              let inputValue;
              if (field.valueAs === "boolean") {
                inputValue =
                  effectiveValue === true
                    ? "true"
                    : effectiveValue === false
                      ? "false"
                      : "";
              } else if (field.type === "number" || field.valueAs === "number") {
                inputValue = effectiveValue ?? "";
              } else if (isListField) {
                if (Array.isArray(effectiveValue)) {
                  inputValue = effectiveValue.join("\n");
                } else if (typeof effectiveValue === "string") {
                  inputValue = effectiveValue;
                } else {
                  inputValue = "";
                }
              } else {
                inputValue = effectiveValue ?? "";
              }

              const handleChange = (event) => {
                const { value } = event.target;

                if (field.valueAs === "boolean") {
                  if (value === "") {
                    onFieldChange(field.id, undefined);
                  } else {
                    onFieldChange(field.id, value === "true");
                  }
                  return;
                }

                if (field.type === "number" || field.valueAs === "number") {
                  if (value === "") {
                    onFieldChange(field.id, undefined);
                  } else {
                    const numeric = Number(value);
                    onFieldChange(
                      field.id,
                      Number.isNaN(numeric) ? undefined : numeric
                    );
                  }
                  return;
                }

                if (isListField) {
                  const entries = value
                    .split(/\n|,/)
                    .map((part) => part.trim())
                    .filter(Boolean);
                  onFieldChange(
                    field.id,
                    entries.length > 0 ? entries : undefined
                  );
                  return;
                }

                onFieldChange(field.id, value);
              };

              const sharedInputClasses = clsx(
                "rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100",
                isSuggestedValue ? "border-primary-300 bg-primary-50" : ""
              );

              const isCapsuleField = field.type === "capsule";
              const labelId = `${field.id}-label`;
              const FieldContainer = isCapsuleField ? "div" : "label";

              const containerProps = {
                key: field.id,
                className:
                  "flex flex-col gap-2 text-sm font-medium text-neutral-700",
              };

              if (isCapsuleField) {
                containerProps.role = "group";
                containerProps["aria-labelledby"] = labelId;
              }

              return (
                <FieldContainer {...containerProps}>
                  <span id={labelId}>
                    {field.label}
                    {field.required ? (
                      <span className="ml-1 text-primary-600">*</span>
                    ) : null}
                  </span>
                  {field.helper ? (
                    <span className="text-xs font-normal text-neutral-500">
                      {field.helper}
                    </span>
                  ) : null}
                  {isSuggestedValue ? (
                    <span className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                      Suggested by your copilot
                    </span>
                  ) : null}
                  {isSuggestedValue && highlightMeta?.rationale ? (
                    <span className="text-xs text-primary-400">
                      {highlightMeta.rationale}
                    </span>
                  ) : null}

                  {isCapsuleField ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-3">
                        {(field.options ?? []).map((option) => {
                          const optionValue = option.value;
                          const isActive = effectiveValue === optionValue;
                          const isHovered = hoveredValue === optionValue;
                          return (
                            <button
                              type="button"
                              key={optionValue}
                              className={capsuleClassName(
                                isActive,
                                isHovered
                              )}
                              onClick={() => {
                                setCustomCapsuleActive(field.id, false);
                                onFieldChange(field.id, optionValue, {
                                  skipRealtime: true,
                                });
                              }}
                              onMouseEnter={() =>
                                setHoveredCapsule(field.id, optionValue)
                              }
                              onMouseLeave={() =>
                                clearHoveredCapsule(field.id, optionValue)
                              }
                            >
                              {option.label}
                            </button>
                          );
                        })}
                        {field.allowCustom ? (
                          <button
                            type="button"
                            className={capsuleClassName(
                              customOptionActive,
                              hoveredValue === "__custom__"
                            )}
                            onClick={() => {
                                setCustomCapsuleActive(field.id, true);
                                if (
                                  (field.options ?? []).some(
                                    (option) => option.value === effectiveValue
                                  )
                                ) {
                                  onFieldChange(field.id, "", {
                                    skipRealtime: true,
                                  });
                                }
                              }}
                              onMouseEnter={() =>
                                setHoveredCapsule(field.id, "__custom__")
                              }
                            onMouseLeave={() =>
                              clearHoveredCapsule(field.id, "__custom__")
                            }
                          >
                            {field.customLabel ?? "Other"}
                          </button>
                        ) : null}
                      </div>
                      {field.allowCustom &&
                      (customCapsuleActive[field.id] ||
                        (effectiveValue &&
                          !(field.options ?? []).some(
                            (option) => option.value === effectiveValue
                          ))) ? (
                        <input
                          className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                          placeholder={field.placeholder ?? "Type to customise"}
                          value={effectiveValue ?? ""}
                          onChange={(event) => {
                            onFieldChange(field.id, event.target.value);
                          }}
                        />
                      ) : null}
                    </div>
                ) : field.type === "select" ? (
                  <select
                    className={clsx(sharedInputClasses, "cursor-pointer")}
                    value={inputValue}
                    onChange={handleChange}
                    disabled={false}
                    >
                      <option value="">
                        {field.placeholder ?? "Select an option"}
                      </option>
                      {(field.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea
                      className={sharedInputClasses}
                      placeholder={field.placeholder}
                      value={inputValue}
                      onChange={handleChange}
                      rows={field.rows ?? 3}
                      disabled={false}
                  />
                ) : (
                  <input
                    className={sharedInputClasses}
                    type={field.type === "number" ? "number" : "text"}
                      placeholder={field.placeholder}
                      value={
                        field.type === "number" && inputValue === ""
                          ? ""
                          : inputValue
                      }
                      onChange={handleChange}
                      maxLength={field.maxLength}
                      step={field.step}
                    disabled={false}
                    autoComplete="off"
                  />
                )}
                </FieldContainer>
              );
            })}
          </form>
        ) : null}

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <button
            type="button"
            onClick={handleBack}
            disabled={currentStepIndex === 0}
            className="self-start rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 transition hover:border-primary-500 hover:text-primary-600 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
          >
            Back
          </button>
          {showUnlockCtas ? (
            <div className="flex flex-col items-end gap-2 text-right">
              <p className="text-xs font-medium text-neutral-500">
                Required complete. Continue to improve (recommended) or publish now.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={handleAddOptional}
                  disabled={isSaving}
                  className="rounded-full bg-primary-600 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
                >
                  {isSaving
                    ? "Saving..."
                    : "Continue — Boost my result (recommended)"}
                </button>
                <button
                  type="button"
                  onClick={handleSkipOptional}
                  disabled={isSaving}
                  className="rounded-full border border-neutral-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-600 transition hover:border-primary-400 hover:text-primary-600 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
                >
                  {isSaving ? "Saving..." : "Publish now and skip"}
                </button>
              </div>
            </div>
          ) : isLastStep ? (
            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={handleGenerateHiringPack}
                disabled={
                  isGeneratingPack ||
                  (isCurrentStepRequired && !currentRequiredStepCompleteInState)
                }
                className="rounded-full bg-primary-600 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
              >
                {isGeneratingPack ? "Generating..." : "Generate my hiring pack"}
              </button>
              <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                We’ll never publish without your approval.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              disabled={
                (isCurrentStepRequired && !currentRequiredStepCompleteInState) ||
                isSaving
              }
              className="rounded-full bg-primary-600 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
            >
              {isSaving ? "Saving..." : "Save & Continue"}
            </button>
          )}
        </div>
      </div>

      <WizardSuggestionPanel
        messages={visibleAssistantMessages}
        onRefresh={() =>
          fetchSuggestionsForStep({
            stepId: currentStep?.id,
            intentOverrides: { forceRefresh: true },
          })
        }
        onSendMessage={handleSendMessage}
        onAcceptSuggestion={handleAcceptSuggestion}
        onToggleSuggestion={handleSuggestionToggle}
        isLoading={isFetchingSuggestions}
        isSending={isChatting}
        nextStepTeaser={copilotNextTeaser}
        jobState={committedState}
        isJobTabEnabled={allRequiredStepsCompleteInState}
      />
    </div>
  );
}
