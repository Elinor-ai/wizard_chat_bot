"use client";

import { useState, useRef, useEffect } from "react";
import DynamicIcon from "./DynamicIcon";

/**
 * Helper to detect if a string is likely an emoji or direct text character
 * (Checks if it contains non-ASCII characters)
 */
const isLikelyEmoji = (str) => {
  if (!str) return false;
  // Matches typical emoji ranges and non-standard text
  return /[^\u0000-\u007F]+/.test(str);
};

/**
 * IconGridSelect - Grid of square cards with icons, supports single/multi-select
 * Now supports custom text input when allowCustomInput is true
 */
export default function IconGridSelect({
  options = [],
  value,
  onChange,
  multiple = false,
  columns = 3,
  title,
  maxSelections,
  selectedColor = "#8b5cf6",
  allowCustomInput = false,
  customInputPlaceholder = "Type your answer...",
}) {
  // State for custom input mode
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customInputValue, setCustomInputValue] = useState("");
  const customInputRef = useRef(null);

  // Parse selected values - can include both option IDs and custom strings
  const selectedValues = multiple
    ? Array.isArray(value)
      ? value
      : []
    : value
      ? [value]
      : [];

  // Focus input when entering custom mode
  useEffect(() => {
    if (isAddingCustom && customInputRef.current) {
      customInputRef.current.focus();
    }
  }, [isAddingCustom]);

  // Handle selecting an option (ID or custom value)
  const handleSelect = (optionIdOrValue) => {
    if (multiple) {
      const isSelected = selectedValues.includes(optionIdOrValue);
      let newSelection;

      if (isSelected) {
        newSelection = selectedValues.filter((v) => v !== optionIdOrValue);
      } else {
        if (maxSelections && selectedValues.length >= maxSelections) {
          // Replace oldest selection
          newSelection = [...selectedValues.slice(1), optionIdOrValue];
        } else {
          newSelection = [...selectedValues, optionIdOrValue];
        }
      }
      onChange(newSelection);
    } else {
      // Single select - toggle or set new value
      onChange(optionIdOrValue === value ? null : optionIdOrValue);
    }
  };

  // Handle submitting custom input
  const handleCustomInputSubmit = () => {
    const trimmedValue = customInputValue.trim();
    if (!trimmedValue) {
      setIsAddingCustom(false);
      return;
    }

    // Add the custom text value (not an ID)
    handleSelect(trimmedValue);
    setCustomInputValue("");
    setIsAddingCustom(false);
  };

  // Handle custom input keydown
  const handleCustomInputKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCustomInputSubmit();
    } else if (e.key === "Escape") {
      setCustomInputValue("");
      setIsAddingCustom(false);
    }
  };

  const gridCols = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
  };

  return (
    <div className="w-full space-y-4">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          {multiple && maxSelections && (
            <span className="text-slate-400 text-sm">
              {selectedValues.length} / {maxSelections}
            </span>
          )}
        </div>
      )}

      <div className={`grid ${gridCols[columns] || "grid-cols-3"} gap-3`}>
        {options.map((option) => {
          const isSelected = selectedValues.includes(option.id);
          const isEmoji = isLikelyEmoji(option.icon);

          return (
            <button
              key={option.id}
              onClick={() => handleSelect(option.id)}
              className={`relative aspect-square p-4 rounded-xl border transition-all duration-200 flex flex-col items-center justify-center gap-2 group ${
                isSelected
                  ? "border-transparent shadow-lg bg-white"
                  : "bg-white border-slate-200 hover:border-primary-300 hover:bg-slate-50"
              }`}
              style={{
                borderColor: isSelected ? selectedColor : undefined,
                boxShadow: isSelected
                  ? `0 4px 12px ${selectedColor}25`
                  : undefined,
              }}
            >
              {/* Icon Container */}
              <div
                className={`transition-transform duration-200 ${
                  isSelected ? "scale-110" : "group-hover:scale-105"
                }`}
              >
                {isEmoji ? (
                  // RENDER EMOJI DIRECTLY
                  <span
                    className="text-3xl"
                    role="img"
                    aria-label={option.label}
                  >
                    {option.icon}
                  </span>
                ) : (
                  // RENDER LUCIDE ICON
                  <DynamicIcon
                    name={option.icon}
                    size={32}
                    className={`transition-colors ${
                      isSelected ? "text-primary-600" : "text-slate-400"
                    }`}
                    style={{
                      color: isSelected ? selectedColor : undefined,
                    }}
                  />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-xs font-medium text-center leading-tight transition-colors ${
                  isSelected ? "text-slate-900" : "text-slate-500"
                }`}
              >
                {option.label}
              </span>

              {/* Checkmark for multi-select */}
              {multiple && isSelected && (
                <div
                  className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-white"
                  style={{ backgroundColor: selectedColor }}
                >
                  <svg
                    className="w-3 h-3"
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
              )}

              {/* Description tooltip on hover */}
              {option.description && (
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 translate-y-full opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                  <div className="px-3 py-2 rounded-lg bg-gray-900 text-white text-xs whitespace-nowrap shadow-xl border border-white/10">
                    {option.description}
                  </div>
                </div>
              )}
            </button>
          );
        })}

        {/* "Add Other" Card - shown when allowCustomInput is true */}
        {allowCustomInput && (
          <div
            className={`relative aspect-square p-4 rounded-xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
              isAddingCustom
                ? "border-primary-400 bg-primary-50"
                : "border-slate-300 bg-white hover:border-primary-300 hover:bg-slate-50 cursor-pointer"
            }`}
            onClick={() => !isAddingCustom && setIsAddingCustom(true)}
          >
            {isAddingCustom ? (
              // Custom input mode
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-1">
                <input
                  ref={customInputRef}
                  type="text"
                  value={customInputValue}
                  onChange={(e) => setCustomInputValue(e.target.value)}
                  onKeyDown={handleCustomInputKeyDown}
                  onBlur={handleCustomInputSubmit}
                  placeholder={customInputPlaceholder}
                  className="w-full px-2 py-1.5 text-xs text-center border border-slate-200 rounded-lg focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  autoFocus
                />
                <span className="text-[10px] text-slate-400">
                  Press Enter to add
                </span>
              </div>
            ) : (
              // Add button mode
              <>
                <div className="transition-transform duration-200 group-hover:scale-105">
                  <svg
                    className="w-8 h-8 text-slate-400"
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
                <span className="text-xs font-medium text-center leading-tight text-slate-500">
                  Add Other
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Selected summary for multi-select */}
      {multiple && selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {selectedValues.map((val) => {
            const option = options.find((o) => o.id === val);
            const isCustom = !option;
            const isEmoji = !isCustom && isLikelyEmoji(option?.icon);

            return (
              <span
                key={val}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs text-slate-700 border border-slate-200"
                style={{
                  backgroundColor: `${selectedColor}10`,
                  borderColor: `${selectedColor}30`,
                }}
              >
                {isCustom ? (
                  // Custom value - show edit icon
                  <svg
                    className="w-3.5 h-3.5 text-slate-500"
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
                ) : isEmoji ? (
                  <span>{option?.icon}</span>
                ) : (
                  <DynamicIcon
                    name={option?.icon}
                    size={14}
                    className="text-slate-500"
                  />
                )}
                <span>{isCustom ? val : option?.label}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(val);
                  }}
                  className="ml-1 hover:text-red-500 transition-colors"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
