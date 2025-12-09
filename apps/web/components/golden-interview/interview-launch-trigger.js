"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CompanySelectionModal } from "../company-intel/company-selection-modal";
import { useUser } from "../user-context";

/**
 * InterviewLaunchTrigger
 *
 * A render-props component that wraps the "Start AI Interview" button.
 * It opens the CompanySelectionModal to capture company context BEFORE
 * navigating to the /golden-interview page.
 *
 * Usage:
 * ```jsx
 * <InterviewLaunchTrigger>
 *   {({ onClick }) => (
 *     <button onClick={onClick}>Start AI Interview</button>
 *   )}
 * </InterviewLaunchTrigger>
 * ```
 */
export function InterviewLaunchTrigger({ children }) {
  const router = useRouter();
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);

  const authToken = user?.authToken ?? null;

  const handleClick = useCallback(() => {
    if (!authToken) {
      // If not authenticated, redirect directly (auth will handle it)
      router.push("/golden-interview");
      return;
    }
    setIsOpen(true);
  }, [authToken, router]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleSelectCompany = useCallback(
    (company) => {
      setIsOpen(false);

      if (!company?.id) {
        // Fallback: navigate without context (agent will ask)
        router.push("/golden-interview");
        return;
      }

      // Build URL with both companyId and companyName for immediate UI display
      const params = new URLSearchParams();
      params.set("companyId", company.id);

      if (company.name) {
        params.set("companyName", company.name);
      }

      router.push(`/golden-interview?${params.toString()}`);
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
