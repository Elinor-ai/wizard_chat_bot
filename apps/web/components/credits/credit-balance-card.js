"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins } from "lucide-react";
import { DashboardApi } from "../../lib/api-client";
import { useUser } from "../user-context";

function formatNumber(value = 0, { currency = false } = {}) {
  if (currency) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(value);
  }
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 1000 ? 1 : 0
  }).format(value);
}

export function CreditBalanceCard() {
  const { user } = useUser();
  const authToken = user?.authToken;
  const userId = user?.id;

  const {
    data,
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ["dashboard-summary", authToken],
    queryFn: () => DashboardApi.fetchSummary({ authToken }),
    enabled: Boolean(authToken)
  });

  const credits = useMemo(() => {
    if (!data) {
      return null;
    }
    const balance = data.credits.balance ?? 0;
    const reserved = data.credits.reserved ?? 0;
    const available = Math.max(balance - reserved, 0);
    return {
      available,
      balance,
      reserved,
      lifetimeUsed: data.credits.lifetimeUsed ?? 0,
      updatedAt: data.updatedAt ? new Date(data.updatedAt) : null
    };
  }, [data]);

  if (!userId || !authToken) {
    return (
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500 shadow-sm shadow-neutral-100">
        Sign in to view your remaining credits.
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 animate-pulse rounded-2xl bg-neutral-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-32 rounded bg-neutral-100" />
            <div className="h-6 w-48 rounded bg-neutral-200" />
            <div className="h-3 w-20 rounded bg-neutral-100" />
          </div>
        </div>
      </section>
    );
  }

  if (isError || !credits) {
    return (
      <section className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-600 shadow-sm shadow-red-100">
        Unable to load credit balance.{" "}
        <button
          type="button"
          onClick={() => refetch()}
          className="font-semibold text-red-700 underline-offset-4 hover:underline"
        >
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Remaining credits
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100">
              <Coins className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-3xl font-semibold text-neutral-900">
                {formatNumber(credits.available, { currency: true })}
              </p>
              <p className="text-xs text-neutral-500">
                {formatNumber(credits.reserved, { currency: true })} reserved ·{" "}
                {formatNumber(credits.balance, { currency: true })} total
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Lifetime used
          </p>
          <p className="mt-2 text-xl font-semibold text-neutral-900">
            {formatNumber(credits.lifetimeUsed, { currency: true })}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-neutral-400">
            Since workspace creation
          </p>
        </div>
      </div>
    </section>
  );
}
