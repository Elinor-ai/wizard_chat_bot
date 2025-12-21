"use client";

import { useMemo } from "react";

/**
 * VisualNodeMap - Central node with orbiting satellite nodes
 * @param {Object} props
 * @param {Object} props.value - { centerLabel: string, satellites: Array<{ring: number, count: number}> }
 * @param {function} props.onChange - Callback with updated value
 * @param {Array<{id: string, label: string, maxCount: number, color: string}>} props.rings - Ring definitions
 * @param {string} [props.centerLabel] - Label for center node
 * @param {string} [props.centerIcon] - Icon for center node
 * @param {string} [props.title] - Title text
 * @param {number} [props.size=300] - SVG size in pixels
 */
export default function VisualNodeMap({
  value = {},
  onChange,
  rings = [
    { id: "direct", label: "Direct Reports", maxCount: 10, color: "#8b5cf6" },
    { id: "team", label: "Team Members", maxCount: 15, color: "#6366f1" },
    { id: "cross", label: "Cross-functional", maxCount: 20, color: "#3b82f6" }
  ],
  centerLabel = "You",
  centerIcon = "👤",
  title,
  size = 300
}) {
  const center = size / 2;
  const ringRadii = rings.map((_, i) => 50 + (i + 1) * 45);

  const satellites = useMemo(() => {
    return rings.map((ring, ringIndex) => {
      const count = value[ring.id] || 0;
      const radius = ringRadii[ringIndex];
      const nodes = [];

      for (let i = 0; i < count; i++) {
        const angle = (2 * Math.PI * i) / Math.max(count, 1) - Math.PI / 2;
        // Add slight randomness for organic feel
        const jitter = (Math.random() - 0.5) * 10;
        nodes.push({
          x: center + (radius + jitter) * Math.cos(angle),
          y: center + (radius + jitter) * Math.sin(angle),
          color: ring.color
        });
      }

      return { ring, nodes, radius };
    });
  }, [rings, value, ringRadii, center]);

  const handleRingChange = (ringId, newCount) => {
    onChange({ ...value, [ringId]: newCount });
  };

  return (
    <div className="w-full space-y-6">
      {title && (
        <h3 className="text-lg font-semibold text-slate-800 text-center">{title}</h3>
      )}

      {/* Node Map Visualization */}
      <div className="flex justify-center">
        <svg width={size} height={size} className="overflow-visible">
          <defs>
            {rings.map((ring) => (
              <filter key={`glow-${ring.id}`} id={`nodeGlow-${ring.id}`}>
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ))}
          </defs>

          {/* Ring circles (background) */}
          {satellites.map(({ ring, radius }, index) => (
            <circle
              key={`ring-${ring.id}`}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={`${ring.color}20`}
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          ))}

          {/* Connection lines from center to satellites */}
          {satellites.map(({ ring, nodes }) =>
            nodes.map((node, i) => (
              <line
                key={`line-${ring.id}-${i}`}
                x1={center}
                y1={center}
                x2={node.x}
                y2={node.y}
                stroke={`${ring.color}30`}
                strokeWidth="1"
              />
            ))
          )}

          {/* Satellite nodes */}
          {satellites.map(({ ring, nodes }) =>
            nodes.map((node, i) => (
              <g key={`node-${ring.id}-${i}`}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="8"
                  fill={node.color}
                  filter={`url(#nodeGlow-${ring.id})`}
                  className="transition-all duration-300"
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="4"
                  fill="white"
                  opacity="0.8"
                />
              </g>
            ))
          )}

          {/* Center node */}
          <circle
            cx={center}
            cy={center}
            r="35"
            fill="url(#centerGradient)"
            stroke="white"
            strokeWidth="3"
            filter="url(#nodeGlow-direct)"
          />
          <defs>
            <radialGradient id="centerGradient">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#6366f1" />
            </radialGradient>
          </defs>

          {/* Center icon */}
          <text
            x={center}
            y={center - 5}
            textAnchor="middle"
            className="text-2xl"
            dominantBaseline="middle"
          >
            {centerIcon}
          </text>
          <text
            x={center}
            y={center + 18}
            textAnchor="middle"
            className="fill-white text-[10px] font-medium"
          >
            {centerLabel}
          </text>
        </svg>
      </div>

      {/* Ring Controls */}
      <div className="space-y-4">
        {rings.map((ring) => {
          const count = value[ring.id] || 0;

          return (
            <div
              key={ring.id}
              className="p-4 rounded-xl border transition-all"
              style={{
                backgroundColor: `${ring.color}10`,
                borderColor: `${ring.color}30`
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: ring.color }}
                  />
                  <span className="text-slate-700 font-medium">{ring.label}</span>
                </div>
                <span
                  className="text-lg font-bold"
                  style={{ color: ring.color }}
                >
                  {count}
                </span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min={0}
                max={ring.maxCount}
                value={count}
                onChange={(e) =>
                  handleRingChange(ring.id, Number(e.target.value))
                }
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${ring.color} ${(count / ring.maxCount) * 100}%, rgba(0,0,0,0.1) ${(count / ring.maxCount) * 100}%)`
                }}
              />

              {/* Quick select buttons */}
              <div className="flex gap-1 mt-2">
                {[0, 3, 5, 10, ring.maxCount].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handleRingChange(ring.id, preset)}
                    className={`flex-1 py-1 rounded text-xs font-medium transition-all ${
                      count === preset
                        ? "text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                    style={{
                      backgroundColor: count === preset ? ring.color : undefined
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="text-center pt-4 border-t border-slate-200">
        <div className="text-slate-500 text-sm">Total Connections</div>
        <div className="text-3xl font-bold text-slate-800">
          {rings.reduce((sum, ring) => sum + (value[ring.id] || 0), 0)}
        </div>
      </div>
    </div>
  );
}
