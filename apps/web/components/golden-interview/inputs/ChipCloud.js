"use client";

/**
 * ChipCloud - Grouped cloud of selectable text chips/tags
 * @param {Object} props
 * @param {Array<{groupId: string, groupLabel: string, items: Array<{id: string, label: string}>}>} props.groups
 * @param {Array<string>} props.value - Array of selected item ids
 * @param {function} props.onChange - Callback with updated selection array
 * @param {string} [props.title] - Title text
 * @param {number} [props.maxSelections] - Maximum number of selections
 * @param {boolean} [props.showGroupLabels=true] - Show group headers
 * @param {string} [props.selectedColor="#8b5cf6"] - Selection color
 */
export default function ChipCloud({
  groups,
  value = [],
  onChange,
  title,
  maxSelections,
  showGroupLabels = true,
  selectedColor = "#8b5cf6"
}) {
  const handleChipToggle = (itemId) => {
    const isSelected = value.includes(itemId);

    if (isSelected) {
      onChange(value.filter((id) => id !== itemId));
    } else if (!maxSelections || value.length < maxSelections) {
      onChange([...value, itemId]);
    }
  };

  const canSelectMore = !maxSelections || value.length < maxSelections;

  return (
    <div className="w-full space-y-4">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {maxSelections && (
            <span
              className={`text-sm ${value.length >= maxSelections ? "text-amber-400" : "text-white/50"}`}
            >
              {value.length} / {maxSelections}
            </span>
          )}
        </div>
      )}

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.groupId} className="space-y-2">
            {showGroupLabels && (
              <div className="text-white/50 text-xs uppercase tracking-wide font-medium">
                {group.groupLabel}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {group.items.map((item) => {
                const isSelected = value.includes(item.id);
                const isDisabled = !isSelected && !canSelectMore;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleChipToggle(item.id)}
                    disabled={isDisabled}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                      isSelected
                        ? "text-white shadow-lg"
                        : isDisabled
                          ? "bg-white/5 text-white/30 cursor-not-allowed"
                          : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-transparent hover:border-white/20"
                    }`}
                    style={{
                      backgroundColor: isSelected ? selectedColor : undefined,
                      boxShadow: isSelected
                        ? `0 4px 15px ${selectedColor}40`
                        : undefined
                    }}
                  >
                    {isSelected && (
                      <span className="mr-1">✓</span>
                    )}
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Selected chips summary */}
      {value.length > 0 && (
        <div className="pt-4 border-t border-white/10">
          <div className="text-white/50 text-xs uppercase tracking-wide mb-2">
            Selected
          </div>
          <div className="flex flex-wrap gap-2">
            {value.map((itemId) => {
              // Find the item across all groups
              let itemLabel = itemId;
              for (const group of groups) {
                const item = group.items.find((i) => i.id === itemId);
                if (item) {
                  itemLabel = item.label;
                  break;
                }
              }

              return (
                <span
                  key={itemId}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm text-white"
                  style={{ backgroundColor: `${selectedColor}30` }}
                >
                  {itemLabel}
                  <button
                    onClick={() => handleChipToggle(itemId)}
                    className="ml-1 hover:text-red-400 transition-colors"
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
