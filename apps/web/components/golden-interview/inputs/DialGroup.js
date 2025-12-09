"use client";

/**
 * DialGroup - Series of range inputs that calculate and display an average score
 * @param {Object} props
 * @param {Array<{id: string, label: string, value: number, icon?: string, description?: string}>} props.dials
 * @param {function} props.onChange - Callback with updated dials array
 * @param {number} [props.min=0] - Minimum value
 * @param {number} [props.max=100] - Maximum value
 * @param {string} [props.title] - Title text
 * @param {Array<{min: number, max: number, label: string, color: string}>} [props.scoreRanges] - Score interpretation ranges
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
    { min: 75, max: 100, label: "Excellent", color: "#22c55e" }
  ]
}) {
  const average = Math.round(
    dials.reduce((sum, d) => sum + d.value, 0) / dials.length
  );

  const currentScoreRange =
    scoreRanges.find((r) => average >= r.min && average < r.max) ||
    scoreRanges[scoreRanges.length - 1];

  const handleDialChange = (dialId, newValue) => {
    const updatedDials = dials.map((dial) =>
      dial.id === dialId ? { ...dial, value: newValue } : dial
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
        <h3 className="text-lg font-semibold text-white text-center">{title}</h3>
      )}

      {/* Average Score Display */}
      <div className="relative flex justify-center">
        <div className="relative">
          {/* Circular background */}
          <svg width="140" height="140" className="transform -rotate-90">
            {/* Background circle */}
            <circle
              cx="70"
              cy="70"
              r="60"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="12"
            />
            {/* Progress arc */}
            <circle
              cx="70"
              cy="70"
              r="60"
              fill="none"
              stroke={currentScoreRange.color}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${(average / max) * 377} 377`}
              className="transition-all duration-500"
              style={{
                filter: `drop-shadow(0 0 10px ${currentScoreRange.color}60)`
              }}
            />
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-4xl font-bold transition-colors duration-300"
              style={{ color: currentScoreRange.color }}
            >
              {average}
            </span>
            <span className="text-white/50 text-xs">
              {currentScoreRange.label}
            </span>
          </div>
        </div>
      </div>

      {/* Individual Dials */}
      <div className="space-y-4">
        {dials.map((dial) => {
          const dialColor = getDialColor(dial.value);
          const percentage = ((dial.value - min) / (max - min)) * 100;

          return (
            <div
              key={dial.id}
              className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {dial.icon && <span className="text-xl">{dial.icon}</span>}
                  <div>
                    <div className="text-white font-medium">{dial.label}</div>
                    {dial.description && (
                      <div className="text-white/40 text-xs">
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

              {/* Slider */}
              <div className="relative">
                <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${percentage}%`,
                      background: `linear-gradient(to right, ${dialColor}80, ${dialColor})`
                    }}
                  />
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={dial.value}
                  onChange={(e) =>
                    handleDialChange(dial.id, Number(e.target.value))
                  }
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>

              {/* Scale markers */}
              <div className="flex justify-between text-[10px] text-white/30">
                <span>{min}</span>
                <span>{Math.round((max - min) / 4)}</span>
                <span>{Math.round((max - min) / 2)}</span>
                <span>{Math.round(((max - min) * 3) / 4)}</span>
                <span>{max}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Score Legend */}
      <div className="flex justify-center gap-4 pt-4">
        {scoreRanges.map((range) => (
          <div key={range.label} className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: range.color }}
            />
            <span className="text-xs text-white/50">{range.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
