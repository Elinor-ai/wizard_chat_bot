import { WizardShell } from "../../../components/wizard/wizard-shell";

export default function WizardPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-neutral-900">
          Job creation wizard
        </h1>
        <p className="text-sm text-neutral-600">
          Capture must-have details first. Sidecar LLM agents suggest enriched
          context without affecting the confirmed record until you approve.
        </p>
      </header>

      <WizardShell />
    </div>
  );
}
