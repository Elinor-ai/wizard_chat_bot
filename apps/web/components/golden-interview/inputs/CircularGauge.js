"use client";

import { useCallback, useRef, useState, useEffect } from "react";

/**
 * CircularGauge - Production Ready
 * Expects strict schema match from LLM.
 * * @param {Object} props
 * @param {number} props.value - Current value (controlled by parent)
 * @param {function} props.onChange - Callback for value changes
 * @param {number} props.min - Minimum value
 * @param {number} props.max - Maximum value
 * @param {string} props.label - Center label (e.g., "Base Salary")
 * @param {string} props.unit - Unit suffix (e.g., "$")
 * @param {string} props.prefix - Prefix (e.g. "$")
 * @param {Array<{value: number, label: string}>} props.markers - Specific points to label on the arc
 */
export default function CircularGauge({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  unit = "",
  prefix = "",
  formatValue,
  markers = [], // <--- New Prop
  trackColor = "rgba(0,0,0,0.1)",
  progressColor = "url(#gaugeGradient)",
  size = 200,
}) {
  const svgRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const strokeWidth = size * 0.08;
  const radius = (size - strokeWidth) / 2 - 20; // Reduced radius slightly to fit markers
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const normalizedValue = Math.min(Math.max(value ?? min, min), max);
  const percentage = (normalizedValue - min) / (max - min);
  const strokeDashoffset = circumference * (1 - percentage * 0.75); // 270 degrees arc

  const displayValue = formatValue
    ? formatValue(normalizedValue)
    : `${prefix}${normalizedValue.toLocaleString()}${unit}`;

  // Calculate position logic
  const getValueFromAngle = useCallback(
    (clientX, clientY) => {
      if (!svgRef.current) return value;
      const rect = svgRef.current.getBoundingClientRect();
      const x = clientX - rect.left - center;
      const y = clientY - rect.top - center;
      let angle = Math.atan2(y, x) * (180 / Math.PI);
      angle = angle - 135;
      if (angle < 0) angle += 360;
      if (angle > 270) angle = angle > 315 ? 0 : 270;
      const newPercentage = Math.min(Math.max(angle / 270, 0), 1);
      const rawValue = min + newPercentage * (max - min);
      const steppedValue = Math.round(rawValue / step) * step;
      return Math.min(Math.max(steppedValue, min), max);
    },
    [center, min, max, step, value]
  );

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    const newValue = getValueFromAngle(e.clientX, e.clientY);
    onChange(newValue);
  };

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging) return;
      const newValue = getValueFromAngle(e.clientX, e.clientY);
      onChange(newValue);
    },
    [isDragging, getValueFromAngle, onChange]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Knob Position
  const knobAngle = 135 + percentage * 270;
  const knobX = center + radius * Math.cos((knobAngle * Math.PI) / 180);
  const knobY = center + radius * Math.sin((knobAngle * Math.PI) / 180);

  return (
    <div className="flex flex-col items-center select-none">
      <svg
        ref={svgRef}
        width={size}
        height={size}
        className="cursor-pointer"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ touchAction: "none" }}
      >
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>

        {/* Markers Rendering */}
        {markers.map((marker, idx) => {
          const mPct = (marker.value - min) / (max - min);
          // Don't render if out of bounds
          if (mPct < 0 || mPct > 1) return null;

          const mAngle = -135 + mPct * 270;
          const mRad = (mAngle * Math.PI) / 180;
          // Position text slightly outside the circle radius
          const textR = radius + 15;
          const tx = center + textR * Math.cos(mRad);
          const ty = center + textR * Math.sin(mRad);

          return (
            <g key={idx}>
              {/* Small tick line */}
              <line
                x1={center + (radius - 5) * Math.cos(mRad)}
                y1={center + (radius - 5) * Math.sin(mRad)}
                x2={center + radius * Math.cos(mRad)}
                y2={center + radius * Math.sin(mRad)}
                stroke="#9ca3af"
                strokeWidth="2"
              />
              {/* Label */}
              <text
                x={tx}
                y={ty}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[10px] fill-gray-500 font-medium"
                style={{ fontSize: size * 0.05 }}
              >
                {marker.label}
              </text>
            </g>
          );
        })}

        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * 0.25}
          transform={`rotate(135 ${center} ${center})`}
        />

        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={progressColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(135 ${center} ${center})`}
          className="transition-all duration-150"
        />

        {/* Knob */}
        <circle
          cx={knobX}
          cy={knobY}
          r={strokeWidth * 0.8}
          fill="white"
          stroke="#e5e7eb"
          strokeWidth="1"
          className="cursor-grab active:cursor-grabbing shadow-lg"
        />

        {/* Center Text */}
        <text
          x={center}
          y={center - 15}
          textAnchor="middle"
          className="fill-gray-400 font-medium"
          style={{ fontSize: size * 0.08 }}
        >
          {label}
        </text>
        <text
          x={center}
          y={center + 15}
          textAnchor="middle"
          className="fill-gray-900 font-bold"
          style={{ fontSize: size * 0.16 }}
        >
          {displayValue}
        </text>
      </svg>
    </div>
  );
}
