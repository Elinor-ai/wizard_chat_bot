"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CompanySelectionModal } from "../company-intel/company-selection-modal";
import { useUser } from "../user-context";
import { WizardApi } from "../../lib/api-client";
import {
  canSkipWizardForCompany,
  filterUsableCompanyJobs
} from "../../lib/company-job-helpers";
import { ExistingJobsModal } from "./existing-jobs-modal";
import { importCompanyJob as importCompanyJobService } from "./wizard-services";

export function WizardLaunchTrigger({ children }) {
  const router = useRouter();
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [existingJobs, setExistingJobs] = useState([]);
  const [existingJobsOpen, setExistingJobsOpen] = useState(false);
  const [jobsError, setJobsError] = useState(null);
  const [importingJobId, setImportingJobId] = useState(null);

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
      setJobsError(null);
      if (!company?.id) {
        router.push("/wizard");
        return;
      }
      if (!user?.authToken) {
        router.push(`/wizard?companyId=${company.id}`);
        return;
      }
      setSelectedCompany(company);
      (async () => {
        try {
          const response = await WizardApi.fetchCompanyJobsByCompany(company.id, {
            authToken: user.authToken
          });
          const rawJobs = response?.jobs ?? [];
          if (canSkipWizardForCompany(company, rawJobs)) {
            const usable = filterUsableCompanyJobs(rawJobs);
            if (usable.length > 0) {
              setExistingJobs(usable);
              setExistingJobsOpen(true);
              return;
            }
          }
          router.push(`/wizard?companyId=${company.id}`);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn("Failed to load company jobs", error);
          router.push(`/wizard?companyId=${company.id}`);
        }
      })();
    },
    [router, user?.authToken]
  );

  const handleUseJob = useCallback(
    async (job) => {
      if (!job?.id || !selectedCompany?.id) {
        return;
      }
      if (!user?.authToken) {
        router.push(`/wizard?companyId=${selectedCompany.id}`);
        return;
      }
      setImportingJobId(job.id);
      setJobsError(null);
      try {
        const response = await importCompanyJobService({
          authToken: user.authToken,
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
    [router, selectedCompany?.id, user?.authToken]
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
    </>
  );
}
