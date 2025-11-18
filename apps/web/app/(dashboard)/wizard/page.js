"use client";

import { WizardPageClient } from "../../../components/wizard/wizard-page-client";

export default function WizardPage({ searchParams }) {
  const companyIdParam = searchParams?.companyId;
  const companyId =
    typeof companyIdParam === "string" && companyIdParam.length > 0 ? companyIdParam : null;
  return <WizardPageClient companyId={companyId} />;
}
