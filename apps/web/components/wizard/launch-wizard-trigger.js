"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CompanySelectionModal } from "../company-intel/company-selection-modal";
import { useUser } from "../user-context";

export function WizardLaunchTrigger({ children }) {
  const router = useRouter();
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = useCallback(() => {
    if (!user?.authToken) {
      router.push("/wizard");
      return;
    }
    setIsOpen(true);
  }, [router, user?.authToken]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleSelectCompany = useCallback(
    (company) => {
      setIsOpen(false);
      if (company?.id) {
        router.push(`/wizard?companyId=${company.id}`);
      } else {
        router.push("/wizard");
      }
    },
    [router]
  );

  return (
    <>
      {typeof children === "function" ? children({ onClick: handleClick }) : null}
      <CompanySelectionModal
        isOpen={isOpen}
        onClose={handleClose}
        onSelectCompany={handleSelectCompany}
      />
    </>
  );
}
