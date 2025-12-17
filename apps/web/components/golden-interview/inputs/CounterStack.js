"use client";

/**
 * CounterStack - List of items with +/- stepper buttons updating a total
 * @param {Object} props
 * @param {Array<{id: string, label: string, icon?: React.ReactNode, unit?: string, min?: number, max?: number, step?: number}>} props.items
 * @param {Object} props.value - { [itemId]: number }
 * @param {function} props.onChange - Callback with updated value object
 * @param {string} [props.title] - Title text
 * @param {string} [props.totalLabel="Total"] - Label for the total
 * @param {string} [props.totalUnit="days"] - Unit for the total
 * @param {string} [props.accentColor="#8b5cf6"] - Accent color
 */
export default function CounterStack({
  items = [],
  value = {},
  onChange,
  title,
  totalLabel = "Total",
  totalUnit = "days",
  accentColor = "#8b5cf6",
}) {
  const handleIncrement = (itemId) => {
    const item = items.find((i) => i.id === itemId);
    const current = value[itemId] || 0;
    const step = item?.step || 1;
    const max = item?.max ?? Infinity;
    const newValue = Math.min(current + step, max);

    onChange({ ...value, [itemId]: newValue });
  };

  const handleDecrement = (itemId) => {
    const item = items.find((i) => i.id === itemId);
    const current = value[itemId] || 0;
    const step = item?.step || 1;
    const min = item?.min ?? 0;
    const newValue = Math.max(current - step, min);

    onChange({ ...value, [itemId]: newValue });
  };

  const handleDirectInput = (itemId, inputValue) => {
    const item = items.find((i) => i.id === itemId);
    const min = item?.min ?? 0;
    const max = item?.max ?? Infinity;
    const parsed = parseInt(inputValue, 10);

    if (!isNaN(parsed)) {
      const newValue = Math.max(min, Math.min(max, parsed));
      onChange({ ...value, [itemId]: newValue });
    }
  };

  const total = Object.values(value).reduce((sum, v) => sum + (v || 0), 0);

  return (
    <div className="w-full space-y-4">
      {title && <h3 className="text-lg font-semibold text-black">{title}</h3>}

      {/* Total display */}
      <div
        className="p-4 rounded-xl text-center"
        style={{
          background: `linear-gradient(135deg, ${accentColor}20, ${accentColor}05)`,
          border: `1px solid ${accentColor}30`,
        }}
      >
        <div className="text-black/60 text-sm">{totalLabel}</div>
        <div className="text-4xl font-bold mt-1" style={{ color: accentColor }}>
          {total}
        </div>
        <div className="text-black/40 text-sm">{totalUnit}</div>
      </div>

      {/* Item counters */}
      <div className="space-y-2">
        {items.map((item) => {
          const itemValue = value[item.id] || 0;
          const min = item.min ?? 0;
          const max = item.max ?? Infinity;
          const canDecrement = itemValue > min;
          const canIncrement = itemValue < max;

          return (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/8 transition-colors"
            >
              {/* Icon */}
              {item.icon && (
                <span className="text-xl flex-shrink-0">{item.icon}</span>
              )}

              {/* Label */}
              <div className="flex-1 min-w-0">
                <span className="text-black/80 text-sm font-medium">
                  {item.label}
                </span>
                {item.unit && (
                  <span className="text-black/40 text-xs ml-1">
                    ({item.unit})
                  </span>
                )}
              </div>

              {/* Counter controls */}
              <div className="flex items-center gap-1">
                {/* Decrement */}
                <button
                  onClick={() => handleDecrement(item.id)}
                  disabled={!canDecrement}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold transition-all ${
                    canDecrement
                      ? "bg-white/10 text-black hover:bg-white/20"
                      : "bg-white/5 text-black/20 cursor-not-allowed"
                  }`}
                >
                  −
                </button>

                {/* Value display/input */}
                <input
                  type="text"
                  value={itemValue}
                  onChange={(e) => handleDirectInput(item.id, e.target.value)}
                  className="w-14 h-9 rounded-lg bg-white/10 text-black
                   text-center font-bold text-lg focus:outline-none focus:ring-2 transition-all"
                  style={{
                    focusRingColor: accentColor,
                  }}
                />

                {/* Increment */}
                <button
                  onClick={() => handleIncrement(item.id)}
                  disabled={!canIncrement}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold transition-all ${
                    canIncrement
                      ? "text-black hover:opacity-90"
                      : "bg-white/5 text-black/20 cursor-not-allowed"
                  }`}
                  style={{
                    backgroundColor: canIncrement ? accentColor : undefined,
                  }}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick presets */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={() => {
            const reset = {};
            items.forEach((item) => {
              reset[item.id] = item.min ?? 0;
            });
            onChange(reset);
          }}
          className="flex-1 py-2 rounded-lg bg-white/5 text-black/50 text-sm hover:bg-white/10 hover:text-black/70 transition-all"
        >
          Clear All
        </button>
        <button
          onClick={() => {
            const defaults = {};
            items.forEach((item) => {
              // Set to midpoint between min and max (or 5 if no max)
              const min = item.min ?? 0;
              const max = item.max ?? 10;
              defaults[item.id] = Math.floor((min + max) / 2);
            });
            onChange(defaults);
          }}
          className="flex-1 py-2 rounded-lg text-black text-sm hover:opacity-90 transition-all"
          style={{ backgroundColor: `${accentColor}50` }}
        >
          Set Defaults
        </button>
      </div>

      {/* Visual breakdown */}
      {total > 0 && (
        <div className="pt-4 border-t border-white/10">
          <div className="text-black/50 text-xs uppercase tracking-wide mb-2">
            Breakdown
          </div>
          <div className="flex h-6 rounded-full overflow-hidden bg-white/10">
            {items
              .filter((item) => (value[item.id] || 0) > 0)
              .map((item, index) => {
                const itemValue = value[item.id] || 0;
                const percentage = (itemValue / total) * 100;
                const colors = [
                  "#8b5cf6",
                  "#6366f1",
                  "#3b82f6",
                  "#06b6d4",
                  "#10b981",
                  "#84cc16",
                ];

                return (
                  <div
                    key={item.id}
                    className="h-full transition-all duration-300 flex items-center justify-center"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: colors[index % colors.length],
                      minWidth: percentage > 0 ? "20px" : "0",
                    }}
                    title={`${item.label}: ${itemValue}`}
                  >
                    {percentage >= 15 && (
                      <span className="text-white text-xs font-bold">
                        {itemValue}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {items
              .filter((item) => (value[item.id] || 0) > 0)
              .map((item, index) => {
                const colors = [
                  "#8b5cf6",
                  "#6366f1",
                  "#3b82f6",
                  "#06b6d4",
                  "#10b981",
                  "#84cc16",
                ];
                return (
                  <div key={item.id} className="flex items-center gap-1">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: colors[index % colors.length] }}
                    />
                    <span className="text-xs text-white/50">
                      {item.label}: {value[item.id]}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
