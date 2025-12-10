"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WizardApi } from "../../lib/api-client";
import { useUser } from "../user-context";
import { CompanyIntelModal } from "./company-intel-modal";

const REFETCH_INTERVAL_MS = 4000; // Increased to 4s to reduce load

export function CompanyEnrichmentStatusPill() {
  const { user, isHydrated } = useUser();
  const queryClient = useQueryClient();
  const authToken = user?.authToken ?? null;

  const [modalOpen, setModalOpen] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [modalError, setModalError] = useState(null);

  const isApprovingRef = useRef(false);
  const autoOpenRef = useRef({ companyId: null, opened: false });

  // 1. Unified Polling using React Query
  // This replaces the manual setInterval and prevents duplicate requests
  // Uses default staleTime (30s) from QueryClient to avoid duplicate fetches on mount
  const { data: overviewData } = useQuery({
    queryKey: ["company-intel", "me"],
    queryFn: () => WizardApi.fetchCompanyOverview({ authToken }),
    enabled: Boolean(authToken && isHydrated && !isApprovingRef.current),
    refetchInterval: (data) => {
      // Smart Polling: Stop if finished or approving
      if (isApprovingRef.current) return false;
      if (!data?.company) return false;
      const { enrichmentStatus, profileConfirmed } = data.company;

      // Stop polling if confirmed
      if (profileConfirmed) return false;

      // Stop polling if failed (no point spamming)
      if (enrichmentStatus === "FAILED") return false;

      // Poll if PENDING or READY (waiting for user action)
      return REFETCH_INTERVAL_MS;
    },
  });

  const company = overviewData?.company ?? null;

  // 2. Fetch Jobs only when needed (READY state)
  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ["company-intel", "jobs", company?.id],
    queryFn: () => WizardApi.fetchCompanyJobs({ authToken }),
    enabled: Boolean(
      authToken &&
        modalOpen &&
        company?.enrichmentStatus === "READY" &&
        !company?.profileConfirmed
    ),
    staleTime: 60 * 1000, // Jobs don't change often, cache for 1 min
  });

  const jobs = jobsData?.jobs ?? [];

  // 3. Auto-Open Logic
  useEffect(() => {
    if (!company) {
      setModalOpen(false);
      autoOpenRef.current = { companyId: null, opened: false };
      return;
    }

    if (autoOpenRef.current.companyId !== company.id) {
      autoOpenRef.current = { companyId: company.id, opened: false };
    }

    if (company.profileConfirmed === true) {
      setModalOpen(false);
      autoOpenRef.current.opened = false;
      return;
    }

    if (company.enrichmentStatus === "PENDING") {
      autoOpenRef.current.opened = false;
    }

    if (
      company.enrichmentStatus === "READY" &&
      autoOpenRef.current.opened === false &&
      !modalOpen
    ) {
      setModalOpen(true);
      autoOpenRef.current.opened = true;
    }
  }, [company, modalOpen]);

  const handleApprove = async () => {
    if (!company) return;

    // Optimistic Update
    isApprovingRef.current = true;
    setApprovalLoading(true);
    setModalError(null);
    setModalOpen(false);

    // Optimistically update cache to hide UI immediately
    queryClient.setQueryData(["company-intel", "me"], (old) => {
      if (!old?.company) return old;
      return {
        ...old,
        company: { ...old.company, profileConfirmed: true },
      };
    });

    try {
      await WizardApi.confirmCompanyProfile(
        { approved: true, companyId: company.id },
        { authToken }
      );
      // Invalidate to ensure fresh data later
      await queryClient.invalidateQueries(["company-intel", "me"]);
    } catch (error) {
      setModalError(error?.message ?? "Unable to confirm profile");
      // Revert on error
      queryClient.invalidateQueries(["company-intel", "me"]);
      setModalOpen(true);
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

      // Update cache with new company state (likely PENDING again)
      queryClient.setQueryData(["company-intel", "me"], response);

      setModalOpen(false);
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

  // Render Logic
  if (!company || company.profileConfirmed === true) {
    return null;
  }

  const showPending = company.enrichmentStatus === "PENDING";
  const showReady = company.enrichmentStatus === "READY";

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
