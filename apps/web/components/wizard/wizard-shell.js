"use client";

import { useMemo, useState } from "react";
import { clsx } from "../../lib/cn";
import { useUser } from "../user-context";
import { WizardSuggestionPanel } from "./wizard-suggestion-panel";
import { OPTIONAL_STEPS } from "./wizard-schema";
import {
  findFieldDefinition,
  getDeep,
  isFieldValueProvided,
} from "./wizard-utils";
import { normalizeSuggestedValueForField } from "./wizard-state";
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

function summarizeSuggestionValue(value) {
  if (Array.isArray(value)) {
    const joined = value
      .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "")))
      .filter(Boolean)
      .join(", ");
    return joined.length > 60 ? `${joined.slice(0, 57)}…` : joined || "Apply suggestion";
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed || "Apply suggestion";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (value && typeof value === "object") {
    const text = Object.values(value)
      .map((entry) => (typeof entry === "string" ? entry.trim() : String(entry ?? "")))
      .filter(Boolean)
      .join(", ");
    return text.length > 60 ? `${text.slice(0, 57)}…` : text || "Apply suggestion";
  }
  return "Apply suggestion";
}

function InlineSuggestionList({ suggestions = [], onApply }) {
  // Debug logging
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[InlineSuggestionList] render", {
      count: suggestions?.length ?? 0,
      suggestions: suggestions?.map((s) => ({
        id: s?.id,
        fieldId: s?.meta?.fieldId,
        hasRationale: Boolean(s?.meta?.rationale),
      })),
    });
  }

  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 pt-2">
      {suggestions.map((message) => {
        if (!message || !message.id) {
          return null;
        }
        const canApply = Boolean(message.meta?.fieldId);
        const suggestionValue = message.meta?.value ?? message.content ?? "";
        const preview = summarizeSuggestionValue(suggestionValue);
        const rationale = message.meta?.rationale;
        return (
          <div key={message.id} className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary-500">
              Suggested by your copilot
            </span>
            {rationale ? (
              <span className="text-xs italic text-primary-400">
                {rationale}
              </span>
            ) : null}
            <button
              type="button"
              title={preview}
              disabled={!canApply}
              onClick={() => {
                if (canApply) {
                  onApply?.({
                    fieldId: message.meta?.fieldId,
                    value: suggestionValue,
                    rationale: message.meta?.rationale,
                    confidence: message.meta?.confidence,
                    source: message.meta?.source ?? "copilot",
                  });
                }
              }}
              className={clsx(
                "group flex max-w-full items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition w-fit",
                canApply
                  ? "border-primary-200 bg-primary-50/70 text-primary-700 hover:bg-primary-100"
                  : "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
              )}
            >
              <span
                className={clsx(
                  "flex h-5 w-5 items-center justify-center rounded-full text-white",
                  canApply ? "bg-primary-600" : "bg-neutral-400"
                )}
              >
                +
              </span>
              <span className="max-w-[220px] truncate text-left">{preview}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function WizardShell({ jobId = null, initialCompanyId = null, mode = "create" }) {
  const { user } = useUser();
  const controller = useWizardController({
    user,
    initialJobId: jobId,
    initialCompanyId,
    mode,
  });
  const [logoErrors, setLogoErrors] = useState({});

  const {
    importContext,
    isImportExperience,
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
    visibleAssistantMessages,
    copilotConversation,
    isChatting,
    isFetchingSuggestions,
    copilotNextTeaser,
    committedState,
    allRequiredStepsCompleteInState,
    currentRequiredStepCompleteInState,
    isCurrentStepRequired,
    isLastStep,
    isSaving,
    activeToast,
    activeToastClassName,
    isHydrated,
    jobId: activeJobId,
  } = controller;

  const optionalStepCount = OPTIONAL_STEPS.length;
  const progressPercent =
    totalProgressFields === 0
      ? 0
      : Math.round((progressCompletedCount / totalProgressFields) * 100);
  const isGeneratingPack = isSaving;
  const handleApplySuggestion = (meta, field) => {
    if (!meta) return;
    const fieldId = field?.id ?? meta.fieldId;
    if (!fieldId) return;

    const rawSuggestedValue = meta.value ?? meta.proposal ?? meta.content ?? null;
    const normalizedValue = normalizeSuggestedValueForField(
      field ?? fieldId,
      rawSuggestedValue
    );

    if (field?.type === "capsule") {
      setCustomCapsuleActive(field.id, false);
    }

    handleAcceptSuggestion({
      ...meta,
      fieldId,
      value: normalizedValue,
    });
  };
  const suggestionMap = useMemo(() => {
    const map = {};
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[WizardShell] suggestionMap:building", {
        visibleAssistantMessagesCount: visibleAssistantMessages?.length ?? 0,
        suggestionMessages: visibleAssistantMessages?.filter((m) => m.kind === "suggestion").length ?? 0,
      });
    }
    visibleAssistantMessages.forEach((message) => {
      if (message.kind !== "suggestion") {
        return;
      }
      const fieldId = message.meta?.fieldId;
      if (!fieldId) {
        return;
      }

      const fieldDefinition = findFieldDefinition(fieldId);
      if (fieldDefinition) {
        const currentValue = getDeep(state, fieldId);
        if (isFieldValueProvided(currentValue, fieldDefinition)) {
          if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.log("[WizardShell] suggestionMap:skipped-has-value", {
              fieldId,
              currentValue,
            });
          }
          return;
        }
      }

      if (!map[fieldId]) {
        map[fieldId] = [];
      }
      map[fieldId].push(message);
    });
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[WizardShell] suggestionMap:result", {
        fieldIds: Object.keys(map),
        totalSuggestions: Object.values(map).flat().length,
      });
    }
    return map;
  }, [state, visibleAssistantMessages]);

  if (!user?.authToken) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-10 text-center text-neutral-600 shadow-sm shadow-neutral-100">
        Please sign in to build a job brief. Once authenticated, your wizard
        progress will be saved to Firestore and synced across the console.
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
        {isImportExperience ? (
          <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4 text-sm text-primary-700">
            <p className="font-semibold text-primary-900">
              Imported job ready for review
            </p>
            <p className="mt-1">
              We populated this draft from{" "}
              {importContext?.externalSource || "a discovered job posting"}. Give it a quick
              polish and continue to channel recommendations.
            </p>
            {importContext?.externalUrl ? (
              <a
                href={importContext.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-xs font-semibold uppercase tracking-wide text-primary-600 underline-offset-4 hover:underline"
              >
                View original posting
              </a>
            ) : null}
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
            Changes stay local until you press “Next step.” Skip anything
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

        {isFetchingSuggestions ? (
          <div className="flex items-center gap-3 rounded-xl border border-primary-200 bg-gradient-to-r from-primary-50 to-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-1">
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="h-2.5 w-2.5 rounded-full bg-primary-500 animate-bounce"
                  style={{ animationDelay: `${index * 0.15}s` }}
                />
              ))}
            </div>
            <span className="text-sm font-medium text-primary-700">
              Generating smart suggestions for you...
            </span>
          </div>
        ) : null}

        {currentStep ? (
          <form className="grid gap-4">
            {currentStep.fields.map((field) => {
              const hiddenReason = getDeep(hiddenFields, field.id);
              if (hiddenReason) {
                return null;
              }
              const fieldSuggestions = suggestionMap[field.id] ?? [];

              const rawValue = getDeep(state, field.id);
              const highlightMeta = getDeep(autofilledFields, field.id);
              const hasSuggestionMeta = Boolean(highlightMeta);
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
              if (field.id === "location") {
                // eslint-disable-next-line no-console
                console.log("[WizardShell] location-field", {
                  rawValue,
                  inputValue,
                  committedValue: getDeep(committedState, field.id),
                  hidden: Boolean(hiddenReason),
                });
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
                className:
                  "flex flex-col gap-2 text-sm font-medium text-neutral-700",
              };

              if (isCapsuleField) {
                containerProps.role = "group";
                containerProps["aria-labelledby"] = labelId;
              }

              if (field.type === "logo") {
                const errorMessage = logoErrors[field.id];

                const handleLogoUrlChange = (event) => {
                  const nextValue = event.target.value.trim();
                  setLogoErrors((prev) => ({ ...prev, [field.id]: undefined }));
                  onFieldChange(
                    field.id,
                    nextValue.length > 0 ? nextValue : undefined
                  );
                };

                const handleFileInput = (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;

                  if (!file.type?.startsWith("image/")) {
                    setLogoErrors((prev) => ({
                      ...prev,
                      [field.id]:
                        "Please upload an image file (PNG, JPG, SVG, or WebP).",
                    }));
                    return;
                  }

                  const maxBytes = 1024 * 1024; // 1MB
                  if (file.size > maxBytes) {
                    setLogoErrors((prev) => ({
                      ...prev,
                      [field.id]: "Logo file is too large. Keep it under 1MB.",
                    }));
                    return;
                  }

                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === "string") {
                      setLogoErrors((prev) => ({ ...prev, [field.id]: undefined }));
                      onFieldChange(field.id, reader.result);
                    } else {
                      setLogoErrors((prev) => ({
                        ...prev,
                        [field.id]: "Couldn't process that image. Please try another file."
                      }));
                    }
                  };
                  reader.onerror = () => {
                    setLogoErrors((prev) => ({
                      ...prev,
                      [field.id]: "Failed to read the file. Please try again.",
                    }));
                  };
                  reader.readAsDataURL(file);
                  event.target.value = "";
                };

                const handleClearLogo = () => {
                  onFieldChange(field.id, undefined);
                  setLogoErrors((prev) => ({ ...prev, [field.id]: undefined }));
                };

                return (
                  <div
                    key={field.id}
                    className="flex flex-col gap-2 text-sm font-medium text-neutral-700"
                  >
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
                    <input
                      className={sharedInputClasses}
                      type="url"
                      placeholder={
                        field.placeholder ?? "https://company.com/logo.png"
                      }
                      value={
                        typeof inputValue === "string" &&
                        inputValue.startsWith("data:")
                          ? ""
                          : inputValue ?? ""
                      }
                      onChange={handleLogoUrlChange}
                      autoComplete="off"
                    />
                    <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                      <label className="flex items-center gap-2">
                        <span className="rounded-full border border-neutral-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
                          Upload
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          onChange={handleFileInput}
                          className="hidden"
                        />
                      </label>
                      <span>PNG, JPG, SVG, or WebP up to 1MB.</span>
                    </div>
                    {errorMessage ? (
                      <p className="text-xs font-medium text-red-600">
                        {errorMessage}
                      </p>
                    ) : null}
                    {inputValue ? (
                      <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                        <div className="h-12 w-12 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                          <img
                            src={inputValue}
                            alt="Job logo preview"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex flex-1 items-center justify-between gap-3 text-xs text-neutral-600">
                          <span className="truncate">
                            {String(inputValue).slice(0, 60)}
                            {String(inputValue).length > 60 ? "…" : ""}
                          </span>
                          <button
                            type="button"
                            onClick={handleClearLogo}
                            className="rounded-full border border-neutral-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 transition hover:border-red-300 hover:text-red-500"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              }

              return (
                <FieldContainer key={field.id} {...containerProps}>
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
                  {hasSuggestionMeta ? (
                    <span className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                      Suggested by your copilot
                    </span>
                  ) : null}
                  {hasSuggestionMeta && highlightMeta?.rationale ? (
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
                  <InlineSuggestionList
                    suggestions={fieldSuggestions}
                    onApply={(meta) => handleApplySuggestion(meta, field)}
                  />
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
                  onClick={handleSkipOptional}
                  disabled={isSaving}
                  className="rounded-full border border-neutral-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-600 transition hover:border-primary-400 hover:text-primary-600 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
                >
                  {isSaving ? "Saving..." : "✨ Create my hiring kit now (Not recommended)"}
                </button>
                <button
                  type="button"
                  onClick={handleAddOptional}
                  disabled={isSaving}
                  className="rounded-full bg-primary-600 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
                >
                  {isSaving
                    ? "Saving..."
                    : "Continue add more details (recommended)"}
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
                {isGeneratingPack ? "Generating..." : "✨ Create my hiring kit"}
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
              {isSaving ? "Saving..." : "Next step"}
            </button>
          )}
        </div>
      </div>

      <WizardSuggestionPanel
        jobId={activeJobId}
        copilotConversation={copilotConversation}
        onSendMessage={handleSendMessage}
        isSending={isChatting}
        nextStepTeaser={copilotNextTeaser}
        jobState={committedState}
        isJobTabEnabled
        stage="wizard"
      />
    </div>
  );
}
