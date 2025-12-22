"use client";

import { useCallback, useRef, useState, useEffect, useMemo } from "react";

export default function CircularGauge({
  value: propValue,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  unit = "",
  prefix = "",
  size = 300
}) {
  // Default value to min if not provided
  const value = propValue ?? min;
  const svgRef = useRef(null);
  const [activeThumb, setActiveThumb] = useState(null);

  // Internal normalization: Ensure value is object for range logic, or handle single number
  const isRange = typeof value === "object" && value !== null && "min" in value;
  const currentMin = isRange ? value.min : value;
  const currentMax = isRange ? value.max : value;

  // Geometry
  const strokeWidth = size * 0.05;
  const radius = (size / 2) - 40;
  const center = size / 2;

  const valueToAngle = useCallback((val) => {
      const clamped = Math.min(Math.max(val, min), max);
      return 135 + ((clamped - min) / (max - min)) * 270;
  }, [min, max]);

  const angleToValue = useCallback((angle) => {
      let relative = angle - 135;
      if (relative < 0) relative += 360;
      const pct = Math.min(Math.max(relative / 270, 0), 1);
      const raw = min + pct * (max - min);
      return Math.round(raw / step) * step;
  }, [min, max, step]);

  const describeArc = (startVal, endVal, r) => {
      const start = valueToAngle(startVal) * Math.PI / 180;
      const end = valueToAngle(endVal) * Math.PI / 180;
      const x1 = center + r * Math.cos(start), y1 = center + r * Math.sin(start);
      const x2 = center + r * Math.cos(end), y2 = center + r * Math.sin(end);
      const large = (end - start) * 180 / Math.PI <= 180 ? "0" : "1";
      return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  const handleInteraction = (e) => {
      if (!svgRef.current) return min;
      const rect = svgRef.current.getBoundingClientRect();
      let angle = Math.atan2(e.clientY - rect.top - center, e.clientX - rect.left - center) * 180 / Math.PI;
      if (angle < 0) angle += 360;
      if (angle < 90) angle += 360;
      return angleToValue(angle);
  };

  const handleMouseDown = (e) => {
      e.preventDefault();
      const val = handleInteraction(e);

      let mode = 'single';
      if (isRange) {
        if (Math.abs(val - currentMin) < Math.abs(val - currentMax)) mode = 'min';
        else mode = 'max';
      }

      setActiveThumb(mode);

      const update = (newVal) => {
        if (!isRange) {
           onChange(newVal);
        } else if (mode === 'min') {
           onChange({ ...value, min: Math.min(newVal, value.max) });
        } else if (mode === 'max') {
           onChange({ ...value, max: Math.max(newVal, value.min) });
        }
      };

      // Update immediately on click
      update(val);

      const move = (ev) => {
          const newVal = handleInteraction(ev);
          update(newVal);
      };

      const up = () => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
          setActiveThumb(null);
      };

      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
  };

  return (
      <div className="relative group flex justify-center select-none">
          <svg
              ref={svgRef}
              width={size}
              height={size}
              className="relative z-10 cursor-pointer touch-none"
              onMouseDown={handleMouseDown}
          >
              <defs>
                  <linearGradient id="vibrantGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#ec4899" />
                  </linearGradient>
                  <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                      <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#6366f1" floodOpacity="0.2"/>
                  </filter>
              </defs>

              {/* Track Background */}
              <path d={describeArc(min, max, radius)} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} strokeLinecap="round" />

              {/* Ticks */}
              {Array.from({ length: 40 }).map((_, i) => {
                  const val = min + (i / 40) * (max - min);
                  const deg = valueToAngle(val);
                  const rad = deg * Math.PI / 180;
                  const r1 = radius + 22;
                  const r2 = radius + 28;
                  const active = val >= currentMin && val <= currentMax;
                  return (
                      <line
                          key={i}
                          x1={center + r1 * Math.cos(rad)} y1={center + r1 * Math.sin(rad)}
                          x2={center + r2 * Math.cos(rad)} y2={center + r2 * Math.sin(rad)}
                          stroke={ active ? "#6366f1" : "#cbd5e1"}
                          strokeWidth={active ? 2 : 1}
                          className="transition-colors duration-300"
                      />
                  )
              })}

              {/* Active Arc */}
              <path
                  d={describeArc(currentMin, currentMax, radius)}
                  fill="none"
                  stroke="url(#vibrantGrad)"
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  filter="url(#shadow)"
                  className="transition-all duration-75"
              />

              {/* Knobs */}
              {(isRange ? ['min', 'max'] : ['single']).map((k) => {
                  const val = k === 'min' ? currentMin : (k === 'max' ? currentMax : value);
                  const deg = valueToAngle(val);
                  const rad = deg * Math.PI / 180;
                  const kx = center + radius * Math.cos(rad);
                  const ky = center + radius * Math.sin(rad);

                  return (
                      <g key={k} className="transition-transform duration-100 ease-out cursor-grab active:cursor-grabbing">
                          <circle cx={kx} cy={ky} r={14} fill="white" stroke="#e2e8f0" strokeWidth="1" className="shadow-lg" />
                          <circle cx={kx} cy={ky} r={6} fill={k === 'min' || k === 'single' ? '#6366f1' : '#ec4899'} />

                          {/* Label */}
                          <g className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                              <rect
                                  x={center + (radius - 50) * Math.cos(rad) - 20}
                                  y={center + (radius - 50) * Math.sin(rad) - 10}
                                  width="40" height="20" rx="4"
                                  fill="#1e293b"
                              />
                              <text
                                  x={center + (radius - 50) * Math.cos(rad)}
                                  y={center + (radius - 50) * Math.sin(rad)}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  fill="white"
                                  fontSize="10"
                                  fontWeight="bold"
                              >
                                  {prefix}{val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}
                              </text>
                          </g>
                      </g>
                  )
              })}

              {/* Center Text */}
              <foreignObject x={center - 80} y={center - 40} width={160} height={80} className="pointer-events-none">
                  <div className="flex flex-col items-center justify-center h-full text-center">
                      <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">{label}</div>
                      <div className="text-2xl font-black text-slate-800 tracking-tight">
                          {isRange ? (
                            <>{prefix}{currentMin.toLocaleString()} <span className="text-slate-300 mx-1">/</span> {prefix}{currentMax.toLocaleString()}</>
                          ) : (
                            <>{prefix}{value.toLocaleString()}{unit}</>
                          )}
                      </div>
                  </div>
              </foreignObject>
          </svg>
      </div>
  );
}
