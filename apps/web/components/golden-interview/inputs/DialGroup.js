"use client";

import DynamicIcon from "./DynamicIcon";

/**
 * DialGroup - Series of range inputs that calculate and display an average score
 */
export default function DialGroup({
  dials,
  onChange,
  min = 0,
  max = 100,
  title,
  scoreRanges = [
    { min: 0, max: 25, label: "Low", color: "#ef4444" },
    { min: 25, max: 50, label: "Moderate", color: "#f97316" },
    { min: 50, max: 75, label: "Good", color: "#eab308" },
    { min: 75, max: 100, label: "Excellent", color: "#22c55e" },
  ],
}) {
  // 1. Safety Check: Default to empty array
  const safeDials = dials || [];

  const average =
    safeDials.length > 0
      ? Math.round(
          safeDials.reduce((sum, d) => sum + d.value, 0) / safeDials.length
        )
      : 0;

  const currentScoreRange =
    scoreRanges.find((r) => average >= r.min && average < r.max) ||
    scoreRanges[scoreRanges.length - 1];

  // 2. Interaction Fix: Update by INDEX to avoid ID collisions
  const handleDialChange = (indexToUpdate, newValue) => {
    const updatedDials = safeDials.map((dial, i) =>
      i === indexToUpdate ? { ...dial, value: newValue } : dial
    );
    onChange(updatedDials);
  };

  const getDialColor = (value) => {
    const range = scoreRanges.find((r) => value >= r.min && value < r.max);
    return range?.color || scoreRanges[scoreRanges.length - 1].color;
  };

  return (
    <div className="w-full space-y-6">
      {title && (
        <h3 className="text-lg font-semibold text-slate-800 text-center">
          {title}
        </h3>
      )}

      {/* Average Score Display */}
      <div className="relative flex justify-center">
        <div className="relative">
          <svg width="140" height="140" className="transform -rotate-90">
            <circle
              cx="70"
              cy="70"
              r="60"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="12"
            />
            <circle
              cx="70"
              cy="70"
              r="60"
              fill="none"
              stroke={currentScoreRange.color}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${(average / 100) * 377} 377`}
              className="transition-all duration-500"
              style={{
                filter: `drop-shadow(0 0 4px ${currentScoreRange.color}40)`,
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-4xl font-bold transition-colors duration-300"
              style={{ color: currentScoreRange.color }}
            >
              {average}
            </span>
            <span className="text-slate-500 text-xs">
              {currentScoreRange.label}
            </span>
          </div>
        </div>
      </div>

      {/* Individual Dials */}
      <div className="space-y-4">
        {safeDials.map((dial, index) => {
          const dialColor = getDialColor(dial.value);
          const effectiveMin = dial.min !== undefined ? dial.min : min;
          const effectiveMax = dial.max !== undefined ? dial.max : max;
          const percentage =
            ((dial.value - effectiveMin) / (effectiveMax - effectiveMin)) * 100;

          // 3. Key Fix: Use ID if present, fallback to index to prevent React key collision
          const uniqueKey = dial.id || `dial-${index}`;

          return (
            <div
              key={uniqueKey}
              className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {dial.icon && (
                    <div className="text-slate-500">
                      <DynamicIcon name={dial.icon} size={24} />
                    </div>
                  )}
                  <div>
                    <div className="text-slate-900 font-medium">
                      {dial.label}
                    </div>
                    {dial.description && (
                      <div className="text-slate-500 text-xs">
                        {dial.description}
                      </div>
                    )}
                  </div>
                </div>
                <div
                  className="text-xl font-bold transition-colors"
                  style={{ color: dialColor }}
                >
                  {dial.value}
                </div>
              </div>

              {/* Slider Container */}
              <div className="relative h-6 flex items-center group">
                {/* Track */}
                <div className="absolute inset-0 h-2 my-auto rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${percentage}%`,
                      background: `linear-gradient(to right, ${dialColor}80, ${dialColor})`,
                    }}
                  />
                </div>

                {/* Visual Thumb Handle */}
                <div
                  className="absolute h-6 w-6 rounded-full bg-white border-2 shadow-md z-10 pointer-events-none transition-all duration-100 ease-out"
                  style={{
                    left: `calc(${percentage}% - 12px)`,
                    borderColor: dialColor,
                  }}
                />

                {/* Invisible Input for Interaction */}
                <input
                  type="range"
                  min={effectiveMin}
                  max={effectiveMax}
                  value={dial.value}
                  // 2. Interaction Fix: Pass INDEX
                  onChange={(e) =>
                    handleDialChange(index, Number(e.target.value))
                  }
                  // 4. Hit-Box Fix: Full styling for cross-browser compatibility
                  className="absolute inset-0 w-full cursor-pointer z-20 m-0 p-0"
                  style={{
                    height: "100%",
                    opacity: 0,
                    WebkitAppearance: "none",
                    MozAppearance: "none",
                    appearance: "none",
                    touchAction: "none",
                  }}
                />
              </div>

              {/* Scale markers */}
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>{effectiveMin}</span>
                <span>
                  {Math.round(effectiveMin + (effectiveMax - effectiveMin) / 2)}
                </span>
                <span>{effectiveMax}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
