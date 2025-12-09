"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * SmartTextArea - Text area with rotating placeholders and shuffle prompt feature
 * @param {Object} props
 * @param {string} props.value - Current text value
 * @param {function} props.onChange - Callback with new text value
 * @param {Array<string>} [props.prompts] - Array of rotating prompt/placeholder texts
 * @param {number} [props.rotationInterval=5000] - Milliseconds between prompt rotations
 * @param {string} [props.title] - Title text
 * @param {number} [props.minLength] - Minimum character length
 * @param {number} [props.maxLength] - Maximum character length
 * @param {number} [props.rows=4] - Number of textarea rows
 * @param {boolean} [props.showShuffle=true] - Show shuffle button
 * @param {string} [props.accentColor="#8b5cf6"] - Accent color
 */
export default function SmartTextArea({
  value,
  onChange,
  prompts = [
    "What makes this role special?",
    "Describe the perfect candidate...",
    "What would you tell a friend about this job?",
    "What's the one thing that sets this apart?"
  ],
  rotationInterval = 5000,
  title,
  minLength,
  maxLength,
  rows = 4,
  showShuffle = true,
  accentColor = "#8b5cf6"
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
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      )}

      {/* Prompt display */}
      {!value?.trim() && prompts.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10">
          <span className="text-xl">💡</span>
          <span
            className={`flex-1 text-white/60 text-sm italic transition-opacity duration-200 ${
              isAnimating ? "opacity-0" : "opacity-100"
            }`}
          >
            {currentPrompt}
          </span>
          <div className="flex gap-1">
            {showShuffle && prompts.length > 1 && (
              <button
                onClick={handleShuffle}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                title="Show different prompt"
              >
                <svg
                  className="w-4 h-4 text-white/50"
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
              className="px-3 py-1 rounded-lg text-xs font-medium text-white hover:opacity-90 transition-colors"
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
          className={`w-full px-4 py-3 rounded-xl bg-white/5 border text-white placeholder:text-white/30 focus:outline-none resize-none transition-all ${
            isOverMax
              ? "border-red-500 focus:border-red-500"
              : "border-white/10 focus:border-white/30"
          }`}
          style={{
            borderColor:
              value?.trim() && !isOverMax && !isUnderMin
                ? `${accentColor}40`
                : undefined
          }}
        />

        {/* Floating placeholder when empty */}
        {!value?.trim() && prompts.length > 0 && (
          <div className="absolute inset-0 flex items-start p-4 pointer-events-none">
            <span
              className={`text-white/20 transition-opacity duration-200 ${
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
          {/* Word count */}
          <span className="text-white/40">
            {(value?.trim().split(/\s+/).filter(Boolean).length || 0)} words
          </span>

          {/* Sentence count */}
          <span className="text-white/40">
            {(value?.split(/[.!?]+/).filter((s) => s.trim()).length || 0)} sentences
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Min length indicator */}
          {minLength && (
            <span
              className={`${
                isUnderMin ? "text-amber-400" : "text-green-400"
              }`}
            >
              {isUnderMin
                ? `${minLength - charCount} more needed`
                : "✓ Min met"}
            </span>
          )}

          {/* Character count */}
          <span
            className={`font-mono ${
              isOverMax
                ? "text-red-400"
                : isUnderMin
                  ? "text-amber-400"
                  : "text-white/40"
            }`}
          >
            {charCount}
            {maxLength && ` / ${maxLength}`}
          </span>
        </div>
      </div>

      {/* Progress bar for min/max */}
      {(minLength || maxLength) && (
        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${Math.min((charCount / (maxLength || minLength * 2)) * 100, 100)}%`,
              backgroundColor: isOverMax
                ? "#ef4444"
                : isUnderMin
                  ? "#f59e0b"
                  : accentColor
            }}
          />
          {minLength && (
            <div
              className="absolute top-0 w-0.5 h-1 bg-white/30"
              style={{
                left: `${(minLength / (maxLength || minLength * 2)) * 100}%`
              }}
            />
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onChange("")}
          disabled={!value?.trim()}
          className="px-3 py-1 rounded-lg bg-white/5 text-white/50 text-xs hover:bg-white/10 disabled:opacity-30 transition-colors"
        >
          Clear
        </button>
        <button
          onClick={handleShuffle}
          disabled={!!value?.trim()}
          className="px-3 py-1 rounded-lg bg-white/5 text-white/50 text-xs hover:bg-white/10 disabled:opacity-30 transition-colors"
        >
          New Prompt
        </button>
      </div>
    </div>
  );
}
