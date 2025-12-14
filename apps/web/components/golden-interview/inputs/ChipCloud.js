"use client";

/**
 * ChipCloud - Grouped cloud of selectable text chips/tags
 *
 * ROBUST HANDLING: This component handles malformed data gracefully.
 * - Defaults groups to [] if undefined/null
 * - Defaults group.items to [] if undefined/null
 * - Light mode styling for visibility on white backgrounds
 *
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
  selectedColor = "#8b5cf6",
}) {
  // Safety check: Ensure groups is always an array
  const safeGroups = Array.isArray(groups) ? groups : [];

  // Safety check: Ensure value is always an array
  const safeValue = Array.isArray(value) ? value : [];

  const handleChipToggle = (itemId) => {
    const isSelected = safeValue.includes(itemId);

    if (isSelected) {
      onChange(safeValue.filter((id) => id !== itemId));
    } else if (!maxSelections || safeValue.length < maxSelections) {
      onChange([...safeValue, itemId]);
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
                      {isSelected && <span className="mr-1">✓</span>}
                      {itemLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
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
              for (const group of safeGroups) {
                const safeItems = Array.isArray(group.items) ? group.items : [];
                const item = safeItems.find((i) => i?.id === itemId);
                if (item) {
                  itemLabel = item.label || item.id;
                  break;
                }
              }

              return (
                <span
                  key={itemId}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm text-white"
                  style={{ backgroundColor: selectedColor }}
                >
                  {itemLabel}
                  <button
                    onClick={() => handleChipToggle(itemId)}
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
