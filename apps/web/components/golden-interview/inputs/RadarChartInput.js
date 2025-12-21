"use client";

import { useMemo } from "react";

/**
 * RadarChartInput - SVG polygon that updates shape as sliders move
 * @param {Object} props
 * @param {Array<{id: string, label: string, value: number, icon?: string}>} props.dimensions
 * @param {function} props.onChange - Callback with updated dimensions array
 * @param {number} [props.max=100] - Maximum value for each dimension
 * @param {number} [props.size=300] - SVG size in pixels
 * @param {string} [props.title] - Title text
 * @param {string} [props.fillColor="rgba(139, 92, 246, 0.3)"] - Polygon fill color
 * @param {string} [props.strokeColor="#8b5cf6"] - Polygon stroke color
 */
export default function RadarChartInput({
  dimensions,
  onChange,
  max = 100,
  size = 300,
  title,
  fillColor = "rgba(139, 92, 246, 0.3)",
  strokeColor = "#8b5cf6"
}) {
  const center = size / 2;
  const maxRadius = (size / 2) * 0.7;

  const points = useMemo(() => {
    const angleStep = (2 * Math.PI) / dimensions.length;
    return dimensions.map((dim, i) => {
      const angle = angleStep * i - Math.PI / 2; // Start from top
      const radius = (dim.value / max) * maxRadius;
      return {
        x: center + radius * Math.cos(angle),
        y: center + radius * Math.sin(angle),
        labelX: center + (maxRadius + 30) * Math.cos(angle),
        labelY: center + (maxRadius + 30) * Math.sin(angle)
      };
    });
  }, [dimensions, max, maxRadius, center]);

  const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  const gridLevels = [0.25, 0.5, 0.75, 1];

  const handleDimensionChange = (dimId, newValue) => {
    const updatedDimensions = dimensions.map((dim) =>
      dim.id === dimId ? { ...dim, value: newValue } : dim
    );
    onChange(updatedDimensions);
  };

  return (
    <div className="w-full space-y-6">
      {title && (
        <h3 className="text-lg font-semibold text-slate-800 text-center">{title}</h3>
      )}

      {/* Radar Chart */}
      <div className="flex justify-center">
        <svg width={size} height={size} className="overflow-visible">
          <defs>
            <linearGradient id="radarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#d946ef" stopOpacity="0.4" />
            </linearGradient>
            <filter id="radarGlow">
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grid circles */}
          {gridLevels.map((level, i) => (
            <polygon
              key={i}
              points={dimensions
                .map((_, idx) => {
                  const angle = ((2 * Math.PI) / dimensions.length) * idx - Math.PI / 2;
                  const r = maxRadius * level;
                  return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
                })
                .join(" ")}
              fill="none"
              stroke="rgba(0,0,0,0.1)"
              strokeWidth="1"
            />
          ))}

          {/* Axis lines */}
          {dimensions.map((_, i) => {
            const angle = ((2 * Math.PI) / dimensions.length) * i - Math.PI / 2;
            return (
              <line
                key={i}
                x1={center}
                y1={center}
                x2={center + maxRadius * Math.cos(angle)}
                y2={center + maxRadius * Math.sin(angle)}
                stroke="rgba(0,0,0,0.1)"
                strokeWidth="1"
              />
            );
          })}

          {/* Data polygon */}
          <polygon
            points={polygonPoints}
            fill="url(#radarGradient)"
            stroke={strokeColor}
            strokeWidth="2"
            filter="url(#radarGlow)"
            className="transition-all duration-300"
          />

          {/* Data points */}
          {points.map((point, i) => (
            <circle
              key={i}
              cx={point.x}
              cy={point.y}
              r="6"
              fill="white"
              stroke={strokeColor}
              strokeWidth="2"
              filter="url(#radarGlow)"
              className="transition-all duration-300"
            />
          ))}

          {/* Labels */}
          {dimensions.map((dim, i) => {
            const point = points[i];
            const angle = ((2 * Math.PI) / dimensions.length) * i - Math.PI / 2;
            const isRight = Math.cos(angle) > 0.1;
            const isLeft = Math.cos(angle) < -0.1;

            return (
              <g key={dim.id}>
                {dim.icon && (
                  <text
                    x={point.labelX}
                    y={point.labelY - 10}
                    textAnchor="middle"
                    className="text-lg"
                  >
                    {dim.icon}
                  </text>
                )}
                <text
                  x={point.labelX}
                  y={point.labelY + (dim.icon ? 8 : 0)}
                  textAnchor={isRight ? "start" : isLeft ? "end" : "middle"}
                  className="fill-slate-600 text-xs font-medium"
                >
                  {dim.label}
                </text>
                <text
                  x={point.labelX}
                  y={point.labelY + (dim.icon ? 22 : 14)}
                  textAnchor={isRight ? "start" : isLeft ? "end" : "middle"}
                  className="fill-slate-800 text-xs font-bold"
                >
                  {dim.value}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Sliders */}
      <div className="grid grid-cols-2 gap-4">
        {dimensions.map((dim) => (
          <div key={dim.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 text-sm flex items-center gap-1">
                {dim.icon && <span>{dim.icon}</span>}
                {dim.label}
              </span>
              <span className="text-slate-800 font-bold text-sm">{dim.value}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={max}
              value={dim.value}
              onChange={(e) =>
                handleDimensionChange(dim.id, Number(e.target.value))
              }
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, ${strokeColor} ${dim.value}%, rgba(0,0,0,0.1) ${dim.value}%)`
              }}
            />
          </div>
        ))}
      </div>

      {/* Average Score */}
      <div className="text-center pt-4 border-t border-slate-200">
        <div className="text-slate-500 text-sm">Average Score</div>
        <div
          className="text-3xl font-bold"
          style={{ color: strokeColor }}
        >
          {Math.round(
            dimensions.reduce((sum, d) => sum + d.value, 0) / dimensions.length
          )}
          %
        </div>
      </div>
    </div>
  );
}
