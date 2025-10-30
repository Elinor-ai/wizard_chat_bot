"use client";

import { Suspense, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useUser } from "../../../components/user-context";

const mockMetrics = [
  { label: "Active Campaigns", value: "12", delta: "+3 this week" },
  { label: "Spend (MTD)", value: "$8,420", delta: "0.72 credit/job" },
  { label: "Qualified Leads", value: "94", delta: "+21%" },
  { label: "Avg. Time-to-Hire", value: "17 days", delta: "-4 days" }
];

export default function DashboardOverviewPage() {
  const { data: session } = useSession();
  const { user, setUser } = useUser();

  // Sync OAuth session with user context
  useEffect(() => {
    if (session?.user && !user) {
      setUser(session.user);
    }
  }, [session, user, setUser]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-neutral-900">
          Control Tower
        </h1>
        <p className="text-sm text-neutral-600">
          Real-time view of assets, campaigns, credits, and agent activity.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        {mockMetrics.map((metric) => (
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
            <p className="mt-2 text-xs text-primary-600">{metric.delta}</p>
          </article>
        ))}
      </section>

      <Suspense fallback={<div className="text-sm text-neutral-500">Loading activity…</div>}>
        <RecentActivity />
      </Suspense>
    </div>
  );
}

function RecentActivity() {
  const events = [
    {
      id: "evt-1",
      title: "Campaign: Senior Backend Engineer",
      detail: "LinkedIn + Reddit went live. Credits reserved: 98."
    },
    {
      id: "evt-2",
      title: "Asset approved",
      detail: "Landing page variation v3 confirmed by Dana."
    },
    {
      id: "evt-3",
      title: "Interview kit generated",
      detail: "Structured rubric with compliant prompts ready."
    }
  ];

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
      <h2 className="text-lg font-semibold text-neutral-900">Recent activity</h2>
      <ul className="mt-4 space-y-4 text-sm text-neutral-600">
        {events.map((event) => (
          <li key={event.id} className="rounded-2xl border border-neutral-100 p-4">
            <p className="font-semibold text-neutral-800">{event.title}</p>
            <p className="mt-1 text-xs text-neutral-500">{event.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
