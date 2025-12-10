"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * SmartTextArea - Light Mode (No bottom "New Prompt" button)
 */
export default function SmartTextArea({
  value,
  onChange,
  prompts = [
    "What makes this role special?",
    "Describe the perfect candidate...",
    "What would you tell a friend about this job?",
    "What's the one thing that sets this apart?",
  ],
  rotationInterval = 5000,
  title,
  minLength,
  maxLength,
  rows = 4,
  showShuffle = true,
  accentColor = "#8b5cf6",
}) {
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const currentPrompt = prompts[currentPromptIndex];

  // Auto-rotate prompts when textarea is empty
  useEffect(() => {
    if (value?.trim() || !prompts.length) return;

    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentPromptIndex((prev) => (prev + 1) % prompts.length);
        setIsAnimating(false);
      }, 200);
    }, rotationInterval);

    return () => clearInterval(interval);
  }, [value, prompts, rotationInterval]);

  const handleShuffle = useCallback(() => {
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentPromptIndex((prev) => (prev + 1) % prompts.length);
      setIsAnimating(false);
    }, 200);
  }, [prompts.length]);

  const handleUsePrompt = () => {
    onChange(currentPrompt);
  };

  const charCount = value?.length || 0;
  const isUnderMin = minLength && charCount < minLength;
  const isOverMax = maxLength && charCount > maxLength;

  return (
    <div className="w-full space-y-3">
      {title && (
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      )}

      {/* Prompt display Banner */}
      {!value?.trim() && prompts.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
          <span className="text-xl">💡</span>
          <span
            className={`flex-1 text-slate-600 text-sm italic transition-opacity duration-200 ${
              isAnimating ? "opacity-0" : "opacity-100"
            }`}
          >
            {currentPrompt}
          </span>
          <div className="flex gap-1">
            {showShuffle && prompts.length > 1 && (
              <button
                onClick={handleShuffle}
                className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all text-slate-400 hover:text-slate-600"
                title="Show different prompt"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            )}
            <button
              onClick={handleUsePrompt}
              className="px-3 py-1 rounded-lg text-xs font-medium text-white hover:opacity-90 hover:shadow-md transition-all"
              style={{ backgroundColor: accentColor }}
            >
              Use this
            </button>
          </div>
        </div>
      )}

      {/* Textarea */}
      <div className="relative">
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          maxLength={maxLength}
          placeholder={!prompts.length ? "Enter your response..." : ""}
          className={`w-full px-4 py-3 rounded-xl border text-slate-900 placeholder:text-slate-400 focus:outline-none resize-none transition-all 
            bg-slate-50
            ${
              isOverMax
                ? "border-red-500 focus:border-red-500 bg-red-50/10"
                : "border-slate-200 focus:border-purple-500 focus:bg-white focus:ring-4 focus:ring-purple-500/10"
            }`}
          style={{
            borderColor:
              value?.trim() && !isOverMax && !isUnderMin
                ? accentColor
                : undefined,
          }}
        />

        {/* Floating placeholder when empty */}
        {!value?.trim() && prompts.length > 0 && (
          <div className="absolute inset-0 flex items-start p-4 pointer-events-none">
            <span
              className={`text-slate-400 italic transition-opacity duration-200 ${
                isAnimating ? "opacity-0" : "opacity-100"
              }`}
            >
              {currentPrompt}
            </span>
          </div>
        )}
      </div>

      {/* Character counter and stats */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex gap-4">
          <span className="text-slate-400 font-medium">
            {value?.trim().split(/\s+/).filter(Boolean).length || 0} words
          </span>
          <span className="text-slate-400 font-medium">
            {value?.split(/[.!?]+/).filter((s) => s.trim()).length || 0}{" "}
            sentences
          </span>
        </div>

        <div className="flex items-center gap-2">
          {minLength && (
            <span
              className={`font-medium ${
                isUnderMin ? "text-amber-500" : "text-green-500"
              }`}
            >
              {isUnderMin
                ? `${minLength - charCount} more needed`
                : "✓ Min met"}
            </span>
          )}
          <span
            className={`font-mono font-medium ${
              isOverMax
                ? "text-red-500"
                : isUnderMin
                  ? "text-amber-500"
                  : "text-slate-400"
            }`}
          >
            {charCount}
            {maxLength && ` / ${maxLength}`}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      {(minLength || maxLength) && (
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden relative">
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${Math.min(
                (charCount / (maxLength || minLength * 2)) * 100,
                100
              )}%`,
              backgroundColor: isOverMax
                ? "#ef4444"
                : isUnderMin
                  ? "#f59e0b"
                  : accentColor,
            }}
          />
          {minLength && (
            <div
              className="absolute top-0 w-0.5 h-1 bg-white border-x border-slate-200"
              style={{
                left: `${(minLength / (maxLength || minLength * 2)) * 100}%`,
              }}
            />
          )}
        </div>
      )}

      {/* Clear Button (Centered Text Link style) */}
      {value?.trim() && (
        <div className="text-center pt-2">
          <button
            onClick={() => onChange("")}
            className="text-slate-400 text-sm hover:text-red-500 transition-colors"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
