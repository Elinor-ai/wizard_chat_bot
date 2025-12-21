"use client";

/**
 * ToggleList - Simple vertical list of toggle buttons with checkmarks
 * @param {Object} props
 * @param {Array<{id: string, label: string, icon?: React.ReactNode, description?: string}>} props.items
 * @param {Array<string>} props.value - Array of selected item ids
 * @param {function} props.onChange - Callback with updated selection array
 * @param {string} [props.title] - Title text
 * @param {string} [props.activeColor="#ef4444"] - Color for active/selected items
 * @param {boolean} [props.singleSelect=false] - Only allow one selection
 * @param {string} [props.variant="default"] - "default" | "danger" | "success"
 */
export default function ToggleList({
  items,
  value = [],
  onChange,
  title,
  activeColor,
  singleSelect = false,
  variant = "default"
}) {
  const variantColors = {
    default: "#8b5cf6",
    danger: "#ef4444",
    success: "#22c55e"
  };

  const color = activeColor || variantColors[variant];

  const handleToggle = (itemId) => {
    if (singleSelect) {
      onChange(value.includes(itemId) ? [] : [itemId]);
    } else {
      const isSelected = value.includes(itemId);
      const newValue = isSelected
        ? value.filter((id) => id !== itemId)
        : [...value, itemId];
      onChange(newValue);
    }
  };

  return (
    <div className="w-full space-y-4">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
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
              className={`w-full p-4 rounded-xl border transition-all duration-200 flex items-center gap-3 text-left group ${
                isSelected
                  ? "border-transparent"
                  : "bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
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
                  isSelected ? "" : "border-2 border-slate-300"
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
                    isSelected ? "text-slate-900" : "text-slate-700"
                  }`}
                >
                  {item.label}
                </span>
                {item.description && (
                  <p className="text-slate-400 text-sm mt-0.5 truncate">
                    {item.description}
                  </p>
                )}
              </div>

              {/* Hover indicator */}
              {!isSelected && (
                <div className="w-6 h-6 rounded-full bg-slate-100 group-hover:bg-slate-200 transition-colors flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Clear all button for multi-select */}
      {!singleSelect && value.length > 0 && (
        <button
          onClick={() => onChange([])}
          className="w-full py-2 text-sm text-slate-500 hover:text-slate-600 transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
