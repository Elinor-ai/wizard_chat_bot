"use client";

import { useState, useCallback } from "react";

/**
 * SwipeDeck - Stack of cards with swipe left/right interaction
 * @param {Object} props
 * @param {Array<{id: string, content: React.ReactNode, title?: string, subtitle?: string}>} props.cards
 * @param {Object} props.value - { left: string[], right: string[] }
 * @param {function} props.onChange - Callback with updated value
 * @param {string} [props.title] - Title text
 * @param {string} [props.leftLabel="No"] - Label for left swipe
 * @param {string} [props.rightLabel="Yes"] - Label for right swipe
 * @param {string} [props.leftColor="#ef4444"] - Color for left
 * @param {string} [props.rightColor="#22c55e"] - Color for right
 */
export default function SwipeDeck({
  cards,
  value = { left: [], right: [] },
  onChange,
  title,
  leftLabel = "No",
  rightLabel = "Yes",
  leftColor = "#ef4444",
  rightColor = "#22c55e"
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const processedIds = [...(value.left || []), ...(value.right || [])];
  const remainingCards = cards.filter((card) => !processedIds.includes(card.id));
  const currentCard = remainingCards[0];
  const nextCard = remainingCards[1];

  const handleSwipe = useCallback(
    (direction) => {
      if (!currentCard || isAnimating) return;

      setSwipeDirection(direction);
      setIsAnimating(true);

      setTimeout(() => {
        const newValue = {
          left: direction === "left" ? [...(value.left || []), currentCard.id] : value.left || [],
          right: direction === "right" ? [...(value.right || []), currentCard.id] : value.right || []
        };
        onChange(newValue);
        setSwipeDirection(null);
        setIsAnimating(false);
        setCurrentIndex((prev) => prev + 1);
      }, 300);
    },
    [currentCard, isAnimating, value, onChange]
  );

  const handleUndo = () => {
    const allProcessed = [...(value.left || []), ...(value.right || [])];
    if (allProcessed.length === 0) return;

    // Find the last processed card
    const lastLeft = value.left?.[value.left.length - 1];
    const lastRight = value.right?.[value.right.length - 1];

    // Determine which was processed last based on original card order
    const lastLeftIndex = lastLeft ? cards.findIndex((c) => c.id === lastLeft) : -1;
    const lastRightIndex = lastRight ? cards.findIndex((c) => c.id === lastRight) : -1;

    if (lastLeftIndex > lastRightIndex && lastLeft) {
      onChange({
        ...value,
        left: value.left.slice(0, -1)
      });
    } else if (lastRight) {
      onChange({
        ...value,
        right: value.right.slice(0, -1)
      });
    }
  };

  const handleReset = () => {
    onChange({ left: [], right: [] });
    setCurrentIndex(0);
  };

  const progress = processedIds.length / cards.length;

  return (
    <div className="w-full space-y-4">
      {title && (
        <h3 className="text-lg font-semibold text-white text-center">{title}</h3>
      )}

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-white/50">
          <span>{processedIds.length} / {cards.length}</span>
          <span>{Math.round(progress * 100)}%</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Card stack */}
      <div className="relative h-80 perspective-1000">
        {/* Next card (behind) */}
        {nextCard && (
          <div className="absolute inset-x-4 top-4 bottom-0 rounded-2xl bg-white/5 border border-white/10 opacity-50 scale-95" />
        )}

        {/* Current card */}
        {currentCard ? (
          <div
            className={`absolute inset-0 rounded-2xl border overflow-hidden transition-all duration-300 ${
              swipeDirection === "left"
                ? "-translate-x-full rotate-[-20deg] opacity-0"
                : swipeDirection === "right"
                  ? "translate-x-full rotate-[20deg] opacity-0"
                  : ""
            }`}
            style={{
              backgroundColor: "rgba(30, 30, 40, 0.95)",
              borderColor:
                swipeDirection === "left"
                  ? leftColor
                  : swipeDirection === "right"
                    ? rightColor
                    : "rgba(255,255,255,0.1)",
              boxShadow:
                swipeDirection === "left"
                  ? `0 0 30px ${leftColor}50`
                  : swipeDirection === "right"
                    ? `0 0 30px ${rightColor}50`
                    : "0 10px 40px rgba(0,0,0,0.3)"
            }}
          >
            {/* Card content */}
            <div className="p-6 h-full flex flex-col">
              {currentCard.title && (
                <h4 className="text-xl font-bold text-white mb-2">
                  {currentCard.title}
                </h4>
              )}
              {currentCard.subtitle && (
                <p className="text-white/50 text-sm mb-4">
                  {currentCard.subtitle}
                </p>
              )}
              <div className="flex-1 flex items-center justify-center text-white">
                {currentCard.content}
              </div>
            </div>

            {/* Swipe indicators */}
            <div
              className={`absolute top-4 left-4 px-4 py-2 rounded-lg font-bold text-lg transition-opacity ${
                swipeDirection === "left" ? "opacity-100" : "opacity-0"
              }`}
              style={{ backgroundColor: leftColor }}
            >
              {leftLabel}
            </div>
            <div
              className={`absolute top-4 right-4 px-4 py-2 rounded-lg font-bold text-lg transition-opacity ${
                swipeDirection === "right" ? "opacity-100" : "opacity-0"
              }`}
              style={{ backgroundColor: rightColor }}
            >
              {rightLabel}
            </div>
          </div>
        ) : (
          /* Completed state */
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex flex-col items-center justify-center">
            <div className="text-4xl mb-4">🎉</div>
            <div className="text-white font-bold text-lg">All Done!</div>
            <div className="text-white/50 text-sm mt-2">
              {value.right?.length || 0} yes, {value.left?.length || 0} no
            </div>
            <button
              onClick={handleReset}
              className="mt-4 px-6 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              Start Over
            </button>
          </div>
        )}
      </div>

      {/* Swipe buttons */}
      {currentCard && (
        <div className="flex justify-center gap-4">
          <button
            onClick={() => handleSwipe("left")}
            disabled={isAnimating}
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all hover:scale-110 active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: `${leftColor}20`,
              border: `2px solid ${leftColor}`,
              color: leftColor
            }}
          >
            ✕
          </button>

          <button
            onClick={handleUndo}
            disabled={processedIds.length === 0}
            className="w-12 h-12 rounded-full bg-white/10 text-white/60 flex items-center justify-center text-lg hover:bg-white/20 transition-all disabled:opacity-30"
          >
            ↩
          </button>

          <button
            onClick={() => handleSwipe("right")}
            disabled={isAnimating}
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all hover:scale-110 active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: `${rightColor}20`,
              border: `2px solid ${rightColor}`,
              color: rightColor
            }}
          >
            ♥
          </button>
        </div>
      )}

      {/* Results summary */}
      {(value.left?.length > 0 || value.right?.length > 0) && (
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: rightColor }}
              />
              <span className="text-white/60 text-sm">{rightLabel}</span>
            </div>
            <div className="space-y-1">
              {(value.right || []).slice(0, 3).map((id) => {
                const card = cards.find((c) => c.id === id);
                return (
                  <div key={id} className="text-xs text-white/40 truncate">
                    {card?.title || card?.id}
                  </div>
                );
              })}
              {(value.right?.length || 0) > 3 && (
                <div className="text-xs text-white/30">
                  +{value.right.length - 3} more
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: leftColor }}
              />
              <span className="text-white/60 text-sm">{leftLabel}</span>
            </div>
            <div className="space-y-1">
              {(value.left || []).slice(0, 3).map((id) => {
                const card = cards.find((c) => c.id === id);
                return (
                  <div key={id} className="text-xs text-white/40 truncate">
                    {card?.title || card?.id}
                  </div>
                );
              })}
              {(value.left?.length || 0) > 3 && (
                <div className="text-xs text-white/30">
                  +{value.left.length - 3} more
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
