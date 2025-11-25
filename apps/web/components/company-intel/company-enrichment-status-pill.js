"use client";

import { useEffect, useRef, useState } from "react";
import { WizardApi } from "../../lib/api-client";
import { useUser } from "../user-context";
import { CompanyIntelModal } from "./company-intel-modal";

const POLL_INTERVAL_MS = 3000;

export function CompanyEnrichmentStatusPill() {
  const { user, isHydrated } = useUser();
  const authToken = user?.authToken ?? null;
  const [company, setCompany] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [modalError, setModalError] = useState(null);

  // We use a ref to prevent polling from overwriting our optimistic state during approval
  const isApprovingRef = useRef(false);
  const autoOpenRef = useRef({ companyId: null, opened: false });

  // 1. Polling Logic
  useEffect(() => {
    if (!authToken || !isHydrated) {
      setCompany(null);
      return;
    }
    let cancelled = false;

    const fetchOverview = async () => {
      // If we are in the middle of approving, pause polling to avoid flickering
      if (isApprovingRef.current) return;

      try {
        const response = await WizardApi.fetchCompanyOverview({ authToken });
        if (cancelled) return;

        const freshCompany = response?.company ?? null;

        // Update state only if data changed to avoid unnecessary re-renders
        setCompany((prev) => {
          if (
            prev?.id === freshCompany?.id &&
            prev?.enrichmentStatus === freshCompany?.enrichmentStatus &&
            prev?.profileConfirmed === freshCompany?.profileConfirmed
          ) {
            return prev;
          }
          return freshCompany;
        });
      } catch (error) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn("Failed to fetch company overview", error);
      }
    };

    // Initial fetch
    fetchOverview();
    const intervalId = setInterval(fetchOverview, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [authToken, isHydrated]);

  // 2. Auto-Open Logic
  useEffect(() => {
    if (!company) {
      setModalOpen(false);
      autoOpenRef.current = { companyId: null, opened: false };
      return;
    }

    // Reset auto-open if we switched companies
    if (autoOpenRef.current.companyId !== company.id) {
      autoOpenRef.current = { companyId: company.id, opened: false };
    }

    // If confirmed, force close
    if (company.profileConfirmed === true) {
      setModalOpen(false);
      autoOpenRef.current.opened = false;
      return;
    }

    // If pending, allow auto-open again in future
    if (company.enrichmentStatus === "PENDING") {
      autoOpenRef.current.opened = false;
    }

    // Trigger Auto Open
    if (
      company.enrichmentStatus === "READY" &&
      autoOpenRef.current.opened === false &&
      !modalOpen
    ) {
      setModalOpen(true);
      autoOpenRef.current.opened = true;
    }
  }, [company, modalOpen]);

  // 3. Fetch Jobs when Modal Opens
  useEffect(() => {
    if (
      !modalOpen ||
      !authToken ||
      company?.enrichmentStatus !== "READY" ||
      company?.profileConfirmed === true
    ) {
      return;
    }
    let cancelled = false;
    setJobsLoading(true);
    WizardApi.fetchCompanyJobs({ authToken })
      .then((response) => {
        if (cancelled) return;
        setJobs(response?.jobs ?? []);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("Failed to fetch discovered jobs", error);
        setJobs([]);
      })
      .finally(() => {
        if (!cancelled) {
          setJobsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    modalOpen,
    authToken,
    company?.enrichmentStatus,
    company?.profileConfirmed,
  ]);

  const handleApprove = async () => {
    if (!company) return;

    // Optimistic Update: Hide everything immediately
    isApprovingRef.current = true;
    setApprovalLoading(true);
    setModalError(null);

    // Force local state to confirmed so UI unmounts immediately
    setCompany((prev) => ({ ...prev, profileConfirmed: true }));
    setModalOpen(false);

    try {
      const response = await WizardApi.confirmCompanyProfile(
        { approved: true, companyId: company.id },
        { authToken }
      );
      // Update with server response
      setCompany(response.company);
    } catch (error) {
      setModalError(error?.message ?? "Unable to confirm profile");
      // Revert optimistic update on error
      setCompany((prev) => ({ ...prev, profileConfirmed: false }));
      setModalOpen(true);
      isApprovingRef.current = false;
    } finally {
      setApprovalLoading(false);
      isApprovingRef.current = false;
    }
  };

  const handleRequestRevision = async ({ name, country, city }) => {
    if (!company) return;
    setApprovalLoading(true);
    setModalError(null);
    isApprovingRef.current = true;

    try {
      const response = await WizardApi.confirmCompanyProfile(
        {
          approved: false,
          companyId: company.id,
          name,
          hqCountry: country,
          hqCity: city,
        },
        { authToken }
      );
      setCompany(response.company);
      setModalOpen(false);
      // Reset auto-open so it pops up again when the new enrichment finishes
      autoOpenRef.current.opened = false;
    } catch (error) {
      setModalError(error?.message ?? "Unable to submit revisions");
    } finally {
      setApprovalLoading(false);
      isApprovingRef.current = false;
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setModalError(null);
  };

  const showPending =
    company &&
    company.profileConfirmed !== true &&
    company.enrichmentStatus === "PENDING";

  const showReady =
    company &&
    company.profileConfirmed !== true &&
    company.enrichmentStatus === "READY";

  // Guard Clause: If confirmed, render absolutely nothing
  if (!company || company.profileConfirmed === true) {
    return null;
  }

  const pill = showPending ? (
    <div className="rounded-full bg-white/90 px-4 py-2 shadow-lg shadow-black/10 ring-1 ring-neutral-200 backdrop-blur animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-2 text-sm font-medium text-neutral-700">
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-neutral-300 border-t-primary-500" />
        <span>
          Scouting {company.name || company.primaryDomain || "company"}…
        </span>
      </div>
    </div>
  ) : showReady ? (
    <button
      type="button"
      onClick={() => setModalOpen(true)}
      className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-300 transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
        Intel ready! View report
      </span>
    </button>
  ) : null;

  return (
    <>
      <CompanyIntelModal
        isOpen={modalOpen}
        mode={company.enrichmentStatus === "READY" ? "ready" : "searching"}
        company={company}
        jobs={jobs}
        onClose={handleCloseModal}
        showApprovalActions={
          company.enrichmentStatus === "READY" &&
          company.profileConfirmed !== true
        }
        onApprove={handleApprove}
        onRequestRevision={handleRequestRevision}
        approvalLoading={approvalLoading}
        footerContent={
          modalError ? (
            <p className="text-sm font-medium text-rose-600">{modalError}</p>
          ) : null
        }
      />
      {pill ? <div className="fixed bottom-6 right-6 z-40">{pill}</div> : null}
    </>
  );
}
