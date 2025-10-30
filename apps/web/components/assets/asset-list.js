"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "../../lib/cn";
import { useUser } from "../user-context";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const statusColor = {
  ok: "bg-emerald-100 text-emerald-700",
  review: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-200 text-emerald-800",
  queued: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  archived: "bg-neutral-200 text-neutral-600"
};

export function AssetList() {
  const { user } = useUser();
  const [assets, setAssets] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) {
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
            "x-user-id": user.id
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
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Prompt</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-600">
              {assets.map((asset) => {
                const latestVersion = asset.latestVersion ?? asset.versions?.[asset.versions.length - 1] ?? null;
                return (
                  <tr key={asset.assetId} className="bg-white">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-neutral-800">
                        {asset.type?.toUpperCase()}
                      </p>
                      <p className="text-xs text-neutral-400">{asset.assetId}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-neutral-700">
                        {asset.jobTitle}
                      </p>
                      {latestVersion?.summary ? (
                        <p className="mt-1 text-xs text-neutral-500 line-clamp-2">
                          {latestVersion.summary}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">{latestVersion?.model ?? "—"}</td>
                    <td className="px-4 py-4">{latestVersion?.promptVersion ?? "—"}</td>
                    <td className="px-4 py-4 text-neutral-500">
                      {asset.updatedAt
                        ? new Date(asset.updatedAt).toLocaleString()
                        : latestVersion
                          ? new Date(latestVersion.createdAt).toLocaleString()
                          : new Date(asset.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span
                        className={clsx(
                          "rounded-full px-3 py-1 text-xs font-semibold capitalize",
                          statusColor[asset.status] ??
                            "bg-neutral-200 text-neutral-600"
                        )}
                      >
                        {asset.status}
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
