"use client";

import { useState } from "react";

/**
 * PerkRevealer - Category tabs with toggleable perk items below
 * @param {Object} props
 * @param {Array<{id: string, label: string, icon?: React.ReactNode, items: Array<{id: string, label: string, icon?: string}>}>} props.categories
 * @param {Object} props.value - { [categoryId]: string[] } - selected item ids per category
 * @param {function} props.onChange - Callback with updated value object
 * @param {string} [props.title] - Title text
 * @param {string} [props.selectedColor="#8b5cf6"] - Selection color
 */
export default function PerkRevealer({
  categories,
  value = {},
  onChange,
  title,
  selectedColor = "#8b5cf6"
}) {
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id);

  const handleItemToggle = (categoryId, itemId) => {
    const currentItems = value[categoryId] || [];
    const isSelected = currentItems.includes(itemId);

    const newItems = isSelected
      ? currentItems.filter((id) => id !== itemId)
      : [...currentItems, itemId];

    onChange({
      ...value,
      [categoryId]: newItems
    });
  };

  const getTotalSelected = () => {
    return Object.values(value).reduce((sum, items) => sum + items.length, 0);
  };

  const getCategoryCount = (categoryId) => {
    return (value[categoryId] || []).length;
  };

  const activeItems = categories.find((c) => c.id === activeCategory)?.items || [];

  return (
    <div className="w-full space-y-4">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <span
            className="text-sm font-medium px-2 py-1 rounded-full"
            style={{ backgroundColor: `${selectedColor}20`, color: selectedColor }}
          >
            {getTotalSelected()} perks
          </span>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {categories.map((category) => {
          const isActive = activeCategory === category.id;
          const count = getCategoryCount(category.id);

          return (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? "text-white shadow-lg"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-700"
              }`}
              style={{
                backgroundColor: isActive ? selectedColor : undefined,
                boxShadow: isActive ? `0 4px 15px ${selectedColor}40` : undefined
              }}
            >
              {category.icon && <span className="text-lg">{category.icon}</span>}
              <span className="font-medium text-sm">{category.label}</span>
              {count > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                    isActive ? "bg-white/20" : "bg-slate-200"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Items Grid */}
      <div className="min-h-[200px]">
        <div className="grid grid-cols-2 gap-2">
          {activeItems.map((item) => {
            const isSelected = (value[activeCategory] || []).includes(item.id);

            return (
              <button
                key={item.id}
                onClick={() => handleItemToggle(activeCategory, item.id)}
                className={`p-3 rounded-xl border transition-all duration-200 text-left flex items-center gap-3 ${
                  isSelected
                    ? "border-transparent"
                    : "bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                }`}
                style={{
                  backgroundColor: isSelected ? `${selectedColor}15` : undefined,
                  borderColor: isSelected ? selectedColor : undefined,
                  boxShadow: isSelected ? `0 0 15px ${selectedColor}20` : undefined
                }}
              >
                {/* Checkbox */}
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all ${
                    isSelected ? "" : "border border-slate-300"
                  }`}
                  style={{
                    backgroundColor: isSelected ? selectedColor : "transparent"
                  }}
                >
                  {isSelected && (
                    <svg
                      className="w-3 h-3 text-white"
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
                </div>

                {/* Icon & Label */}
                {item.icon && (
                  <span className="text-lg flex-shrink-0">{item.icon}</span>
                )}
                <span
                  className={`text-sm ${isSelected ? "text-slate-900 font-medium" : "text-slate-700"}`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {activeItems.length === 0 && (
          <div className="flex items-center justify-center h-40 text-slate-400">
            No items in this category
          </div>
        )}
      </div>

      {/* Summary */}
      {getTotalSelected() > 0 && (
        <div className="pt-4 border-t border-slate-200">
          <div className="text-slate-500 text-xs uppercase tracking-wide mb-3">
            All Selected Perks
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) =>
              (value[category.id] || []).map((itemId) => {
                const item = category.items.find((i) => i.id === itemId);
                return (
                  <span
                    key={`${category.id}-${itemId}`}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs text-slate-700"
                    style={{ backgroundColor: `${selectedColor}20` }}
                  >
                    {item?.icon && <span>{item.icon}</span>}
                    {item?.label}
                    <button
                      onClick={() => handleItemToggle(category.id, itemId)}
                      className="ml-1 hover:text-red-500 transition-colors"
                    >
                      ×
                    </button>
                  </span>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
