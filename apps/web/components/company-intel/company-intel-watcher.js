"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WizardApi } from "../../lib/api-client";
import { useUser } from "../user-context";
import { CompanyIntelModal } from "./company-intel-modal";
import { CompanyIntelIndicator } from "./company-intel-indicator";
import { CompanyNameConfirmModal } from "./company-name-confirm-modal";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

function determineStage(company) {
  if (!company) return null;
  if (!company.nameConfirmed) {
    return "name-confirm";
  }
  if (
    company.enrichmentStatus === "FAILED" &&
    company.nameConfirmed &&
    !company.profileConfirmed
  ) {
    return "profile-review";
  }
  if (company.enrichmentStatus !== "READY") {
    return "searching";
  }
  if (!company.profileConfirmed) {
    return "profile-review";
  }
  return "results";
}

function buildStageSignature(stage, company) {
  if (!stage || !company) return null;
  const updatedAt =
    company.updatedAt instanceof Date
      ? company.updatedAt.toISOString()
      : company.updatedAt ?? "";
  switch (stage) {
    case "name-confirm":
      return `name:${company.id}`;
    case "searching":
      return `search:${company.id}:${company.enrichmentStatus}`;
    case "profile-review":
      return `profile:${company.id}:${updatedAt}`;
    case "results":
      return `results:${company.id}:${updatedAt}`;
    default:
      return null;
  }
}

function shouldAutoOpenStage(stage, company) {
  if (!stage || !company) {
    return false;
  }
  if (stage === "name-confirm") {
    return true;
  }
  if (
    stage === "profile-review" &&
    company.nameConfirmed &&
    !company.profileConfirmed &&
    company.enrichmentStatus === "READY"
  ) {
    return true;
  }
  return false;
}

export function CompanyIntelWatcher() {
  const { user, isHydrated } = useUser();
  const queryClient = useQueryClient();
  const authToken = user?.authToken;
  const [storageKey, setStorageKey] = useState(null);
  const [dismissedMap, setDismissedMap] = useState({});
  const [activeStage, setActiveStage] = useState(null);

  const companyQuery = useQuery({
    queryKey: ["company-intel", "me"],
    queryFn: () => WizardApi.fetchCompanyOverview({ authToken }),
    enabled: Boolean(authToken && isHydrated),
    retry: false
  });

  const company = companyQuery.data?.company ?? null;
  const stage = determineStage(company);
  const stageSignature = buildStageSignature(stage, company);
  const autoOpenStage = shouldAutoOpenStage(stage, company);

  const jobsQuery = useQuery({
    queryKey: ["company-intel", "jobs", company?.id],
    queryFn: () => WizardApi.fetchCompanyJobs({ authToken }),
    enabled: Boolean(authToken && company?.id && company.enrichmentStatus === "READY"),
    staleTime: 60_000,
    retry: false
  });
  const jobs = jobsQuery.data?.jobs ?? [];

  useEffect(() => {
    if (!company?.id || typeof window === "undefined") {
      setStorageKey(null);
      setDismissedMap({});
      return;
    }
    const key = `company-intel:prefs:${company.id}`;
    setStorageKey(key);
    try {
      const stored = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      setDismissedMap(stored);
    } catch {
      setDismissedMap({});
    }
  }, [company?.id]);

  useEffect(() => {
    if (!stage || !stageSignature) {
      setActiveStage(null);
      return;
    }

    // Check if already dismissed
    if (dismissedMap[stageSignature]) {
      return;
    }

    // Update activeStage to match current stage, whether modal is open or not
    // This handles: searching → profile-review transitions while modal is open
    // and auto-opening when stage becomes available
    setActiveStage((prev) => {
      // If modal is already open (prev !== null), always update to current stage
      if (prev !== null) {
        return stage;
      }
      // If modal is not open, only open if auto-open is enabled
      if (autoOpenStage) {
        return stage;
      }
      // Otherwise keep it closed
      return null;
    });
  }, [stage, stageSignature, dismissedMap, autoOpenStage]);

  useEffect(() => {
    if (!company?.id || typeof window === "undefined") {
      return undefined;
    }
    const source = new EventSource(
      `${API_BASE_URL}/companies/stream/${company.id}`,
      { withCredentials: true }
    );

    const handleCompanyUpdate = (event) => {
      try {
        const payload = JSON.parse(event.data ?? "{}");
        const nextCompany = payload.company ?? null;
        if (!nextCompany) return;
        queryClient.setQueryData(["company-intel", "me"], (prev) => {
          const base = prev ?? {};
          const hasJobs =
            base?.hasDiscoveredJobs ??
            (nextCompany?.jobDiscoveryStatus === "FOUND_JOBS");
          return {
            ...base,
            company: nextCompany,
            hasDiscoveredJobs: Boolean(hasJobs)
          };
        });
      } catch {
        // ignore malformed payloads
      }
    };

    const handleJobsUpdate = (event) => {
      try {
        const payload = JSON.parse(event.data ?? "{}");
        const nextJobs = Array.isArray(payload.jobs) ? payload.jobs : [];
        queryClient.setQueryData(["company-intel", "jobs", company.id], {
          companyId: company.id,
          jobs: nextJobs
        });
      } catch {
        // ignore malformed payloads
      }
    };

    source.addEventListener("company_updated", handleCompanyUpdate);
    source.addEventListener("jobs_updated", handleJobsUpdate);

    source.onerror = () => {
      // Let react-query handle manual refetches on error if needed
    };

    return () => {
      source.removeEventListener("company_updated", handleCompanyUpdate);
      source.removeEventListener("jobs_updated", handleJobsUpdate);
      source.close();
    };
  }, [company?.id, queryClient]);

  const persistDismissed = useCallback(
    (next) => {
      if (!storageKey || typeof window === "undefined") return;
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    },
    [storageKey]
  );

  const dismissStage = useCallback(() => {
    if (!stageSignature) return;
    setDismissedMap((prev) => {
      const next = { ...prev, [stageSignature]: true };
      persistDismissed(next);
      return next;
    });
    setActiveStage(null);
  }, [stageSignature, persistDismissed]);

  const reopenStage = useCallback(() => {
    if (!stageSignature) return;
    setDismissedMap((prev) => {
      const next = { ...prev };
      delete next[stageSignature];
      persistDismissed(next);
      return next;
    });
    setActiveStage(stage);
  }, [stage, stageSignature, persistDismissed]);

  const confirmNameMutation = useMutation({
    mutationFn: (payload) => WizardApi.confirmCompanyName(payload, { authToken }),
    onSuccess: (response) => {
      if (response) {
        queryClient.setQueryData(["company-intel", "me"], response);
      }
      setDismissedMap({});
      persistDismissed({});
      setActiveStage(null);
      companyQuery.refetch();
    }
  });

  const confirmProfileMutation = useMutation({
    mutationFn: (payload) => WizardApi.confirmCompanyProfile(payload, { authToken }),
    onSuccess: () => {
      setActiveStage(null);
      companyQuery.refetch();
      jobsQuery.refetch();
    }
  });

  const indicatorVisible = Boolean(company && stage);

  const intelModalStages = new Set(["searching", "profile-review", "results"]);
  const intelModalOpen = Boolean(activeStage && intelModalStages.has(activeStage));
  const intelModalMode = activeStage === "searching" ? "searching" : "ready";

  return (
    <>
      <CompanyNameConfirmModal
        isOpen={activeStage === "name-confirm" && !confirmNameMutation.isLoading}
        company={company}
        onApprove={() => confirmNameMutation.mutate({ approved: true })}
        onSubmitCorrections={(values) =>
          confirmNameMutation.mutate({ approved: false, ...values })
        }
        onClose={dismissStage}
        loading={confirmNameMutation.isLoading}
        domainEditable
      />
      <CompanyIntelModal
        isOpen={intelModalOpen}
        mode={intelModalMode}
        company={company}
        jobs={jobs}
        onClose={dismissStage}
        showApprovalActions={activeStage === "profile-review"}
        onApprove={() => confirmProfileMutation.mutate({ approved: true })}
        onRequestRevision={(values) =>
          confirmProfileMutation.mutate({ approved: false, ...values })
        }
        approvalLoading={confirmProfileMutation.isLoading}
      />
      <CompanyIntelIndicator visible={indicatorVisible} stage={stage} onClick={reopenStage} />
    </>
  );
}
