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

      // Build URL with new=true to force a new session (don't restore old one)
      const params = new URLSearchParams();
      params.set("new", "true");

      if (!company?.id) {
        // Fallback: navigate without context (agent will ask)
        router.push(`/golden-interview?${params.toString()}`);
        return;
      }

      // Add companyId and companyName for immediate UI display
      params.set("companyId", company.id);

      if (company.name) {
        params.set("companyName", company.name);
      }

      router.push(`/golden-interview?${params.toString()}`);
    },
    [router]
  );

  const handleSkipCompany = useCallback(() => {
    setIsOpen(false);
    // Force new session even when skipping company selection
    router.push("/golden-interview?new=true");
  }, [router]);

  return (
    <>
      {typeof children === "function" ? children({ onClick: handleClick }) : null}
      <CompanySelectionModal
        isOpen={isOpen}
        onClose={handleClose}
        onSelectCompany={handleSelectCompany}
        onSkipCompany={handleSkipCompany}
      />
    </>
  );
}
