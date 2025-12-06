"use client";

import { useState } from "react";

/**
 * EquityBuilder - 2-step wizard for equity configuration
 * @param {Object} props
 * @param {Object} props.value - { type: string, percentage: number, vestingYears: number, cliff: boolean }
 * @param {function} props.onChange - Callback with updated value
 * @param {Array<{id: string, label: string, icon: React.ReactNode, description: string}>} props.typeOptions
 * @param {number} [props.maxPercentage=10] - Maximum percentage
 * @param {string} [props.title] - Title text
 */
export default function EquityBuilder({
  value,
  onChange,
  typeOptions = [
    {
      id: "options",
      label: "Stock Options",
      icon: "📈",
      description: "Right to buy shares at fixed price"
    },
    {
      id: "RSUs",
      label: "RSUs",
      icon: "🎁",
      description: "Shares granted over time"
    },
    {
      id: "phantom",
      label: "Phantom Equity",
      icon: "👻",
      description: "Cash equivalent to equity value"
    },
    {
      id: "profit_interest",
      label: "Profit Interest",
      icon: "💰",
      description: "Share of future profits"
    }
  ],
  maxPercentage = 10,
  title = "Equity Package"
}) {
  const [step, setStep] = useState(value?.type ? 2 : 1);

  const handleTypeSelect = (typeId) => {
    onChange({
      ...value,
      type: typeId,
      percentage: value?.percentage || 0.5,
      vestingYears: value?.vestingYears || 4,
      cliff: value?.cliff ?? true
    });
    setStep(2);
  };

  const handlePercentageChange = (percentage) => {
    onChange({ ...value, percentage });
  };

  const handleVestingChange = (vestingYears) => {
    onChange({ ...value, vestingYears });
  };

  const handleCliffToggle = () => {
    onChange({ ...value, cliff: !value?.cliff });
  };

  const handleBack = () => {
    setStep(1);
  };

  const selectedType = typeOptions.find((t) => t.id === value?.type);

  return (
    <div className="w-full space-y-6">
      {title && (
        <h3 className="text-lg font-semibold text-white text-center">{title}</h3>
      )}

      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
            step >= 1
              ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
              : "bg-white/10 text-white/40"
          }`}
        >
          1
        </div>
        <div
          className={`w-12 h-1 rounded ${step >= 2 ? "bg-purple-500" : "bg-white/10"}`}
        />
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
            step >= 2
              ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
              : "bg-white/10 text-white/40"
          }`}
        >
          2
        </div>
      </div>

      {/* Step 1: Type Selection */}
      {step === 1 && (
        <div className="grid grid-cols-2 gap-3">
          {typeOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => handleTypeSelect(option.id)}
              className={`p-4 rounded-xl border transition-all text-left ${
                value?.type === option.id
                  ? "bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border-purple-400 shadow-lg shadow-purple-500/20"
                  : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
              }`}
            >
              <div className="text-2xl mb-2">{option.icon}</div>
              <div className="text-white font-semibold text-sm">
                {option.label}
              </div>
              <div className="text-white/50 text-xs mt-1">
                {option.description}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: Configure Details */}
      {step === 2 && (
        <div className="space-y-6">
          {/* Selected type badge */}
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors mx-auto"
          >
            <span className="text-xl">{selectedType?.icon}</span>
            <span className="text-white font-medium">{selectedType?.label}</span>
            <span className="text-white/40 text-sm">← Change</span>
          </button>

          {/* Percentage Slider */}
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Equity Percentage</span>
              <span className="text-white font-bold">
                {value?.percentage?.toFixed(2)}%
              </span>
            </div>

            <div className="relative">
              <input
                type="range"
                min={0}
                max={maxPercentage}
                step={0.01}
                value={value?.percentage || 0}
                onChange={(e) => handlePercentageChange(Number(e.target.value))}
                className="w-full h-3 rounded-full appearance-none cursor-pointer bg-gradient-to-r from-indigo-500/30 via-purple-500/30 to-pink-500/30"
              />
              <div
                className="absolute top-0 left-0 h-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 pointer-events-none"
                style={{ width: `${(value?.percentage / maxPercentage) * 100}%` }}
              />
            </div>

            <div className="flex justify-between text-xs text-white/40">
              <span>0%</span>
              <span>{maxPercentage}%</span>
            </div>
          </div>

          {/* Vesting Schedule */}
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Vesting Period</span>
              <span className="text-white font-bold">
                {value?.vestingYears} years
              </span>
            </div>

            <div className="flex gap-2">
              {[2, 3, 4, 5, 6].map((years) => (
                <button
                  key={years}
                  onClick={() => handleVestingChange(years)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                    value?.vestingYears === years
                      ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg"
                      : "bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  {years}y
                </button>
              ))}
            </div>
          </div>

          {/* Cliff Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
            <div>
              <div className="text-white font-medium">1-Year Cliff</div>
              <div className="text-white/50 text-xs">
                No vesting until first year complete
              </div>
            </div>
            <button
              onClick={handleCliffToggle}
              className={`relative w-14 h-8 rounded-full transition-all ${
                value?.cliff
                  ? "bg-gradient-to-r from-indigo-500 to-purple-500"
                  : "bg-white/10"
              }`}
            >
              <div
                className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-lg transition-all ${
                  value?.cliff ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>

          {/* Summary */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-purple-500/20">
            <div className="text-white/60 text-sm mb-2">Summary</div>
            <div className="text-white">
              <span className="font-bold">{value?.percentage?.toFixed(2)}%</span>{" "}
              {selectedType?.label} vesting over{" "}
              <span className="font-bold">{value?.vestingYears} years</span>
              {value?.cliff && " with 1-year cliff"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
