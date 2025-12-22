"use client";

import { useState, useRef, useEffect } from "react";

/**
 * ToggleList - Simple vertical list of toggle buttons with checkmarks
 * Now supports custom text input when allowCustomInput is true
 * @param {Object} props
 * @param {Array<{id: string, label: string, icon?: React.ReactNode, description?: string}>} props.items
 * @param {Array<string>} props.value - Array of selected item ids (or custom text values)
 * @param {function} props.onChange - Callback with updated selection array
 * @param {string} [props.title] - Title text
 * @param {string} [props.activeColor="#ef4444"] - Color for active/selected items
 * @param {boolean} [props.singleSelect=false] - Only allow one selection
 * @param {string} [props.variant="default"] - "default" | "danger" | "success"
 * @param {boolean} [props.allowCustomInput=false] - Show "Add Other" toggle for custom input
 * @param {string} [props.customInputPlaceholder="Type your answer..."] - Placeholder for custom input
 */
export default function ToggleList({
  items,
  value = [],
  onChange,
  title,
  activeColor,
  singleSelect = false,
  variant = "default",
  allowCustomInput = false,
  customInputPlaceholder = "Type your answer...",
}) {
  // State for custom input
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customInputValue, setCustomInputValue] = useState("");
  const customInputRef = useRef(null);

  const variantColors = {
    default: "#8b5cf6",
    danger: "#ef4444",
    success: "#22c55e"
  };

  const color = activeColor || variantColors[variant];

  // Focus input when entering custom mode
  useEffect(() => {
    if (isAddingCustom && customInputRef.current) {
      customInputRef.current.focus();
    }
  }, [isAddingCustom]);

  // Check if a value is a custom value (not in items list)
  const isCustomValue = (val) => !items.some((item) => item.id === val);

  // Get custom values from the selection
  const customValues = value.filter(isCustomValue);

  const handleToggle = (itemIdOrValue) => {
    if (singleSelect) {
      onChange(value.includes(itemIdOrValue) ? [] : [itemIdOrValue]);
    } else {
      const isSelected = value.includes(itemIdOrValue);
      const newValue = isSelected
        ? value.filter((v) => v !== itemIdOrValue)
        : [...value, itemIdOrValue];
      onChange(newValue);
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
    if (!value.includes(trimmedValue)) {
      handleToggle(trimmedValue);
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

  return (
    <div className="w-full space-y-4">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {!singleSelect && value.length > 0 && (
            <span
              className="text-sm font-medium px-2 py-1 rounded-full"
              style={{ backgroundColor: `${color}20`, color }}
            >
              {value.length} selected
            </span>
          )}
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => {
          const isSelected = value.includes(item.id);

          return (
            <button
              key={item.id}
              onClick={() => handleToggle(item.id)}
              aria-label={`${item.label}${item.description ? `: ${item.description}` : ''}`}
              aria-pressed={isSelected}
              className={`w-full p-4 rounded-xl border transition-all duration-200 flex items-center gap-3 text-left group ${
                isSelected
                  ? "border-transparent"
                  : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
              }`}
              style={{
                backgroundColor: isSelected ? `${color}15` : undefined,
                borderColor: isSelected ? color : undefined,
                boxShadow: isSelected ? `0 0 20px ${color}20` : undefined
              }}
            >
              {/* Toggle indicator */}
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ${
                  isSelected ? "" : "border-2 border-white/20"
                }`}
                style={{
                  backgroundColor: isSelected ? color : "transparent"
                }}
              >
                {isSelected && (
                  <svg
                    className="w-4 h-4 text-white"
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

              {/* Icon */}
              {item.icon && (
                <span
                  className={`text-xl transition-transform flex-shrink-0 ${
                    isSelected ? "scale-110" : "group-hover:scale-105"
                  }`}
                >
                  {item.icon}
                </span>
              )}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <span
                  className={`font-medium transition-colors ${
                    isSelected ? "text-white" : "text-white/80"
                  }`}
                >
                  {item.label}
                </span>
                {item.description && (
                  <p className="text-white/40 text-sm mt-0.5 truncate">
                    {item.description}
                  </p>
                )}
              </div>

              {/* Hover indicator */}
              {!isSelected && (
                <div className="w-6 h-6 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors flex-shrink-0" />
              )}
            </button>
          );
        })}

        {/* Custom values - displayed as toggle items */}
        {customValues.map((customVal) => (
          <button
            key={`custom-${customVal}`}
            onClick={() => handleToggle(customVal)}
            aria-label={`Custom answer: ${customVal}`}
            aria-pressed={true}
            className="w-full p-4 rounded-xl border transition-all duration-200 flex items-center gap-3 text-left group border-transparent"
            style={{
              backgroundColor: `${color}15`,
              borderColor: color,
              boxShadow: `0 0 20px ${color}20`
            }}
          >
            {/* Toggle indicator - checked */}
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
              style={{ backgroundColor: color }}
            >
              <svg
                className="w-4 h-4 text-white"
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

            {/* Pencil icon to indicate custom value */}
            <span className="text-xl flex-shrink-0">
              <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </span>

            {/* Custom value text */}
            <div className="flex-1 min-w-0">
              <span className="font-medium text-white">{customVal}</span>
              <p className="text-white/40 text-sm mt-0.5">Custom answer</p>
            </div>
          </button>
        ))}

        {/* "Add Other" toggle - shown when allowCustomInput is true */}
        {allowCustomInput && (
          <div
            role={isAddingCustom ? "group" : "button"}
            aria-label={isAddingCustom ? "Custom input field" : "Add custom answer"}
            tabIndex={isAddingCustom ? undefined : 0}
            className={`w-full p-4 rounded-xl border-2 border-dashed transition-all duration-200 flex items-center gap-3 ${
              isAddingCustom
                ? "border-white/40 bg-white/10"
                : "border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/30 cursor-pointer"
            }`}
            onClick={() => !isAddingCustom && setIsAddingCustom(true)}
            onKeyDown={(e) => !isAddingCustom && e.key === 'Enter' && setIsAddingCustom(true)}
          >
            {isAddingCustom ? (
              // Custom input mode
              <>
                <div className="w-6 h-6 rounded-lg border-2 border-white/30 flex-shrink-0" aria-hidden="true" />
                <input
                  ref={customInputRef}
                  type="text"
                  value={customInputValue}
                  onChange={(e) => setCustomInputValue(e.target.value)}
                  onKeyDown={handleCustomInputKeyDown}
                  onBlur={handleCustomInputSubmit}
                  placeholder={customInputPlaceholder}
                  aria-label="Enter custom answer"
                  className="flex-1 bg-transparent text-white placeholder-white/40 focus:outline-none"
                  autoFocus
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCustomInputSubmit();
                  }}
                  aria-label="Submit custom answer"
                  className="px-3 py-1 rounded-lg bg-white/20 text-white text-sm hover:bg-white/30 transition-colors flex-shrink-0"
                >
                  Add
                </button>
              </>
            ) : (
              // Button mode
              <>
                <div className="w-6 h-6 rounded-lg border-2 border-dashed border-white/30 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="font-medium text-white/60" aria-hidden="true">Add Other</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Clear all button for multi-select */}
      {!singleSelect && value.length > 0 && (
        <button
          onClick={() => onChange([])}
          className="w-full py-2 text-sm text-white/50 hover:text-white/70 transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
