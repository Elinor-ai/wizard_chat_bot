"use client";

import { useState } from "react";

/**
 * ComparisonDuel - Two large side-by-side cards for A vs B comparison
 * @param {Object} props
 * @param {Object} props.optionA - { id, title, description, icon?, color? }
 * @param {Object} props.optionB - { id, title, description, icon?, color? }
 * @param {string} props.value - Selected option id (optionA.id or optionB.id)
 * @param {function} props.onChange - Callback with selected option id
 * @param {string} [props.title] - Title text
 * @param {string} [props.vsText="VS"] - Text between options
 */
export default function ComparisonDuel({
  optionA,
  optionB,
  value,
  onChange,
  title,
  vsText = "VS"
}) {
  const [hoveredSide, setHoveredSide] = useState(null);

  const defaultColorA = "#6366f1";
  const defaultColorB = "#ec4899";

  const colorA = optionA?.color || defaultColorA;
  const colorB = optionB?.color || defaultColorB;

  const handleSelect = (optionId) => {
    onChange(optionId === value ? null : optionId);
  };

  const isASelected = value === optionA?.id;
  const isBSelected = value === optionB?.id;

  return (
    <div className="w-full space-y-4">
      {title && (
        <h3 className="text-lg font-semibold text-slate-800 text-center">{title}</h3>
      )}

      <div className="relative flex gap-4">
        {/* Option A */}
        <button
          onClick={() => handleSelect(optionA?.id)}
          onMouseEnter={() => setHoveredSide("A")}
          onMouseLeave={() => setHoveredSide(null)}
          className={`flex-1 p-6 rounded-2xl border-2 transition-all duration-300 text-left relative overflow-hidden ${
            isASelected
              ? "scale-[1.02]"
              : isBSelected
                ? "opacity-50 scale-95"
                : "hover:scale-[1.01]"
          }`}
          style={{
            borderColor: isASelected ? colorA : "rgba(255,255,255,0.1)",
            backgroundColor: isASelected
              ? `${colorA}15`
              : hoveredSide === "A"
                ? `${colorA}08`
                : "rgba(255,255,255,0.03)"
          }}
        >
          {/* Glow effect */}
          {isASelected && (
            <div
              className="absolute inset-0 opacity-20"
              style={{
                background: `radial-gradient(circle at center, ${colorA}, transparent 70%)`
              }}
            />
          )}

          {/* Selection checkmark */}
          {isASelected && (
            <div
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: colorA }}
            >
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          )}

          <div className="relative z-10">
            {optionA?.icon && (
              <div className="text-4xl mb-4">{optionA.icon}</div>
            )}
            <h4
              className={`text-xl font-bold mb-2 transition-colors ${
                isASelected ? "text-slate-900" : "text-slate-700"
              }`}
            >
              {optionA?.title}
            </h4>
            <p className="text-slate-500 text-sm">{optionA?.description}</p>
          </div>

          {/* Bottom highlight bar */}
          <div
            className={`absolute bottom-0 left-0 right-0 h-1 transition-all duration-300 ${
              isASelected ? "opacity-100" : "opacity-0"
            }`}
            style={{ backgroundColor: colorA }}
          />
        </button>

        {/* VS Badge */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
              !value
                ? "bg-gradient-to-br from-indigo-500 to-pink-500 scale-100"
                : "bg-slate-200 scale-90"
            }`}
            style={{
              boxShadow: !value
                ? "0 0 30px rgba(139, 92, 246, 0.5)"
                : undefined
            }}
          >
            <span className={!value ? "text-white" : "text-slate-600"}>{vsText}</span>
          </div>
        </div>

        {/* Option B */}
        <button
          onClick={() => handleSelect(optionB?.id)}
          onMouseEnter={() => setHoveredSide("B")}
          onMouseLeave={() => setHoveredSide(null)}
          className={`flex-1 p-6 rounded-2xl border-2 transition-all duration-300 text-left relative overflow-hidden ${
            isBSelected
              ? "scale-[1.02]"
              : isASelected
                ? "opacity-50 scale-95"
                : "hover:scale-[1.01]"
          }`}
          style={{
            borderColor: isBSelected ? colorB : "rgba(255,255,255,0.1)",
            backgroundColor: isBSelected
              ? `${colorB}15`
              : hoveredSide === "B"
                ? `${colorB}08`
                : "rgba(255,255,255,0.03)"
          }}
        >
          {/* Glow effect */}
          {isBSelected && (
            <div
              className="absolute inset-0 opacity-20"
              style={{
                background: `radial-gradient(circle at center, ${colorB}, transparent 70%)`
              }}
            />
          )}

          {/* Selection checkmark */}
          {isBSelected && (
            <div
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: colorB }}
            >
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          )}

          <div className="relative z-10">
            {optionB?.icon && (
              <div className="text-4xl mb-4">{optionB.icon}</div>
            )}
            <h4
              className={`text-xl font-bold mb-2 transition-colors ${
                isBSelected ? "text-slate-900" : "text-slate-700"
              }`}
            >
              {optionB?.title}
            </h4>
            <p className="text-slate-500 text-sm">{optionB?.description}</p>
          </div>

          {/* Bottom highlight bar */}
          <div
            className={`absolute bottom-0 left-0 right-0 h-1 transition-all duration-300 ${
              isBSelected ? "opacity-100" : "opacity-0"
            }`}
            style={{ backgroundColor: colorB }}
          />
        </button>
      </div>

      {/* Selection indicator bar */}
      <div className="flex items-center gap-2">
        <div
          className={`flex-1 h-2 rounded-full transition-all duration-300 ${
            isASelected ? "opacity-100" : "opacity-20"
          }`}
          style={{ backgroundColor: colorA }}
        />
        <div className="w-4 h-4 rounded-full bg-slate-200 flex-shrink-0" />
        <div
          className={`flex-1 h-2 rounded-full transition-all duration-300 ${
            isBSelected ? "opacity-100" : "opacity-20"
          }`}
          style={{ backgroundColor: colorB }}
        />
      </div>

      {/* Selected feedback */}
      {value && (
        <div className="text-center">
          <span className="text-slate-500 text-sm">
            You prefer:{" "}
            <span className="text-slate-800 font-medium">
              {isASelected ? optionA?.title : optionB?.title}
            </span>
          </span>
        </div>
      )}

      {/* Clear selection */}
      {value && (
        <button
          onClick={() => onChange(null)}
          className="w-full py-2 text-slate-400 text-sm hover:text-slate-600 transition-colors"
        >
          Clear selection
        </button>
      )}
    </div>
  );
}
