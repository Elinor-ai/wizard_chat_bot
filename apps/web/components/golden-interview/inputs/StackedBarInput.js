"use client";

/**
 * StackedBarInput - Multiple sliders updating a single stacked progress bar
 * @param {Object} props
 * @param {Array<{id: string, label: string, color: string, value: number}>} props.segments - Segment definitions
 * @param {function} props.onChange - Callback with updated segments array
 * @param {number} [props.total=100] - Total value (segments should sum to this)
 * @param {string} [props.title] - Optional title above the bar
 * @param {boolean} [props.showPercentages=true] - Show percentage labels
 * @param {boolean} [props.autoBalance=true] - Auto-adjust other segments when one changes
 */
export default function StackedBarInput({
  segments,
  onChange,
  total = 100,
  title,
  showPercentages = true,
  autoBalance = true,
}) {
  const currentTotal = segments.reduce((sum, s) => sum + s.value, 0);

  const handleSliderChange = (segmentId, newValue) => {
    const segmentIndex = segments.findIndex((s) => s.id === segmentId);
    const oldValue = segments[segmentIndex].value;
    const diff = newValue - oldValue;

    let updatedSegments;

    if (autoBalance && segments.length > 1) {
      // Distribute the difference among other segments proportionally
      const otherSegments = segments.filter((s) => s.id !== segmentId);
      const otherTotal = otherSegments.reduce((sum, s) => sum + s.value, 0);

      updatedSegments = segments.map((segment) => {
        if (segment.id === segmentId) {
          return { ...segment, value: Math.max(0, Math.min(total, newValue)) };
        }

        if (otherTotal === 0) {
          // If other segments are all 0, distribute evenly
          const evenShare = -diff / otherSegments.length;
          return { ...segment, value: Math.max(0, segment.value + evenShare) };
        }

        // Proportional distribution
        const proportion = segment.value / otherTotal;
        const adjustment = -diff * proportion;
        return { ...segment, value: Math.max(0, segment.value + adjustment) };
      });

      // Normalize to ensure total stays correct
      const newTotal = updatedSegments.reduce((sum, s) => sum + s.value, 0);
      if (Math.abs(newTotal - total) > 0.01) {
        const scale = total / newTotal;
        updatedSegments = updatedSegments.map((s) => ({
          ...s,
          value: Math.round(s.value * scale),
        }));
      }
    } else {
      updatedSegments = segments.map((segment) =>
        segment.id === segmentId
          ? { ...segment, value: Math.max(0, Math.min(total, newValue)) }
          : segment
      );
    }

    onChange(updatedSegments);
  };

  return (
    <div className="w-full space-y-6">
      {title && (
        <h3 className="text-lg font-semibold text-black text-center">
          {title}
        </h3>
      )}

      {/* Stacked Bar */}
      <div className="relative h-12 rounded-full overflow-hidden bg-black/10 backdrop-blur-sm border border-black/20">
        <div className="absolute inset-0 flex">
          {segments.map((segment, index) => {
            const percentage = (segment.value / total) * 100;
            return (
              <div
                key={segment.id}
                className="h-full transition-all duration-300 flex items-center justify-center relative overflow-hidden"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: segment.color,
                  minWidth: percentage > 0 ? "2px" : "0",
                }}
              >
                {showPercentages && percentage >= 10 && (
                  <span className="text-black text-xs font-bold drop-shadow-lg">
                    {Math.round(percentage)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-t from-transparent to-black/10 pointer-events-none" />
      </div>

      {/* Legend & Sliders */}
      <div className="space-y-4">
        {segments.map((segment) => (
          <div key={segment.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full shadow-lg"
                  style={{ backgroundColor: segment.color }}
                />
                <span className="text-black/80 text-sm font-medium">
                  {segment.label}
                </span>
              </div>
              <span className="text-black font-bold text-sm">
                {Math.round(segment.value)}%
              </span>
            </div>

            <input
              type="range"
              min={0}
              max={total}
              value={segment.value}
              onChange={(e) =>
                handleSliderChange(segment.id, Number(e.target.value))
              }
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, ${segment.color} ${(segment.value / total) * 100}%, rgba(255,255,255,0.1) ${(segment.value / total) * 100}%)`,
              }}
            />
          </div>
        ))}
      </div>

      {/* Total indicator */}
      {!autoBalance && (
        <div className="text-center">
          <span
            className={`text-sm font-medium ${Math.abs(currentTotal - total) < 1 ? "text-green-400" : "text-amber-400"}`}
          >
            Total: {Math.round(currentTotal)}% / {total}%
          </span>
        </div>
      )}
    </div>
  );
}
