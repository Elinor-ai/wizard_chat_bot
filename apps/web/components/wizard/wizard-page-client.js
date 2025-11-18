"use client";

import { WizardShell } from "./wizard-shell";

export function WizardPageClient({ jobId = null, companyId = null }) {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-neutral-900">
          {jobId ? "Continue job wizard" : "Job creation wizard"}
        </h1>
        <p className="text-sm text-neutral-600">
          {jobId
            ? "Pick up where you left off. Your latest saved answers and any recent draft edits are restored automatically."
            : "Capture must-have details first. Sidecar LLM agents suggest enriched context without affecting the confirmed record until you approve."}
        </p>
      </header>

      <WizardShell jobId={jobId ?? null} initialCompanyId={companyId ?? null} />
    </div>
  );
}
