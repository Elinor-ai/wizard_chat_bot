"use client";

import { useState, useRef, useEffect } from "react";

/**
 * ChipCloud - Grouped cloud of selectable text chips/tags
 *
 * ROBUST HANDLING: This component handles malformed data gracefully.
 * - Defaults groups to [] if undefined/null
 * - Defaults group.items to [] if undefined/null
 * - Light mode styling for visibility on white backgrounds
 * - Now supports custom chip creation when allowCustomInput is true
 *
 * @param {Object} props
 * @param {Array<{groupId: string, groupLabel: string, items: Array<{id: string, label: string}>}>} props.groups
 * @param {Array<string>} props.value - Array of selected item ids (can include custom strings)
 * @param {function} props.onChange - Callback with updated selection array
 * @param {string} [props.title] - Title text
 * @param {number} [props.maxSelections] - Maximum number of selections
 * @param {boolean} [props.showGroupLabels=true] - Show group headers
 * @param {string} [props.selectedColor="#8b5cf6"] - Selection color
 * @param {boolean} [props.allowCustomInput=false] - Allow custom chip creation
 * @param {string} [props.customInputPlaceholder] - Placeholder for custom input
 */
export default function ChipCloud({
  groups,
  value = [],
  onChange,
  title,
  maxSelections,
  showGroupLabels = true,
  selectedColor = "#8b5cf6",
  allowCustomInput = false,
  customInputPlaceholder = "Add custom...",
}) {
  // State for custom input
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customInputValue, setCustomInputValue] = useState("");
  const customInputRef = useRef(null);

  // Safety check: Ensure groups is always an array
  const safeGroups = Array.isArray(groups) ? groups : [];

  // Safety check: Ensure value is always an array
  const safeValue = Array.isArray(value) ? value : [];

  // Focus input when entering custom mode
  useEffect(() => {
    if (isAddingCustom && customInputRef.current) {
      customInputRef.current.focus();
    }
  }, [isAddingCustom]);

  // Check if a value is a custom chip (not in any group)
  const isCustomChip = (itemId) => {
    for (const group of safeGroups) {
      const safeItems = Array.isArray(group.items) ? group.items : [];
      if (safeItems.some((item) => item?.id === itemId)) {
        return false;
      }
    }
    return true;
  };

  // Get all custom chips from selected values
  const customChips = safeValue.filter(isCustomChip);

  const handleChipToggle = (itemId) => {
    const isSelected = safeValue.includes(itemId);

    if (isSelected) {
      onChange(safeValue.filter((id) => id !== itemId));
    } else if (!maxSelections || safeValue.length < maxSelections) {
      onChange([...safeValue, itemId]);
    }
  };

  // Handle submitting custom chip
  const handleCustomSubmit = () => {
    const trimmedValue = customInputValue.trim();
    if (!trimmedValue) {
      setIsAddingCustom(false);
      return;
    }

    // Don't add duplicates
    if (!safeValue.includes(trimmedValue)) {
      if (!maxSelections || safeValue.length < maxSelections) {
        onChange([...safeValue, trimmedValue]);
      }
    }

    setCustomInputValue("");
    setIsAddingCustom(false);
  };

  // Handle keyboard events in custom input
  const handleCustomKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCustomSubmit();
    } else if (e.key === "Escape") {
      setCustomInputValue("");
      setIsAddingCustom(false);
    }
  };

  const canSelectMore = !maxSelections || safeValue.length < maxSelections;

  return (
    <div className="w-full space-y-4">
      {title && (
        <div className="flex items-center justify-between">
          {/* Light Mode: text-white -> text-slate-800 */}
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          {maxSelections && (
            <span
              className={`text-sm ${
                safeValue.length >= maxSelections
                  ? "text-amber-600"
                  : "text-slate-500"
              }`}
            >
              {safeValue.length} / {maxSelections}
            </span>
          )}
        </div>
      )}

      <div className="space-y-4">
        {safeGroups.map((group, groupIndex) => {
          // Safety check: Ensure group.items is always an array
          const safeItems = Array.isArray(group.items) ? group.items : [];

          return (
            <div
              key={group.groupId || `group-${groupIndex}`}
              className="space-y-2"
            >
              {showGroupLabels && group.groupLabel && (
                // Light Mode: text-white/50 -> text-slate-500
                <div className="text-slate-500 text-xs uppercase tracking-wide font-medium">
                  {group.groupLabel}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {safeItems.map((item, itemIndex) => {
                  // Safety check: Ensure item has id and label
                  const itemId = item?.id || `item-${groupIndex}-${itemIndex}`;
                  const itemLabel = item?.label || item?.id || "Unknown";
                  const isSelected = safeValue.includes(itemId);
                  const isDisabled = !isSelected && !canSelectMore;

                  return (
                    <button
                      key={itemId}
                      onClick={() => handleChipToggle(itemId)}
                      disabled={isDisabled}
                      aria-label={itemLabel}
                      aria-pressed={isSelected}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                        isSelected
                          ? "text-white shadow-lg"
                          : isDisabled
                            ? "bg-slate-100 text-slate-300 cursor-not-allowed border border-slate-200"
                            : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                      }`}
                      style={{
                        backgroundColor: isSelected ? selectedColor : undefined,
                        boxShadow: isSelected
                          ? `0 4px 15px ${selectedColor}40`
                          : undefined,
                      }}
                    >
                      {isSelected && <span className="mr-1" aria-hidden="true">✓</span>}
                      {itemLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Custom chips section - shows custom chips and add button */}
        {allowCustomInput && (
          <div className="space-y-2">
            {customChips.length > 0 && (
              <div className="text-slate-500 text-xs uppercase tracking-wide font-medium">
                Custom
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {/* Render selected custom chips */}
              {customChips.map((chipValue) => (
                <button
                  key={chipValue}
                  onClick={() => handleChipToggle(chipValue)}
                  aria-label={`Custom answer: ${chipValue}`}
                  aria-pressed={true}
                  className="px-4 py-2 rounded-full text-sm font-medium text-white shadow-lg transition-all duration-200"
                  style={{
                    backgroundColor: selectedColor,
                    boxShadow: `0 4px 15px ${selectedColor}40`,
                  }}
                >
                  <span className="mr-1" aria-hidden="true">✓</span>
                  {chipValue}
                </button>
              ))}

              {/* "+ Add" chip or inline input */}
              {isAddingCustom ? (
                <div className="inline-flex items-center" role="group" aria-label="Custom input field">
                  <input
                    ref={customInputRef}
                    type="text"
                    value={customInputValue}
                    onChange={(e) => setCustomInputValue(e.target.value)}
                    onKeyDown={handleCustomKeyDown}
                    onBlur={handleCustomSubmit}
                    placeholder={customInputPlaceholder}
                    aria-label="Enter custom answer"
                    className="px-4 py-2 rounded-full text-sm border-2 border-dashed border-primary-400 bg-primary-50 focus:outline-none focus:border-primary-500 min-w-[120px]"
                    autoFocus
                  />
                </div>
              ) : (
                canSelectMore && (
                  <button
                    onClick={() => setIsAddingCustom(true)}
                    aria-label="Add custom answer"
                    className="px-4 py-2 rounded-full text-sm font-medium border-2 border-dashed border-slate-300 text-slate-500 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-all duration-200"
                  >
                    <span className="mr-1" aria-hidden="true">+</span>
                    Add
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* Selected chips summary */}
      {safeValue.length > 0 && (
        // Light Mode: border-white/10 -> border-slate-200
        <div className="pt-4 border-t border-slate-200">
          {/* Light Mode: text-white/50 -> text-slate-500 */}
          <div className="text-slate-500 text-xs uppercase tracking-wide mb-2">
            Selected
          </div>
          <div className="flex flex-wrap gap-2">
            {safeValue.map((itemId) => {
              // Find the item across all groups
              let itemLabel = itemId;
              let isCustom = true;
              for (const group of safeGroups) {
                const safeItems = Array.isArray(group.items) ? group.items : [];
                const item = safeItems.find((i) => i?.id === itemId);
                if (item) {
                  itemLabel = item.label || item.id;
                  isCustom = false;
                  break;
                }
              }

              return (
                <span
                  key={itemId}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm text-white"
                  style={{ backgroundColor: selectedColor }}
                >
                  {isCustom && (
                    <svg
                      className="w-3 h-3 mr-0.5"
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
                  )}
                  {itemLabel}
                  <button
                    onClick={() => handleChipToggle(itemId)}
                    aria-label={`Remove ${itemLabel}`}
                    className="ml-1 hover:text-red-200 transition-colors"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
