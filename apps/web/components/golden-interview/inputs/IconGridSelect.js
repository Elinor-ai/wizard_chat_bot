"use client";

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
 */
export default function IconGridSelect({
  options,
  value,
  onChange,
  multiple = false,
  columns = 3,
  title,
  maxSelections,
  selectedColor = "#8b5cf6",
}) {
  const selectedIds = multiple
    ? Array.isArray(value)
      ? value
      : []
    : value
      ? [value]
      : [];

  const handleSelect = (optionId) => {
    if (multiple) {
      const isSelected = selectedIds.includes(optionId);
      let newSelection;

      if (isSelected) {
        newSelection = selectedIds.filter((id) => id !== optionId);
      } else {
        if (maxSelections && selectedIds.length >= maxSelections) {
          // Replace oldest selection
          newSelection = [...selectedIds.slice(1), optionId];
        } else {
          newSelection = [...selectedIds, optionId];
        }
      }
      onChange(newSelection);
    } else {
      onChange(optionId === value ? null : optionId);
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
              {selectedIds.length} / {maxSelections}
            </span>
          )}
        </div>
      )}

      <div className={`grid ${gridCols[columns] || "grid-cols-3"} gap-3`}>
        {options.map((option) => {
          const isSelected = selectedIds.includes(option.id);
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
      </div>

      {/* Selected summary for multi-select */}
      {multiple && selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {selectedIds.map((id) => {
            const option = options.find((o) => o.id === id);
            const isEmoji = isLikelyEmoji(option?.icon);

            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs text-slate-700 border border-slate-200"
                style={{
                  backgroundColor: `${selectedColor}10`,
                  borderColor: `${selectedColor}30`,
                }}
              >
                {isEmoji ? (
                  <span>{option?.icon}</span>
                ) : (
                  <DynamicIcon
                    name={option?.icon}
                    size={14}
                    className="text-slate-500"
                  />
                )}
                <span>{option?.label}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(id);
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
