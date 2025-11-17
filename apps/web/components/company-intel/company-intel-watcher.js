"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { WizardApi } from "../../lib/api-client";
import { useUser } from "../user-context";
import { CompanyIntelModal } from "./company-intel-modal";
import { CompanyIntelIndicator } from "./company-intel-indicator";
import { CompanyNameConfirmModal } from "./company-name-confirm-modal";

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

function shouldPollIntel(company) {
  if (!company || !company.nameConfirmed) {
    return false;
  }
  return company.enrichmentStatus !== "READY" && company.enrichmentStatus !== "FAILED";
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
    if (!autoOpenStage) {
      return;
    }
    if (dismissedMap[stageSignature]) {
      return;
    }
    setActiveStage(stage);
  }, [stage, stageSignature, dismissedMap, autoOpenStage]);

  useEffect(() => {
    if (!company?.id || !shouldPollIntel(company)) {
      return undefined;
    }
    const intervalId = setInterval(() => {
      void companyQuery.refetch();
    }, 4000);
    // Kick off an immediate refresh so users see the transition without waiting for the next tick.
    void companyQuery.refetch();
    return () => clearInterval(intervalId);
  }, [company?.id, company?.enrichmentStatus, company?.nameConfirmed, companyQuery]);

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
    onSuccess: () => {
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
        isOpen={activeStage === "name-confirm"}
        company={company}
        onApprove={() => confirmNameMutation.mutate({ approved: true })}
        onSubmitCorrections={(values) =>
          confirmNameMutation.mutate({ approved: false, ...values })
        }
        onClose={dismissStage}
        loading={confirmNameMutation.isLoading}
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
