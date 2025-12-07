"use client";

import { useCallback, useRef, useState } from "react";

/**
 * CircularGauge - A circular SVG slider with centered text display
 * @param {Object} props
 * @param {number} props.value - Current value
 * @param {function} props.onChange - Callback when value changes
 * @param {number} [props.min=0] - Minimum value
 * @param {number} [props.max=100] - Maximum value
 * @param {number} [props.step=1] - Step increment
 * @param {string} [props.label] - Label text displayed above value
 * @param {string} [props.unit] - Unit suffix (e.g., "$", "K", "%")
 * @param {string} [props.prefix] - Value prefix (e.g., "$")
 * @param {function} [props.formatValue] - Custom value formatter
 * @param {string} [props.trackColor] - Track background color
 * @param {string} [props.progressColor] - Progress arc color/gradient
 * @param {number} [props.size=200] - SVG size in pixels
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
  trackColor = "rgba(255,255,255,0.1)",
  progressColor = "url(#gaugeGradient)",
  size = 200,
}) {
  const svgRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const strokeWidth = size * 0.08;
  const radius = (size - strokeWidth) / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const normalizedValue = Math.min(Math.max(value, min), max);
  const percentage = (normalizedValue - min) / (max - min);
  const strokeDashoffset = circumference * (1 - percentage * 0.75); // 270 degrees arc

  const displayValue = formatValue
    ? formatValue(normalizedValue)
    : `${prefix}${normalizedValue.toLocaleString()}${unit}`;

  const getValueFromAngle = useCallback(
    (clientX, clientY) => {
      if (!svgRef.current) return value;

      const rect = svgRef.current.getBoundingClientRect();
      const x = clientX - rect.left - center;
      const y = clientY - rect.top - center;

      // Calculate angle from bottom-left (-135deg) to bottom-right (135deg)
      let angle = Math.atan2(y, x) * (180 / Math.PI);

      // Normalize angle to our 270-degree arc starting from bottom-left
      angle = angle + 135;
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

  // Attach global mouse events when dragging
  useState(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Calculate knob position
  const knobAngle = -135 + percentage * 270;
  const knobX = center + radius * Math.cos((knobAngle * Math.PI) / 180);
  const knobY = center + radius * Math.sin((knobAngle * Math.PI) / 180);

  return (
    <div className="flex flex-col items-center">
      <svg
        ref={svgRef}
        width={size}
        height={size}
        className="cursor-pointer select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#d946ef" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

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
          filter="url(#glow)"
          className="transition-all duration-150"
        />

        {/* Knob */}
        <circle
          cx={knobX}
          cy={knobY}
          r={strokeWidth * 0.8}
          fill="black"
          filter="url(#glow)"
          className="cursor-grab active:cursor-grabbing"
        />

        {/* Center text */}
        <text
          x={center}
          y={center - 10}
          textAnchor="middle"
          className="fill-black/60 text-sm font-medium"
        >
          {label}
        </text>
        <text
          x={center}
          y={center + 15}
          textAnchor="middle"
          className="fill-black text-2xl font-bold"
        >
          {displayValue}
        </text>
      </svg>
    </div>
  );
}
