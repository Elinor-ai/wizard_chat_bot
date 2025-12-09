"use client";

import { useState, useCallback } from "react";

/**
 * WeekScheduler - 7-day grid with hour slots supporting drag-to-paint selection
 * @param {Object} props
 * @param {Object} props.value - { [day-hour]: boolean }
 * @param {function} props.onChange - Callback with updated value
 * @param {Array<string>} [props.days] - Day labels
 * @param {number} [props.startHour=6] - First hour to show (0-23)
 * @param {number} [props.endHour=22] - Last hour to show (0-23)
 * @param {string} [props.title] - Title text
 * @param {string} [props.activeColor="#8b5cf6"] - Color for selected slots
 * @param {string} [props.activeLabel="Working"] - Label for selected state
 * @param {string} [props.inactiveLabel="Off"] - Label for unselected state
 */
export default function WeekScheduler({
  value = {},
  onChange,
  days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  startHour = 6,
  endHour = 22,
  title,
  activeColor = "#8b5cf6",
  activeLabel = "Working",
  inactiveLabel = "Off"
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState(null); // 'select' or 'deselect'
  const [dragStart, setDragStart] = useState(null);

  const hours = [];
  for (let h = startHour; h <= endHour; h++) {
    hours.push(h);
  }

  const getCellKey = (day, hour) => `${day}-${hour}`;

  const formatHour = (hour) => {
    const h = hour % 12 || 12;
    const ampm = hour < 12 ? "AM" : "PM";
    return `${h}${ampm}`;
  };

  const handleCellMouseDown = (day, hour) => {
    const key = getCellKey(day, hour);
    const isCurrentlySelected = value[key];

    setIsDragging(true);
    setDragMode(isCurrentlySelected ? "deselect" : "select");
    setDragStart({ day, hour });

    // Toggle this cell
    onChange({
      ...value,
      [key]: !isCurrentlySelected
    });
  };

  const handleCellMouseEnter = useCallback(
    (day, hour) => {
      if (!isDragging || dragMode === null) return;

      const key = getCellKey(day, hour);
      const shouldSelect = dragMode === "select";

      if (value[key] !== shouldSelect) {
        onChange({
          ...value,
          [key]: shouldSelect
        });
      }
    },
    [isDragging, dragMode, value, onChange]
  );

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragMode(null);
    setDragStart(null);
  };

  // Calculate statistics
  const totalSlots = days.length * hours.length;
  const selectedSlots = Object.values(value).filter(Boolean).length;
  const hoursPerWeek = selectedSlots;

  // Count per day
  const getHoursPerDay = (day) => {
    return hours.filter((hour) => value[getCellKey(day, hour)]).length;
  };

  return (
    <div
      className="w-full space-y-4 select-none"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {title && (
        <h3 className="text-lg font-semibold text-white text-center">{title}</h3>
      )}

      {/* Summary */}
      <div
        className="p-4 rounded-xl text-center"
        style={{
          background: `linear-gradient(135deg, ${activeColor}20, ${activeColor}05)`,
          border: `1px solid ${activeColor}30`
        }}
      >
        <div className="text-white/60 text-sm">Weekly Hours</div>
        <div className="text-3xl font-bold" style={{ color: activeColor }}>
          {hoursPerWeek}
        </div>
        <div className="text-white/40 text-xs">
          {((selectedSlots / totalSlots) * 100).toFixed(0)}% of available slots
        </div>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-6">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded"
            style={{ backgroundColor: activeColor }}
          />
          <span className="text-xs text-white/60">{activeLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-white/5 border border-white/10" />
          <span className="text-xs text-white/60">{inactiveLabel}</span>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto pb-2">
        <div className="inline-block min-w-full">
          {/* Day headers */}
          <div className="flex mb-1">
            <div className="w-14 flex-shrink-0" />
            {days.map((day) => (
              <div
                key={day}
                className="flex-1 min-w-12 text-center text-xs font-medium text-white/70"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Hours per day */}
          <div className="flex mb-2">
            <div className="w-14 flex-shrink-0" />
            {days.map((day) => {
              const dayHours = getHoursPerDay(day);
              return (
                <div
                  key={day}
                  className="flex-1 min-w-12 text-center text-[10px] text-white/40"
                >
                  {dayHours}h
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="space-y-0.5">
            {hours.map((hour) => (
              <div key={hour} className="flex items-center gap-0.5">
                {/* Hour label */}
                <div className="w-14 flex-shrink-0 text-xs text-white/40 text-right pr-2">
                  {formatHour(hour)}
                </div>

                {/* Day cells */}
                {days.map((day) => {
                  const key = getCellKey(day, hour);
                  const isSelected = value[key];

                  return (
                    <button
                      key={day}
                      onMouseDown={() => handleCellMouseDown(day, hour)}
                      onMouseEnter={() => handleCellMouseEnter(day, hour)}
                      className={`flex-1 min-w-12 h-6 rounded transition-all duration-100 ${
                        isSelected
                          ? "border-transparent"
                          : "bg-white/5 border border-white/10 hover:bg-white/10"
                      }`}
                      style={{
                        backgroundColor: isSelected ? activeColor : undefined,
                        boxShadow: isSelected
                          ? `0 0 8px ${activeColor}50`
                          : undefined
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onChange({})}
          className="flex-1 py-2 rounded-lg bg-white/5 text-white/50 text-sm hover:bg-white/10 transition-colors"
        >
          Clear All
        </button>
        <button
          onClick={() => {
            const weekdays = {};
            days.slice(0, 5).forEach((day) => {
              for (let h = 9; h <= 17; h++) {
                weekdays[getCellKey(day, h)] = true;
              }
            });
            onChange(weekdays);
          }}
          className="flex-1 py-2 rounded-lg bg-white/5 text-white/50 text-sm hover:bg-white/10 transition-colors"
        >
          9-5 Weekdays
        </button>
        <button
          onClick={() => {
            const all = {};
            days.forEach((day) => {
              hours.forEach((hour) => {
                all[getCellKey(day, hour)] = true;
              });
            });
            onChange(all);
          }}
          className="flex-1 py-2 rounded-lg text-white text-sm hover:opacity-90 transition-colors"
          style={{ backgroundColor: `${activeColor}50` }}
        >
          Select All
        </button>
      </div>

      {/* Per-day breakdown */}
      <div className="pt-4 border-t border-white/10">
        <div className="text-white/50 text-xs uppercase tracking-wide mb-2">
          Hours by Day
        </div>
        <div className="flex gap-1">
          {days.map((day) => {
            const dayHours = getHoursPerDay(day);
            const maxPossible = hours.length;
            const percentage = (dayHours / maxPossible) * 100;

            return (
              <div key={day} className="flex-1 text-center">
                <div className="h-16 bg-white/5 rounded overflow-hidden relative">
                  <div
                    className="absolute bottom-0 left-0 right-0 transition-all duration-300"
                    style={{
                      height: `${percentage}%`,
                      backgroundColor: dayHours > 0 ? activeColor : "transparent"
                    }}
                  />
                </div>
                <div className="mt-1 text-xs text-white/40">{day}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
