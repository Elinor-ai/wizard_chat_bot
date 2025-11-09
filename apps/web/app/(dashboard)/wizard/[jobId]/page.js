"use client";

import { WizardPageClient } from "../../../../components/wizard/wizard-page-client";

export default function WizardEditPage({ params }) {
  const jobId = Array.isArray(params?.jobId) ? params.jobId[0] : params?.jobId;
  return <WizardPageClient jobId={jobId ?? null} />;
}
