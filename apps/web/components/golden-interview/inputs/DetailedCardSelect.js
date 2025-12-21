"use client";

import { useState, useEffect, useRef } from "react";
import DynamicIcon from "./DynamicIcon";

/**
 * DetailedCardSelect - Cards with icon, title, and description
 * Now supports custom card creation when allowCustomInput is true
 */
export default function DetailedCardSelect({
  options = [],
  value,
  onChange,
  multiple = false,
  layout = "list",
  title,
  selectedColor = "#8b5cf6",
  allowCustomInput = false,
  customTitlePlaceholder = "Enter title...",
  customDescriptionPlaceholder = "Enter description (optional)...",
}) {
  // Internal state to ensure selection works even if parent state has issues
  const [internalValue, setInternalValue] = useState(value);

  // Custom input form state
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const titleInputRef = useRef(null);

  // Sync internal state with external value prop
  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  // Focus title input when entering custom mode
  useEffect(() => {
    if (isAddingCustom && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isAddingCustom]);

  // Use internal value for display, falling back to prop value
  const currentValue = internalValue !== undefined ? internalValue : value;

  // Parse selected values - can be option IDs or custom objects
  const selectedValues = multiple
    ? Array.isArray(currentValue)
      ? currentValue
      : []
    : currentValue
      ? [currentValue]
      : [];

  // Extract selected IDs for comparison (handles both string IDs and custom objects)
  const getValueId = (val) => (typeof val === "object" && val?.id ? val.id : val);
  const selectedIds = selectedValues.map(getValueId);

  // Handle selecting an option (ID or custom value object)
  const handleSelect = (optionIdOrValue) => {
    const valueId = getValueId(optionIdOrValue);
    let newValue;

    if (multiple) {
      const isSelected = selectedIds.includes(valueId);
      if (isSelected) {
        // Remove by filtering out matching ID
        newValue = selectedValues.filter((v) => getValueId(v) !== valueId);
      } else {
        // Add the value (could be ID string or custom object)
        newValue = [...selectedValues, optionIdOrValue];
      }
    } else {
      // Single select - toggle or set new value
      const currentId = getValueId(currentValue);
      newValue = valueId === currentId ? null : optionIdOrValue;
    }

    // Update internal state immediately for responsive UI
    setInternalValue(newValue);

    // Notify parent
    if (onChange) {
      onChange(newValue);
    }
  };

  // Handle submitting custom card
  const handleCustomSubmit = () => {
    const trimmedTitle = customTitle.trim();
    if (!trimmedTitle) {
      setIsAddingCustom(false);
      return;
    }

    // Create custom value object with unique ID
    const customValue = {
      id: `custom-${Date.now()}`,
      title: trimmedTitle,
      description: customDescription.trim() || undefined,
      isCustom: true,
    };

    handleSelect(customValue);
    setCustomTitle("");
    setCustomDescription("");
    setIsAddingCustom(false);
  };

  // Handle keyboard events in custom form
  const handleCustomKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleCustomSubmit();
    } else if (e.key === "Escape") {
      setCustomTitle("");
      setCustomDescription("");
      setIsAddingCustom(false);
    }
  };

  // Cancel custom input
  const handleCustomCancel = () => {
    setCustomTitle("");
    setCustomDescription("");
    setIsAddingCustom(false);
  };

  const containerClass =
    layout === "grid" ? "grid grid-cols-2 gap-3" : "flex flex-col gap-3";

  return (
    <div className="w-full space-y-4">
      {title && <h3 className="text-lg font-semibold text-black">{title}</h3>}

      <div className={containerClass}>
        {options.map((option) => {
          const isSelected = selectedIds.includes(option.id);

          return (
            <button
              type="button"
              key={option.id}
              onClick={() => handleSelect(option.id)}
              className={`relative p-4 rounded-xl border transition-all duration-200 text-left group ${
                isSelected
                  ? "border-transparent"
                  : "bg-green/5 border-green/10 hover:bg-green/10 hover:border-green/20"
              }`}
              style={{
                backgroundColor: isSelected ? `${selectedColor}15` : undefined,
                borderColor: isSelected ? selectedColor : undefined,
                boxShadow: isSelected
                  ? `0 4px 20px ${selectedColor}25`
                  : undefined,
              }}
            >
              {/* Selection indicator line */}
              {isSelected && (
                <div
                  className="absolute left-0 top-4 bottom-4 w-1 rounded-full"
                  style={{ backgroundColor: selectedColor }}
                />
              )}

              <div className="flex items-start gap-4">
                {/* Icon container */}
                <div
                  className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                    isSelected ? "scale-105" : "bg-black/5 group-hover:bg-white/10"
                  }`}
                  style={{
                    backgroundColor: isSelected
                      ? `${selectedColor}25`
                      : undefined,
                  }}
                >
                  <DynamicIcon
                    name={option.icon}
                    size={24}
                    className={`transition-colors ${
                      isSelected ? "text-black" : "text-black/70"
                    }`}
                    style={{
                      color: isSelected ? selectedColor : undefined,
                    }}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4
                      className={`font-semibold transition-colors ${
                        isSelected ? "text-black" : "text-black/90"
                      }`}
                    >
                      {option.title}
                    </h4>
                    {option.badge && (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{
                          backgroundColor: `${selectedColor}30`,
                          color: selectedColor,
                        }}
                      >
                        {option.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-black/50 text-sm mt-1 line-clamp-2">
                    {option.description}
                  </p>
                </div>

                {/* Selection indicator */}
                <div
                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    isSelected ? "border-transparent" : "border-white/20"
                  }`}
                  style={{
                    backgroundColor: isSelected ? selectedColor : "transparent",
                  }}
                >
                  {isSelected && (
                    <svg
                      className="w-3.5 h-3.5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        {/* Render selected custom values as cards */}
        {selectedValues
          .filter((v) => typeof v === "object" && v?.isCustom)
          .map((customVal) => (
            <button
              type="button"
              key={customVal.id}
              onClick={() => handleSelect(customVal)}
              className="relative p-4 rounded-xl border-2 border-dashed transition-all duration-200 text-left group"
              style={{
                backgroundColor: `${selectedColor}15`,
                borderColor: selectedColor,
                boxShadow: `0 4px 20px ${selectedColor}25`,
              }}
            >
              {/* Selection indicator line */}
              <div
                className="absolute left-0 top-4 bottom-4 w-1 rounded-full"
                style={{ backgroundColor: selectedColor }}
              />

              <div className="flex items-start gap-4">
                {/* Custom icon container */}
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center scale-105"
                  style={{ backgroundColor: `${selectedColor}25` }}
                >
                  <svg
                    className="w-6 h-6"
                    style={{ color: selectedColor }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-black">{customVal.title}</h4>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{
                        backgroundColor: `${selectedColor}30`,
                        color: selectedColor,
                      }}
                    >
                      Custom
                    </span>
                  </div>
                  {customVal.description && (
                    <p className="text-black/50 text-sm mt-1 line-clamp-2">
                      {customVal.description}
                    </p>
                  )}
                </div>

                {/* Selection indicator (checked) */}
                <div
                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: selectedColor }}
                >
                  <svg
                    className="w-3.5 h-3.5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
            </button>
          ))}

        {/* "Add New" Card - shown when allowCustomInput is true */}
        {allowCustomInput && (
          <div
            className={`relative p-4 rounded-xl border-2 border-dashed transition-all duration-200 ${
              isAddingCustom
                ? "border-primary-400 bg-primary-50"
                : "border-slate-300 bg-white hover:border-primary-300 hover:bg-slate-50 cursor-pointer"
            }`}
            onClick={() => !isAddingCustom && setIsAddingCustom(true)}
          >
            {isAddingCustom ? (
              // Custom input form
              <div className="space-y-3">
                <div className="flex items-start gap-4">
                  {/* Icon placeholder */}
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </div>

                  {/* Form fields */}
                  <div className="flex-1 space-y-2">
                    <input
                      ref={titleInputRef}
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      onKeyDown={handleCustomKeyDown}
                      placeholder={customTitlePlaceholder}
                      className="w-full px-3 py-2 text-sm font-semibold border border-slate-200 rounded-lg focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                      autoFocus
                    />
                    <textarea
                      value={customDescription}
                      onChange={(e) => setCustomDescription(e.target.value)}
                      onKeyDown={handleCustomKeyDown}
                      placeholder={customDescriptionPlaceholder}
                      rows={2}
                      className="w-full px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg resize-none focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    />
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCustomCancel}
                    className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCustomSubmit}
                    disabled={!customTitle.trim()}
                    className="px-4 py-1.5 text-xs font-medium text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: selectedColor }}
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : (
              // Add button mode
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-slate-200 transition-colors">
                  <svg
                    className="w-6 h-6 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-500">Add New Option</h4>
                  <p className="text-slate-400 text-sm mt-0.5">
                    Click to create your own
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selection count for multi-select */}
      {multiple && selectedValues.length > 0 && (
        <div className="text-center text-slate-500 text-sm">
          {selectedValues.length} selected
        </div>
      )}
    </div>
  );
}
