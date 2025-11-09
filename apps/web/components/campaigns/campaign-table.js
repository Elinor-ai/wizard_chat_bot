"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardApi } from "../../lib/api-client";
import { useUser } from "../user-context";

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

export function CampaignTable() {
  const { user } = useUser();
  const userId = user?.id;
  const authToken = user?.authToken;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard-campaigns", authToken],
    queryFn: () => DashboardApi.fetchCampaigns({ authToken }),
    enabled: Boolean(authToken)
  });

  const campaigns = useMemo(() => data ?? [], [data]);

  if (!userId || !authToken) {
    return (
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500 shadow-sm shadow-neutral-100">
        Sign in to preview campaign readiness.
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
      <header className="flex items-center justify-between text-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Campaigns</h2>
        <div className="flex gap-3">
          <button
            type="button"
            className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 transition hover:border-primary-500 hover:text-primary-600"
          >
            Add channel
          </button>
          <button
            type="button"
            className="rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500"
          >
            Launch all
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`campaign-skeleton-${index}`} className="animate-pulse rounded-2xl border border-neutral-100 p-4">
              <div className="h-3 w-32 rounded bg-neutral-200" />
              <div className="mt-2 h-3 w-48 rounded bg-neutral-100" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          Unable to load campaign data. Please try again shortly.
        </p>
      ) : campaigns.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-500">
          No campaigns yet. Approve a job and select distribution channels to generate launch plans.
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-100">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Budget</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Objective</th>
                <th className="px-4 py-3 text-right">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-600">
              {campaigns.map((campaign) => (
                <tr key={campaign.campaignId}>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-neutral-800">{campaign.jobTitle}</p>
                    <p className="text-xs text-neutral-400">{campaign.jobId}</p>
                  </td>
                  <td className="px-4 py-4 capitalize">{campaign.channel}</td>
                  <td className="px-4 py-4">{formatCurrency(campaign.budget)}</td>
                  <td className="px-4 py-4 capitalize">{campaign.status}</td>
                  <td className="px-4 py-4">{campaign.objective}</td>
                  <td className="px-4 py-4 text-right text-neutral-500">
                    {new Date(campaign.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
