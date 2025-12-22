"use client";

import { useRef, useState, useEffect } from "react";

export default function LinearSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label, // Not used in component layout but passed by LLM
  unit = "",
  prefix = ""
}) {
  const trackRef = useRef(null);

  // Normalization
  const isRange = typeof value === "object" && value !== null && "min" in value;
  const currentMin = isRange ? value.min : min; // For single value, bar starts at 0 (or min)
  const currentMax = isRange ? value.max : value;

  const getPercent = (v) => ((v - min) / (max - min)) * 100;

  const handleInteraction = (clientX, rect) => {
      const pct = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      const raw = min + pct * (max - min);
      return Math.round(raw / step) * step;
  };

  const handleMouseDown = (e, thumbType) => {
      e.preventDefault();
      e.stopPropagation();

      const move = (ev) => {
          const rect = trackRef.current.getBoundingClientRect();
          const newVal = handleInteraction(ev.clientX, rect);

          if (!isRange) {
             onChange(newVal);
             return;
          }

          if (thumbType === 'min') onChange({ ...value, min: Math.min(newVal, value.max) });
          else onChange({ ...value, max: Math.max(newVal, value.min) });
      };

      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', () => window.removeEventListener('mousemove', move), { once: true });
  };

  const handleTrackClick = (e) => {
      if (!isRange) {
          const rect = trackRef.current.getBoundingClientRect();
          onChange(handleInteraction(e.clientX, rect));
          return;
      }

      const rect = trackRef.current.getBoundingClientRect();
      const clickVal = handleInteraction(e.clientX, rect);

      if (Math.abs(clickVal - value.min) < Math.abs(clickVal - value.max)) {
          onChange({ ...value, min: Math.min(clickVal, value.max) });
      } else {
          onChange({ ...value, max: Math.max(clickVal, value.min) });
      }
  }

  return (
      <div className="w-full py-8 group select-none">
          <div
              ref={trackRef}
              className="relative h-3 bg-slate-100 rounded-full cursor-pointer shadow-inner"
              onMouseDown={handleTrackClick}
          >
              {/* Active Bar */}
              <div
                  className="absolute h-full rounded-full bg-gradient-to-r from-indigo-500 to-pink-500 shadow-glow-brand transition-all duration-75"
                  style={{
                      left: `${getPercent(currentMin)}%`,
                      width: `${getPercent(currentMax) - getPercent(currentMin)}%`
                  }}
              />

              {/* Thumbs */}
              {(isRange ? ['min', 'max'] : ['single']).map(key => {
                  const val = key === 'min' ? currentMin : currentMax;
                  return (
                    <div
                        key={key}
                        onMouseDown={(e) => handleMouseDown(e, key)}
                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 z-10 cursor-grab active:cursor-grabbing hover:scale-110 transition-transform"
                        style={{ left: `${getPercent(val)}%` }}
                    >
                        <div className="w-full h-full bg-white border border-slate-200 rounded-full shadow-lg flex items-center justify-center">
                            <div className={`w-2.5 h-2.5 rounded-full ${key === 'min' ? 'bg-indigo-500' : 'bg-pink-500'}`}></div>
                        </div>

                        {/* Tooltip */}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs font-bold py-1 px-2.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-xl pointer-events-none transform translate-y-2 group-hover:translate-y-0">
                            {prefix}{val.toLocaleString()}{unit}
                            <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
                        </div>
                    </div>
                  )
              })}
          </div>
          <div className="mt-4 flex justify-between text-xs font-semibold text-slate-400">
              <span>{prefix}{min.toLocaleString()}{unit}</span>
              <span>{prefix}{max.toLocaleString()}{unit}</span>
          </div>
      </div>
  );
}
