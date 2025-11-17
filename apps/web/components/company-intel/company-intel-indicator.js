"use client";

const stageCopy = {
  "name-confirm": {
    label: "Confirm company identity",
    color: "bg-amber-400"
  },
  searching: {
    label: "Scanning company intel…",
    color: "bg-amber-400"
  },
  "profile-review": {
    label: "Review company profile",
    color: "bg-emerald-400"
  },
  results: {
    label: "Company intel ready",
    color: "bg-emerald-400"
  }
};

export function CompanyIntelIndicator({
  visible,
  stage,
  onClick
}) {
  if (!visible) return null;
  const copy = stageCopy[stage] ?? {
    label: "Company intel",
    color: "bg-neutral-400"
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-6 right-6 z-[900] flex items-center gap-3 rounded-full border border-neutral-300 bg-white/95 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-700 shadow-lg shadow-black/10 transition hover:border-primary-400 hover:text-primary-700"
    >
      <span className={`h-2.5 w-2.5 rounded-full ${copy.color} ${stage === "searching" ? "animate-pulse" : ""}`} />
      <span>{copy.label}</span>
    </button>
  );
}
