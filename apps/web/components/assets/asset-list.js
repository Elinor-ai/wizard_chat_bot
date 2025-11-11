"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "../../lib/cn";
import { useUser } from "../user-context";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const statusColor = {
  READY: "bg-emerald-100 text-emerald-700",
  GENERATING: "bg-amber-100 text-amber-700",
  PENDING: "bg-amber-50 text-amber-700",
  FAILED: "bg-red-100 text-red-700",
  DEFAULT: "bg-neutral-200 text-neutral-600"
};

export function AssetList() {
  const { user } = useUser();
  const [assets, setAssets] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.authToken) {
      setAssets([]);
      return;
    }

    const controller = new AbortController();

    async function fetchAssets() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/assets`, {
          headers: {
            Authorization: `Bearer ${user.authToken}`
          },
          signal: controller.signal
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error?.message ?? "Unable to load assets");
        }

        const data = await response.json();
        setAssets(data.assets ?? []);
      } catch (requestError) {
        if (requestError.name !== "AbortError") {
          setError(requestError.message);
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchAssets();

    return () => controller.abort();
  }, [user]);

  const emptyState = useMemo(() => !isLoading && assets.length === 0, [assets, isLoading]);

  if (!user) {
    return (
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500 shadow-sm shadow-neutral-100">
        Sign in to view generated assets and publishing history.
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-100">
      <header className="flex items-center justify-between text-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Asset library</h2>
      </header>

      {error ? (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <p className="mt-4 text-sm text-neutral-500">Loading assets…</p>
      ) : null}

      {emptyState ? (
        <p className="mt-4 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-sm text-neutral-500">
          Submit a job through the wizard to generate your first job description asset.
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-100">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Format</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-600">
              {assets.map((asset) => {
                const summary = asset.summary ?? "—";
                const initials =
                  asset.jobTitle?.charAt?.(0)?.toUpperCase() ?? "J";
                const badgeClass =
                  statusColor[asset.status] ?? statusColor.DEFAULT;
                return (
                  <tr key={asset.id} className="bg-white">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
                          {asset.logoUrl ? (
                            <img
                              src={asset.logoUrl}
                              alt="Job logo"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-neutral-500">
                              {initials}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-neutral-800">
                            {asset.formatId?.replace(/_/g, " ")}
                          </p>
                          <p className="text-xs text-neutral-400">
                            {asset.channelId}
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-neutral-500 line-clamp-2">
                        {summary}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-neutral-700">
                        {asset.jobTitle}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      {asset.model ? `${asset.provider ?? ""} ${asset.model}` : "—"}
                    </td>
                    <td className="px-4 py-4 text-neutral-500">
                      {asset.updatedAt
                        ? new Date(asset.updatedAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span
                        className={clsx(
                          "rounded-full px-3 py-1 text-xs font-semibold uppercase",
                          badgeClass
                        )}
                      >
                        {asset.status.toLowerCase()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
