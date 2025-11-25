"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CompanySelectionModal } from "../company-intel/company-selection-modal";
import { CompanyIntelModal } from "../company-intel/company-intel-modal";
import { useUser } from "../user-context";
import { WizardApi } from "../../lib/api-client";
import {
  canSkipWizardForCompany,
  filterUsableCompanyJobs
} from "../../lib/company-job-helpers";
import { ExistingJobsModal } from "./existing-jobs-modal";
import { importCompanyJob as importCompanyJobService } from "./wizard-services";

function isCompanyIntelReady(company) {
  if (!company) return false;
  return company.enrichmentStatus === "READY" || company.enrichmentStatus === "FAILED";
}

export function WizardLaunchTrigger({ children }) {
  const router = useRouter();
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [existingJobs, setExistingJobs] = useState([]);
  const [existingJobsOpen, setExistingJobsOpen] = useState(false);
  const [jobsError, setJobsError] = useState(null);
  const [importingJobId, setImportingJobId] = useState(null);
  const [intelModalOpen, setIntelModalOpen] = useState(false);
  const [intelModalMode, setIntelModalMode] = useState("searching");
  const [intelModalCompany, setIntelModalCompany] = useState(null);
  const [intelModalShowApproval, setIntelModalShowApproval] = useState(false);
  const [intelJobsPreview, setIntelJobsPreview] = useState([]);
  const [intelApprovalLoading, setIntelApprovalLoading] = useState(false);
  const [intelPollingCompanyId, setIntelPollingCompanyId] = useState(null);
  const [intelJobsFetchedFor, setIntelJobsFetchedFor] = useState(null);
  const navigationGuardRef = useRef(false);

  const authToken = user?.authToken ?? null;

  const handleClick = useCallback(() => {
    if (!authToken) {
      router.push("/wizard");
      return;
    }
    setIsOpen(true);
  }, [authToken, router]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const fetchCompanyJobs = useCallback(
    async (companyId) => {
      if (!companyId || !authToken) {
        return [];
      }
      try {
        const response = await WizardApi.fetchCompanyJobsByCompany(companyId, {
          authToken
        });
        return response?.jobs ?? [];
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("Failed to fetch company jobs", error);
        return [];
      }
    },
    [authToken]
  );

  const openExistingJobsIfAvailable = useCallback(
    (company, jobs) => {
      if (!company || !Array.isArray(jobs) || jobs.length === 0) {
        return false;
      }
      if (!canSkipWizardForCompany(company, jobs)) {
        return false;
      }
      const usable = filterUsableCompanyJobs(jobs);
      if (usable.length === 0) {
        return false;
      }
      setExistingJobs(usable);
      setExistingJobsOpen(true);
      return true;
    },
    []
  );

  const launchWizardForCompany = useCallback(
    (company) => {
      if (!company?.id) {
        router.push("/wizard");
        return;
      }
      if (!authToken) {
        router.push(`/wizard?companyId=${company.id}`);
        return;
      }
      setJobsError(null);
      setSelectedCompany(company);
      (async () => {
        const jobs = await fetchCompanyJobs(company.id);
        if (openExistingJobsIfAvailable(company, jobs)) {
          return;
        }
        router.push(`/wizard?companyId=${company.id}`);
      })();
    },
    [authToken, fetchCompanyJobs, openExistingJobsIfAvailable, router]
  );

  const beginCompanyIntelFlow = useCallback(
    (company) => {
      if (!company?.id) {
        router.push("/wizard");
        return;
      }
      navigationGuardRef.current = false;
      setIntelModalCompany(company);
      setIntelModalMode(isCompanyIntelReady(company) ? "ready" : "searching");
      setIntelModalShowApproval(isCompanyIntelReady(company) && !company.profileConfirmed);
      setIntelJobsPreview([]);
      setIntelJobsFetchedFor(null);
      setIntelModalOpen(true);
      setIntelPollingCompanyId(company.id);
      if (isCompanyIntelReady(company)) {
        (async () => {
          const jobs = await fetchCompanyJobs(company.id);
          setIntelJobsPreview(jobs);
          setIntelJobsFetchedFor(company.id);
        })();
      }
    },
    [fetchCompanyJobs, router]
  );

  const handleProfileConfirmationSuccess = useCallback(
    (company) => {
      if (!company?.id) {
        return;
      }
      navigationGuardRef.current = true;
      setIntelModalOpen(false);
      setIntelPollingCompanyId(null);
      setIntelJobsPreview([]);
      setIntelJobsFetchedFor(null);
      setIntelModalCompany(company);
      setSelectedCompany(company);
      launchWizardForCompany(company);
    },
    [launchWizardForCompany]
  );

  const handleSelectCompany = useCallback(
    (company) => {
      setIsOpen(false);
      setJobsError(null);
      if (!company?.id) {
        router.push("/wizard");
        return;
      }
      if (!authToken) {
        router.push(`/wizard?companyId=${company.id}`);
        return;
      }
      setSelectedCompany(company);
      if (company.profileConfirmed) {
        launchWizardForCompany(company);
        return;
      }
      beginCompanyIntelFlow(company);
    },
    [authToken, beginCompanyIntelFlow, launchWizardForCompany, router]
  );

  const handleUseJob = useCallback(
    async (job) => {
      if (!job?.id || !selectedCompany?.id) {
        return;
      }
      if (!authToken) {
        router.push(`/wizard?companyId=${selectedCompany.id}`);
        return;
      }
      setImportingJobId(job.id);
      setJobsError(null);
      try {
        const response = await importCompanyJobService({
          authToken,
          companyJobId: job.id,
          companyId: selectedCompany.id
        });
        setExistingJobsOpen(false);
        setSelectedCompany(null);
        router.push(`/wizard/${response.jobId}?mode=import`);
      } catch (error) {
        setJobsError(error?.message ?? "Unable to import this job.");
      } finally {
        setImportingJobId(null);
      }
    },
    [authToken, router, selectedCompany?.id]
  );

  const handleStartFromScratch = useCallback(() => {
    if (selectedCompany?.id) {
      router.push(`/wizard?companyId=${selectedCompany.id}`);
    } else {
      router.push("/wizard");
    }
    setExistingJobsOpen(false);
    setSelectedCompany(null);
  }, [router, selectedCompany?.id]);

  const handleExistingJobsClose = useCallback(() => {
    setExistingJobsOpen(false);
    setSelectedCompany(null);
  }, []);

  const handleIntelApprove = useCallback(async () => {
    if (!intelModalCompany?.id || !authToken) {
      return;
    }
    setIntelApprovalLoading(true);
    try {
      const response = await WizardApi.confirmCompanyProfile(
        {
          approved: true,
          companyId: intelModalCompany.id
        },
        { authToken }
      );
      const updatedCompany = response?.company ?? intelModalCompany;
      handleProfileConfirmationSuccess(updatedCompany);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to approve company intel", error);
    } finally {
      setIntelApprovalLoading(false);
    }
  }, [authToken, handleProfileConfirmationSuccess, intelModalCompany]);

  const handleIntelRevision = useCallback(
    async (values) => {
      if (!intelModalCompany?.id || !authToken) {
        return;
      }
      setIntelApprovalLoading(true);
      try {
        const response = await WizardApi.confirmCompanyProfile(
          {
            approved: false,
            companyId: intelModalCompany.id,
            ...values
          },
          { authToken }
        );
        const updatedCompany = response?.company ?? intelModalCompany;
        navigationGuardRef.current = false;
        setIntelModalCompany(updatedCompany);
        setSelectedCompany(updatedCompany);
        setIntelModalMode("searching");
        setIntelModalShowApproval(false);
        setIntelJobsPreview([]);
        setIntelJobsFetchedFor(null);
        setIntelPollingCompanyId(updatedCompany.id);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("Failed to submit company corrections", error);
      } finally {
        setIntelApprovalLoading(false);
      }
    },
    [authToken, intelModalCompany]
  );

  const handleIntelClose = useCallback(() => {
    setIntelModalOpen(false);
    setIntelPollingCompanyId(null);
    setIntelJobsPreview([]);
    setIntelJobsFetchedFor(null);
    setIntelModalCompany(null);
    navigationGuardRef.current = false;
    setSelectedCompany(null);
    setExistingJobs([]);
    setExistingJobsOpen(false);
    setIsOpen(true);
  }, []);

  useEffect(() => {
    if (!intelPollingCompanyId || !authToken) {
      return undefined;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await WizardApi.fetchCompanyById(intelPollingCompanyId, {
          authToken
        });
        if (cancelled) {
          return;
        }
        const updatedCompany = response?.company ?? null;
        if (!updatedCompany) {
          return;
        }
        setIntelModalCompany((prev) =>
          prev?.id === updatedCompany.id ? updatedCompany : prev ?? updatedCompany
        );
        setSelectedCompany((prev) =>
          prev?.id === updatedCompany.id ? updatedCompany : prev
        );
        const ready = isCompanyIntelReady(updatedCompany);
        const failed = updatedCompany.enrichmentStatus === "FAILED";
        setIntelModalMode(ready ? "ready" : "searching");
        setIntelModalShowApproval(ready && !updatedCompany.profileConfirmed);
        if (ready && intelJobsFetchedFor !== updatedCompany.id) {
          const jobs = await fetchCompanyJobs(updatedCompany.id);
          if (cancelled) {
            return;
          }
          setIntelJobsPreview(jobs);
          setIntelJobsFetchedFor(updatedCompany.id);
        }
        if ((ready || failed) && intelPollingCompanyId) {
          setIntelPollingCompanyId(null);
        }
        if (ready && updatedCompany.profileConfirmed && !navigationGuardRef.current) {
          handleProfileConfirmationSuccess(updatedCompany);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("Failed to poll company intel", error);
      }
    };
    const intervalId = window.setInterval(poll, 4000);
    poll();
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    authToken,
    fetchCompanyJobs,
    handleProfileConfirmationSuccess,
    intelJobsFetchedFor,
    intelPollingCompanyId
  ]);

  return (
    <>
      {typeof children === "function" ? children({ onClick: handleClick }) : null}
      <CompanySelectionModal
        isOpen={isOpen}
        onClose={handleClose}
        onSelectCompany={handleSelectCompany}
      />
      <ExistingJobsModal
        isOpen={existingJobsOpen}
        company={selectedCompany}
        jobs={existingJobs}
        onUseJob={handleUseJob}
        onStartFromScratch={handleStartFromScratch}
        onClose={handleExistingJobsClose}
        loadingJobId={importingJobId}
        errorMessage={jobsError}
      />
      <CompanyIntelModal
        isOpen={intelModalOpen}
        mode={intelModalMode}
        company={intelModalCompany}
        jobs={intelJobsPreview}
        onClose={handleIntelClose}
        showApprovalActions={intelModalShowApproval}
        onApprove={handleIntelApprove}
        onRequestRevision={handleIntelRevision}
        approvalLoading={intelApprovalLoading}
      />
    </>
  );
}
