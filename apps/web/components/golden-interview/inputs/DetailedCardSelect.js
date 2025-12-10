"use client";

import { useState, useEffect } from "react";
import DynamicIcon from "./DynamicIcon";

export default function DetailedCardSelect({
  options,
  value,
  onChange,
  multiple = false,
  layout = "list",
  title,
  selectedColor = "#8b5cf6",
}) {
  // Internal state to ensure selection works even if parent state has issues
  const [internalValue, setInternalValue] = useState(value);

  // Sync internal state with external value prop
  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  // Use internal value for display, falling back to prop value
  const currentValue = internalValue !== undefined ? internalValue : value;

  const selectedIds = multiple
    ? Array.isArray(currentValue)
      ? currentValue
      : []
    : currentValue
      ? [currentValue]
      : [];

  const handleSelect = (optionId) => {
    let newValue;

    if (multiple) {
      const isSelected = selectedIds.includes(optionId);
      newValue = isSelected
        ? selectedIds.filter((id) => id !== optionId)
        : [...selectedIds, optionId];
    } else {
      newValue = optionId === currentValue ? null : optionId;
    }

    // Update internal state immediately for responsive UI
    setInternalValue(newValue);

    // Notify parent
    if (onChange) {
      onChange(newValue);
    }
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
      </div>

      {/* Selection count for multi-select */}
      {multiple && selectedIds.length > 0 && (
        <div className="text-center text-white/50 text-sm">
          {selectedIds.length} selected
        </div>
      )}
    </div>
  );
}
