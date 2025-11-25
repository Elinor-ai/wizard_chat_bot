"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Heart, MessageCircle, Share2, Bookmark } from "lucide-react";
import { clsx } from "../../lib/cn";

function useEscape(handler, enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") {
        handler?.();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, handler]);
}

function VideoPreview({ asset }) {
  const videoUrl = asset?.content?.videoUrl ?? null;
  const poster = asset?.content?.posterUrl ?? asset?.content?.thumbnailUrl ?? null;
  const caption = asset?.content?.caption ?? asset?.summary ?? "";
  return (
    <article className="w-full max-w-3xl rounded-3xl border border-neutral-200 bg-black/80 p-6 shadow-xl">
      <div className="rounded-2xl bg-black p-4 shadow-inner shadow-black/40">
        {videoUrl ? (
          <video
            className="w-full rounded-2xl"
            src={videoUrl}
            poster={poster || undefined}
            controls
            playsInline
          >
            <p className="text-sm text-white">
              Your browser does not support HTML video. Download from{" "}
              <a href={videoUrl} className="underline">
                {videoUrl}
              </a>
              .
            </p>
          </video>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-white/20 text-sm text-white/70">
            Video file unavailable for this asset.
          </div>
        )}
      </div>
      {caption ? (
        <p className="mt-4 whitespace-pre-wrap text-sm text-white/80">{caption}</p>
      ) : null}
    </article>
  );
}

function LinkedInPreview({ asset, logoUrl, companyName }) {
  const body =
    asset?.content?.body ??
    asset?.content?.caption ??
    asset?.content?.script ??
    asset?.summary ??
    "LinkedIn copy preview.";
  const image = asset?.content?.imageUrl ?? asset?.content?.thumbnailUrl ?? null;
  return (
    <article className="w-full max-w-2xl rounded-3xl border border-neutral-200 bg-white shadow-xl shadow-black/10">
      <header className="flex items-center gap-3 px-6 py-4">
        <div className="h-14 w-14 overflow-hidden rounded-2xl bg-neutral-100">
          {logoUrl ? (
            <img src={logoUrl} alt={companyName ?? "Company"} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-neutral-500">
              {(companyName ?? "Job").slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div>
          <p className="text-base font-semibold text-neutral-900">{companyName ?? "Company"}</p>
          <p className="text-sm text-neutral-500">Promoted • 1st</p>
        </div>
      </header>
      <div className="px-6 pb-4 text-sm leading-relaxed text-neutral-800 whitespace-pre-wrap">
        {body}
      </div>
      {image ? (
        <div className="mt-2 border-t border-neutral-100">
          <img src={image} alt="Preview" className="h-96 w-full object-cover" />
        </div>
      ) : null}
      <footer className="flex items-center justify-between px-6 py-4 text-xs text-neutral-500">
        <span>👍 Celebrate • 💬 Comment • ↗️ Share</span>
        <span>1,024 impressions</span>
      </footer>
    </article>
  );
}

function InstagramPreview({ asset, companyName }) {
  const image = asset?.content?.imageUrl ?? asset?.content?.thumbnailUrl ?? null;
  const caption = asset?.content?.caption ?? asset?.content?.body ?? asset?.summary ?? "";
  return (
    <article className="mx-auto w-full max-w-sm rounded-[32px] border border-neutral-200 bg-black text-white shadow-2xl">
      <div className="flex items-center justify-between px-4 py-2 text-xs opacity-80">
        <span>9:41</span>
        <div className="flex items-center gap-1">
          <span>5G</span>
          <span>🔋</span>
        </div>
      </div>
      <header className="flex items-center gap-3 px-4 py-3">
        <div className="h-10 w-10 rounded-full bg-neutral-700" />
        <div>
          <p className="text-sm font-semibold">{companyName ?? "Company"}</p>
          <p className="text-xs text-neutral-300">Sponsored</p>
        </div>
      </header>
      <div className="aspect-square w-full bg-neutral-900">
        {image ? (
          <img src={image} alt="Instagram preview" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-500">
            No media
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-4 py-3 text-neutral-200">
        <div className="flex items-center gap-4">
          <Heart className="h-5 w-5" />
          <MessageCircle className="h-5 w-5" />
          <Share2 className="h-5 w-5" />
        </div>
        <Bookmark className="h-5 w-5" />
      </div>
      <div className="space-y-2 px-4 pb-6 text-sm text-neutral-100">
        <p className="font-semibold">Sponsored</p>
        <p className="whitespace-pre-wrap">{caption}</p>
      </div>
    </article>
  );
}

function FacebookPreview({ asset, companyName, logoUrl }) {
  const body = asset?.content?.body ?? asset?.summary ?? "Facebook ad preview text.";
  const headline = asset?.content?.title ?? companyName ?? "Apply now";
  const image = asset?.content?.imageUrl ?? asset?.content?.thumbnailUrl ?? null;
  const domain =
    asset?.content?.landingPageUrl?.replace?.(/^https?:\/\//, "") ??
    asset?.content?.domain ??
    (companyName ? `${companyName.replace(/\s+/g, "").toUpperCase()}.COM` : "COMPANY.COM");

  return (
    <article className="w-full rounded-2xl border border-neutral-200 bg-white shadow-lg">
      <header className="flex items-center gap-3 px-4 py-3">
        <div className="h-12 w-12 overflow-hidden rounded-full bg-neutral-100">
          {logoUrl ? (
            <img src={logoUrl} alt={companyName ?? "Company"} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-neutral-500">
              {(companyName ?? "FB").slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-neutral-900">{companyName ?? "Company"}</p>
          <p className="text-xs text-neutral-500">Sponsored · 🌍</p>
        </div>
      </header>
      <div className="px-4 pb-4 text-sm text-neutral-800 whitespace-pre-wrap">{body}</div>
      <div className="h-64 w-full bg-neutral-100">
        {image ? (
          <img src={image} alt="Facebook preview" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-400">
            No media provided
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <div>
          <p className="text-xs font-semibold text-neutral-500">{domain}</p>
          <p className="font-semibold text-neutral-900">{headline}</p>
        </div>
        <button
          type="button"
          className="rounded-full bg-primary-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Apply now
        </button>
      </div>
      <footer className="flex items-center justify-around border-t border-neutral-100 px-4 py-2 text-xs text-neutral-500">
        <button type="button">👍 Like</button>
        <button type="button">💬 Comment</button>
        <button type="button">↗️ Share</button>
      </footer>
    </article>
  );
}

function GenericPreview({ asset, companyName }) {
  const title = asset?.content?.title ?? asset?.formatId ?? "Asset preview";
  const body =
    asset?.content?.body ??
    asset?.content?.script ??
    asset?.content?.caption ??
    asset?.summary ??
    "Preview unavailable.";

  return (
    <article className="w-full rounded-2xl border border-dashed border-neutral-300 bg-white p-6 shadow-lg">
      <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
      <p className="mt-1 text-sm text-neutral-500">{companyName ?? "Company"}</p>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">{body}</p>
    </article>
  );
}

function resolvePreviewComponent(asset) {
  const artifactType = asset?.artifactType?.toLowerCase?.() ?? "";
  const format = asset?.formatId?.toUpperCase?.() ?? "";
  const channel = asset?.channelId?.toUpperCase?.() ?? "";

  if (artifactType === "video" || format.includes("VIDEO") || channel.includes("VIDEO")) {
    return VideoPreview;
  }
  if (["FACEBOOK_JOBS_US", "META_FB_IG_LEAD", "FACEBOOK_FEED_AD"].some((key) => format.includes(key) || channel.includes("FACEBOOK") || channel.includes("META"))) {
    return FacebookPreview;
  }
  if (["LINKEDIN_JOB_POSTING", "LINKEDIN_FEED_POST"].some((key) => format.includes(key) || channel.includes("LINKEDIN"))) {
    return LinkedInPreview;
  }
  if (["SOCIAL_IMAGE_POST", "SHORT_VIDEO_INSTAGRAM"].some((key) => format.includes(key)) || channel.includes("INSTAGRAM")) {
    return InstagramPreview;
  }
  return GenericPreview;
}

export function AssetPreviewModal({ isOpen, onClose, asset, companyName, logoUrl }) {
  useEscape(onClose, isOpen);
  if (!isOpen || !asset) {
    return null;
  }

  const PreviewComponent = resolvePreviewComponent(asset);
  const modalContent = (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4">
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[32px] bg-neutral-950/10 p-4 backdrop-blur">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-6 top-6 rounded-full border border-white/20 bg-white/10 p-2 text-white transition hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
        <div className={clsx("mt-8 flex w-full justify-center px-2 py-6")}>
          <PreviewComponent asset={asset} companyName={companyName} logoUrl={logoUrl} />
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
