"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { DashboardApi } from "../../../lib/api-client";
import { useUser } from "../../../components/user-context";

function formatNumber(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

export default function DashboardOverviewPage() {
  const { user } = useUser();

  const userId = user?.id;
  const authToken = user?.authToken;

  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary", authToken],
    queryFn: () => DashboardApi.fetchSummary({ authToken }),
    enabled: Boolean(authToken)
  });

  const activityQuery = useQuery({
    queryKey: ["dashboard-activity", authToken],
    queryFn: () => DashboardApi.fetchActivity({ authToken }),
    enabled: Boolean(authToken)
  });

  const metricCards = useMemo(() => {
    if (!summaryQuery.data) {
      return [];
    }
    const summary = summaryQuery.data;
    return [
      {
        label: "Jobs live",
        value: formatNumber(summary.jobs.active),
        detail: `${formatNumber(summary.jobs.awaitingApproval)} awaiting approval`
      },
      {
        label: "Assets",
        value: formatNumber(summary.assets.total),
        detail: `${formatNumber(summary.assets.approved)} approved`
      },
      {
        label: "Campaigns",
        value: formatNumber(summary.campaigns.total),
        detail: `${formatNumber(summary.campaigns.live)} live`
      },
      {
        label: "Credits",
        value: formatNumber(summary.usage?.remainingCredits ?? 0),
        detail: `${formatNumber(summary.credits.reserved ?? 0)} reserved`
      }
    ];
  }, [summaryQuery.data]);

  if (!userId || !authToken) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-10 text-center text-neutral-600 shadow-sm shadow-neutral-100">
        Sign in to review your recruiting performance.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-neutral-900">
            Control Tower
          </h1>
          <p className="text-sm text-neutral-600">
            Real-time view of assets, campaigns, credits, and agent activity.
          </p>
        </div>
        <Link
          href="/golden-interview"
          className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          <span>✨</span>
          Start AI Interview
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        {summaryQuery.isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <article
              key={`summary-skeleton-${index}`}
              className="animate-pulse rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100"
            >
              <div className="h-3 w-24 rounded bg-neutral-200" />
              <div className="mt-4 h-6 w-32 rounded bg-neutral-200" />
              <div className="mt-2 h-3 w-20 rounded bg-neutral-100" />
            </article>
          ))
        ) : summaryQuery.isError ? (
          <article className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-600 shadow-sm shadow-red-100">
            Failed to load summary data. Please retry shortly.
          </article>
        ) : metricCards.length === 0 ? (
          <article className="rounded-3xl border border-dashed border-neutral-200 bg-white p-6 text-sm text-neutral-500 shadow-sm shadow-neutral-100">
            No job data yet. Launch your first wizard to populate the dashboard.
          </article>
        ) : (
          metricCards.map((metric) => (
            <article
              key={metric.label}
              className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {metric.label}
              </p>
              <p className="mt-3 text-2xl font-semibold text-neutral-900">
                {metric.value}
              </p>
              <p className="mt-2 text-xs text-primary-600">{metric.detail}</p>
            </article>
          ))
        )}
      </section>

      <RecentActivity
        events={activityQuery.data ?? []}
        isLoading={activityQuery.isLoading}
        isError={activityQuery.isError}
      />
    </div>
  );
}

function RecentActivity({ events, isLoading, isError }) {
  if (isLoading) {
    return (
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
        <h2 className="text-lg font-semibold text-neutral-900">Recent activity</h2>
        <ul className="mt-4 space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <li key={`activity-skeleton-${index}`} className="animate-pulse rounded-2xl border border-neutral-100 p-4">
              <div className="h-3 w-48 rounded bg-neutral-200" />
              <div className="mt-2 h-3 w-64 rounded bg-neutral-100" />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
        <h2 className="text-lg font-semibold text-neutral-900">Recent activity</h2>
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          Unable to load activity feed. Please refresh the page.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
      <h2 className="text-lg font-semibold text-neutral-900">Recent activity</h2>
      {events.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-500">
          No workflow events yet. Once jobs progress through the pipeline their activity will appear here.
        </p>
      ) : (
        <ul className="mt-4 space-y-4 text-sm text-neutral-600">
          {events.map((event) => (
            <li key={event.id} className="rounded-2xl border border-neutral-100 p-4">
              <p className="font-semibold text-neutral-800">{event.title}</p>
              <p className="mt-1 text-xs text-neutral-500">{event.detail}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-neutral-400">
                {new Date(event.occurredAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
