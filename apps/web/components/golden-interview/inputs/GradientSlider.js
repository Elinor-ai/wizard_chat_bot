"use client";

/**
 * GradientSlider - Slider with gradient track revealing sub-options based on value ranges
 * @param {Object} props
 * @param {number} props.value - Current slider value
 * @param {function} props.onChange - Callback with new value
 * @param {Object} props.subValue - Sub-option values object
 * @param {function} props.onSubChange - Callback for sub-option changes
 * @param {number} [props.min=0] - Minimum value
 * @param {number} [props.max=100] - Maximum value
 * @param {Array<{min: number, max: number, label: string, color: string, subOptions?: Array}>} props.ranges
 * @param {string} [props.leftLabel] - Left end label
 * @param {string} [props.rightLabel] - Right end label
 * @param {string} [props.title] - Title text
 */
export default function GradientSlider({
  value,
  onChange,
  subValue = {},
  onSubChange,
  min = 0,
  max = 100,
  ranges = [
    {
      min: 0,
      max: 20,
      label: "Fully Remote",
      color: "#22c55e",
      subOptions: []
    },
    {
      min: 20,
      max: 40,
      label: "Mostly Remote",
      color: "#84cc16",
      subOptions: [
        { id: "daysInOffice", label: "Days in office/month", type: "number", max: 4 }
      ]
    },
    {
      min: 40,
      max: 60,
      label: "Hybrid",
      color: "#eab308",
      subOptions: [
        { id: "daysInOffice", label: "Days in office/week", type: "number", max: 3 }
      ]
    },
    {
      min: 60,
      max: 80,
      label: "Mostly On-site",
      color: "#f97316",
      subOptions: [
        { id: "remoteDays", label: "Remote days/week", type: "number", max: 2 }
      ]
    },
    {
      min: 80,
      max: 100,
      label: "Fully On-site",
      color: "#ef4444",
      subOptions: []
    }
  ],
  leftLabel = "Remote",
  rightLabel = "On-site",
  title
}) {
  const currentRange = ranges.find((r) => value >= r.min && value < r.max) || ranges[ranges.length - 1];
  const percentage = ((value - min) / (max - min)) * 100;

  // Build gradient from ranges
  const gradientStops = ranges
    .map((r) => `${r.color} ${r.min}%, ${r.color} ${r.max}%`)
    .join(", ");

  const handleSubOptionChange = (optionId, newValue) => {
    onSubChange?.({ ...subValue, [optionId]: newValue });
  };

  return (
    <div className="w-full space-y-4">
      {title && (
        <h3 className="text-lg font-semibold text-slate-800 text-center">{title}</h3>
      )}

      {/* Current value label */}
      <div className="text-center">
        <span
          className="inline-block px-4 py-2 rounded-full text-white font-semibold text-sm transition-all"
          style={{ backgroundColor: currentRange.color }}
        >
          {currentRange.label}
        </span>
      </div>

      {/* Slider container */}
      <div className="relative pt-2 pb-6">
        {/* Track background with gradient */}
        <div
          className="absolute top-2 left-0 right-0 h-4 rounded-full"
          style={{
            background: `linear-gradient(to right, ${gradientStops})`
          }}
        />

        {/* Track overlay for unfilled portion */}
        <div
          className="absolute top-2 right-0 h-4 rounded-r-full bg-black/40"
          style={{ width: `${100 - percentage}%` }}
        />

        {/* Glow effect at current position */}
        <div
          className="absolute top-0 w-8 h-8 rounded-full transition-all pointer-events-none"
          style={{
            left: `calc(${percentage}% - 16px)`,
            backgroundColor: currentRange.color,
            filter: "blur(12px)",
            opacity: 0.6
          }}
        />

        {/* Actual slider input */}
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="relative w-full h-4 appearance-none bg-transparent cursor-pointer z-10"
          style={{
            WebkitAppearance: "none"
          }}
        />

        {/* Labels */}
        <div className="absolute -bottom-1 left-0 right-0 flex justify-between text-xs text-slate-500">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      </div>

      {/* Range markers */}
      <div className="flex justify-between px-1">
        {ranges.map((range, index) => (
          <div
            key={index}
            className="flex flex-col items-center"
            style={{ width: `${range.max - range.min}%` }}
          >
            <div
              className="w-2 h-2 rounded-full mb-1"
              style={{ backgroundColor: range.color }}
            />
            <span className="text-[10px] text-slate-400 text-center leading-tight">
              {range.label}
            </span>
          </div>
        ))}
      </div>

      {/* Sub-options panel */}
      {currentRange.subOptions && currentRange.subOptions.length > 0 && (
        <div
          className="mt-4 p-4 rounded-xl border transition-all"
          style={{
            backgroundColor: `${currentRange.color}15`,
            borderColor: `${currentRange.color}40`
          }}
        >
          <div className="text-slate-500 text-xs mb-3 uppercase tracking-wide">
            Additional Details
          </div>
          {currentRange.subOptions.map((option) => (
            <div key={option.id} className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">{option.label}</span>
                <span className="text-slate-800 font-bold">
                  {subValue[option.id] || 0}
                </span>
              </div>

              {option.type === "number" && (
                <div className="flex gap-2">
                  {Array.from({ length: option.max + 1 }, (_, i) => i).map(
                    (num) => (
                      <button
                        key={num}
                        onClick={() => handleSubOptionChange(option.id, num)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                          subValue[option.id] === num
                            ? "text-white shadow-lg"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                        style={{
                          backgroundColor:
                            subValue[option.id] === num
                              ? currentRange.color
                              : undefined
                        }}
                      >
                        {num}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow:
            0 0 10px rgba(0, 0, 0, 0.3),
            0 0 20px ${currentRange.color}80;
          border: 2px solid ${currentRange.color};
          transition: transform 0.15s;
        }

        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.1);
        }

        input[type="range"]::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow:
            0 0 10px rgba(0, 0, 0, 0.3),
            0 0 20px ${currentRange.color}80;
          border: 2px solid ${currentRange.color};
        }
      `}</style>
    </div>
  );
}
