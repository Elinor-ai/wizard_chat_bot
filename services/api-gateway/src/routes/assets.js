import { Router } from "express";
import { wrapAsync, httpError } from "@wizard/utils";
import { JobAssetRecordSchema, VideoLibraryItemSchema } from "@wizard/core";

function getAuthenticatedUserId(req) {
  const userId = req.user?.id;
  if (!userId) {
    throw httpError(401, "Unauthorized");
  }
  return userId;
}

const JOB_COLLECTION = "jobs";
const JOB_ASSET_COLLECTION = "jobAssets";
const VIDEO_LIBRARY_COLLECTION = "videoLibraryItems";

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

function resolveCompanyId(job) {
  if (!job) return null;
  if (typeof job.companyId === "string" && job.companyId.trim().length > 0) {
    return job.companyId.trim();
  }
  return null;
}

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

function timestampValue(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function normalizeAsset(record) {
  const parsed = JobAssetRecordSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
}

function normalizeVideoItem(record) {
  const parsed = VideoLibraryItemSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
}

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

export function assetsRouter({ firestore, logger }) {
  const router = Router();

  router.get(
    "/",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const jobIdRaw = Array.isArray(req.query.jobId)
        ? req.query.jobId[0]
        : req.query.jobId;
      const jobIdFilter = typeof jobIdRaw === "string" ? jobIdRaw.trim() : null;

      let jobs = [];
      if (jobIdFilter) {
        const job = await firestore.getDocument(JOB_COLLECTION, jobIdFilter);
        if (!job) {
          throw httpError(404, "Job not found");
        }
        if (job.ownerUserId && job.ownerUserId !== userId) {
          throw httpError(403, "You do not have access to this job");
        }
        jobs = [job];
      } else {
        jobs = await firestore.listCollection(JOB_COLLECTION, [
          { field: "ownerUserId", operator: "==", value: userId }
        ]);
      }

      const assetFilters = [{ field: "ownerUserId", operator: "==", value: userId }];
      const videoFilters = [{ field: "ownerUserId", operator: "==", value: userId }];
      if (jobIdFilter) {
        assetFilters.push({ field: "jobId", operator: "==", value: jobIdFilter });
        videoFilters.push({ field: "jobId", operator: "==", value: jobIdFilter });
      }

      const [assets, videoItems] = await Promise.all([
        firestore.listCollection(JOB_ASSET_COLLECTION, assetFilters),
        firestore.listCollection(VIDEO_LIBRARY_COLLECTION, videoFilters)
      ]);

      const jobMap = new Map(jobs.map((job) => [job.id, job]));
      const normalized = assets
        .map(normalizeAsset)
        .filter(Boolean)
        .map((asset) => {
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
        });

      const videoAssets = videoItems
        .map(normalizeVideoItem)
        .filter(Boolean)
        .map((item) => mapVideoItemToAsset(item, jobMap))
        .filter(Boolean);

      const virtualAssets = jobs
        .map((job) => {
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
        })
        .filter(Boolean);

      const mergedAssets = [...virtualAssets, ...normalized, ...videoAssets].sort(
        (a, b) => timestampValue(b.updatedAt) - timestampValue(a.updatedAt)
      );

      logger.info(
        { userId, assetCount: mergedAssets.length, jobId: jobIdFilter ?? null },
        "Fetched assets for user"
      );
      res.json({ assets: mergedAssets });
    })
  );

  return router;
}
