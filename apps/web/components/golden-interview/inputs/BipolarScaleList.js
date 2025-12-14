"use client";

/**
 * BipolarScaleList - List of sliders balancing between two text extremes
 *
 * ROBUST HANDLING: This component handles items with or without IDs.
 * - Uses index-based updates to ensure sliders work even if API sends missing IDs
 * - Uses (item.id || index) for React keys to prevent duplicate key warnings
 */
export default function BipolarScaleList({
  items,
  onChange,
  min = -50,
  max = 50,
  title,
  leftColor = "#3b82f6",
  rightColor = "#ef4444",
  showValues = false,
}) {
  // 1. Safety Check: Prevent crash if items is null/undefined
  const safeItems = items || [];

  // FIX: Use index-based update to handle items without IDs
  const handleItemChange = (index, newValue) => {
    const updatedItems = safeItems.map((item, i) =>
      i === index ? { ...item, value: newValue } : item
    );
    onChange(updatedItems);
  };

  const getBarStyle = (value) => {
    const normalized = ((value - min) / (max - min)) * 100;
    const center = 50;

    if (normalized < center) {
      // Left side filled
      return {
        left: `${normalized}%`,
        width: `${center - normalized}%`,
        background: `linear-gradient(to right, ${leftColor}, ${leftColor}80)`,
      };
    } else {
      // Right side filled
      return {
        left: "50%",
        width: `${normalized - center}%`,
        background: `linear-gradient(to right, ${rightColor}80, ${rightColor})`,
      };
    }
  };

  const getGlowPosition = (value) => {
    const normalized = ((value - min) / (max - min)) * 100;
    const isLeft = normalized < 50;
    return {
      left: `${normalized}%`,
      backgroundColor: isLeft ? leftColor : rightColor,
    };
  };

  return (
    <div className="w-full space-y-6">
      {title && (
        // 2. Visibility Fix: text-white -> text-slate-800
        <h3 className="text-lg font-semibold text-slate-800 text-center">
          {title}
        </h3>
      )}

      <div className="space-y-5">
        {safeItems.map((item, index) => {
          // FIX: Default to 0 if value is missing to prevent NaN
          const itemValue = item.value ?? 0;
          const barStyle = getBarStyle(itemValue);
          const glowStyle = getGlowPosition(itemValue);
          const normalized = ((itemValue - min) / (max - min)) * 100;

          return (
            // FIX: Use item.id if available, fallback to index for unique React key
            <div key={item.id || `bipolar-item-${index}`} className="space-y-2">
              {/* Labels */}
              <div className="flex justify-between items-center">
                <span
                  // 2. Visibility Fix: text-white/50 -> text-slate-400
                  // Keep dynamic color logic for active state
                  className={`text-sm font-medium transition-all ${
                    itemValue < 0 ? "" : "text-slate-400"
                  }`}
                  style={{ color: itemValue < 0 ? leftColor : undefined }}
                >
                  {item.leftLabel}
                </span>
                {showValues && (
                  <span className="text-xs text-slate-400 font-mono">
                    {itemValue > 0 ? "+" : ""}
                    {itemValue}
                  </span>
                )}
                <span
                  // 2. Visibility Fix: text-white/50 -> text-slate-400
                  className={`text-sm font-medium transition-all ${
                    itemValue > 0 ? "" : "text-slate-400"
                  }`}
                  style={{ color: itemValue > 0 ? rightColor : undefined }}
                >
                  {item.rightLabel}
                </span>
              </div>

              {/* Slider Track */}
              <div className="relative h-8">
                {/* Background track: bg-white/10 -> bg-slate-100 */}
                <div className="absolute inset-0 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                  {/* Center line: bg-white/30 -> bg-slate-300 */}
                  <div className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-300" />

                  {/* Filled portion */}
                  <div
                    className="absolute top-0 bottom-0 transition-all duration-150"
                    style={barStyle}
                  />
                </div>

                {/* Glow indicator */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-all duration-150 pointer-events-none"
                  style={{
                    ...glowStyle,
                    filter: "blur(8px)",
                    opacity: 0.6,
                    transform: "translate(-50%, -50%)",
                  }}
                />

                {/* Slider input */}
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={itemValue}
                  onChange={(e) =>
                    // FIX: Use index instead of item.id for reliable updates
                    handleItemChange(index, Number(e.target.value))
                  }
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />

                {/* Thumb indicator */}
                <div
                  className="absolute top-1/2 w-6 h-6 rounded-full bg-white shadow-md border-2 transition-all duration-150 pointer-events-none"
                  style={{
                    left: `${normalized}%`,
                    transform: "translate(-50%, -50%)",
                    borderColor: normalized < 50 ? leftColor : rightColor,
                    // Keep shadow but make it subtler for light mode
                    boxShadow: `0 2px 8px ${
                      normalized < 50 ? leftColor : rightColor
                    }40`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="flex justify-center gap-8 pt-4 border-t border-slate-100">
        <div className="text-center">
          <div className="text-2xl font-bold" style={{ color: leftColor }}>
            {safeItems.filter((i) => (i.value ?? 0) < -10).length}
          </div>
          <div className="text-xs text-slate-400">Lean Left</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-slate-600">
            {safeItems.filter((i) => {
              const v = i.value ?? 0;
              return v >= -10 && v <= 10;
            }).length}
          </div>
          <div className="text-xs text-slate-400">Balanced</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold" style={{ color: rightColor }}>
            {safeItems.filter((i) => (i.value ?? 0) > 10).length}
          </div>
          <div className="text-xs text-slate-400">Lean Right</div>
        </div>
      </div>
    </div>
  );
}
