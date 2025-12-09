"use client";

/**
 * BrandValueMeter - Vertical bar charts controlled by sliders with star rating calculation
 * @param {Object} props
 * @param {Array<{id: string, label: string, value: number, icon?: string, weight?: number}>} props.metrics
 * @param {function} props.onChange - Callback with updated metrics array
 * @param {number} [props.max=100] - Maximum value for each metric
 * @param {string} [props.title] - Title text
 * @param {number} [props.maxStars=5] - Maximum star rating
 */
export default function BrandValueMeter({
  metrics,
  onChange,
  max = 100,
  title,
  maxStars = 5
}) {
  // Calculate weighted average for star rating
  const totalWeight = metrics.reduce((sum, m) => sum + (m.weight || 1), 0);
  const weightedSum = metrics.reduce(
    (sum, m) => sum + m.value * (m.weight || 1),
    0
  );
  const averageScore = weightedSum / totalWeight;
  const starRating = (averageScore / max) * maxStars;
  const fullStars = Math.floor(starRating);
  const partialStar = starRating - fullStars;

  const handleMetricChange = (metricId, newValue) => {
    const updatedMetrics = metrics.map((metric) =>
      metric.id === metricId ? { ...metric, value: newValue } : metric
    );
    onChange(updatedMetrics);
  };

  const getBarGradient = (value) => {
    const percentage = (value / max) * 100;
    if (percentage < 25) return "from-red-500 to-red-400";
    if (percentage < 50) return "from-orange-500 to-amber-400";
    if (percentage < 75) return "from-yellow-500 to-lime-400";
    return "from-green-500 to-emerald-400";
  };

  return (
    <div className="w-full space-y-6">
      {title && (
        <h3 className="text-lg font-semibold text-white text-center">{title}</h3>
      )}

      {/* Star Rating Display */}
      <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-yellow-500/10 border border-amber-500/20">
        <div className="flex gap-1">
          {Array.from({ length: maxStars }).map((_, i) => {
            const isFilled = i < fullStars;
            const isPartial = i === fullStars && partialStar > 0;

            return (
              <div key={i} className="relative">
                {/* Background star */}
                <svg
                  className="w-8 h-8 text-white/20"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                {/* Filled star */}
                {(isFilled || isPartial) && (
                  <svg
                    className="absolute inset-0 w-8 h-8 text-amber-400"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    style={{
                      clipPath: isPartial
                        ? `inset(0 ${100 - partialStar * 100}% 0 0)`
                        : undefined
                    }}
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
        <div className="text-amber-400 font-bold text-xl">
          {starRating.toFixed(1)} / {maxStars}
        </div>
        <div className="text-white/50 text-xs">Overall Brand Value Score</div>
      </div>

      {/* Vertical Bar Chart */}
      <div className="flex justify-around items-end h-48 gap-2 px-4">
        {metrics.map((metric) => {
          const heightPercent = (metric.value / max) * 100;

          return (
            <div
              key={metric.id}
              className="flex flex-col items-center gap-2 flex-1 max-w-20"
            >
              {/* Value label */}
              <span className="text-white font-bold text-sm">
                {metric.value}
              </span>

              {/* Bar container */}
              <div className="w-full h-36 bg-white/5 rounded-t-lg rounded-b-sm overflow-hidden relative flex items-end">
                {/* Filled bar */}
                <div
                  className={`w-full bg-gradient-to-t ${getBarGradient(metric.value)} transition-all duration-300 rounded-t-lg`}
                  style={{
                    height: `${heightPercent}%`,
                    boxShadow:
                      heightPercent > 50
                        ? "0 -4px 20px rgba(34, 197, 94, 0.3)"
                        : undefined
                  }}
                />

                {/* Grid lines */}
                {[25, 50, 75].map((level) => (
                  <div
                    key={level}
                    className="absolute left-0 right-0 border-t border-white/10"
                    style={{ bottom: `${level}%` }}
                  />
                ))}
              </div>

              {/* Icon */}
              {metric.icon && (
                <span className="text-xl">{metric.icon}</span>
              )}

              {/* Label */}
              <span className="text-white/60 text-[10px] text-center leading-tight">
                {metric.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Sliders */}
      <div className="space-y-4 pt-4 border-t border-white/10">
        {metrics.map((metric) => (
          <div key={metric.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-white/70 text-sm flex items-center gap-2">
                {metric.icon && <span>{metric.icon}</span>}
                {metric.label}
                {metric.weight && metric.weight > 1 && (
                  <span className="text-xs text-white/30">
                    (×{metric.weight})
                  </span>
                )}
              </span>
              <span className="text-white font-bold text-sm">
                {metric.value}
              </span>
            </div>

            <input
              type="range"
              min={0}
              max={max}
              value={metric.value}
              onChange={(e) =>
                handleMetricChange(metric.id, Number(e.target.value))
              }
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #f59e0b ${metric.value}%, rgba(255,255,255,0.1) ${metric.value}%)`
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
