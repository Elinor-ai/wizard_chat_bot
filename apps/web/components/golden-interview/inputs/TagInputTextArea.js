"use client";

/**
 * TagInputTextArea - Light Mode Version
 */
export default function TagInputTextArea({
  value,
  onChange,
  suggestions = [],
  title,
  placeholder = "Type your answer...",
  maxWords,
  minWords,
  centered = true,
  accentColor = "#8b5cf6",
}) {
  const words = value?.trim().split(/\s+/).filter(Boolean) || [];
  const wordCount = words.length;
  const isUnderMin = minWords && wordCount < minWords;
  const isOverMax = maxWords && wordCount > maxWords;

  const handleSuggestionClick = (suggestion) => {
    const currentText = value?.trim() || "";
    const separator = currentText ? " " : "";
    onChange(currentText + separator + suggestion);
  };

  const hasUsedSuggestion = (suggestion) => {
    return value?.toLowerCase().includes(suggestion.toLowerCase());
  };

  return (
    <div className="w-full space-y-4">
      {title && (
        <h3 className="text-lg font-semibold text-slate-900 text-center">
          {title}
        </h3>
      )}

      {/* Main text input */}
      <div className="relative">
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={5}
          className={`w-full px-6 py-4 rounded-2xl border text-lg focus:outline-none resize-none transition-all
            bg-slate-50 
            text-slate-900 
            placeholder:text-slate-400
            ${centered ? "text-center" : ""} 
            ${
              isOverMax
                ? "border-red-500 focus:border-red-500"
                : "border-slate-200 focus:border-purple-500"
            }`}
          style={{
            // Only apply custom border color on focus or if valid, handled by class above otherwise
            borderColor: value?.trim() && !isOverMax ? accentColor : undefined,
          }}
        />

        {/* Word count badge */}
        <div
          className={`absolute bottom-3 right-3 px-2 py-1 rounded-md text-xs font-medium border ${
            isOverMax
              ? "bg-red-50 text-red-600 border-red-100"
              : isUnderMin
                ? "bg-amber-50 text-amber-600 border-amber-100"
                : "bg-white text-slate-400 border-slate-100 shadow-sm"
          }`}
        >
          {wordCount}
          {maxWords ? ` / ${maxWords}` : ""} words
        </div>
      </div>

      {/* Word progress bar */}
      {(minWords || maxWords) && (
        <div className="px-4">
          {/* Changed track color to slate-100 (visible on white) */}
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden relative">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(
                  (wordCount / (maxWords || minWords * 2)) * 100,
                  100
                )}%`,
                backgroundColor: isOverMax
                  ? "#ef4444"
                  : isUnderMin
                    ? "#f59e0b"
                    : accentColor,
              }}
            />
            {minWords && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white border-x border-slate-200"
                style={{
                  left: `${(minWords / (maxWords || minWords * 2)) * 100}%`,
                }}
              />
            )}
          </div>
          <div className="flex justify-between mt-1 text-xs text-slate-400">
            {minWords && <span>Min: {minWords}</span>}
            {maxWords && <span className="ml-auto">Max: {maxWords}</span>}
          </div>
        </div>
      )}

      {/* Suggestion tags */}
      {suggestions.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="text-slate-400 text-xs uppercase tracking-wide text-center font-semibold">
            Click to add
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((suggestion) => {
              const isUsed = hasUsedSuggestion(suggestion);

              return (
                <button
                  key={suggestion}
                  onClick={() => handleSuggestionClick(suggestion)}
                  disabled={isUsed}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                    isUsed
                      ? "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed line-through"
                      : "bg-white text-slate-600 border-slate-200 hover:border-purple-300 hover:text-purple-600 hover:shadow-sm hover:-translate-y-0.5"
                  }`}
                >
                  + {suggestion}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Status messages */}
      {(isUnderMin || isOverMax) && (
        <div
          className={`text-center text-sm font-medium ${
            isOverMax ? "text-red-500" : "text-amber-500"
          }`}
        >
          {isOverMax
            ? `Please reduce by ${wordCount - maxWords} word${
                wordCount - maxWords > 1 ? "s" : ""
              }`
            : `Please add ${minWords - wordCount} more word${
                minWords - wordCount > 1 ? "s" : ""
              }`}
        </div>
      )}

      {/* Character and sentence stats */}
      <div className="flex justify-center gap-6 text-xs text-slate-400">
        <span>{value?.length || 0} characters</span>
        <span>
          {value?.split(/[.!?]+/).filter((s) => s.trim()).length || 0} sentences
        </span>
      </div>

      {/* Clear button */}
      {value?.trim() && (
        <div className="text-center">
          <button
            onClick={() => onChange("")}
            className="text-slate-400 text-sm hover:text-red-500 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
