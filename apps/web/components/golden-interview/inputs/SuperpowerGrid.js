"use client";

import { useState } from "react";
import DynamicIcon from "./DynamicIcon"; // Make sure to import this if you want Lucide icons

/**
 * SuperpowerGrid - Grid of traits with custom text input area
 */
export default function SuperpowerGrid({
  traits,
  value,
  onChange,
  maxSelections = 5,
  title,
  customPlaceholder = "Add your own superpowers...",
  selectedColor = "#8b5cf6",
}) {
  const [customInput, setCustomInput] = useState("");

  // Defensive: normalize null/undefined value to safe default
  const safeValue = value ?? { selected: [], custom: "" };
  const selectedTraits = safeValue.selected || [];
  const customTraits = safeValue.custom
    ? safeValue.custom
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const totalSelected = selectedTraits.length + customTraits.length;

  const handleTraitToggle = (traitId) => {
    const isSelected = selectedTraits.includes(traitId);
    let newSelected;

    if (isSelected) {
      newSelected = selectedTraits.filter((id) => id !== traitId);
    } else if (totalSelected < maxSelections) {
      newSelected = [...selectedTraits, traitId];
    } else {
      return; // Max reached
    }

    onChange({ ...safeValue, selected: newSelected });
  };

  const handleCustomChange = (text) => {
    setCustomInput(text);
  };

  const handleCustomBlur = () => {
    onChange({ ...safeValue, custom: customInput });
  };

  const handleAddCustomTag = () => {
    if (customInput.trim() && totalSelected < maxSelections) {
      const newCustom = safeValue.custom
        ? `${safeValue.custom}, ${customInput.trim()}`
        : customInput.trim();
      onChange({ ...safeValue, custom: newCustom });
      setCustomInput("");
    }
  };

  const handleRemoveCustomTag = (tagToRemove) => {
    const newCustom = customTraits.filter((t) => t !== tagToRemove).join(", ");
    onChange({ ...safeValue, custom: newCustom });
  };

  return (
    <div className="w-full space-y-4">
      {title && (
        <div className="flex items-center justify-between">
          {/* FIX: text-white -> text-slate-800 */}
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <span
            className={`text-sm ${
              totalSelected >= maxSelections
                ? "text-amber-500"
                : "text-slate-400"
            }`}
          >
            {totalSelected} / {maxSelections}
          </span>
        </div>
      )}

      {/* Trait Grid */}
      <div className="grid grid-cols-3 gap-2">
        {traits.map((trait) => {
          const isSelected = selectedTraits.includes(trait.id);
          const isDisabled = !isSelected && totalSelected >= maxSelections;

          return (
            <button
              key={trait.id}
              onClick={() => handleTraitToggle(trait.id)}
              disabled={isDisabled}
              // FIX: Updated background and border colors for light mode
              className={`p-3 rounded-xl border transition-all duration-200 text-center flex flex-col items-center justify-center gap-2 ${
                isSelected
                  ? "border-transparent bg-white shadow-md"
                  : isDisabled
                    ? "bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed"
                    : "bg-white border-slate-200 hover:border-primary-300 hover:bg-slate-50"
              }`}
              style={{
                borderColor: isSelected ? selectedColor : undefined,
                boxShadow: isSelected
                  ? `0 4px 12px ${selectedColor}25`
                  : undefined,
              }}
            >
              {trait.icon && (
                <div
                  className={`text-2xl ${isSelected ? "text-primary-600" : "text-slate-500"}`}
                >
                  {/* Handle both Emojis and Lucide Icons */}
                  {typeof trait.icon === "string" &&
                  trait.icon.match(/[a-z-]/) ? (
                    <DynamicIcon name={trait.icon} size={24} />
                  ) : (
                    trait.icon
                  )}
                </div>
              )}
              <span
                // FIX: text-white -> text-slate-900 / text-slate-500
                className={`text-xs font-medium ${
                  isSelected ? "text-slate-900" : "text-slate-500"
                }`}
              >
                {trait.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Custom Input Section */}
      <div className="space-y-3 pt-4 border-t border-slate-200">
        {/* FIX: text-white/60 -> text-slate-500 */}
        <label className="text-slate-500 text-sm">Or add your own:</label>

        <div className="flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => handleCustomChange(e.target.value)}
            onBlur={handleCustomBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddCustomTag();
              }
            }}
            placeholder={customPlaceholder}
            disabled={totalSelected >= maxSelections}
            // FIX: Input styling for light mode
            className="flex-1 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 disabled:bg-slate-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleAddCustomTag}
            disabled={!customInput.trim() || totalSelected >= maxSelections}
            className="px-4 py-2 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-sm hover:shadow-md"
            style={{
              backgroundColor: selectedColor,
            }}
          >
            Add
          </button>
        </div>

        {/* Custom Tags */}
        {customTraits.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {customTraits.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm text-slate-700 border border-slate-200 bg-slate-50"
              >
                ✨ {tag}
                <button
                  onClick={() => handleRemoveCustomTag(tag)}
                  className="ml-1 text-slate-400 hover:text-red-500 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
