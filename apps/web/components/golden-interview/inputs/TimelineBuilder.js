"use client";

/**
 * TimelineBuilder - Vertical timeline with input boxes at each point
 * @param {Object} props
 * @param {Array<{id: string, label: string, sublabel?: string}>} props.points - Timeline points
 * @param {Object} props.value - { [pointId]: string }
 * @param {function} props.onChange - Callback with updated value
 * @param {string} [props.title] - Title text
 * @param {string} [props.placeholder="What happened here..."] - Input placeholder
 * @param {string} [props.accentColor="#8b5cf6"] - Accent color
 * @param {boolean} [props.reversed=false] - Reverse timeline direction
 */
export default function TimelineBuilder({
  points,
  value = {},
  onChange,
  title,
  placeholder = "What happened here...",
  accentColor = "#8b5cf6",
  reversed = false
}) {
  const handlePointChange = (pointId, text) => {
    onChange({
      ...value,
      [pointId]: text
    });
  };

  const displayPoints = reversed ? [...points].reverse() : points;
  const filledCount = Object.values(value).filter((v) => v?.trim()).length;

  return (
    <div className="w-full space-y-4">
      {title && (
        <h3 className="text-lg font-semibold text-slate-800 text-center">{title}</h3>
      )}

      {/* Progress indicator */}
      <div className="text-center">
        <span
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm"
          style={{
            backgroundColor: `${accentColor}20`,
            color: accentColor
          }}
        >
          {filledCount} / {points.length} completed
        </span>
      </div>

      {/* Timeline */}
      <div className="relative pl-8">
        {/* Vertical line */}
        <div
          className="absolute left-3 top-0 bottom-0 w-0.5 rounded-full"
          style={{
            background: `linear-gradient(to bottom, ${accentColor}, ${accentColor}30)`
          }}
        />

        {/* Timeline points */}
        <div className="space-y-6">
          {displayPoints.map((point, index) => {
            const hasContent = value[point.id]?.trim();
            const isFirst = index === 0;
            const isLast = index === displayPoints.length - 1;

            return (
              <div key={point.id} className="relative">
                {/* Node dot */}
                <div
                  className={`absolute -left-5 top-4 w-4 h-4 rounded-full border-2 transition-all ${
                    hasContent ? "scale-100" : "scale-90"
                  }`}
                  style={{
                    backgroundColor: hasContent ? accentColor : "transparent",
                    borderColor: accentColor,
                    boxShadow: hasContent
                      ? `0 0 10px ${accentColor}60`
                      : undefined
                  }}
                >
                  {hasContent && (
                    <div className="absolute inset-0 rounded-full bg-white/30" />
                  )}
                </div>

                {/* Content card */}
                <div
                  className={`ml-4 p-4 rounded-xl border transition-all ${
                    hasContent
                      ? "bg-white"
                      : "bg-slate-50"
                  }`}
                  style={{
                    borderColor: hasContent
                      ? `${accentColor}40`
                      : "#e2e8f0"
                  }}
                >
                  {/* Time label */}
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: hasContent ? accentColor : "#334155" }}
                    >
                      {point.label}
                    </span>
                    {point.sublabel && (
                      <span className="text-xs text-slate-400">
                        {point.sublabel}
                      </span>
                    )}
                  </div>

                  {/* Input */}
                  <textarea
                    value={value[point.id] || ""}
                    onChange={(e) => handlePointChange(point.id, e.target.value)}
                    placeholder={placeholder}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100 resize-none"
                  />

                  {/* Character count */}
                  {value[point.id]?.length > 0 && (
                    <div className="text-right mt-1">
                      <span className="text-xs text-slate-400">
                        {value[point.id].length} characters
                      </span>
                    </div>
                  )}
                </div>

                {/* Connector arrows */}
                {!isLast && (
                  <div
                    className="absolute -left-3 top-12"
                    style={{ color: `${accentColor}40` }}
                  >
                    ↓
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      {filledCount > 0 && (
        <div className="pt-4 border-t border-slate-200">
          <div className="text-slate-400 text-xs uppercase tracking-wide mb-3">
            Timeline Summary
          </div>
          <div className="space-y-2">
            {displayPoints
              .filter((point) => value[point.id]?.trim())
              .map((point) => (
                <div
                  key={point.id}
                  className="flex gap-3 text-sm"
                >
                  <span
                    className="font-medium flex-shrink-0"
                    style={{ color: accentColor }}
                  >
                    {point.label}:
                  </span>
                  <span className="text-slate-600 line-clamp-1">
                    {value[point.id]}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onChange({})}
          disabled={filledCount === 0}
          className="flex-1 py-2 rounded-lg bg-slate-100 text-slate-500 text-sm hover:bg-slate-200 disabled:opacity-30 transition-colors"
        >
          Clear All
        </button>
      </div>
    </div>
  );
}
