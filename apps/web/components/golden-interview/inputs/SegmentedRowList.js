"use client";

/**
 * SegmentedRowList - List of rows with segmented controls
 * @param {Object} props
 * @param {Array<{id: string, label: string, icon?: React.ReactNode}>} props.rows
 * @param {Object} props.value - { [rowId]: segmentValue }
 * @param {function} props.onChange - Callback with updated value object
 * @param {Array<{value: string, label: string, color?: string}>} props.segments - Segment options
 * @param {string} [props.title] - Title text
 * @param {string} [props.defaultSegment] - Default segment value for unset rows
 */
export default function SegmentedRowList({
  rows,
  value = {},
  onChange,
  segments = [
    { value: "never", label: "Never", color: "#22c55e" },
    { value: "rare", label: "Rare", color: "#84cc16" },
    { value: "sometimes", label: "Sometimes", color: "#eab308" },
    { value: "often", label: "Often", color: "#f97316" },
    { value: "always", label: "Always", color: "#ef4444" }
  ],
  title,
  defaultSegment
}) {
  const handleSegmentChange = (rowId, segmentValue) => {
    onChange({ ...value, [rowId]: segmentValue });
  };

  const getSegmentColor = (segmentValue) => {
    const segment = segments.find((s) => s.value === segmentValue);
    return segment?.color || "#8b5cf6";
  };

  return (
    <div className="w-full space-y-4">
      {title && (
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      )}

      {/* Header row with segment labels */}
      <div className="flex items-center gap-3 pb-2 border-b border-white/10">
        <div className="flex-1" />
        <div className="flex gap-1">
          {segments.map((segment) => (
            <div
              key={segment.value}
              className="w-16 text-center text-[10px] text-white/50 uppercase tracking-wide"
            >
              {segment.label}
            </div>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {rows.map((row) => {
          const currentValue = value[row.id] || defaultSegment;

          return (
            <div
              key={row.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/8 transition-colors"
            >
              {/* Row label */}
              <div className="flex-1 flex items-center gap-2 min-w-0">
                {row.icon && <span className="text-lg">{row.icon}</span>}
                <span className="text-white/80 text-sm truncate">
                  {row.label}
                </span>
              </div>

              {/* Segmented control */}
              <div className="flex gap-1 p-1 rounded-lg bg-white/5">
                {segments.map((segment) => {
                  const isSelected = currentValue === segment.value;

                  return (
                    <button
                      key={segment.value}
                      onClick={() => handleSegmentChange(row.id, segment.value)}
                      className={`w-14 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                        isSelected
                          ? "text-white shadow-md"
                          : "text-white/40 hover:text-white/60 hover:bg-white/5"
                      }`}
                      style={{
                        backgroundColor: isSelected ? segment.color : undefined,
                        boxShadow: isSelected
                          ? `0 2px 10px ${segment.color}40`
                          : undefined
                      }}
                    >
                      {segment.label.charAt(0)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary by segment */}
      <div className="flex justify-center gap-4 pt-4 border-t border-white/10">
        {segments.map((segment) => {
          const count = Object.values(value).filter(
            (v) => v === segment.value
          ).length;

          return (
            <div
              key={segment.value}
              className="text-center"
            >
              <div
                className="text-lg font-bold"
                style={{ color: segment.color }}
              >
                {count}
              </div>
              <div className="text-[10px] text-white/40">{segment.label}</div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        {segments.map((segment) => (
          <div key={segment.value} className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            <span className="text-xs text-white/50">{segment.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
