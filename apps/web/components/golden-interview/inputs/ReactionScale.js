"use client";

import { useState } from "react";

/**
 * ReactionScale - Large emoji buttons with animation/selection state
 * @param {Object} props
 * @param {Array<{id: string, emoji: string, label: string, color?: string}>} props.reactions
 * @param {string} props.value - Selected reaction id
 * @param {function} props.onChange - Callback with selected reaction id
 * @param {string} [props.title] - Title text
 * @param {string} [props.prompt] - Question/prompt text
 */
export default function ReactionScale({
  reactions = [
    { id: "love", emoji: "😍", label: "Love it!", color: "#ef4444" },
    { id: "like", emoji: "🙂", label: "Like it", color: "#f97316" },
    { id: "neutral", emoji: "😐", label: "Neutral", color: "#eab308" },
    { id: "dislike", emoji: "😕", label: "Not great", color: "#84cc16" },
    { id: "hate", emoji: "😤", label: "Hate it", color: "#22c55e" }
  ],
  value,
  onChange,
  title,
  prompt
}) {
  const [animatingId, setAnimatingId] = useState(null);

  const handleSelect = (reactionId) => {
    setAnimatingId(reactionId);

    // Trigger animation
    setTimeout(() => {
      onChange(reactionId);
      setTimeout(() => setAnimatingId(null), 300);
    }, 150);
  };

  const selectedReaction = reactions.find((r) => r.id === value);

  return (
    <div className="w-full space-y-6">
      {title && (
        <h3 className="text-lg font-semibold text-white text-center">{title}</h3>
      )}

      {prompt && (
        <div className="text-center px-4">
          <p className="text-white/70 text-lg">{prompt}</p>
        </div>
      )}

      {/* Reaction buttons */}
      <div className="flex justify-center gap-4">
        {reactions.map((reaction) => {
          const isSelected = value === reaction.id;
          const isAnimating = animatingId === reaction.id;

          return (
            <button
              key={reaction.id}
              onClick={() => handleSelect(reaction.id)}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl transition-all duration-200 ${
                isSelected
                  ? "scale-110"
                  : "hover:scale-105 opacity-60 hover:opacity-100"
              }`}
              style={{
                backgroundColor: isSelected
                  ? `${reaction.color}20`
                  : "transparent"
              }}
            >
              {/* Emoji */}
              <span
                className={`text-5xl transition-transform duration-200 ${
                  isAnimating ? "scale-150 animate-bounce" : ""
                } ${isSelected ? "drop-shadow-lg" : ""}`}
                style={{
                  filter: isSelected
                    ? `drop-shadow(0 0 10px ${reaction.color}60)`
                    : undefined
                }}
              >
                {reaction.emoji}
              </span>

              {/* Label */}
              <span
                className={`text-xs font-medium transition-colors ${
                  isSelected ? "text-white" : "text-white/50"
                }`}
              >
                {reaction.label}
              </span>

              {/* Selection indicator */}
              <div
                className={`w-2 h-2 rounded-full transition-all ${
                  isSelected ? "opacity-100 scale-100" : "opacity-0 scale-0"
                }`}
                style={{ backgroundColor: reaction.color }}
              />
            </button>
          );
        })}
      </div>

      {/* Selected feedback */}
      {selectedReaction && (
        <div
          className="text-center p-4 rounded-xl transition-all duration-300"
          style={{
            backgroundColor: `${selectedReaction.color}15`,
            border: `1px solid ${selectedReaction.color}30`
          }}
        >
          <span
            className="text-lg font-medium"
            style={{ color: selectedReaction.color }}
          >
            {selectedReaction.label}
          </span>
        </div>
      )}

      {/* Scale visualization */}
      <div className="pt-4">
        <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
          {/* Gradient background */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to right, ${reactions.map((r) => r.color).join(", ")})`
            }}
          />

          {/* Selected position indicator */}
          {value && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-lg transition-all duration-300"
              style={{
                left: `${(reactions.findIndex((r) => r.id === value) / (reactions.length - 1)) * 100}%`,
                transform: "translate(-50%, -50%)",
                boxShadow: `0 0 10px ${selectedReaction?.color || "white"}`
              }}
            />
          )}
        </div>

        {/* Scale labels */}
        <div className="flex justify-between mt-2">
          <span className="text-xs text-white/40">{reactions[0]?.label}</span>
          <span className="text-xs text-white/40">
            {reactions[reactions.length - 1]?.label}
          </span>
        </div>
      </div>
    </div>
  );
}
