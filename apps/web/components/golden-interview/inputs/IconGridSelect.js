"use client";

/**
 * IconGridSelect - Grid of square cards with icons, supports single/multi-select
 * @param {Object} props
 * @param {Array<{id: string, label: string, icon: React.ReactNode, description?: string}>} props.options
 * @param {string|Array<string>} props.value - Selected id(s)
 * @param {function} props.onChange - Callback with selected value(s)
 * @param {boolean} [props.multiple=false] - Allow multiple selections
 * @param {number} [props.columns=3] - Number of grid columns
 * @param {string} [props.title] - Title text
 * @param {number} [props.maxSelections] - Max selections (for multiple mode)
 * @param {string} [props.selectedColor="#8b5cf6"] - Selection highlight color
 */
export default function IconGridSelect({
  options,
  value,
  onChange,
  multiple = false,
  columns = 3,
  title,
  maxSelections,
  selectedColor = "#8b5cf6"
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
    6: "grid-cols-6"
  };

  return (
    <div className="w-full space-y-4">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {multiple && maxSelections && (
            <span className="text-white/50 text-sm">
              {selectedIds.length} / {maxSelections}
            </span>
          )}
        </div>
      )}

      <div className={`grid ${gridCols[columns] || "grid-cols-3"} gap-3`}>
        {options.map((option) => {
          const isSelected = selectedIds.includes(option.id);

          return (
            <button
              key={option.id}
              onClick={() => handleSelect(option.id)}
              className={`relative aspect-square p-4 rounded-xl border transition-all duration-200 flex flex-col items-center justify-center gap-2 group ${
                isSelected
                  ? "border-transparent shadow-lg"
                  : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
              }`}
              style={{
                backgroundColor: isSelected ? `${selectedColor}20` : undefined,
                borderColor: isSelected ? selectedColor : undefined,
                boxShadow: isSelected
                  ? `0 0 20px ${selectedColor}30, inset 0 0 20px ${selectedColor}10`
                  : undefined
              }}
            >
              {/* Glow effect on selection */}
              {isSelected && (
                <div
                  className="absolute inset-0 rounded-xl opacity-20 pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at center, ${selectedColor}, transparent 70%)`
                  }}
                />
              )}

              {/* Icon */}
              <div
                className={`text-3xl transition-transform duration-200 ${
                  isSelected ? "scale-110" : "group-hover:scale-105"
                }`}
              >
                {option.icon}
              </div>

              {/* Label */}
              <span
                className={`text-xs font-medium text-center leading-tight transition-colors ${
                  isSelected ? "text-white" : "text-white/70"
                }`}
              >
                {option.label}
              </span>

              {/* Checkmark for multi-select */}
              {multiple && isSelected && (
                <div
                  className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: selectedColor }}
                >
                  <svg
                    className="w-3 h-3 text-white"
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
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs text-white"
                style={{ backgroundColor: `${selectedColor}30` }}
              >
                <span>{option?.icon}</span>
                <span>{option?.label}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(id);
                  }}
                  className="ml-1 hover:text-red-400 transition-colors"
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
