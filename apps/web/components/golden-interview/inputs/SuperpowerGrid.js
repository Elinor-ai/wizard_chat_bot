"use client";

import { useState } from "react";

/**
 * SuperpowerGrid - Grid of traits with custom text input area
 * @param {Object} props
 * @param {Array<{id: string, label: string, icon?: React.ReactNode}>} props.traits
 * @param {Object} props.value - { selected: string[], custom: string }
 * @param {function} props.onChange - Callback with updated value
 * @param {number} [props.maxSelections=5] - Maximum trait selections
 * @param {string} [props.title] - Title text
 * @param {string} [props.customPlaceholder="Add your own..."] - Custom input placeholder
 * @param {string} [props.selectedColor="#8b5cf6"] - Selection highlight color
 */
export default function SuperpowerGrid({
  traits,
  value = { selected: [], custom: "" },
  onChange,
  maxSelections = 5,
  title,
  customPlaceholder = "Add your own superpowers...",
  selectedColor = "#8b5cf6"
}) {
  const [customInput, setCustomInput] = useState("");

  const selectedTraits = value.selected || [];
  const customTraits = value.custom
    ? value.custom.split(",").map((t) => t.trim()).filter(Boolean)
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

    onChange({ ...value, selected: newSelected });
  };

  const handleCustomChange = (text) => {
    setCustomInput(text);
  };

  const handleCustomBlur = () => {
    onChange({ ...value, custom: customInput });
  };

  const handleAddCustomTag = () => {
    if (customInput.trim() && totalSelected < maxSelections) {
      const newCustom = value.custom
        ? `${value.custom}, ${customInput.trim()}`
        : customInput.trim();
      onChange({ ...value, custom: newCustom });
      setCustomInput("");
    }
  };

  const handleRemoveCustomTag = (tagToRemove) => {
    const newCustom = customTraits
      .filter((t) => t !== tagToRemove)
      .join(", ");
    onChange({ ...value, custom: newCustom });
  };

  return (
    <div className="w-full space-y-4">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <span
            className={`text-sm ${totalSelected >= maxSelections ? "text-amber-400" : "text-white/50"}`}
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
              className={`p-3 rounded-xl border transition-all duration-200 text-center ${
                isSelected
                  ? "border-transparent"
                  : isDisabled
                    ? "bg-white/5 border-white/5 opacity-50 cursor-not-allowed"
                    : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
              }`}
              style={{
                backgroundColor: isSelected ? `${selectedColor}20` : undefined,
                borderColor: isSelected ? selectedColor : undefined,
                boxShadow: isSelected
                  ? `0 0 15px ${selectedColor}30`
                  : undefined
              }}
            >
              {trait.icon && (
                <div className="text-xl mb-1">{trait.icon}</div>
              )}
              <span
                className={`text-xs font-medium ${
                  isSelected ? "text-white" : "text-white/70"
                }`}
              >
                {trait.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Custom Input Section */}
      <div className="space-y-3 pt-4 border-t border-white/10">
        <label className="text-white/60 text-sm">Or add your own:</label>

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
            className="flex-1 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleAddCustomTag}
            disabled={!customInput.trim() || totalSelected >= maxSelections}
            className="px-4 py-2 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: `${selectedColor}30`,
              color: selectedColor
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
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm text-white"
                style={{ backgroundColor: `${selectedColor}25` }}
              >
                ✨ {tag}
                <button
                  onClick={() => handleRemoveCustomTag(tag)}
                  className="ml-1 hover:text-red-400 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Selected Summary */}
      {(selectedTraits.length > 0 || customTraits.length > 0) && (
        <div className="p-4 rounded-xl bg-gradient-to-br from-white/5 to-white/0 border border-white/10">
          <div className="text-white/50 text-xs uppercase tracking-wide mb-2">
            Your Superpowers
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedTraits.map((traitId) => {
              const trait = traits.find((t) => t.id === traitId);
              return (
                <span
                  key={traitId}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium"
                  style={{
                    backgroundColor: `${selectedColor}20`,
                    color: "white"
                  }}
                >
                  {trait?.icon} {trait?.label}
                </span>
              );
            })}
            {customTraits.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium bg-white/10 text-white"
              >
                ✨ {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
