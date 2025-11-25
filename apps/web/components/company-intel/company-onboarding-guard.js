"use client";

import { useEffect, useMemo, useState } from "react";
import { WizardApi } from "../../lib/api-client";
import { useUser } from "../user-context";

const INITIAL_FORM = {
  name: "",
  hqCountry: "",
  hqCity: "",
  primaryDomain: ""
};

export function CompanyOnboardingGuard() {
  const { user, isHydrated } = useUser();
  const authToken = user?.authToken ?? null;
  const [isOpen, setIsOpen] = useState(false);
  const [company, setCompany] = useState(null);
  const [view, setView] = useState("confirm");
  const [formState, setFormState] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    if (!authToken || !isHydrated) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await WizardApi.fetchCompanyOverview({ authToken });
        if (cancelled) return;
        if (response?.company && response.company.nameConfirmed === false) {
          setCompany(response.company);
          setFormState({
            name: response.company.name ?? "",
            hqCountry: response.company.hqCountry ?? "",
            hqCity: response.company.hqCity ?? "",
            primaryDomain: response.company.primaryDomain ?? ""
          });
          setIsOpen(true);
          setView("confirm");
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("Failed to fetch company overview", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken, isHydrated]);

  const inferredDomain = useMemo(() => {
    if (company?.primaryDomain) {
      return company.primaryDomain;
    }
    const email = user?.email ?? "";
    const [, domain] = email.split("@");
    return domain ?? "";
  }, [company?.primaryDomain, user?.email]);

  if (!authToken || !isOpen || !company) {
    return null;
  }

  const handleApprove = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await WizardApi.confirmCompanyName(
        { approved: true },
        { authToken }
      );
      setCompany(response.company);
      setIsOpen(false);
    } catch (error) {
      setErrorMessage(error?.message ?? "Unable to confirm company");
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = async (event) => {
    event.preventDefault();
    if (!formState.name.trim()) {
      setErrorMessage("Company name is required.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const payload = {
        approved: false,
        name: formState.name.trim(),
        hqCountry: formState.hqCountry.trim() || undefined,
        hqCity: formState.hqCity.trim() || undefined,
        primaryDomain: formState.primaryDomain.trim() || undefined
      };
      const response = await WizardApi.confirmCompanyName(payload, { authToken });
      setCompany(response.company);
      setIsOpen(false);
    } catch (error) {
      setErrorMessage(error?.message ?? "Unable to update company details");
    } finally {
      setLoading(false);
    }
  };

  const renderConfirmView = () => (
    <>
      <h2 className="text-2xl font-semibold text-neutral-900">Is this your company?</h2>
      <p className="mt-3 text-sm text-neutral-600">
        We detected your email is from{" "}
        <span className="font-semibold text-neutral-900">{company?.name || "your company"}</span>{" "}
        ({inferredDomain || "domain unknown"}). Confirm to continue or update details.
      </p>
      <div className="mt-6 space-y-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
        <p className="text-sm font-medium text-neutral-700">{company?.name || "Unknown name"}</p>
        <p className="text-xs text-neutral-500">{inferredDomain || "Unknown domain"}</p>
      </div>
      {errorMessage ? (
        <p className="mt-4 text-sm text-rose-600">{errorMessage}</p>
      ) : null}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          className="inline-flex flex-1 items-center justify-center rounded-full bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-primary-200 transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleApprove}
          disabled={loading}
        >
          {loading ? "Saving..." : "Yes, that's us"}
        </button>
        <button
          type="button"
          className="inline-flex flex-1 items-center justify-center rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-neutral-400"
          onClick={() => {
            setView("edit");
            setErrorMessage(null);
          }}
          disabled={loading}
        >
          No, update details
        </button>
      </div>
    </>
  );

  const renderEditView = () => (
    <form onSubmit={handleFormSubmit} className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-neutral-900">Update Company Details</h2>
        <p className="mt-2 text-sm text-neutral-600">
          We’ll use this to tailor your onboarding experience.
        </p>
      </div>
      <div className="space-y-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
          Company name <span className="text-rose-500">*</span>
          <input
            type="text"
            className="rounded-2xl border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            value={formState.name}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, name: event.target.value }))
            }
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
          Country
          <input
            type="text"
            className="rounded-2xl border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            value={formState.hqCountry}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, hqCountry: event.target.value }))
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
          City
          <input
            type="text"
            className="rounded-2xl border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            value={formState.hqCity}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, hqCity: event.target.value }))
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
          Domain
          <input
            type="text"
            className="rounded-2xl border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            value={formState.primaryDomain}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, primaryDomain: event.target.value }))
            }
          />
        </label>
      </div>
      {errorMessage ? (
        <p className="text-sm text-rose-600">{errorMessage}</p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          className="inline-flex flex-1 items-center justify-center rounded-full bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-primary-200 transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Saving..." : "Save & Continue"}
        </button>
        <button
          type="button"
          className="inline-flex flex-1 items-center justify-center rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-neutral-400"
          onClick={() => {
            setView("confirm");
            setErrorMessage(null);
          }}
          disabled={loading}
        >
          Back
        </button>
      </div>
    </form>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl shadow-black/20">
        {view === "confirm" ? renderConfirmView() : renderEditView()}
      </div>
    </div>
  );
}
