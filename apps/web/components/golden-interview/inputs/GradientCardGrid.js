"use client";

import { useState, useRef, useEffect } from "react";
import DynamicIcon from "./DynamicIcon";

/**
 * GradientCardGrid - Vibrant cards with dynamic icons and rich animations
 * Now supports custom text input when allowCustomInput is true
 */
export default function GradientCardGrid({
  options = [],
  value,
  onChange,
  multiple = false,
  columns = 2,
  title,
  allowCustomInput = false,
  customInputPlaceholder = "Describe your vibe...",
}) {
  // State for custom input
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customInputValue, setCustomInputValue] = useState("");
  const customInputRef = useRef(null);

  const safeOptions = Array.isArray(options) ? options : [];

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

  // Check if a value is a custom value (not in options list)
  const isCustomValue = (val) => !safeOptions.some((option) => option.id === val);

  // Get custom values from the selection
  const customValues = selectedValues.filter(isCustomValue);

  const handleSelect = (optionIdOrValue) => {
    if (multiple) {
      const isSelected = selectedValues.includes(optionIdOrValue);
      const newSelection = isSelected
        ? selectedValues.filter((v) => v !== optionIdOrValue)
        : [...selectedValues, optionIdOrValue];
      onChange(newSelection);
    } else {
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

    // Don't add duplicates
    if (!selectedValues.includes(trimmedValue)) {
      handleSelect(trimmedValue);
    }
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
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  const defaultGradients = [
    "from-blue-500 via-indigo-500 to-purple-600",
    "from-rose-400 via-fuchsia-500 to-indigo-500",
    "from-emerald-400 via-teal-500 to-cyan-600",
    "from-orange-400 via-amber-500 to-yellow-500",
    "from-pink-500 via-rose-500 to-red-500",
    "from-cyan-400 via-sky-500 to-blue-600",
  ];

  if (safeOptions.length === 0) return null;

  return (
    <div className="w-full space-y-6 font-sans">
      {title && (
        <h3 className="text-xl font-bold text-gray-800 dark:text-white text-center mb-2">
          {title}
        </h3>
      )}

      <div
        className={`grid ${gridCols[columns] || "grid-cols-1 sm:grid-cols-2"} gap-4`}
      >
        {safeOptions.map((option, index) => {
          if (!option || !option.id) return null;

          const isSelected = selectedValues.includes(option.id);
          const gradientClass =
            option.gradient ||
            defaultGradients[index % defaultGradients.length];

          return (
            <button
              key={`${option.id}-${index}`}
              onClick={() => handleSelect(option.id)}
              aria-label={`${option.label}${option.description ? `: ${option.description}` : ''}`}
              aria-pressed={isSelected}
              className={`
                relative group overflow-hidden rounded-2xl text-left transition-all duration-300
                min-h-[160px] flex flex-col justify-center items-center p-1
                ${
                  isSelected
                    ? "transform scale-[1.02] ring-4 ring-offset-2 ring-indigo-500 shadow-2xl z-10"
                    : "hover:scale-[1.03] hover:shadow-xl shadow-md"
                }
              `}
            >
              {/* Layer 1: Animated Vibrant Gradient Background */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${gradientClass} transition-all duration-500 ${
                  isSelected
                    ? "opacity-100"
                    : "opacity-90 group-hover:opacity-100"
                }`}
              />

              {/* Layer 2: Noise Texture Overlay (Optional depth) */}
              <div className="absolute inset-0 opacity-10 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

              {/* Layer 3: Shine Effect on Hover */}
              <div
                className={`absolute inset-0 bg-gradient-to-tr from-white/0 via-white/20 to-white/0
                translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none`}
              />

              {/* Layer 4: Content Container */}
              <div className="relative w-full h-full bg-black/10 backdrop-blur-[2px] rounded-xl p-6 flex flex-col items-center text-center transition-colors group-hover:bg-black/0">
                {/* Icon Circle */}
                <div
                  className={`
                  mb-4 p-3 rounded-full backdrop-blur-md shadow-lg transition-all duration-300
                  ${isSelected ? "bg-white text-indigo-600 scale-110" : "bg-white/20 text-white group-hover:bg-white/30 group-hover:scale-110"}
                `}
                >
                  <DynamicIcon name={option.icon} className="w-8 h-8" />
                </div>

                {/* Label */}
                <span className="text-white font-bold text-xl leading-tight drop-shadow-md tracking-wide">
                  {option.label}
                </span>

                {/* Description */}
                {option.description && (
                  <span className="text-white/90 text-sm mt-2 font-medium leading-relaxed max-w-[90%]">
                    {option.description}
                  </span>
                )}

                {/* Selected Checkmark Indicator */}
                {isSelected && (
                  <div className="absolute top-3 right-3 bg-white text-indigo-600 rounded-full p-1 shadow-lg animate-in fade-in zoom-in duration-200">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          );
        })}

        {/* Custom value cards */}
        {customValues.map((customVal, index) => (
          <button
            key={`custom-${customVal}-${index}`}
            onClick={() => handleSelect(customVal)}
            aria-label={`Custom answer: ${customVal}`}
            aria-pressed={true}
            className="relative group overflow-hidden rounded-2xl text-left transition-all duration-300 min-h-[160px] flex flex-col justify-center items-center p-1 transform scale-[1.02] ring-4 ring-offset-2 ring-indigo-500 shadow-2xl z-10"
          >
            {/* Custom gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800 opacity-100" />

            {/* Noise Texture */}
            <div className="absolute inset-0 opacity-10 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

            {/* Content Container */}
            <div className="relative w-full h-full bg-black/10 backdrop-blur-[2px] rounded-xl p-6 flex flex-col items-center text-center">
              {/* Pencil Icon Circle */}
              <div className="mb-4 p-3 rounded-full backdrop-blur-md shadow-lg bg-white text-slate-600 scale-110">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>

              {/* Custom Value Label */}
              <span className="text-white font-bold text-xl leading-tight drop-shadow-md tracking-wide">
                {customVal}
              </span>

              {/* Custom indicator */}
              <span className="text-white/70 text-sm mt-2 font-medium">
                Custom answer
              </span>

              {/* Selected Checkmark */}
              <div className="absolute top-3 right-3 bg-white text-indigo-600 rounded-full p-1 shadow-lg">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          </button>
        ))}

        {/* "Add Other" Card - shown when allowCustomInput is true */}
        {allowCustomInput && (
          <div
            role={isAddingCustom ? "group" : "button"}
            aria-label={isAddingCustom ? "Custom input field" : "Add custom answer"}
            tabIndex={isAddingCustom ? undefined : 0}
            onClick={() => !isAddingCustom && setIsAddingCustom(true)}
            onKeyDown={(e) => !isAddingCustom && e.key === 'Enter' && setIsAddingCustom(true)}
            className={`
              relative group overflow-hidden rounded-2xl text-left transition-all duration-300
              min-h-[160px] flex flex-col justify-center items-center p-1
              border-2 border-dashed
              ${
                isAddingCustom
                  ? "border-indigo-400 bg-indigo-50/10"
                  : "border-slate-400/50 hover:border-indigo-400 hover:bg-white/5 cursor-pointer"
              }
            `}
          >
            {/* Content Container */}
            <div className="relative w-full h-full rounded-xl p-6 flex flex-col items-center justify-center text-center">
              {isAddingCustom ? (
                // Custom input mode
                <div className="w-full flex flex-col items-center gap-4">
                  <input
                    ref={customInputRef}
                    type="text"
                    value={customInputValue}
                    onChange={(e) => setCustomInputValue(e.target.value)}
                    onKeyDown={handleCustomInputKeyDown}
                    onBlur={handleCustomInputSubmit}
                    placeholder={customInputPlaceholder}
                    aria-label="Enter custom answer"
                    className="w-full px-4 py-3 text-center text-lg bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCustomInputSubmit();
                      }}
                      aria-label="Submit custom answer"
                      className="px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-colors"
                    >
                      Add
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCustomInputValue("");
                        setIsAddingCustom(false);
                      }}
                      aria-label="Cancel custom input"
                      className="px-4 py-2 rounded-lg bg-white/10 text-white/70 text-sm font-medium hover:bg-white/20 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // Button mode
                <>
                  <div className="mb-4 p-3 rounded-full border-2 border-dashed border-slate-400/50 group-hover:border-indigo-400 transition-colors" aria-hidden="true">
                    <svg className="w-8 h-8 text-slate-400 group-hover:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <span className="text-slate-400 group-hover:text-indigo-400 font-bold text-xl leading-tight transition-colors" aria-hidden="true">
                    Add Other
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
