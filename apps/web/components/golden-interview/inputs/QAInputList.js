"use client";

import { useState } from "react";

/**
 * QAInputList - List of Question/Answer input pairs
 * @param {Object} props
 * @param {Object} props.value - { pairs: Array<{question: string, answer: string}> }
 * @param {function} props.onChange - Callback with updated value
 * @param {string} [props.title] - Title text
 * @param {number} [props.maxPairs=10] - Maximum number of Q&A pairs
 * @param {string} [props.questionPlaceholder="Your question..."] - Question placeholder
 * @param {string} [props.answerPlaceholder="The answer..."] - Answer placeholder
 * @param {string} [props.accentColor="#8b5cf6"] - Accent color
 * @param {Array<string>} [props.suggestedQuestions] - Suggested questions to add
 */
export default function QAInputList({
  value = { pairs: [] },
  onChange,
  title,
  maxPairs = 10,
  questionPlaceholder = "What would you like to know?",
  answerPlaceholder = "The answer...",
  accentColor = "#8b5cf6",
  suggestedQuestions = []
}) {
  const [expandedIndex, setExpandedIndex] = useState(null);

  const pairs = value.pairs || [];
  const canAddMore = pairs.length < maxPairs;

  const handleAddPair = (question = "") => {
    if (!canAddMore) return;

    const newPairs = [...pairs, { question, answer: "" }];
    onChange({ ...value, pairs: newPairs });
    setExpandedIndex(newPairs.length - 1);
  };

  const handleUpdatePair = (index, field, text) => {
    const newPairs = pairs.map((pair, i) =>
      i === index ? { ...pair, [field]: text } : pair
    );
    onChange({ ...value, pairs: newPairs });
  };

  const handleRemovePair = (index) => {
    const newPairs = pairs.filter((_, i) => i !== index);
    onChange({ ...value, pairs: newPairs });
    setExpandedIndex(null);
  };

  const handleToggleExpand = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const completePairs = pairs.filter(
    (p) => p.question?.trim() && p.answer?.trim()
  );
  const usedQuestions = pairs.map((p) => p.question?.toLowerCase().trim());
  const availableSuggestions = suggestedQuestions.filter(
    (q) => !usedQuestions.includes(q.toLowerCase().trim())
  );

  return (
    <div className="w-full space-y-4">
      {title && (
        <h3 className="text-lg font-semibold text-white text-center">{title}</h3>
      )}

      {/* Progress */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-white/50">
          {completePairs.length} complete Q&As
        </span>
        <span className="text-white/40">
          {pairs.length} / {maxPairs}
        </span>
      </div>

      {/* Q&A pairs */}
      <div className="space-y-3">
        {pairs.map((pair, index) => {
          const isExpanded = expandedIndex === index;
          const isComplete = pair.question?.trim() && pair.answer?.trim();

          return (
            <div
              key={index}
              className={`rounded-xl border transition-all overflow-hidden ${
                isComplete
                  ? "bg-gradient-to-r from-white/5 to-transparent"
                  : "bg-white/5"
              }`}
              style={{
                borderColor: isComplete
                  ? `${accentColor}40`
                  : "rgba(255,255,255,0.1)"
              }}
            >
              {/* Header */}
              <button
                onClick={() => handleToggleExpand(index)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left"
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{
                    backgroundColor: isComplete
                      ? accentColor
                      : "rgba(255,255,255,0.1)",
                    color: isComplete ? "white" : "rgba(255,255,255,0.5)"
                  }}
                >
                  {isComplete ? "✓" : index + 1}
                </span>

                <div className="flex-1 min-w-0">
                  <div
                    className={`text-sm font-medium truncate ${
                      pair.question?.trim()
                        ? "text-white"
                        : "text-white/40 italic"
                    }`}
                  >
                    {pair.question?.trim() || "Question..."}
                  </div>
                  {!isExpanded && pair.answer?.trim() && (
                    <div className="text-xs text-white/40 truncate mt-0.5">
                      A: {pair.answer}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemovePair(index);
                    }}
                    className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-red-400 transition-colors"
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
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>

                  <svg
                    className={`w-4 h-4 text-white/40 transition-transform ${
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
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-3">
                  {/* Question input */}
                  <div>
                    <label className="text-white/50 text-xs block mb-1">
                      Question
                    </label>
                    <input
                      type="text"
                      value={pair.question || ""}
                      onChange={(e) =>
                        handleUpdatePair(index, "question", e.target.value)
                      }
                      placeholder={questionPlaceholder}
                      className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
                    />
                  </div>

                  {/* Answer input */}
                  <div>
                    <label className="text-white/50 text-xs block mb-1">
                      Answer
                    </label>
                    <textarea
                      value={pair.answer || ""}
                      onChange={(e) =>
                        handleUpdatePair(index, "answer", e.target.value)
                      }
                      placeholder={answerPlaceholder}
                      rows={3}
                      className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add new pair */}
      {canAddMore && (
        <button
          onClick={() => handleAddPair()}
          className="w-full py-3 rounded-xl border-2 border-dashed border-white/20 text-white/50 text-sm hover:border-white/40 hover:text-white/70 transition-colors flex items-center justify-center gap-2"
        >
          <span>+</span>
          <span>Add Q&A Pair</span>
        </button>
      )}

      {/* Suggested questions */}
      {availableSuggestions.length > 0 && canAddMore && (
        <div className="pt-4 border-t border-white/10">
          <div className="text-white/40 text-xs uppercase tracking-wide mb-2">
            Suggested Questions
          </div>
          <div className="flex flex-wrap gap-2">
            {availableSuggestions.slice(0, 5).map((question) => (
              <button
                key={question}
                onClick={() => handleAddPair(question)}
                className="px-3 py-1.5 rounded-full text-xs bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
              >
                + {question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {completePairs.length > 0 && (
        <div className="pt-4 border-t border-white/10">
          <div className="text-white/40 text-xs uppercase tracking-wide mb-3">
            Q&A Summary
          </div>
          <div className="space-y-3">
            {completePairs.map((pair, index) => (
              <div
                key={index}
                className="p-3 rounded-lg bg-white/5 text-sm"
              >
                <div className="font-medium text-white mb-1">
                  Q: {pair.question}
                </div>
                <div className="text-white/60">A: {pair.answer}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
