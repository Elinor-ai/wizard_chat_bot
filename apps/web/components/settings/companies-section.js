"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Globe, MapPin, RefreshCcw, Link as LinkIcon } from "lucide-react";
import { WizardApi } from "../../lib/api-client";
import { useUser } from "../user-context";

const COMPANY_TYPE_OPTIONS = [
  { value: "company", label: "Company" },
  { value: "agency", label: "Agency" },
  { value: "freelancer", label: "Freelancer" }
];

const HEADCOUNT_BUCKETS = [
  "unknown",
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1,000",
  "1,001-5,000",
  "5,001+"
];

const SOCIAL_FIELDS = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "twitter", label: "Twitter" },
  { id: "tiktok", label: "TikTok" }
];
const DOMAIN_REGEX = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function buildFormState(company) {
  return {
    name: company?.name ?? "",
    companyType: company?.companyType ?? "company",
    industry: company?.industry ?? "",
    employeeCountBucket: company?.employeeCountBucket ?? "unknown",
    hqCountry: company?.hqCountry ?? "",
    hqCity: company?.hqCity ?? "",
    website: company?.website ?? "",
    logoUrl: company?.logoUrl ?? "",
    tagline: company?.tagline ?? "",
    toneOfVoice: company?.toneOfVoice ?? "",
    primaryColor: company?.primaryColor ?? "",
    secondaryColor: company?.secondaryColor ?? "",
    fontFamilyPrimary: company?.fontFamilyPrimary ?? "",
    primaryDomain: company?.primaryDomain ?? "",
    socials: {
      linkedin: company?.socials?.linkedin ?? "",
      facebook: company?.socials?.facebook ?? "",
      instagram: company?.socials?.instagram ?? "",
      twitter: company?.socials?.twitter ?? "",
      tiktok: company?.socials?.tiktok ?? ""
    }
  };
}

function buildUpdatePayload(formState) {
  const socials = {};
  SOCIAL_FIELDS.forEach((field) => {
    const rawValue = formState.socials[field.id] ?? "";
    const trimmed = rawValue.trim();
    if (trimmed) {
      socials[field.id] = trimmed;
    }
  });

  const payload = {
    name: formState.name.trim(),
    companyType: formState.companyType,
    industry: formState.industry.trim(),
    employeeCountBucket: formState.employeeCountBucket.trim(),
    hqCountry: formState.hqCountry.trim(),
    hqCity: formState.hqCity.trim(),
    website: formState.website.trim(),
    logoUrl: formState.logoUrl.trim(),
    tagline: formState.tagline.trim(),
    toneOfVoice: formState.toneOfVoice.trim(),
    primaryColor: formState.primaryColor.trim(),
    secondaryColor: formState.secondaryColor.trim(),
    fontFamilyPrimary: formState.fontFamilyPrimary.trim(),
    socials
  };
  const normalizedDomain = formState.primaryDomain?.trim().toLowerCase();
  if (normalizedDomain && DOMAIN_REGEX.test(normalizedDomain)) {
    payload.primaryDomain = normalizedDomain;
  }
  return payload;
}

export default function CompaniesSection({ user }) {
  const authToken = user?.authToken ?? null;
  const queryClient = useQueryClient();
  const { setUser: setUserContext } = useUser();
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [formState, setFormState] = useState(buildFormState(null));
  const [message, setMessage] = useState(null);

  const companiesQuery = useQuery({
    queryKey: ["companies", "settings"],
    queryFn: () => WizardApi.fetchMyCompanies({ authToken }),
    enabled: Boolean(authToken),
    staleTime: 60_000
  });

  const companies = companiesQuery.data?.companies ?? [];

  useEffect(() => {
    if (!selectedCompanyId && companies.length > 0) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [companies, selectedCompanyId]);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId]
  );

  useEffect(() => {
    setFormState(buildFormState(selectedCompany));
    setMessage(null);
  }, [selectedCompany?.id, selectedCompany?.updatedAt]);

  const updateCompany = useMutation({
    mutationFn: (payload) => {
      if (!selectedCompanyId) {
        return Promise.reject(new Error("No company selected"));
      }
      return WizardApi.updateCompany(selectedCompanyId, payload, { authToken });
    },
    onSuccess: (response) => {
      queryClient.setQueryData(["companies", "settings"], (previous) => {
        if (!previous) return previous;
        const nextCompanies = (previous.companies ?? []).map((company) =>
          company.id === response.company.id ? response.company : company
        );
        return { ...previous, companies: nextCompanies };
      });
      queryClient.invalidateQueries({ queryKey: ["company-intel", "me"] });
      queryClient.invalidateQueries({ queryKey: ["company-intel", "jobs"] });
      setMessage({ type: "success", text: "Company profile updated." });
    },
    onError: (error) => {
      setMessage({
        type: "error",
        text: error?.message ?? "Failed to update company."
      });
    }
  });

  const setMainCompany = useMutation({
    mutationFn: (companyId) => WizardApi.setMainCompany(companyId, { authToken }),
    onSuccess: (_, companyId) => {
      if (user) {
        const profile = user.profile ?? {};
        setUserContext({
          ...user,
          profile: {
            ...profile,
            mainCompanyId: companyId
          }
        });
      }
      setMessage({ type: "success", text: "Main company updated." });
    },
    onError: (error) => {
      setMessage({
        type: "error",
        text: error?.message ?? "Failed to update main company."
      });
    }
  });

  const handleFieldChange = (field, value) => {
    setFormState((prev) => {
      if (field.startsWith("socials.")) {
        const key = field.split(".")[1];
        return {
          ...prev,
          socials: {
            ...prev.socials,
            [key]: value
          }
        };
      }
      if (field === "primaryDomain") {
        return {
          ...prev,
          primaryDomain: value
        };
      }
      return {
        ...prev,
        [field]: value
      };
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!selectedCompanyId) return;
    const payload = buildUpdatePayload(formState);
    setMessage(null);
    updateCompany.mutate(payload);
  };

  const handleReset = () => {
    setFormState(buildFormState(selectedCompany));
    setMessage(null);
  };

  if (!authToken) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
        Sign in again to manage company profiles.
      </div>
    );
  }

  if (companiesQuery.isLoading) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
        Loading companies…
      </div>
    );
  }

  if (companiesQuery.error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        Failed to load companies. Please refresh.
      </div>
    );
  }

  if (!companies.length) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
        No companies linked to your account yet. Confirm your work email to get started.
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
      <aside className="rounded-3xl border border-neutral-200 bg-white">
        <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-4">
          <Building2 className="h-5 w-5 text-primary-600" />
          <div>
            <p className="text-sm font-semibold text-neutral-900">Companies</p>
            <p className="text-xs text-neutral-500">Linked to your workspace</p>
          </div>
        </div>
        <div className="divide-y divide-neutral-100">
          {companies.map((company) => {
            const isActive = company.id === selectedCompanyId;
            const isMain = user?.profile?.mainCompanyId === company.id;
            const label = company.name?.trim() || company.primaryDomain;
            return (
              <button
                key={company.id}
                type="button"
                onClick={() => setSelectedCompanyId(company.id)}
                className={`flex w-full flex-col items-start gap-1 px-5 py-4 text-left transition ${
                  isActive ? "bg-primary-50" : "hover:bg-neutral-50"
                }`}
              >
                <span className="text-sm font-semibold text-neutral-900">{label}</span>
                <span className="text-xs text-neutral-500">{company.primaryDomain}</span>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge
                    label={company.nameConfirmed ? "Name confirmed" : "Awaiting name"}
                    tone={company.nameConfirmed ? "success" : "neutral"}
                  />
                  <StatusBadge
                    label={company.profileConfirmed ? "Profile approved" : "Needs approval"}
                    tone={company.profileConfirmed ? "success" : "warning"}
                  />
                  {isMain ? (
                    <StatusBadge label="Main company" tone="success" />
                  ) : (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMainCompany.mutate(company.id);
                      }}
                      disabled={setMainCompany.isLoading}
                      className="rounded-full border border-neutral-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600 transition hover:border-primary-300 hover:text-primary-600 disabled:opacity-50"
                    >
                      Make main
                    </button>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="rounded-3xl border border-neutral-200 bg-white p-6">
        {selectedCompany ? (
          <div className="space-y-6">
            <header className="flex flex-col gap-1">
              <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Company profile
              </p>
              <h2 className="text-2xl font-semibold text-neutral-900">
                {selectedCompany.name?.trim() || selectedCompany.primaryDomain}
              </h2>
              <p className="text-sm text-neutral-500">
                Keep your public identity accurate—campaigns, assets, and automations will pull from
                this data.
              </p>
            </header>

            {message ? (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  message.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {message.text}
              </div>
            ) : null}

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Company name"
                  value={formState.name}
                  onChange={(event) => handleFieldChange("name", event.target.value)}
                  required
                />
                <TextField
                  label="Primary domain"
                  value={formState.primaryDomain}
                  onChange={(event) =>
                    handleFieldChange("primaryDomain", event.target.value.trim().toLowerCase())
                  }
                  required
                  pattern={DOMAIN_REGEX.source}
                  placeholder="acme.com"
                  icon={<Globe className="h-4 w-4 text-neutral-400" />}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <SelectField
                  label="Company type"
                  value={formState.companyType}
                  onChange={(event) => handleFieldChange("companyType", event.target.value)}
                  options={COMPANY_TYPE_OPTIONS}
                />
                <TextField
                  label="Industry"
                  value={formState.industry}
                  onChange={(event) => handleFieldChange("industry", event.target.value)}
                />
                <SelectField
                  label="Headcount"
                  value={formState.employeeCountBucket}
                  onChange={(event) => handleFieldChange("employeeCountBucket", event.target.value)}
                  options={HEADCOUNT_BUCKETS.map((bucket) => ({ value: bucket, label: bucket }))}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="HQ country"
                  value={formState.hqCountry}
                  onChange={(event) => handleFieldChange("hqCountry", event.target.value)}
                  icon={<MapPin className="h-4 w-4 text-neutral-400" />}
                />
                <TextField
                  label="HQ city"
                  value={formState.hqCity}
                  onChange={(event) => handleFieldChange("hqCity", event.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Website"
                  value={formState.website}
                  onChange={(event) => handleFieldChange("website", event.target.value)}
                  icon={<LinkIcon className="h-4 w-4 text-neutral-400" />}
                />
                <TextField
                  label="Logo URL"
                  value={formState.logoUrl}
                  onChange={(event) => handleFieldChange("logoUrl", event.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Tagline"
                  value={formState.tagline}
                  onChange={(event) => handleFieldChange("tagline", event.target.value)}
                />
                <TextField
                  label="Tone of voice"
                  value={formState.toneOfVoice}
                  onChange={(event) => handleFieldChange("toneOfVoice", event.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <TextField
                  label="Primary color"
                  value={formState.primaryColor}
                  onChange={(event) => handleFieldChange("primaryColor", event.target.value)}
                />
                <TextField
                  label="Secondary color"
                  value={formState.secondaryColor}
                  onChange={(event) => handleFieldChange("secondaryColor", event.target.value)}
                />
                <TextField
                  label="Primary font"
                  value={formState.fontFamilyPrimary}
                  onChange={(event) => handleFieldChange("fontFamilyPrimary", event.target.value)}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-neutral-900">Social profiles</p>
                  <span className="text-xs text-neutral-500">Paste full URLs to each profile</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {SOCIAL_FIELDS.map((field) => (
                    <TextField
                      key={field.id}
                      label={field.label}
                      value={formState.socials[field.id]}
                      onChange={(event) =>
                        handleFieldChange(`socials.${field.id}`, event.target.value)
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <RefreshCcw className="h-4 w-4" />
                  Last updated{" "}
                  {selectedCompany.updatedAt
                    ? new Date(selectedCompany.updatedAt).toLocaleString()
                    : "recently"}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-600"
                    disabled={updateCompany.isLoading}
                  >
                    Reset
                  </button>
                  <button
                    type="submit"
                    className="rounded-full bg-primary-600 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm shadow-primary-200 transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
                    disabled={updateCompany.isLoading}
                  >
                    Save changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : (
          <div className="text-sm text-neutral-600">Select a company to start editing.</div>
        )}
      </section>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  disabled = false,
  required = false,
  icon = null,
  type = "text",
  pattern,
  placeholder
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-neutral-700">
      {label}
      <div className="flex items-center gap-2 rounded-2xl border border-neutral-300 px-3 py-2 focus-within:border-primary-500">
        {icon}
        <input
          type={type}
          value={value}
          required={required}
          onChange={onChange}
          disabled={disabled}
          pattern={pattern}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-neutral-900 outline-none disabled:cursor-not-allowed disabled:text-neutral-400"
        />
      </div>
    </label>
  );
}

function SelectField({ label, value, onChange, options = [] }) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-neutral-700">
      {label}
      <select
        value={value}
        onChange={onChange}
        className="rounded-2xl border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
      >
        {options.map((option) => (
          <option key={option.value ?? option} value={option.value ?? option}>
            {option.label ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusBadge({ label, tone }) {
  const toneClasses =
    tone === "success"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "warning"
      ? "bg-amber-100 text-amber-700"
      : "bg-neutral-100 text-neutral-600";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${toneClasses}`}>
      {label}
    </span>
  );
}
