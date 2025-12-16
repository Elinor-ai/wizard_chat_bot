"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WizardApi } from "../../lib/api-client";
import { useUser } from "../user-context";
import { CompanyNameConfirmModal } from "./company-name-confirm-modal";

const DOMAIN_REGEX = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function normalizeDomainInput(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function CompanyList({ companies, mainCompanyId, onSelect }) {
  if (!companies.length) {
    return (
      <p className="text-sm text-neutral-500">
        No companies linked yet. Add one to get started.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {companies.map((company) => {
        const isMain = company.id === mainCompanyId;
        return (
          <li
            key={company.id}
            className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3"
          >
            <div>
              <p className="text-sm font-semibold text-neutral-900">
                {company.name || company.primaryDomain}
              </p>
              <p className="text-xs text-neutral-500">{company.primaryDomain}</p>
              {company.hqCity || company.hqCountry ? (
                <p className="text-xs text-neutral-500">
                  {[company.hqCity, company.hqCountry].filter(Boolean).join(", ")}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {isMain ? (
                <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary-600">
                  Main
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => onSelect(company)}
                className="rounded-full border border-primary-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-700 transition hover:bg-primary-50"
              >
                Select
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function CompanySelectionModal({
  isOpen,
  onClose,
  onSelectCompany,
  onSkipCompany
}) {
  const { user, setUser } = useUser();
  const authToken = user?.authToken ?? null;
  const queryClient = useQueryClient();
  const [addingNew, setAddingNew] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const companiesQuery = useQuery({
    queryKey: ["companies", "settings"],
    queryFn: () => WizardApi.fetchMyCompanies({ authToken }),
    enabled: Boolean(isOpen && authToken),
    staleTime: 60_000
  });

  const companies = companiesQuery.data?.companies ?? [];
  const mainCompanyId = user?.profile?.mainCompanyId ?? null;
  const sortedCompanies = useMemo(() => {
    if (!companies.length) return [];
    return [...companies].sort((a, b) => {
      if (a.id === mainCompanyId) return -1;
      if (b.id === mainCompanyId) return 1;
      return (a.name || a.primaryDomain).localeCompare(b.name || b.primaryDomain);
    });
  }, [companies, mainCompanyId]);

  const createCompanyMutation = useMutation({
    mutationFn: (payload) => WizardApi.createCompany(payload, { authToken }),
    onMutate: () => {
      setErrorMessage(null);
    },
    onSuccess: (response) => {
      const createdCompany = response.company;
      queryClient.invalidateQueries({ queryKey: ["companies", "settings"] });
      if (user) {
        const profile = user.profile ?? {};
        const nextIds = Array.isArray(profile.companyIds) ? [...profile.companyIds] : [];
        if (!nextIds.includes(createdCompany.id)) {
          nextIds.push(createdCompany.id);
        }
        const nextUser = {
          ...user,
          profile: {
            ...profile,
            companyIds: nextIds,
            mainCompanyId: profile.mainCompanyId ?? createdCompany.id,
            companyDomain: profile.companyDomain ?? createdCompany.primaryDomain
          }
        };
        setUser(nextUser);
      }
      setAddingNew(false);
      onSelectCompany?.(createdCompany);
    },
    onError: (error) => {
      setErrorMessage(error?.message ?? "Failed to create company");
    }
  });

  const handleSelect = (company) => {
    onSelectCompany?.(company);
  };

  const handleCancel = () => {
    setErrorMessage(null);
    setAddingNew(false);
    onClose?.();
  };

  const handleCreate = (values) => {
    const normalizedDomain = normalizeDomainInput(values.primaryDomain ?? "");
    if (!DOMAIN_REGEX.test(normalizedDomain)) {
      setErrorMessage("Please enter a valid domain (example.com).");
      return;
    }
    createCompanyMutation.mutate({
      primaryDomain: normalizedDomain,
      name: values.name ?? "",
      hqCountry: values.country ?? "",
      hqCity: values.city ?? ""
    });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-primary-500">
                  Choose company
                </p>
                <h2 className="text-2xl font-bold text-neutral-900">Who are you hiring for?</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Select a company to anchor enrichment, job intel, and wizard defaults.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 transition hover:border-neutral-400"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {companiesQuery.isLoading ? (
                <p className="text-sm text-neutral-500">Loading companies…</p>
              ) : companiesQuery.error ? (
                <p className="text-sm text-rose-600">
                  Failed to load companies. Refresh and try again.
                </p>
              ) : (
                <CompanyList
                  companies={sortedCompanies}
                  mainCompanyId={mainCompanyId}
                  onSelect={handleSelect}
                />
              )}

              <div className="rounded-2xl border border-dashed border-neutral-300 px-4 py-4 text-center">
                <p className="text-sm font-semibold text-neutral-900">Need to add another brand?</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Spin up enrichment for clients or subsidiaries.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setAddingNew(true);
                  }}
                  className="mt-3 rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow shadow-primary-200 transition hover:bg-primary-500"
                >
                  Add new company
                </button>
              </div>

              {onSkipCompany ? (
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 text-center">
                  <p className="text-sm font-semibold text-neutral-900">Not associated with a company?</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    For freelancers, tutors, or independent professionals.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage(null);
                      onSkipCompany();
                    }}
                    className="mt-3 rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-700 shadow-sm transition hover:bg-neutral-100"
                  >
                    Continue without company
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>,
        document.body
      )}

      <CompanyNameConfirmModal
        isOpen={addingNew}
        company={{
          id: "new_company",
          name: "",
          primaryDomain: ""
        }}
        onApprove={() => {}}
        onSubmitCorrections={handleCreate}
        onClose={() => {
          setErrorMessage(null);
          setAddingNew(false);
        }}
        loading={createCompanyMutation.isLoading}
        startInEditing
        domainEditable
        showApproveButton={false}
        titleOverride="Add a new company"
        descriptionOverride="Provide the public domain and HQ info so we can enrich this company."
      />
      {errorMessage && addingNew
        ? createPortal(
            <div className="fixed inset-x-0 bottom-6 z-[1001] flex justify-center">
              <div className="rounded-full bg-rose-500 px-4 py-2 text-xs font-semibold text-white shadow-lg">
                {errorMessage}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
