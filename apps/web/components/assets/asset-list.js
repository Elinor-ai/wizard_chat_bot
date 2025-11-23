"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Layers,
  MoreHorizontal,
  Plus,
  Video as VideoIcon
} from "lucide-react";
import { clsx } from "../../lib/cn";
import { WizardApi } from "../../lib/api-client";
import { useUser } from "../user-context";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const assetTypeTokens = {
  text: {
    icon: FileText,
    accent: "bg-primary-50 text-primary-600 border-primary-100"
  },
  image: {
    icon: ImageIcon,
    accent: "bg-pink-50 text-pink-600 border-pink-100"
  },
  video: {
    icon: VideoIcon,
    accent: "bg-indigo-50 text-indigo-600 border-indigo-100"
  },
  default: {
    icon: FileText,
    accent: "bg-neutral-100 text-neutral-500 border-neutral-200"
  }
};

async function fetchAssets({ authToken, signal }) {
  if (!authToken) return [];
  const response = await fetch(`${API_BASE_URL}/assets`, {
    headers: {
      Authorization: `Bearer ${authToken}`
    },
    signal
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message ?? "Unable to load assets");
  }

  const data = await response.json();
  return data.assets ?? [];
}

function formatDisplayName(value) {
  if (!value) return "Asset";
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

function getInitials(value, fallback = "J") {
  if (!value || typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parts = trimmed.split(/\s+/);
  const [first = "", second = ""] = [parts[0]?.[0] ?? "", parts.length > 1 ? parts[parts.length - 1][0] : ""];
  const initials = `${first}${second}`.toUpperCase();
  return initials || fallback;
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildJobGroups(assets) {
  const groups = new Map();
  assets.forEach((asset) => {
    if (!asset?.jobId) {
      return;
    }
    const existing = groups.get(asset.jobId);
    const updatedAt = normalizeDate(asset.updatedAt) ?? null;
    if (!existing) {
      groups.set(asset.jobId, {
        jobId: asset.jobId,
        jobTitle: asset.jobTitle ?? "Untitled role",
        companyId: asset.companyId ?? null,
        logoUrl: asset.logoUrl ?? null,
        latestUpdatedAt: updatedAt,
        assets: [asset]
      });
    } else {
      existing.assets.push(asset);
      if (updatedAt && (!existing.latestUpdatedAt || updatedAt > existing.latestUpdatedAt)) {
        existing.latestUpdatedAt = updatedAt;
      }
    }
  });

  return Array.from(groups.values()).map((group) => ({
    ...group,
    assets: [...group.assets].sort((a, b) => {
      const first = normalizeDate(b.updatedAt);
      const second = normalizeDate(a.updatedAt);
      if (first && second) return first - second;
      if (first) return -1;
      if (second) return 1;
      return 0;
    })
  }));
}

function deriveTextSnippet(content, summary) {
  if (!content) {
    return summary ?? "Ready to share.";
  }
  if (content.body) return content.body;
  if (content.title) return content.title;
  return summary ?? "Ready to share.";
}

function deriveMediaUrl(content) {
  if (!content) return null;
  if (typeof content.imageUrl === "string" && content.imageUrl) {
    return content.imageUrl;
  }
  if (typeof content.thumbnailUrl === "string" && content.thumbnailUrl) {
    return content.thumbnailUrl;
  }
  return null;
}

function getCompanyKeyFromAsset(asset) {
  if (asset?.companyId) {
    return asset.companyId;
  }
  const name = asset?.companyName;
  if (typeof name === "string") {
    const trimmed = name.trim();
    if (trimmed) {
      return `name:${trimmed.toLowerCase()}`;
    }
  }
  return null;
}

function SidebarItem({ label, description, isActive, onClick, icon, initials }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition",
        isActive
          ? "border-neutral-900 bg-neutral-900 text-white shadow-lg shadow-neutral-900/20"
          : "border-transparent bg-white text-neutral-600 hover:border-neutral-200 hover:text-neutral-900"
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-neutral-100 text-neutral-500">
        {icon ? (
          icon
        ) : initials ? (
          <span className="text-sm font-semibold">{initials}</span>
        ) : (
          <Building2 className="h-5 w-5" />
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold">{label}</span>
        {description ? (
          <span className={clsx("text-xs", isActive ? "text-neutral-200" : "text-neutral-500")}>
            {description}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function CompanySidebar({
  companies,
  isLoading,
  isError,
  fallbackActive,
  selectedCompanyId,
  onSelect
}) {
  return (
    <aside className="w-full shrink-0 rounded-3xl border border-neutral-100 bg-neutral-50/60 p-4 shadow-inner shadow-white/50 lg:w-64">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Companies
      </p>
      {isError ? (
        <p className="mt-2 rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-600">
          Unable to load companies.
        </p>
      ) : null}
      {fallbackActive ? (
        <p className="mt-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Showing companies derived from your asset history.
        </p>
      ) : null}
      <div className="mt-3 space-y-2">
        <SidebarItem
          label="All assets"
          description="Every job"
          isActive={!selectedCompanyId}
          onClick={() => onSelect(null)}
          icon={<Layers className="h-5 w-5" />}
        />
        {isLoading ? (
          <p className="px-2 py-4 text-sm text-neutral-500">Loading companies…</p>
        ) : companies.length === 0 ? (
          <p className="px-2 py-4 text-sm text-neutral-500">
            Link companies to organize assets by client.
          </p>
        ) : (
          companies.map((company) => (
            <SidebarItem
              key={company.id}
              label={company.name || company.primaryDomain || "Untitled company"}
              description={
                company.primaryDomain ||
                (company.isFallback ? "Derived from assets" : "")
              }
              isActive={selectedCompanyId === company.id}
              onClick={() => onSelect(company.id)}
              initials={getInitials(company.name || company.primaryDomain || "C", "C")}
              icon={
                company.logoUrl ? (
                  <img
                    src={company.logoUrl}
                    alt={company.name || company.primaryDomain || "Company"}
                    className="h-full w-full object-cover"
                  />
                ) : null
              }
            />
          ))
        )}
      </div>
    </aside>
  );
}

function JobGroupCard({ group }) {
  const [isOpen, setIsOpen] = useState(false);
  const initials = getInitials(group.jobTitle);
  const assetCount = group.assets.length;
  const lastUpdatedLabel = group.latestUpdatedAt
    ? `Updated ${group.latestUpdatedAt.toLocaleDateString()}`
    : "Awaiting update";

  return (
    <div className="rounded-3xl border border-neutral-100 bg-white shadow-sm shadow-neutral-200/60">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 overflow-hidden rounded-2xl bg-neutral-100">
            {group.logoUrl ? (
              <img
                src={group.logoUrl}
                alt={`${group.jobTitle} logo`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-base font-semibold text-neutral-500">
                {initials}
              </div>
            )}
          </div>
          <div>
            <p className="text-lg font-semibold text-neutral-900">{group.jobTitle}</p>
            <p className="text-sm text-neutral-500">{lastUpdatedLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700">
            {assetCount} {assetCount === 1 ? "asset" : "assets"}
          </span>
          <ChevronDown
            className={clsx(
              "h-5 w-5 text-neutral-400 transition-transform duration-200",
              isOpen ? "rotate-180" : "rotate-0"
            )}
          />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden border-t border-neutral-100"
          >
            <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {group.assets.map((asset) => (
                <AssetCard key={asset.id} asset={asset} />
              ))}
              <GenerateMoreCard jobTitle={group.jobTitle} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function AssetCard({ asset }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const normalizedType = asset.artifactType?.toLowerCase?.() ?? "text";
  const config = assetTypeTokens[normalizedType] ?? assetTypeTokens.default;
  const Icon = config.icon;
  const textSnippet = deriveTextSnippet(asset.content, asset.summary);
  const mediaUrl = deriveMediaUrl(asset.content);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleMenuAction = (action) => {
    setMenuOpen(false);
    if (action === "Copy") {
      const text = textSnippet ?? "";
      if (
        text &&
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      return;
    }
    // Placeholder actions for Download/Launch integrations.
    // eslint-disable-next-line no-console
    console.log(`${action} clicked for asset ${asset.id}`);
  };

  const statusLabel = asset.status?.toLowerCase?.() ?? "pending";
  const updatedLabel = asset.updatedAt
    ? `Updated ${normalizeDate(asset.updatedAt)?.toLocaleDateString()}`
    : null;

  return (
    <div className="relative flex min-h-[220px] flex-col rounded-3xl border border-neutral-100 bg-white p-4 shadow-sm shadow-neutral-200/70 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={clsx(
              "flex h-10 w-10 items-center justify-center rounded-2xl border text-sm",
              config.accent
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              {formatDisplayName(asset.formatId)}
            </p>
            <p className="text-xs uppercase tracking-wide text-neutral-400">
              {asset.channelId}
            </p>
          </div>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="rounded-full border border-neutral-200 p-2 text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-900"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-10 z-20 w-32 rounded-2xl border border-neutral-200 bg-white py-1 text-sm shadow-lg shadow-black/10">
              {["Copy", "Download", "Launch"].map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => handleMenuAction(action)}
                  className="block w-full px-3 py-2 text-left text-neutral-600 hover:bg-neutral-50"
                >
                  {action}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex-1">
        {normalizedType === "text" ? (
          <p className="line-clamp-5 text-sm text-neutral-600">{textSnippet}</p>
        ) : (
          <div className="flex h-40 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-neutral-200 bg-neutral-50">
            {mediaUrl ? (
              <img
                src={mediaUrl}
                alt={asset.formatId ?? "Asset preview"}
                className="h-full w-full object-cover"
              />
            ) : (
              <Icon className="h-10 w-10 text-neutral-400" />
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-neutral-500">
        <span className="rounded-full bg-neutral-100 px-2 py-1 font-medium capitalize text-neutral-700">
          {statusLabel}
        </span>
        {updatedLabel ? <span>{updatedLabel}</span> : null}
      </div>
    </div>
  );
}

function GenerateMoreCard({ jobTitle }) {
  return (
    <button
      type="button"
      className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-neutral-200 bg-white px-4 py-6 text-center text-sm font-semibold text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-900"
    >
      <Plus className="h-6 w-6" />
      <span className="mt-2">Generate more</span>
      <p className="mt-1 text-xs font-normal text-neutral-400">{jobTitle}</p>
    </button>
  );
}

export function AssetList() {
  const { user } = useUser();
  const authToken = user?.authToken ?? null;
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);

  const assetsQuery = useQuery({
    queryKey: ["assets", authToken],
    queryFn: ({ signal }) => fetchAssets({ authToken, signal }),
    enabled: Boolean(authToken),
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000
  });

  const companiesQuery = useQuery({
    queryKey: ["companies", "asset-list", authToken],
    queryFn: () => WizardApi.fetchMyCompanies({ authToken }),
    enabled: Boolean(authToken),
    staleTime: 5 * 60 * 1000
  });

  const companies = useMemo(() => {
    const records = companiesQuery.data?.companies ?? [];
    if (!records.length) return [];
    return records
      .map((company) => ({
        id: company.id,
        name: company.name || company.primaryDomain || "Untitled company",
        primaryDomain: company.primaryDomain,
        logoUrl: company.logoUrl ?? null,
        isFallback: false
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [companiesQuery.data]);

  useEffect(() => {
    if (!authToken) {
      setSelectedCompanyId(null);
    }
  }, [authToken]);

  const assets = assetsQuery.data ?? [];

  const fallbackCompanies = useMemo(() => {
    const map = new Map();
    assets.forEach((asset) => {
      const key = getCompanyKeyFromAsset(asset);
      if (!key) return;
      if (map.has(key)) return;
      const normalizedName =
        (typeof asset.companyName === "string" && asset.companyName.trim().length > 0
          ? asset.companyName.trim()
          : null) ?? "Untitled company";
      map.set(key, {
        id: key,
        name: normalizedName,
        primaryDomain: "",
        logoUrl: asset.logoUrl ?? null,
        isFallback: true
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [assets]);

  const sidebarCompanies = companies.length > 0 ? companies : fallbackCompanies;
  const fallbackCompaniesActive = companies.length === 0 && fallbackCompanies.length > 0;

  useEffect(() => {
    if (!selectedCompanyId) return;
    if (!sidebarCompanies.some((company) => company.id === selectedCompanyId)) {
      setSelectedCompanyId(null);
    }
  }, [sidebarCompanies, selectedCompanyId]);

  const filteredAssets = useMemo(() => {
    if (!selectedCompanyId) return assets;
    return assets.filter((asset) => getCompanyKeyFromAsset(asset) === selectedCompanyId);
  }, [assets, selectedCompanyId]);

  const groupedAssets = useMemo(() => {
    const groups = buildJobGroups(filteredAssets);
    return groups.sort((a, b) => {
      if (a.latestUpdatedAt && b.latestUpdatedAt) {
        return b.latestUpdatedAt - a.latestUpdatedAt;
      }
      if (a.latestUpdatedAt) return -1;
      if (b.latestUpdatedAt) return 1;
      return b.assets.length - a.assets.length;
    });
  }, [filteredAssets]);

  if (!user) {
    return (
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500 shadow-sm shadow-neutral-100">
        Sign in to view generated assets and publishing history.
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white shadow-sm shadow-neutral-100">
      <div className="flex flex-col gap-6 p-6 lg:flex-row">
        <CompanySidebar
          companies={sidebarCompanies}
          selectedCompanyId={selectedCompanyId}
          onSelect={setSelectedCompanyId}
          isLoading={companiesQuery.isLoading}
          isError={Boolean(companiesQuery.error)}
          fallbackActive={fallbackCompaniesActive}
        />

        <div className="flex-1">
          <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                Asset library
              </p>
              <h2 className="text-2xl font-bold text-neutral-900">Job assets</h2>
              {selectedCompanyId ? (
                <p className="text-sm text-neutral-500">
                  Showing assets for{" "}
                  {
                    sidebarCompanies.find((company) => company.id === selectedCompanyId)?.name ??
                    "selected company"
                  }
                </p>
              ) : (
                <p className="text-sm text-neutral-500">View outputs grouped by job.</p>
              )}
            </div>
            <div className="text-sm text-neutral-500">
              {filteredAssets.length} total asset{filteredAssets.length === 1 ? "" : "s"}
            </div>
          </header>

          {assetsQuery.error ? (
            <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {assetsQuery.error.message}
            </p>
          ) : null}

          {assetsQuery.isLoading ? (
            <p className="mt-6 text-sm text-neutral-500">Loading assets…</p>
          ) : groupedAssets.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-neutral-200 bg-neutral-50 px-6 py-10 text-center text-sm text-neutral-500">
              {selectedCompanyId
                ? "No assets exist for this company yet. Run the wizard to generate the first batch."
                : "Submit a job through the wizard to generate your first job description asset."}
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {groupedAssets.map((group) => (
                <JobGroupCard key={group.jobId} group={group} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
