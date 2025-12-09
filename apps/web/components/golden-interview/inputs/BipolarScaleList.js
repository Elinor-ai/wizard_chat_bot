"use client";

/**
 * BipolarScaleList - List of sliders balancing between two text extremes
 * @param {Object} props
 * @param {Array<{id: string, leftLabel: string, rightLabel: string, value: number}>} props.items
 * @param {function} props.onChange - Callback with updated items array
 * @param {number} [props.min=-50] - Minimum value (left extreme)
 * @param {number} [props.max=50] - Maximum value (right extreme)
 * @param {string} [props.title] - Title text
 * @param {string} [props.leftColor="#3b82f6"] - Left side color
 * @param {string} [props.rightColor="#ef4444"] - Right side color
 * @param {boolean} [props.showValues=false] - Show numeric values
 */
export default function BipolarScaleList({
  items,
  onChange,
  min = -50,
  max = 50,
  title,
  leftColor = "#3b82f6",
  rightColor = "#ef4444",
  showValues = false
}) {
  const handleItemChange = (itemId, newValue) => {
    const updatedItems = items.map((item) =>
      item.id === itemId ? { ...item, value: newValue } : item
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
        background: `linear-gradient(to right, ${leftColor}, ${leftColor}80)`
      };
    } else {
      // Right side filled
      return {
        left: "50%",
        width: `${normalized - center}%`,
        background: `linear-gradient(to right, ${rightColor}80, ${rightColor})`
      };
    }
  };

  const getGlowPosition = (value) => {
    const normalized = ((value - min) / (max - min)) * 100;
    const isLeft = normalized < 50;
    return {
      left: `${normalized}%`,
      backgroundColor: isLeft ? leftColor : rightColor
    };
  };

  return (
    <div className="w-full space-y-6">
      {title && (
        <h3 className="text-lg font-semibold text-white text-center">{title}</h3>
      )}

      <div className="space-y-5">
        {items.map((item) => {
          const barStyle = getBarStyle(item.value);
          const glowStyle = getGlowPosition(item.value);
          const normalized = ((item.value - min) / (max - min)) * 100;

          return (
            <div key={item.id} className="space-y-2">
              {/* Labels */}
              <div className="flex justify-between items-center">
                <span
                  className={`text-sm font-medium transition-all ${
                    item.value < 0 ? "text-white" : "text-white/50"
                  }`}
                  style={{ color: item.value < 0 ? leftColor : undefined }}
                >
                  {item.leftLabel}
                </span>
                {showValues && (
                  <span className="text-xs text-white/40 font-mono">
                    {item.value > 0 ? "+" : ""}
                    {item.value}
                  </span>
                )}
                <span
                  className={`text-sm font-medium transition-all ${
                    item.value > 0 ? "text-white" : "text-white/50"
                  }`}
                  style={{ color: item.value > 0 ? rightColor : undefined }}
                >
                  {item.rightLabel}
                </span>
              </div>

              {/* Slider Track */}
              <div className="relative h-8">
                {/* Background track */}
                <div className="absolute inset-0 rounded-full bg-white/10 backdrop-blur-sm overflow-hidden">
                  {/* Center line */}
                  <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/30" />

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
                    transform: "translate(-50%, -50%)"
                  }}
                />

                {/* Slider input */}
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={item.value}
                  onChange={(e) =>
                    handleItemChange(item.id, Number(e.target.value))
                  }
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />

                {/* Thumb indicator */}
                <div
                  className="absolute top-1/2 w-6 h-6 rounded-full bg-white shadow-lg border-2 transition-all duration-150 pointer-events-none"
                  style={{
                    left: `${normalized}%`,
                    transform: "translate(-50%, -50%)",
                    borderColor: normalized < 50 ? leftColor : rightColor,
                    boxShadow: `0 0 12px ${normalized < 50 ? leftColor : rightColor}60`
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="flex justify-center gap-8 pt-4 border-t border-white/10">
        <div className="text-center">
          <div
            className="text-2xl font-bold"
            style={{ color: leftColor }}
          >
            {items.filter((i) => i.value < -10).length}
          </div>
          <div className="text-xs text-white/50">Lean Left</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-white/60">
            {items.filter((i) => i.value >= -10 && i.value <= 10).length}
          </div>
          <div className="text-xs text-white/50">Balanced</div>
        </div>
        <div className="text-center">
          <div
            className="text-2xl font-bold"
            style={{ color: rightColor }}
          >
            {items.filter((i) => i.value > 10).length}
          </div>
          <div className="text-xs text-white/50">Lean Right</div>
        </div>
      </div>
    </div>
  );
}
