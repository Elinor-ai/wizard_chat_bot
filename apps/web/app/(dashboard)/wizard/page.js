"use client";

import { WizardPageClient } from "../../../components/wizard/wizard-page-client";

export default function WizardPage({ searchParams }) {
  const companyIdParam = searchParams?.companyId;
  const companyId =
    typeof companyIdParam === "string" && companyIdParam.length > 0 ? companyIdParam : null;
  const modeParam = typeof searchParams?.mode === "string" ? searchParams.mode : null;
  const mode = modeParam === "import" ? "import" : "create";
  return <WizardPageClient companyId={companyId} mode={mode} />;
}
