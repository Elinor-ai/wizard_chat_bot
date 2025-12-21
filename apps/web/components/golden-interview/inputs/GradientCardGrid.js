"use client";

import DynamicIcon from "./DynamicIcon";

/**
 * GradientCardGrid - Vibrant cards with dynamic icons and rich animations
 */
export default function GradientCardGrid({
  options = [],
  value,
  onChange,
  multiple = false,
  columns = 2,
  title,
}) {
  const safeOptions = Array.isArray(options) ? options : [];

  const selectedIds = multiple
    ? Array.isArray(value)
      ? value
      : []
    : value
      ? [value]
      : [];

  const handleSelect = (optionId) => {
    if (multiple) {
      const isSelected = selectedIds.includes(optionId);
      const newSelection = isSelected
        ? selectedIds.filter((id) => id !== optionId)
        : [...selectedIds, optionId];
      onChange(newSelection);
    } else {
      onChange(optionId === value ? null : optionId);
    }
  };

  const gridCols = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  const defaultGradients = [
    "from-blue-500 via-indigo-500 to-purple-600",
    "from-rose-400 via-fuchsia-500 to-indigo-500",
    "from-emerald-400 via-teal-500 to-cyan-600",
    "from-orange-400 via-amber-500 to-yellow-500",
    "from-pink-500 via-rose-500 to-red-500",
    "from-cyan-400 via-sky-500 to-blue-600",
  ];

  if (safeOptions.length === 0) return null;

  return (
    <div className="w-full space-y-6 font-sans">
      {title && (
        <h3 className="text-xl font-bold text-gray-800 dark:text-white text-center mb-2">
          {title}
        </h3>
      )}

      <div
        className={`grid ${gridCols[columns] || "grid-cols-1 sm:grid-cols-2"} gap-4`}
      >
        {safeOptions.map((option, index) => {
          if (!option || !option.id) return null;

          const isSelected = selectedIds.includes(option.id);
          const gradientClass =
            option.gradient ||
            defaultGradients[index % defaultGradients.length];

          return (
            <button
              key={`${option.id}-${index}`}
              onClick={() => handleSelect(option.id)}
              className={`
                relative group overflow-hidden rounded-2xl text-left transition-all duration-300
                min-h-[160px] flex flex-col justify-center items-center p-1
                ${
                  isSelected
                    ? "transform scale-[1.02] ring-4 ring-offset-2 ring-indigo-500 shadow-2xl z-10"
                    : "hover:scale-[1.03] hover:shadow-xl shadow-md"
                }
              `}
            >
              {/* Layer 1: Animated Vibrant Gradient Background */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${gradientClass} transition-all duration-500 ${
                  isSelected
                    ? "opacity-100"
                    : "opacity-90 group-hover:opacity-100"
                }`}
              />

              {/* Layer 2: Noise Texture Overlay (Optional depth) */}
              <div className="absolute inset-0 opacity-10 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

              {/* Layer 3: Shine Effect on Hover */}
              <div
                className={`absolute inset-0 bg-gradient-to-tr from-white/0 via-white/20 to-white/0 
                translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none`}
              />

              {/* Layer 4: Content Container */}
              <div className="relative w-full h-full bg-black/10 backdrop-blur-[2px] rounded-xl p-6 flex flex-col items-center text-center transition-colors group-hover:bg-black/0">
                {/* Icon Circle */}
                <div
                  className={`
                  mb-4 p-3 rounded-full backdrop-blur-md shadow-lg transition-all duration-300
                  ${isSelected ? "bg-white text-indigo-600 scale-110" : "bg-white/20 text-white group-hover:bg-white/30 group-hover:scale-110"}
                `}
                >
                  <DynamicIcon name={option.icon} className="w-8 h-8" />
                </div>

                {/* Label */}
                <span className="text-white font-bold text-xl leading-tight drop-shadow-md tracking-wide">
                  {option.label}
                </span>

                {/* Description */}
                {option.description && (
                  <span className="text-white/90 text-sm mt-2 font-medium leading-relaxed max-w-[90%]">
                    {option.description}
                  </span>
                )}

                {/* Selected Checkmark Indicator */}
                {isSelected && (
                  <div className="absolute top-3 right-3 bg-white text-indigo-600 rounded-full p-1 shadow-lg animate-in fade-in zoom-in duration-200">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
