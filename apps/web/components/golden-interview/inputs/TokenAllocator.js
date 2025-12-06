"use client";

/**
 * TokenAllocator - Fixed pool of tokens distributed across categories
 * @param {Object} props
 * @param {Array<{id: string, label: string, icon?: React.ReactNode, description?: string}>} props.categories
 * @param {Object} props.value - { [categoryId]: number }
 * @param {function} props.onChange - Callback with updated value object
 * @param {number} [props.totalTokens=10] - Total tokens available
 * @param {string} [props.title] - Title text
 * @param {string} [props.tokenIcon="🪙"] - Icon for tokens
 * @param {string} [props.accentColor="#f59e0b"] - Accent color
 */
export default function TokenAllocator({
  categories,
  value = {},
  onChange,
  totalTokens = 10,
  title,
  tokenIcon = "🪙",
  accentColor = "#f59e0b"
}) {
  const usedTokens = Object.values(value).reduce((sum, v) => sum + (v || 0), 0);
  const remainingTokens = totalTokens - usedTokens;

  const handleIncrement = (categoryId) => {
    if (remainingTokens <= 0) return;

    const current = value[categoryId] || 0;
    onChange({ ...value, [categoryId]: current + 1 });
  };

  const handleDecrement = (categoryId) => {
    const current = value[categoryId] || 0;
    if (current <= 0) return;

    onChange({ ...value, [categoryId]: current - 1 });
  };

  const handleReset = () => {
    const reset = {};
    categories.forEach((cat) => {
      reset[cat.id] = 0;
    });
    onChange(reset);
  };

  return (
    <div className="w-full space-y-4">
      {title && (
        <h3 className="text-lg font-semibold text-white text-center">{title}</h3>
      )}

      {/* Token pool display */}
      <div
        className="p-4 rounded-xl text-center"
        style={{
          background: `linear-gradient(135deg, ${accentColor}20, ${accentColor}05)`,
          border: `1px solid ${accentColor}30`
        }}
      >
        <div className="text-white/60 text-sm mb-2">Tokens Remaining</div>
        <div className="flex justify-center gap-1 flex-wrap">
          {Array.from({ length: totalTokens }).map((_, i) => (
            <span
              key={i}
              className={`text-2xl transition-all duration-300 ${
                i < remainingTokens
                  ? "opacity-100 scale-100"
                  : "opacity-20 scale-90"
              }`}
            >
              {tokenIcon}
            </span>
          ))}
        </div>
        <div className="mt-2 text-sm">
          <span style={{ color: accentColor }} className="font-bold">
            {remainingTokens}
          </span>
          <span className="text-white/40"> / {totalTokens}</span>
        </div>
      </div>

      {/* Category allocations */}
      <div className="space-y-3">
        {categories.map((category) => {
          const allocated = value[category.id] || 0;
          const canIncrement = remainingTokens > 0;
          const canDecrement = allocated > 0;

          return (
            <div
              key={category.id}
              className={`p-4 rounded-xl border transition-all ${
                allocated > 0
                  ? "bg-gradient-to-r from-white/5 to-transparent"
                  : "bg-white/5"
              }`}
              style={{
                borderColor: allocated > 0 ? `${accentColor}40` : "rgba(255,255,255,0.1)"
              }}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                {category.icon && (
                  <span className="text-2xl flex-shrink-0">{category.icon}</span>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium">{category.label}</div>
                  {category.description && (
                    <div className="text-white/40 text-xs mt-0.5">
                      {category.description}
                    </div>
                  )}

                  {/* Token display */}
                  <div className="flex gap-0.5 mt-2 flex-wrap">
                    {Array.from({ length: allocated }).map((_, i) => (
                      <span
                        key={i}
                        className="text-lg animate-bounce"
                        style={{ animationDelay: `${i * 50}ms` }}
                      >
                        {tokenIcon}
                      </span>
                    ))}
                    {allocated === 0 && (
                      <span className="text-white/30 text-sm">No tokens allocated</span>
                    )}
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleDecrement(category.id)}
                    disabled={!canDecrement}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold transition-all ${
                      canDecrement
                        ? "bg-white/10 text-white hover:bg-white/20 active:scale-95"
                        : "bg-white/5 text-white/20 cursor-not-allowed"
                    }`}
                  >
                    −
                  </button>

                  <div
                    className="w-12 h-10 rounded-xl flex items-center justify-center text-lg font-bold"
                    style={{
                      backgroundColor: allocated > 0 ? `${accentColor}30` : "rgba(255,255,255,0.05)",
                      color: allocated > 0 ? accentColor : "rgba(255,255,255,0.4)"
                    }}
                  >
                    {allocated}
                  </div>

                  <button
                    onClick={() => handleIncrement(category.id)}
                    disabled={!canIncrement}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold transition-all ${
                      canIncrement
                        ? "text-white hover:opacity-90 active:scale-95"
                        : "bg-white/5 text-white/20 cursor-not-allowed"
                    }`}
                    style={{
                      backgroundColor: canIncrement ? accentColor : undefined
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reset button */}
      <button
        onClick={handleReset}
        className="w-full py-2 rounded-lg bg-white/5 text-white/50 text-sm hover:bg-white/10 hover:text-white/70 transition-all"
      >
        Reset All Tokens
      </button>

      {/* Priority ranking */}
      {usedTokens > 0 && (
        <div className="pt-4 border-t border-white/10">
          <div className="text-white/50 text-xs uppercase tracking-wide mb-2">
            Your Priorities
          </div>
          <div className="space-y-2">
            {[...categories]
              .filter((cat) => (value[cat.id] || 0) > 0)
              .sort((a, b) => (value[b.id] || 0) - (value[a.id] || 0))
              .map((category, index) => {
                const allocated = value[category.id] || 0;
                const percentage = (allocated / totalTokens) * 100;

                return (
                  <div key={category.id} className="flex items-center gap-3">
                    <span className="text-white/40 text-sm w-6">#{index + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white/80 text-sm flex items-center gap-1">
                          {category.icon && <span>{category.icon}</span>}
                          {category.label}
                        </span>
                        <span className="text-white/40 text-xs">
                          {allocated} tokens ({Math.round(percentage)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: accentColor
                          }}
                        />
                      </div>
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
