"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function CompanyNameConfirmModal({
  isOpen,
  company,
  onApprove,
  onSubmitCorrections,
  onClose,
  loading,
  startInEditing = false,
  domainEditable = false,
  titleOverride,
  descriptionOverride,
  showApproveButton = true
}) {
  const [editing, setEditing] = useState(startInEditing);
  const [form, setForm] = useState({
    name: company?.name ?? company?.primaryDomain ?? "",
    country: company?.hqCountry ?? "",
    city: company?.hqCity ?? "",
    domain: company?.primaryDomain ?? ""
  });

  useEffect(() => {
    setEditing(startInEditing);
    setForm({
      name: company?.name ?? company?.primaryDomain ?? "",
      country: company?.hqCountry ?? "",
      city: company?.hqCity ?? "",
      domain: company?.primaryDomain ?? ""
    });
  }, [company?.id, company?.name, company?.primaryDomain, startInEditing]);

  if (!isOpen || !company) {
    return null;
  }

  const handleSubmit = (event) => {
    event.preventDefault();
    const payload = {
      name: form.name,
      country: form.country,
      city: form.city
    };
    if (domainEditable) {
      payload.primaryDomain = form.domain;
    }
    onSubmitCorrections?.(payload);
  };

  const displayDomain = domainEditable ? form.domain || company.primaryDomain : company.primaryDomain;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl shadow-black/20">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-500">
          Company setup
        </p>
        <h2 className="mt-2 text-2xl font-bold text-neutral-900">
          {titleOverride ?? `Is your company ${company.name || displayDomain || ""}?`}
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          {descriptionOverride ?? (
            <>
              We use the domain{" "}
              <span className="font-semibold">{displayDomain || "your domain"}</span> to run
              enrichment. Let us know if we should update the legal name or headquarters before we
              look for public intel.
            </>
          )}
        </p>

        {editing ? (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            {domainEditable ? (
              <label className="grid gap-1 text-sm font-medium text-neutral-700">
                Primary domain
                <input
                  type="text"
                  className="rounded-2xl border border-neutral-300 px-3 py-2 text-sm text-neutral-800"
                  value={form.domain}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, domain: event.target.value.trim() }))
                  }
                  required
                  disabled={loading}
                />
              </label>
            ) : null}
            <label className="grid gap-1 text-sm font-medium text-neutral-700">
              Company name
              <input
                type="text"
                className="rounded-2xl border border-neutral-300 px-3 py-2 text-sm text-neutral-800"
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                required
                disabled={loading}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-neutral-700">
                HQ Country
                <input
                  type="text"
                  className="rounded-2xl border border-neutral-300 px-3 py-2 text-sm text-neutral-800"
                  value={form.country}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, country: event.target.value }))
                  }
                  disabled={loading}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-neutral-700">
                HQ City
                <input
                  type="text"
                  className="rounded-2xl border border-neutral-300 px-3 py-2 text-sm text-neutral-800"
                  value={form.city}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, city: event.target.value }))
                  }
                  disabled={loading}
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-600"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
                disabled={loading}
              >
                Save & Continue
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {showApproveButton ? (
              <button
                type="button"
                onClick={onApprove}
                disabled={loading}
                className="flex-1 rounded-2xl bg-primary-600 px-4 py-3 text-center text-sm font-semibold uppercase tracking-wide text-white shadow-lg shadow-primary-200 transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
              >
                Yes, that's us
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={loading}
              className="flex-1 rounded-2xl border border-neutral-300 px-4 py-3 text-center text-sm font-semibold uppercase tracking-wide text-neutral-700 transition hover:border-primary-400 hover:text-primary-600 disabled:cursor-not-allowed"
            >
              No / Update details
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-6 text-xs font-semibold uppercase tracking-wide text-neutral-400 underline-offset-4 hover:underline"
        >
          Close
        </button>
      </div>
    </div>,
    document.body
  );
}
