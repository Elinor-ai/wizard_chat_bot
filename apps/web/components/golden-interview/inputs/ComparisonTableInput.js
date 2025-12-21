"use client";

/**
 * ComparisonTableInput - Two-column input list for comparisons
 * @param {Object} props
 * @param {Array<{id: string, label?: string}>} props.rows - Row definitions
 * @param {Object} props.value - { [rowId]: { left: string, right: string } }
 * @param {function} props.onChange - Callback with updated value
 * @param {string} [props.title] - Title text
 * @param {string} [props.leftHeader="Before"] - Left column header
 * @param {string} [props.rightHeader="After"] - Right column header
 * @param {string} [props.leftPlaceholder="Enter..."] - Left placeholder
 * @param {string} [props.rightPlaceholder="Enter..."] - Right placeholder
 * @param {string} [props.leftColor="#6366f1"] - Left column accent
 * @param {string} [props.rightColor="#22c55e"] - Right column accent
 * @param {boolean} [props.allowAddRows=false] - Allow adding custom rows
 */
export default function ComparisonTableInput({
  rows,
  value = {},
  onChange,
  title,
  leftHeader = "Expectation",
  rightHeader = "Reality",
  leftPlaceholder = "What you expected...",
  rightPlaceholder = "What actually happened...",
  leftColor = "#6366f1",
  rightColor = "#22c55e",
  allowAddRows = false
}) {
  const handleCellChange = (rowId, column, text) => {
    const currentRow = value[rowId] || { left: "", right: "" };
    onChange({
      ...value,
      [rowId]: {
        ...currentRow,
        [column]: text
      }
    });
  };

  const handleAddRow = () => {
    const newId = `custom-${Date.now()}`;
    onChange({
      ...value,
      [newId]: { left: "", right: "", isCustom: true }
    });
  };

  const handleRemoveRow = (rowId) => {
    const newValue = { ...value };
    delete newValue[rowId];
    onChange(newValue);
  };

  // Combine predefined rows with custom rows
  const allRows = [
    ...rows,
    ...Object.keys(value)
      .filter((key) => value[key]?.isCustom)
      .map((key) => ({ id: key, label: "Custom", isCustom: true }))
  ];

  const filledRowCount = allRows.filter(
    (row) => value[row.id]?.left?.trim() || value[row.id]?.right?.trim()
  ).length;

  return (
    <div className="w-full space-y-4">
      {title && (
        <h3 className="text-lg font-semibold text-slate-800 text-center">{title}</h3>
      )}

      {/* Progress */}
      <div className="text-center">
        <span className="text-slate-400 text-sm">
          {filledRowCount} / {allRows.length} rows filled
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-2 gap-px bg-slate-200">
          <div
            className="px-4 py-3 text-center font-semibold text-sm"
            style={{ backgroundColor: `${leftColor}20`, color: leftColor }}
          >
            {leftHeader}
          </div>
          <div
            className="px-4 py-3 text-center font-semibold text-sm"
            style={{ backgroundColor: `${rightColor}20`, color: rightColor }}
          >
            {rightHeader}
          </div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-slate-200">
          {allRows.map((row, index) => {
            const rowValue = value[row.id] || { left: "", right: "" };
            const hasLeft = rowValue.left?.trim();
            const hasRight = rowValue.right?.trim();

            return (
              <div key={row.id} className="relative group">
                {/* Row label */}
                {row.label && (
                  <div className="absolute left-2 top-2 z-10">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wide">
                      {row.label}
                    </span>
                  </div>
                )}

                {/* Remove button for custom rows */}
                {row.isCustom && (
                  <button
                    onClick={() => handleRemoveRow(row.id)}
                    className="absolute -right-2 -top-2 z-10 w-5 h-5 rounded-full bg-red-500 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    ×
                  </button>
                )}

                <div className="grid grid-cols-2 gap-px bg-slate-100">
                  {/* Left column */}
                  <div
                    className="p-3 transition-colors"
                    style={{
                      backgroundColor: hasLeft
                        ? `${leftColor}05`
                        : "transparent"
                    }}
                  >
                    <textarea
                      value={rowValue.left}
                      onChange={(e) =>
                        handleCellChange(row.id, "left", e.target.value)
                      }
                      placeholder={leftPlaceholder}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none resize-none transition-all"
                      style={{
                        borderColor: hasLeft ? `${leftColor}30` : undefined
                      }}
                    />
                  </div>

                  {/* Comparison arrow */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                    <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-400 text-xs">
                      →
                    </div>
                  </div>

                  {/* Right column */}
                  <div
                    className="p-3 transition-colors"
                    style={{
                      backgroundColor: hasRight
                        ? `${rightColor}05`
                        : "transparent"
                    }}
                  >
                    <textarea
                      value={rowValue.right}
                      onChange={(e) =>
                        handleCellChange(row.id, "right", e.target.value)
                      }
                      placeholder={rightPlaceholder}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none resize-none transition-all"
                      style={{
                        borderColor: hasRight ? `${rightColor}30` : undefined
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add row button */}
      {allowAddRows && (
        <button
          onClick={handleAddRow}
          className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 text-sm hover:border-slate-400 hover:text-slate-600 transition-colors"
        >
          + Add Row
        </button>
      )}

      {/* Summary */}
      {filledRowCount > 0 && (
        <div className="pt-4 border-t border-slate-200">
          <div className="text-slate-400 text-xs uppercase tracking-wide mb-3">
            Comparison Summary
          </div>
          <div className="space-y-3">
            {allRows
              .filter(
                (row) =>
                  value[row.id]?.left?.trim() || value[row.id]?.right?.trim()
              )
              .map((row) => {
                const rowValue = value[row.id];
                return (
                  <div
                    key={row.id}
                    className="grid grid-cols-2 gap-4 text-sm"
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                        style={{ backgroundColor: leftColor }}
                      />
                      <span className="text-slate-600 line-clamp-2">
                        {rowValue.left || "(empty)"}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <div
                        className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                        style={{ backgroundColor: rightColor }}
                      />
                      <span className="text-slate-600 line-clamp-2">
                        {rowValue.right || "(empty)"}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Clear all */}
      {filledRowCount > 0 && (
        <button
          onClick={() => onChange({})}
          className="w-full py-2 text-slate-400 text-sm hover:text-slate-600 transition-colors"
        >
          Clear all entries
        </button>
      )}
    </div>
  );
}
