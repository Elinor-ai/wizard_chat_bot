/**
 * @file assets-query-service.js
 * Service for loading unified asset views across jobs, campaign assets, videos, and hero images.
 *
 * ARCHITECTURE:
 * - This service orchestrates multiple repository calls to build unified asset views
 * - All Firestore access goes through services/repositories/*
 * - No LLM calls are made from this service
 */

import { httpError } from "@wizard/utils";
import { JobAssetRecordSchema, VideoLibraryItemSchema } from "@wizard/core";
import {
  getJob,
  listJobsForUser,
} from "./repositories/job-repository.js";
import { loadAssetsForUser } from "./repositories/asset-repository.js";
import { loadHeroImagesForUser } from "./repositories/hero-image-repository.js";
import { loadVideoItemsForUser } from "./repositories/video-repository.js";

// =============================================================================
// JOB FIELD EXTRACTORS
// =============================================================================

/**
 * Derive job title from job document
 * @param {Object|null} job - Job document
 * @returns {string} Job title or fallback
 */
function deriveJobTitle(job) {
  if (!job) return "Untitled role";
  if (typeof job.roleTitle === "string" && job.roleTitle.trim().length > 0) {
    return job.roleTitle.trim();
  }
  if (typeof job.companyName === "string" && job.companyName.trim().length > 0) {
    return `${job.companyName.trim()} role`;
  }
  return "Untitled role";
}

/**
 * Resolve company ID from job document
 * @param {Object|null} job - Job document
 * @returns {string|null} Company ID or null
 */
function resolveCompanyId(job) {
  if (!job) return null;
  if (typeof job.companyId === "string" && job.companyId.trim().length > 0) {
    return job.companyId.trim();
  }
  return null;
}

/**
 * Resolve company name from job document
 * @param {Object|null} job - Job document
 * @returns {string|null} Company name or null
 */
function resolveCompanyName(job) {
  if (!job) return null;
  if (typeof job.companyName === "string" && job.companyName.trim().length > 0) {
    return job.companyName.trim();
  }
  if (
    typeof job.confirmed?.companyName === "string" &&
    job.confirmed.companyName.trim().length > 0
  ) {
    return job.confirmed.companyName.trim();
  }
  return null;
}

/**
 * Resolve logo URL from job document
 * @param {Object|null} job - Job document
 * @returns {string|null} Logo URL or null
 */
function resolveJobLogo(job) {
  if (!job) return null;
  if (typeof job.logoUrl === "string" && job.logoUrl.trim().length > 0) {
    return job.logoUrl;
  }
  if (
    typeof job.confirmed?.logoUrl === "string" &&
    job.confirmed.logoUrl.trim().length > 0
  ) {
    return job.confirmed.logoUrl;
  }
  return null;
}

/**
 * Extract job description from job document
 * @param {Object|null} job - Job document
 * @returns {string|null} Job description or null
 */
function extractJobDescription(job) {
  if (!job) return null;
  if (
    typeof job.confirmed?.jobDescription === "string" &&
    job.confirmed.jobDescription.trim().length > 0
  ) {
    return job.confirmed.jobDescription.trim();
  }
  if (typeof job.jobDescription === "string" && job.jobDescription.trim().length > 0) {
    return job.jobDescription.trim();
  }
  return null;
}

// =============================================================================
// MAPPERS
// =============================================================================

/**
 * Convert timestamp value to milliseconds
 * @param {*} value - Timestamp value
 * @returns {number} Timestamp in milliseconds
 */
function timestampValue(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

/**
 * Map a hero image document to asset format
 * @param {Object} imageDoc - Hero image document
 * @param {Map} jobMap - Map of job ID to job document
 * @returns {Object|null} Asset object or null
 */
function mapHeroImageToAsset(imageDoc, jobMap) {
  if (!imageDoc?.jobId) return null;
  const job = jobMap.get(imageDoc.jobId);
  const jobLogo = resolveJobLogo(job);
  const companyId = resolveCompanyId(job);
  const companyName = resolveCompanyName(job);
  const imageUrl =
    imageDoc.imageUrl ??
    (imageDoc.imageBase64
      ? `data:${imageDoc.imageMimeType ?? "image/png"};base64,${imageDoc.imageBase64}`
      : null);

  return {
    id: `hero-image-${imageDoc.jobId}`,
    jobId: imageDoc.jobId,
    jobTitle: deriveJobTitle(job),
    logoUrl: jobLogo,
    companyId,
    companyName,
    channelId: "HERO_IMAGE",
    formatId: "HERO_IMAGE",
    artifactType: "image",
    status: imageDoc.status ?? "PENDING",
    provider: imageDoc.imageProvider ?? imageDoc.promptProvider ?? null,
    model: imageDoc.imageModel ?? imageDoc.promptModel ?? null,
    updatedAt: imageDoc.updatedAt ?? imageDoc.createdAt ?? null,
    summary:
      imageDoc.caption ??
      imageDoc.prompt ??
      imageDoc.failure?.message ??
      "Hero image",
    content: {
      title: "Hero Image",
      body: imageDoc.caption ?? imageDoc.prompt ?? "",
      imageUrl,
      caption: imageDoc.caption ?? null,
      hashtags: Array.isArray(imageDoc.captionHashtags)
        ? imageDoc.captionHashtags
        : [],
    },
  };
}

/**
 * Map a campaign asset to unified asset format
 * @param {Object} asset - Campaign asset record
 * @param {Map} jobMap - Map of job ID to job document
 * @returns {Object} Asset object
 */
function mapCampaignAssetToUnified(asset, jobMap) {
  const job = jobMap.get(asset.jobId);
  const jobLogo = resolveJobLogo(job);
  const companyId = resolveCompanyId(job);
  const companyName = resolveCompanyName(job);

  return {
    id: asset.id,
    jobId: asset.jobId,
    jobTitle: deriveJobTitle(job),
    logoUrl: jobLogo,
    companyId,
    companyName,
    channelId: asset.channelId,
    formatId: asset.formatId,
    artifactType: asset.artifactType,
    status: asset.status,
    provider: asset.provider ?? null,
    model: asset.model ?? null,
    updatedAt: asset.updatedAt ?? asset.createdAt ?? null,
    summary:
      asset.content?.summary ??
      asset.content?.body ??
      asset.llmRationale ??
      null
  };
}

/**
 * Map a video library item to unified asset format
 * @param {Object} item - Video library item
 * @param {Map} jobMap - Map of job ID to job document
 * @returns {Object|null} Asset object or null
 */
function mapVideoItemToAsset(item, jobMap) {
  if (!item) return null;
  const job = jobMap.get(item.jobId);
  const jobTitle = job ? deriveJobTitle(job) : item.jobSnapshot?.title ?? "Untitled role";
  const companyId = resolveCompanyId(job);
  const companyName = resolveCompanyName(job) ?? item.jobSnapshot?.company ?? null;
  const jobLogo = resolveJobLogo(job);
  const captionText = item.activeManifest?.caption?.text ?? null;
  const storyboard = Array.isArray(item.activeManifest?.storyboard)
    ? item.activeManifest.storyboard
    : [];
  const durationSeconds =
    item.renderTask?.metrics?.secondsGenerated ??
    storyboard.reduce((sum, shot) => sum + Number(shot.durationSeconds ?? 0), 0);
  const status = typeof item.status === "string" ? item.status.toUpperCase() : "READY";
  const summary =
    captionText ??
    item.jobSnapshot?.description ??
    item.activeManifest?.placementName ??
    null;

  return {
    id: `video-${item.id}`,
    jobId: item.jobId,
    jobTitle,
    logoUrl: jobLogo,
    companyId,
    companyName,
    channelId: item.channelId,
    formatId: `VIDEO_${item.channelId}`,
    artifactType: "video",
    status,
    provider: item.renderTask?.renderer ?? null,
    model: item.renderTask?.metrics?.model ?? null,
    updatedAt: item.updatedAt ?? item.createdAt ?? null,
    summary,
    content: {
      title: item.placementName ?? item.channelName ?? "Video asset",
      body: captionText ?? summary ?? "",
      caption: captionText ?? "",
      hashtags: item.activeManifest?.caption?.hashtags ?? [],
      storyboard,
      durationSeconds,
      videoUrl: item.renderTask?.result?.videoUrl ?? null,
      posterUrl: item.renderTask?.result?.posterUrl ?? null,
      thumbnailUrl: item.renderTask?.result?.posterUrl ?? null
    }
  };
}

/**
 * Create a virtual job description asset from a job document
 * @param {Object} job - Job document
 * @returns {Object|null} Virtual asset object or null
 */
function createVirtualJobDescriptionAsset(job) {
  const description = extractJobDescription(job);
  if (!description) {
    return null;
  }
  const jobLogo = resolveJobLogo(job);
  const companyId = resolveCompanyId(job);
  const companyName = resolveCompanyName(job);
  return {
    id: `virtual-jd-${job.id}`,
    jobId: job.id,
    jobTitle: deriveJobTitle(job),
    logoUrl: jobLogo,
    companyId,
    companyName,
    channelId: "JOB_DESCRIPTION",
    formatId: "JOB_DESCRIPTION",
    artifactType: "text",
    status: "READY",
    provider: null,
    model: null,
    updatedAt: job.updatedAt ?? job.createdAt ?? new Date(),
    summary: description,
    content: {
      title: "Job Description",
      body: description
    }
  };
}

// =============================================================================
// SERVICE FUNCTIONS
// =============================================================================

/**
 * Load unified assets for a user.
 * Combines campaign assets, video items, hero images, and virtual job description assets.
 *
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.userId - User ID
 * @param {string|null} [params.jobId] - Optional job ID filter
 * @returns {Promise<Object[]>} Array of unified asset objects, sorted by updatedAt desc
 * @throws {HttpError} If job not found or access denied
 */
export async function loadUnifiedAssetsForUser({ firestore, userId, jobId = null }) {
  // Load jobs (either single job or all user jobs)
  let jobs = [];
  if (jobId) {
    const job = await getJob(firestore, jobId);
    if (!job) {
      throw httpError(404, "Job not found");
    }
    if (job.ownerUserId && job.ownerUserId !== userId) {
      throw httpError(403, "You do not have access to this job");
    }
    jobs = [job];
  } else {
    jobs = await listJobsForUser(firestore, userId);
  }

  // Load all asset types in parallel
  const [assets, videoItems, heroImages] = await Promise.all([
    loadAssetsForUser(firestore, userId, jobId),
    loadVideoItemsForUser(firestore, userId, jobId),
    loadHeroImagesForUser(firestore, userId, jobId)
  ]);

  // Build job map for efficient lookups
  const jobMap = new Map(jobs.map((job) => [job.id, job]));

  // Map campaign assets
  const normalizedAssets = assets.map((asset) => mapCampaignAssetToUnified(asset, jobMap));

  // Map video items
  const videoAssets = videoItems
    .map((item) => mapVideoItemToAsset(item, jobMap))
    .filter(Boolean);

  // Map hero images
  const heroAssets = (heroImages ?? [])
    .map((image) => mapHeroImageToAsset(image, jobMap))
    .filter(Boolean);

  // Create virtual job description assets
  const virtualAssets = jobs
    .map((job) => createVirtualJobDescriptionAsset(job))
    .filter(Boolean);

  // Merge and sort by updatedAt desc
  const mergedAssets = [...virtualAssets, ...heroAssets, ...normalizedAssets, ...videoAssets].sort(
    (a, b) => timestampValue(b.updatedAt) - timestampValue(a.updatedAt)
  );

  return mergedAssets;
}
