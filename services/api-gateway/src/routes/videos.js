import { Router } from "express";
import { z } from "zod";
import { wrapAsync, httpError } from "@wizard/utils";
import { JobSchema, ChannelIdEnum } from "@wizard/core";
import { createVideoLibraryService } from "../video/service.js";
import { createRenderer } from "../video/renderer.js";
import { createPublisherRegistry } from "../video/publishers.js";

const JOB_COLLECTION = "jobs";

const createRequestSchema = z.object({
  jobId: z.string(),
  channelId: ChannelIdEnum,
  recommendedMedium: z.string().optional()
});

const listQuerySchema = z.object({
  channelId: ChannelIdEnum.optional(),
  status: z.enum(["planned", "generating", "extending", "ready", "approved", "published", "archived"]).optional(),
  geo: z.string().optional(),
  roleFamily: z.string().optional()
});

const bulkActionSchema = z.object({
  action: z.enum(["approve", "archive"]),
  ids: z.array(z.string().min(1)).min(1)
});

const captionUpdateSchema = z.object({
  captionText: z.string().min(10),
  hashtags: z.array(z.string().min(1)).max(8).optional()
});

function getAuthenticatedUserId(req) {
  const userId = req.user?.id;
  if (!userId) {
    throw httpError(401, "Unauthorized");
  }
  return userId;
}

async function loadJob(firestore, jobId, ownerUserId) {
  const rawJob = await firestore.getDocument(JOB_COLLECTION, jobId);
  if (!rawJob || rawJob.ownerUserId !== ownerUserId) {
    return null;
  }
  const parsed = JobSchema.safeParse(rawJob);
  return parsed.success ? parsed.data : null;
}

function mapListItem(item) {
  const durationSeconds = item.renderTask?.metrics?.secondsGenerated ??
    item.activeManifest?.storyboard?.reduce((sum, shot) => sum + Number(shot.durationSeconds ?? 0), 0);
  return {
    id: item.id,
    jobId: item.jobId,
    jobTitle: item.jobSnapshot?.title ?? "Untitled role",
    channelId: item.channelId,
    channelName: item.channelName,
    placementName: item.placementName,
    status: item.status,
    manifestVersion: item.manifestVersion,
    durationSeconds,
    updatedAt: item.updatedAt,
    thumbnail: item.activeManifest?.thumbnail ?? null,
    veoStatus: item.veo?.status ?? "none",
    hasVideo:
      item.renderTask?.mode === "file" &&
      item.renderTask?.status === "completed" &&
      Boolean(item.renderTask?.result?.videoUrl)
  };
}

function buildDetailResponse(item) {
  const hasFile =
    item.renderTask?.mode === "file" &&
    item.renderTask?.status === "completed" &&
    item.renderTask?.result?.videoUrl;
  const playback = hasFile
    ? {
        type: "file",
        videoUrl: item.renderTask.result.videoUrl,
        posterUrl: item.renderTask.result.posterUrl,
        captionFileUrl: item.renderTask.result.captionFileUrl,
        synthesis: item.renderTask.result.synthesis ?? null
      }
    : {
        type: "storyboard",
        storyboard: item.activeManifest?.storyboard ?? [],
        durationSeconds: item.activeManifest?.storyboard?.reduce(
          (sum, shot) => sum + Number(shot.durationSeconds ?? 0),
          0
        ),
        caption: item.activeManifest?.caption ?? null
      };

  const tracking = item.activeManifest?.tracking;
  const utmString = tracking
    ? `utm_source=${tracking.utmSource}&utm_medium=${tracking.utmMedium}&utm_campaign=${tracking.utmCampaign}&utm_content=${tracking.utmContent}`
    : null;

  return {
    id: item.id,
    jobId: item.jobId,
    jobSnapshot: item.jobSnapshot,
    channelId: item.channelId,
    channelName: item.channelName,
    placementName: item.placementName,
    status: item.status,
    manifestVersion: item.manifestVersion,
    manifest: item.activeManifest,
    renderTask: item.renderTask,
    publishTask: item.publishTask,
    generationMetrics: item.renderTask?.metrics ?? null,
    analytics: item.analytics,
    auditLog: item.auditLog,
    playback,
    trackingString: utmString,
    veo: item.veo ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

export function videosRouter({ firestore, bigQuery, llmClient, logger }) {
  const router = Router();
  const renderer = createRenderer({ logger });
  const publisherRegistry = createPublisherRegistry({ logger });
  const service = createVideoLibraryService({
    firestore,
    bigQuery,
    llmClient,
    renderer,
    publisherRegistry,
    logger
  });

  router.get(
    "/",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const filters = listQuerySchema.parse(req.query ?? {});
      const items = await service.listItems({ ownerUserId: userId, filters });
      res.json({ items: items.map(mapListItem) });
    })
  );

  router.post(
    "/",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = createRequestSchema.parse(req.body ?? {});
      const job = await loadJob(firestore, payload.jobId, userId);
      if (!job) {
        throw httpError(404, "Job not found");
      }
      const { item, renderQueued } = await service.createItem({
        job,
        channelId: payload.channelId,
        recommendedMedium: payload.recommendedMedium,
        ownerUserId: userId
      });
      if (!item) {
        throw httpError(500, "Failed to create video item");
      }
      const responseBody = {
        item: buildDetailResponse(item)
      };
      if (renderQueued) {
        responseBody.renderStatus = {
          assetId: item.id,
          status: "PROCESSING"
        };
        return res.status(202).json(responseBody);
      }
      res.status(201).json(responseBody);
    })
  );

  router.get(
    "/jobs",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const jobs = await firestore.listCollection(JOB_COLLECTION, [
        { field: "ownerUserId", operator: "==", value: userId }
      ]);
      const normalized = jobs
        .map((job) => {
          const parsed = JobSchema.safeParse(job);
          if (!parsed.success) {
            return null;
          }
          return {
            id: job.id,
            title: parsed.data.roleTitle ?? "Untitled role",
            company: parsed.data.companyName ?? null,
            location: parsed.data.location ?? "",
            payRange: parsed.data.salary ?? null,
            benefits: parsed.data.benefits ?? []
          };
        })
        .filter(Boolean);
      res.json({ jobs: normalized });
    })
  );

  router.get(
    "/:id",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const item = await service.getItem({ ownerUserId: userId, itemId: req.params.id });
      if (!item) {
        throw httpError(404, "Video item not found");
      }
      res.json({ item: buildDetailResponse(item) });
    })
  );

  router.post(
    "/:id/regenerate",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = createRequestSchema.pick({ jobId: true, recommendedMedium: true }).parse(req.body ?? {});
      const job = await loadJob(firestore, payload.jobId, userId);
      if (!job) {
        throw httpError(404, "Job not found for regeneration");
      }
      const item = await service.regenerateManifest({
        ownerUserId: userId,
        itemId: req.params.id,
        job,
        recommendedMedium: payload.recommendedMedium
      });
      if (!item) {
        throw httpError(404, "Video item not found");
      }
      res.json({ item: buildDetailResponse(item) });
    })
  );

  router.post(
    "/:id/render",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const item = await service.triggerRender({ ownerUserId: userId, itemId: req.params.id });
      if (!item?.item) {
        throw httpError(404, "Video item not found");
      }
      res
        .status(item.httpStatus ?? 200)
        .json({ item: buildDetailResponse(item.item) });
    })
  );

  router.post(
    "/:id/caption",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = captionUpdateSchema.parse(req.body ?? {});
      const item = await service.updateCaption({
        ownerUserId: userId,
        itemId: req.params.id,
        caption: {
          text: payload.captionText.trim(),
          hashtags: payload.hashtags ?? []
        }
      });
      if (!item) {
        throw httpError(404, "Video item not found");
      }
      res.json({ item: buildDetailResponse(item) });
    })
  );

  router.post(
    "/:id/approve",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const item = await service.approveItem({ ownerUserId: userId, itemId: req.params.id });
      if (!item) {
        throw httpError(404, "Video item not found");
      }
      res.json({ item: buildDetailResponse(item) });
    })
  );

  router.post(
    "/:id/publish",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const item = await service.publishItem({ ownerUserId: userId, itemId: req.params.id });
      if (!item) {
        throw httpError(404, "Video item not found");
      }
      res.json({ item: buildDetailResponse(item) });
    })
  );

  router.post(
    "/bulk",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = bulkActionSchema.parse(req.body ?? {});
      const results = await service.bulkUpdate({
        ownerUserId: userId,
        itemIds: payload.ids,
        action: payload.action
      });
      res.json({ items: results.map(mapListItem) });
    })
  );

  return router;
}
