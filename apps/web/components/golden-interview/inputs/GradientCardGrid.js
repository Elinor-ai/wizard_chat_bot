// "use client";

// /**
//  * GradientCardGrid - Cards with distinct gradient backgrounds and icons
//  * @param {Object} props
//  * @param {Array<{id: string, label: string, icon: React.ReactNode, gradient: string, description?: string}>} props.options
//  * @param {string|Array<string>} props.value - Selected id(s)
//  * @param {function} props.onChange - Callback with selected value(s)
//  * @param {boolean} [props.multiple=false] - Allow multiple selections
//  * @param {number} [props.columns=2] - Number of grid columns
//  * @param {string} [props.title] - Title text
//  */
// export default function GradientCardGrid({
//   options,
//   value,
//   onChange,
//   multiple = false,
//   columns = 2,
//   title
// }) {
//   const selectedIds = multiple
//     ? Array.isArray(value)
//       ? value
//       : []
//     : value
//       ? [value]
//       : [];

//   const handleSelect = (optionId) => {
//     if (multiple) {
//       const isSelected = selectedIds.includes(optionId);
//       const newSelection = isSelected
//         ? selectedIds.filter((id) => id !== optionId)
//         : [...selectedIds, optionId];
//       onChange(newSelection);
//     } else {
//       onChange(optionId === value ? null : optionId);
//     }
//   };

//   const gridCols = {
//     2: "grid-cols-2",
//     3: "grid-cols-3",
//     4: "grid-cols-4"
//   };

//   // Default gradients if not provided
//   const defaultGradients = [
//     "from-violet-600 to-indigo-600",
//     "from-pink-600 to-rose-600",
//     "from-cyan-600 to-blue-600",
//     "from-emerald-600 to-teal-600",
//     "from-amber-600 to-orange-600",
//     "from-fuchsia-600 to-purple-600"
//   ];

//   return (
//     <div className="w-full space-y-4">
//       {title && (
//         <h3 className="text-lg font-semibold text-white">{title}</h3>
//       )}

//       <div className={`grid ${gridCols[columns] || "grid-cols-2"} gap-4`}>
//         {options.map((option, index) => {
//           const isSelected = selectedIds.includes(option.id);
//           const gradient =
//             option.gradient || defaultGradients[index % defaultGradients.length];

//           return (
//             <button
//               key={option.id}
//               onClick={() => handleSelect(option.id)}
//               className={`relative overflow-hidden rounded-2xl transition-all duration-300 group ${
//                 isSelected
//                   ? "ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-[1.02]"
//                   : "hover:scale-[1.02]"
//               }`}
//             >
//               {/* Gradient background */}
//               <div
//                 className={`absolute inset-0 bg-gradient-to-br ${gradient} transition-opacity ${
//                   isSelected ? "opacity-100" : "opacity-70 group-hover:opacity-90"
//                 }`}
//               />

//               {/* Overlay pattern */}
//               <div className="absolute inset-0 opacity-10">
//                 <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
//                   <defs>
//                     <pattern
//                       id={`pattern-${option.id}`}
//                       x="0"
//                       y="0"
//                       width="20"
//                       height="20"
//                       patternUnits="userSpaceOnUse"
//                     >
//                       <circle cx="10" cy="10" r="1" fill="white" />
//                     </pattern>
//                   </defs>
//                   <rect
//                     width="100%"
//                     height="100%"
//                     fill={`url(#pattern-${option.id})`}
//                   />
//                 </svg>
//               </div>

//               {/* Shine effect */}
//               <div
//                 className={`absolute inset-0 bg-gradient-to-tr from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ${
//                   isSelected ? "translate-x-0" : ""
//                 }`}
//               />

//               {/* Content */}
//               <div className="relative p-6 flex flex-col items-center text-center min-h-[140px] justify-center">
//                 {/* Selection checkmark */}
//                 {isSelected && (
//                   <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center">
//                     <svg
//                       className="w-4 h-4 text-white"
//                       fill="none"
//                       stroke="currentColor"
//                       viewBox="0 0 24 24"
//                     >
//                       <path
//                         strokeLinecap="round"
//                         strokeLinejoin="round"
//                         strokeWidth={3}
//                         d="M5 13l4 4L19 7"
//                       />
//                     </svg>
//                   </div>
//                 )}

//                 {/* Icon */}
//                 <div
//                   className={`text-4xl mb-3 drop-shadow-lg transition-transform duration-300 ${
//                     isSelected ? "scale-110" : "group-hover:scale-110"
//                   }`}
//                 >
//                   {option.icon}
//                 </div>

//                 {/* Label */}
//                 <span className="text-white font-semibold text-sm drop-shadow-lg">
//                   {option.label}
//                 </span>

//                 {/* Description */}
//                 {option.description && (
//                   <span className="text-white/70 text-xs mt-1 line-clamp-2">
//                     {option.description}
//                   </span>
//                 )}
//               </div>
//             </button>
//           );
//         })}
//       </div>

//       {/* Selection summary */}
//       {multiple && selectedIds.length > 0 && (
//         <div className="flex justify-center">
//           <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm">
//             <span className="text-white/70 text-sm">Selected:</span>
//             {selectedIds.map((id) => {
//               const option = options.find((o) => o.id === id);
//               return (
//                 <span key={id} className="text-lg" title={option?.label}>
//                   {option?.icon}
//                 </span>
//               );
//             })}
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }
"use client";

import React from "react";

// Quick mapping from server string values to emojis
const ICON_MAP = {
  rocket: "🚀",
  store: "🏪",
  building: "🏢",
  city: "🏙️",
  heart: "❤️",
  flag: "🚩",
  "chart-line": "📈",
  users: "👥",
  globe: "🌍",
  laptop: "💻",
};

/**
 * GradientCardGrid - Robust Version
 * Fixes: Visibility issues (dark text), Icon mapping, and Safety checks.
 */
export default function GradientCardGrid({
  options,
  items, // Support alternate prop naming
  value,
  onChange,
  multiple = false,
  columns = 2,
  title,
}) {
  // 1. Normalize and guard data to avoid crashes from unexpected keys
  const rawData = options || items || [];

  // 2. Ensure we are working with an array
  const dataToRender = Array.isArray(rawData) ? rawData : [];

  if (dataToRender.length === 0) {
    console.warn("GradientCardGrid: No data to render");
    return null;
  }

  // Selection management (single or multi)
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

  // Responsive grid configuration
  const gridCols = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  // Fallback gradients if Tailwind ones fail
  const defaultGradients = [
    "from-violet-500 to-indigo-600",
    "from-pink-500 to-rose-600",
    "from-cyan-500 to-blue-600",
    "from-emerald-500 to-teal-600",
    "from-amber-500 to-orange-600",
    "from-fuchsia-500 to-purple-600",
  ];

  return (
    <div className="w-full space-y-4">
      {/* Title color fix: use dark text so it is visible on a light background */}
      {title && (
        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
          {title}
        </h3>
      )}

      <div
        className={`grid ${gridCols[columns] || "grid-cols-1 sm:grid-cols-2"} gap-4`}
      >
        {dataToRender.map((option, index) => {
          const isSelected = selectedIds.includes(option.id);

          // Gradient selection (with fallback)
          const gradientClass =
            option.gradient ||
            defaultGradients[index % defaultGradients.length];

          // Convert textual icon to emoji
          const displayIcon = ICON_MAP[option.icon] || option.icon || "✨";

          return (
            <button
              key={option.id || index}
              onClick={() => handleSelect(option.id)}
              className={`
                relative overflow-hidden rounded-2xl text-left transition-all duration-300 group
                min-h-[140px] flex flex-col justify-center items-center p-6
                ${
                  isSelected
                    ? "ring-4 ring-primary-500/30 scale-[1.02] shadow-xl"
                    : "hover:scale-[1.02] hover:shadow-lg border border-slate-100"
                }
              `}
            >
              {/* Layer 1: Background color (fallback if gradient fails). Default dark background keeps white text legible. */}
              <div className="absolute inset-0 bg-slate-800" />

              {/* Layer 2: Gradient */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${gradientClass} transition-opacity duration-300 ${
                  isSelected
                    ? "opacity-100"
                    : "opacity-85 group-hover:opacity-100"
                }`}
              />

              {/* Layer 3: Shine Effect */}
              <div
                className={`absolute inset-0 bg-gradient-to-tr from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none`}
              />

              {/* Layer 4: Content (Text & Icons) */}
              <div className="relative z-10 flex flex-col items-center text-center">
                {/* Checkmark Badge */}
                {isSelected && (
                  <div className="absolute -top-4 -right-4 w-8 h-8 bg-white text-green-600 rounded-full flex items-center justify-center shadow-sm animate-in zoom-in">
                    <svg
                      className="w-5 h-5"
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

                {/* Icon */}
                <span className="text-4xl mb-3 filter drop-shadow-md">
                  {displayIcon}
                </span>

                {/* Label - always white because we guarantee a dark background */}
                <span className="text-white font-bold text-lg leading-tight drop-shadow-md">
                  {option.label}
                </span>

                {/* Description */}
                {option.description && (
                  <span className="text-white/90 text-sm mt-2 line-clamp-2 font-medium">
                    {option.description}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
