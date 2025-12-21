"use client";

/**
 * HeatMapGrid - Grid of cells that cycle through colors on click
 * @param {Object} props
 * @param {Array<string>} props.rows - Row labels (e.g., hours, categories)
 * @param {Array<string>} props.columns - Column labels (e.g., days, months)
 * @param {Object} props.value - { [row-col]: stateIndex }
 * @param {function} props.onChange - Callback with updated value
 * @param {Array<{value: number, label: string, color: string}>} [props.states] - Cell states to cycle through
 * @param {string} [props.title] - Title text
 * @param {string} [props.rowLabel] - Label for rows axis
 * @param {string} [props.columnLabel] - Label for columns axis
 */
export default function HeatMapGrid({
  rows,
  columns,
  value = {},
  onChange,
  states = [
    { value: 0, label: "None", color: "rgba(255,255,255,0.05)" },
    { value: 1, label: "Low", color: "#22c55e" },
    { value: 2, label: "Medium", color: "#eab308" },
    { value: 3, label: "High", color: "#ef4444" }
  ],
  title,
  rowLabel,
  columnLabel
}) {
  const getCellKey = (row, col) => `${row}-${col}`;

  const handleCellClick = (row, col) => {
    const key = getCellKey(row, col);
    const currentState = value[key] || 0;
    const nextState = (currentState + 1) % states.length;

    onChange({
      ...value,
      [key]: nextState
    });
  };

  const getCellState = (row, col) => {
    const key = getCellKey(row, col);
    const stateIndex = value[key] || 0;
    return states[stateIndex];
  };

  // Calculate statistics
  const getStatistics = () => {
    const counts = {};
    states.forEach((s) => {
      counts[s.value] = 0;
    });

    Object.values(value).forEach((stateIndex) => {
      counts[stateIndex] = (counts[stateIndex] || 0) + 1;
    });

    return counts;
  };

  const stats = getStatistics();
  const filledCells = Object.values(value).filter((v) => v > 0).length;
  const totalCells = rows.length * columns.length;

  return (
    <div className="w-full space-y-4">
      {title && (
        <h3 className="text-lg font-semibold text-slate-800 text-center">{title}</h3>
      )}

      {/* Legend */}
      <div className="flex justify-center gap-4">
        {states.map((state) => (
          <div key={state.value} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: state.color }}
            />
            <span className="text-xs text-slate-600">{state.label}</span>
          </div>
        ))}
      </div>

      {/* Grid container */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Column labels */}
          <div className="flex">
            <div className="w-20 flex-shrink-0" /> {/* Spacer for row labels */}
            {columns.map((col) => (
              <div
                key={col}
                className="flex-1 min-w-10 text-center text-xs text-slate-500 pb-2 px-0.5"
              >
                {col}
              </div>
            ))}
          </div>

          {/* Column axis label */}
          {columnLabel && (
            <div className="text-center text-xs text-slate-400 mb-2">
              {columnLabel}
            </div>
          )}

          {/* Grid rows */}
          <div className="space-y-1">
            {rows.map((row) => (
              <div key={row} className="flex items-center gap-1">
                {/* Row label */}
                <div className="w-20 flex-shrink-0 text-xs text-slate-500 text-right pr-2">
                  {row}
                </div>

                {/* Cells */}
                {columns.map((col) => {
                  const cellState = getCellState(row, col);

                  return (
                    <button
                      key={col}
                      onClick={() => handleCellClick(row, col)}
                      className="flex-1 min-w-10 aspect-square rounded transition-all duration-200 hover:scale-110 hover:z-10 relative group"
                      style={{
                        backgroundColor: cellState.color,
                        boxShadow:
                          cellState.value > 0
                            ? `0 0 10px ${cellState.color}50`
                            : undefined
                      }}
                    >
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                        <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap border border-white/10">
                          {row}, {col}: {cellState.label}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Row axis label */}
          {rowLabel && (
            <div className="w-20 text-center text-xs text-slate-400 mt-2">
              {rowLabel}
            </div>
          )}
        </div>
      </div>

      {/* Statistics */}
      <div className="pt-4 border-t border-slate-200">
        <div className="flex justify-between items-center mb-3">
          <span className="text-slate-500 text-sm">Coverage</span>
          <span className="text-slate-800 font-medium">
            {filledCells} / {totalCells} cells
          </span>
        </div>

        {/* Stats breakdown */}
        <div className="grid grid-cols-4 gap-2">
          {states.slice(1).map((state) => (
            <div
              key={state.value}
              className="p-3 rounded-lg text-center"
              style={{ backgroundColor: `${state.color}20` }}
            >
              <div
                className="text-2xl font-bold"
                style={{ color: state.color }}
              >
                {stats[state.value] || 0}
              </div>
              <div className="text-xs text-slate-500">{state.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onChange({})}
          className="flex-1 py-2 rounded-lg bg-slate-100 text-slate-500 text-sm hover:bg-slate-200 transition-colors"
        >
          Clear All
        </button>
        <button
          onClick={() => {
            const filled = {};
            rows.forEach((row) => {
              columns.forEach((col) => {
                filled[getCellKey(row, col)] = 1;
              });
            });
            onChange(filled);
          }}
          className="flex-1 py-2 rounded-lg bg-slate-100 text-slate-500 text-sm hover:bg-slate-200 transition-colors"
        >
          Fill Low
        </button>
      </div>
    </div>
  );
}
