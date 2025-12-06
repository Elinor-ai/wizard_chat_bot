"use client";

/**
 * TagInputTextArea - Large text input with word counter and clickable suggestion tags
 * @param {Object} props
 * @param {string} props.value - Current text value
 * @param {function} props.onChange - Callback with new text value
 * @param {Array<string>} [props.suggestions] - Suggestion tags to display
 * @param {string} [props.title] - Title text
 * @param {string} [props.placeholder] - Placeholder text
 * @param {number} [props.maxWords] - Maximum word count
 * @param {number} [props.minWords] - Minimum word count
 * @param {boolean} [props.centered=true] - Center the text input
 * @param {string} [props.accentColor="#8b5cf6"] - Accent color
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
  accentColor = "#8b5cf6"
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
        <h3 className="text-lg font-semibold text-white text-center">{title}</h3>
      )}

      {/* Main text input */}
      <div className="relative">
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={`w-full px-6 py-4 rounded-2xl bg-white/5 border text-white text-lg placeholder:text-white/30 focus:outline-none resize-none transition-all ${
            centered ? "text-center" : ""
          } ${
            isOverMax
              ? "border-red-500"
              : value?.trim()
                ? `border-opacity-40`
                : "border-white/10"
          }`}
          style={{
            borderColor:
              value?.trim() && !isOverMax ? accentColor : undefined
          }}
        />

        {/* Word count badge */}
        <div
          className={`absolute bottom-3 right-3 px-2 py-1 rounded-full text-xs font-medium ${
            isOverMax
              ? "bg-red-500/20 text-red-400"
              : isUnderMin
                ? "bg-amber-500/20 text-amber-400"
                : "bg-white/10 text-white/50"
          }`}
        >
          {wordCount}
          {maxWords ? ` / ${maxWords}` : ""} words
        </div>
      </div>

      {/* Word progress bar */}
      {(minWords || maxWords) && (
        <div className="px-4">
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden relative">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min((wordCount / (maxWords || minWords * 2)) * 100, 100)}%`,
                backgroundColor: isOverMax
                  ? "#ef4444"
                  : isUnderMin
                    ? "#f59e0b"
                    : accentColor
              }}
            />
            {minWords && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white/40"
                style={{
                  left: `${(minWords / (maxWords || minWords * 2)) * 100}%`
                }}
              />
            )}
          </div>
          <div className="flex justify-between mt-1 text-xs text-white/40">
            {minWords && <span>Min: {minWords}</span>}
            {maxWords && <span className="ml-auto">Max: {maxWords}</span>}
          </div>
        </div>
      )}

      {/* Suggestion tags */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="text-white/40 text-xs uppercase tracking-wide text-center">
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
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    isUsed
                      ? "bg-white/5 text-white/30 cursor-not-allowed line-through"
                      : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white hover:scale-105"
                  }`}
                  style={{
                    backgroundColor: isUsed ? undefined : `${accentColor}15`,
                    borderColor: isUsed ? undefined : `${accentColor}30`
                  }}
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
          className={`text-center text-sm ${
            isOverMax ? "text-red-400" : "text-amber-400"
          }`}
        >
          {isOverMax
            ? `Please reduce by ${wordCount - maxWords} word${wordCount - maxWords > 1 ? "s" : ""}`
            : `Please add ${minWords - wordCount} more word${minWords - wordCount > 1 ? "s" : ""}`}
        </div>
      )}

      {/* Character and sentence stats */}
      <div className="flex justify-center gap-6 text-xs text-white/30">
        <span>{value?.length || 0} characters</span>
        <span>
          {(value?.split(/[.!?]+/).filter((s) => s.trim()).length || 0)} sentences
        </span>
      </div>

      {/* Clear button */}
      {value?.trim() && (
        <div className="text-center">
          <button
            onClick={() => onChange("")}
            className="text-white/40 text-sm hover:text-white/60 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
