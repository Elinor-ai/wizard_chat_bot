"use client";

import { useQuery } from "@tanstack/react-query";
import { DashboardApi } from "../../lib/api-client";
import { useUser } from "../user-context";

function formatCredits(value) {
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

function formatCurrency(value, currency = "USD") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);
}

export function CreditLedger() {
  const { user } = useUser();
  const userId = user?.id;
  const authToken = user?.authToken;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard-ledger", authToken],
    queryFn: () => DashboardApi.fetchLedger({ authToken }),
    enabled: Boolean(authToken)
  });

  if (!userId || !authToken) {
    return (
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500 shadow-sm shadow-neutral-100">
        Sign in to view your credit transactions.
      </section>
    );
  }

  const entries = data ?? [];

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
      <header className="flex items-center justify-between text-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Ledger</h2>
        <button
          type="button"
          className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 transition hover:border-primary-500 hover:text-primary-600"
        >
          Export CSV
        </button>
      </header>

      {isLoading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`ledger-skeleton-${index}`} className="animate-pulse rounded-2xl border border-neutral-100 p-4">
              <div className="h-3 w-40 rounded bg-neutral-200" />
              <div className="mt-2 h-3 w-60 rounded bg-neutral-100" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          Failed to load credit ledger. Please refresh and try again.
        </p>
      ) : entries.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-500">
          No billing activity yet. Charges and reservations appear here as workflows execute.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-100">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Workflow</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Credits</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Txn ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-600">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-4 text-neutral-500">
                    {new Date(entry.occurredAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-neutral-800">{entry.workflow}</p>
                    <p className="text-xs text-neutral-400">{entry.jobId}</p>
                  </td>
                  <td className="px-4 py-4 capitalize">{entry.type.toLowerCase()}</td>
                  <td className="px-4 py-4 font-semibold text-neutral-800">
                    {formatCredits(entry.amount)} credits
                  </td>
                  <td className="px-4 py-4 font-semibold text-neutral-800">
                    {typeof entry.purchaseAmountUsd === "number" &&
                    entry.purchaseAmountUsd !== 0
                      ? formatCurrency(
                          entry.purchaseAmountUsd,
                          entry.currency ?? "USD"
                        )
                      : "—"}
                  </td>
                  <td className="px-4 py-4 capitalize">{entry.status}</td>
                  <td className="px-4 py-4 text-xs text-neutral-400">{entry.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
