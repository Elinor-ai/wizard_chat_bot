"use client";

import { WizardPageClient } from "../../../../components/wizard/wizard-page-client";

export default function WizardEditPage({ params, searchParams }) {
  const jobId = Array.isArray(params?.jobId) ? params.jobId[0] : params?.jobId;
  const modeParam = typeof searchParams?.mode === "string" ? searchParams.mode : null;
  const mode = modeParam === "import" ? "import" : "create";
  return <WizardPageClient jobId={jobId ?? null} mode={mode} />;
}
