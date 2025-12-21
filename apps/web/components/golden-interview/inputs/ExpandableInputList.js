"use client";

import { useState } from "react";

/**
 * ExpandableInputList - List items that expand to reveal text input when clicked
 * @param {Object} props
 * @param {Array<{id: string, label: string, icon?: React.ReactNode, placeholder?: string}>} props.items
 * @param {Object} props.value - { [itemId]: { selected: boolean, evidence: string } }
 * @param {function} props.onChange - Callback with updated value object
 * @param {string} [props.title] - Title text
 * @param {string} [props.evidenceLabel="Share an example..."] - Label for evidence input
 * @param {string} [props.selectedColor="#8b5cf6"] - Selection color
 */
export default function ExpandableInputList({
  items,
  value = {},
  onChange,
  title,
  evidenceLabel = "Share an example or evidence...",
  selectedColor = "#8b5cf6"
}) {
  const [expandedId, setExpandedId] = useState(null);

  const handleItemToggle = (itemId) => {
    const current = value[itemId] || { selected: false, evidence: "" };

    if (current.selected) {
      // Deselecting - keep evidence but toggle off
      onChange({
        ...value,
        [itemId]: { ...current, selected: false }
      });
      setExpandedId(null);
    } else {
      // Selecting - expand for evidence
      onChange({
        ...value,
        [itemId]: { ...current, selected: true }
      });
      setExpandedId(itemId);
    }
  };

  const handleEvidenceChange = (itemId, evidence) => {
    const current = value[itemId] || { selected: true, evidence: "" };
    onChange({
      ...value,
      [itemId]: { ...current, evidence }
    });
  };

  const handleExpandToggle = (itemId) => {
    setExpandedId(expandedId === itemId ? null : itemId);
  };

  const selectedCount = Object.values(value).filter((v) => v.selected).length;

  return (
    <div className="w-full space-y-4">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          {selectedCount > 0 && (
            <span
              className="text-sm font-medium px-2 py-1 rounded-full"
              style={{ backgroundColor: `${selectedColor}20`, color: selectedColor }}
            >
              {selectedCount} selected
            </span>
          )}
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => {
          const itemValue = value[item.id] || { selected: false, evidence: "" };
          const isSelected = itemValue.selected;
          const isExpanded = expandedId === item.id;
          const hasEvidence = itemValue.evidence?.trim();

          return (
            <div
              key={item.id}
              className={`rounded-xl border transition-all duration-300 overflow-hidden ${
                isSelected
                  ? "border-transparent"
                  : "bg-slate-50 border-slate-200"
              }`}
              style={{
                backgroundColor: isSelected ? `${selectedColor}10` : undefined,
                borderColor: isSelected ? `${selectedColor}40` : undefined
              }}
            >
              {/* Main row */}
              <div className="flex items-center gap-3 p-4">
                {/* Checkbox */}
                <button
                  onClick={() => handleItemToggle(item.id)}
                  className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ${
                    isSelected ? "" : "border-2 border-slate-300 hover:border-slate-400"
                  }`}
                  style={{
                    backgroundColor: isSelected ? selectedColor : "transparent"
                  }}
                >
                  {isSelected && (
                    <svg
                      className="w-4 h-4 text-white"
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
                  )}
                </button>

                {/* Icon */}
                {item.icon && (
                  <span className="text-xl flex-shrink-0">{item.icon}</span>
                )}

                {/* Label */}
                <span
                  className={`flex-1 font-medium transition-colors ${
                    isSelected ? "text-slate-900" : "text-slate-700"
                  }`}
                >
                  {item.label}
                </span>

                {/* Evidence indicator */}
                {hasEvidence && !isExpanded && (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <svg
                      className="w-3 h-3"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                    </svg>
                    Has note
                  </span>
                )}

                {/* Expand button */}
                {isSelected && (
                  <button
                    onClick={() => handleExpandToggle(item.id)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                      isExpanded
                        ? "bg-slate-200"
                        : "bg-slate-100 hover:bg-slate-200"
                    }`}
                  >
                    <svg
                      className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                )}
              </div>

              {/* Expandable evidence section */}
              {isSelected && isExpanded && (
                <div className="px-4 pb-4 pt-0">
                  <div className="pl-9">
                    <label className="text-slate-500 text-xs block mb-2">
                      {evidenceLabel}
                    </label>
                    <textarea
                      value={itemValue.evidence}
                      onChange={(e) =>
                        handleEvidenceChange(item.id, e.target.value)
                      }
                      placeholder={item.placeholder || "Describe how this applies..."}
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-300 resize-none text-sm"
                    />
                    <div className="flex justify-end mt-2">
                      <span className="text-xs text-slate-400">
                        {itemValue.evidence?.length || 0} characters
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary of items with evidence */}
      {Object.entries(value).filter(([_, v]) => v.selected && v.evidence?.trim()).length > 0 && (
        <div className="pt-4 border-t border-slate-200">
          <div className="text-slate-500 text-xs uppercase tracking-wide mb-2">
            Items with evidence
          </div>
          <div className="space-y-2">
            {Object.entries(value)
              .filter(([_, v]) => v.selected && v.evidence?.trim())
              .map(([itemId, itemValue]) => {
                const item = items.find((i) => i.id === itemId);
                return (
                  <div
                    key={itemId}
                    className="p-3 rounded-lg bg-slate-50 text-sm"
                  >
                    <div className="font-medium text-slate-700 flex items-center gap-2">
                      {item?.icon && <span>{item.icon}</span>}
                      {item?.label}
                    </div>
                    <div className="text-slate-500 mt-1 text-xs line-clamp-2">
                      {itemValue.evidence}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
