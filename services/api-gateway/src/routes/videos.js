/**
 * @file videos.js
 * Video Library API Router - thin dispatcher for video operations.
 *
 * ARCHITECTURE:
 * - PROTECTED: This router is mounted behind requireAuth middleware in server.js.
 *   The router assumes req.user is already set and does NOT verify JWTs directly.
 * - This router does NOT access Firestore directly.
 * - All Firestore access goes through services/repositories/* or video/service.js.
 * - LLM operations (create, regenerate, render, caption) go through HTTP POST /api/llm
 * - This router does NOT import or call llmClient directly
 * - Only Firestore-only operations (list, get, approve, publish, bulk) are handled by the video service
 */

import { Router } from "express";
import { z } from "zod";
import { wrapAsync, httpError, loadEnv } from "@wizard/utils";
import { ChannelIdEnum } from "@wizard/core";
import { createVideoLibraryService } from "../video/service.js";
import { createRenderer } from "../video/renderer.js";
import { createPublisherRegistry } from "../video/publishers.js";
import { getJobForUser, listJobsForUser } from "../services/repositories/index.js";

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

/**
 * Trigger a video operation via HTTP POST /api/llm.
 * This enforces the invariant: all LLM calls go through POST /api/llm.
 *
 * @param {Object} params
 * @param {string} params.apiBaseUrl - Base URL for API calls
 * @param {string} params.authToken - Bearer token for auth
 * @param {string} params.taskType - LLM task type (e.g., "video_create_manifest")
 * @param {Object} params.context - Task-specific context
 * @param {Object} params.logger - Logger instance
 * @returns {Promise<Object>} Result from the LLM endpoint
 */
async function triggerVideoOperationViaHttp({ apiBaseUrl, authToken, taskType, context, logger }) {
  const url = `${apiBaseUrl}/api/llm`;
  logger?.info?.({ taskType, context }, "videos.http_dispatch.start");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ taskType, context }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger?.error?.(
      { taskType, status: response.status, errorText },
      "videos.http_dispatch.failed"
    );
    throw httpError(response.status, errorText || `Video operation failed: ${taskType}`);
  }

  const data = await response.json();
  logger?.info?.({ taskType, hasResult: Boolean(data?.result) }, "videos.http_dispatch.complete");
  return data.result;
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

// Videos routes - NO llmClient passed
// All LLM calls go through HTTP POST /api/llm
export function videosRouter({ firestore, bigQuery, logger }) {
  const router = Router();

  // Determine API base URL for internal HTTP calls (same pattern as companies, golden-interview)
  const env = loadEnv();
  const port = Number(env.PORT ?? 4000);
  const apiBaseUrl = `http://127.0.0.1:${port}`;

  // Service is used ONLY for Firestore-only operations (list, get, approve, publish, bulk)
  // LLM operations (create, regenerate, render, caption) go through HTTP POST /api/llm
  const renderer = createRenderer({ logger });
  const publisherRegistry = createPublisherRegistry({ logger });
  const service = createVideoLibraryService({
    firestore,
    bigQuery,
    llmClient: null, // No llmClient - LLM operations go through HTTP
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

  // POST / - Create video manifest via HTTP POST /api/llm
  // Note: LLM calls for storyboard/caption/compliance go through POST /api/llm
  router.post(
    "/",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const authToken = req.user?.token;
      if (!authToken) {
        throw httpError(401, "Missing auth token");
      }
      const payload = createRequestSchema.parse(req.body ?? {});

      // Verify job exists and belongs to user (auth check before HTTP call)
      const job = await getJobForUser(firestore, payload.jobId, userId);
      if (!job) {
        throw httpError(404, "Job not found");
      }

      // Trigger video_create_manifest via HTTP POST /api/llm
      const result = await triggerVideoOperationViaHttp({
        apiBaseUrl,
        authToken,
        taskType: "video_create_manifest",
        context: {
          jobId: payload.jobId,
          channelId: payload.channelId,
          recommendedMedium: payload.recommendedMedium,
        },
        logger,
      });

      const item = result?.item;
      if (!item) {
        throw httpError(500, "Failed to create video item");
      }

      const responseBody = {
        item: buildDetailResponse(item)
      };
      // Check if render was auto-queued (async provider)
      if (item.status === "generating") {
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
      const jobs = await listJobsForUser(firestore, userId);
      const normalized = jobs.map((job) => ({
        id: job.id,
        title: job.roleTitle ?? "Untitled role",
        company: job.companyName ?? null,
        location: job.location ?? "",
        payRange: job.salary ?? null,
        benefits: job.benefits ?? []
      }));
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

  // POST /:id/regenerate - Regenerate video manifest via HTTP POST /api/llm
  // Note: LLM calls for storyboard/caption/compliance go through POST /api/llm
  router.post(
    "/:id/regenerate",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const authToken = req.user?.token;
      if (!authToken) {
        throw httpError(401, "Missing auth token");
      }
      const payload = createRequestSchema.pick({ jobId: true, recommendedMedium: true }).parse(req.body ?? {});

      // Verify job exists and belongs to user (auth check before HTTP call)
      const job = await getJobForUser(firestore, payload.jobId, userId);
      if (!job) {
        throw httpError(404, "Job not found for regeneration");
      }

      // Trigger video_regenerate via HTTP POST /api/llm
      const result = await triggerVideoOperationViaHttp({
        apiBaseUrl,
        authToken,
        taskType: "video_regenerate",
        context: {
          jobId: payload.jobId,
          itemId: req.params.id,
          recommendedMedium: payload.recommendedMedium,
        },
        logger,
      });

      const item = result?.item;
      if (!item) {
        throw httpError(404, "Video item not found");
      }
      res.json({ item: buildDetailResponse(item) });
    })
  );

  // POST /:id/render - Trigger video render via HTTP POST /api/llm
  // Note: Video generation (Veo/Sora) is handled by the orchestrator
  router.post(
    "/:id/render",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const authToken = req.user?.token;
      if (!authToken) {
        throw httpError(401, "Missing auth token");
      }

      // Trigger video_render via HTTP POST /api/llm
      const result = await triggerVideoOperationViaHttp({
        apiBaseUrl,
        authToken,
        taskType: "video_render",
        context: { itemId: req.params.id },
        logger,
      });

      const item = result?.item;
      if (!item) {
        throw httpError(404, "Video item not found");
      }
      res.status(200).json({ item: buildDetailResponse(item) });
    })
  );

  // POST /:id/caption - Update video caption via HTTP POST /api/llm
  // Note: Caption update is handled by the orchestrator for consistency
  router.post(
    "/:id/caption",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const authToken = req.user?.token;
      if (!authToken) {
        throw httpError(401, "Missing auth token");
      }
      const payload = captionUpdateSchema.parse(req.body ?? {});

      // Trigger video_caption_update via HTTP POST /api/llm
      const result = await triggerVideoOperationViaHttp({
        apiBaseUrl,
        authToken,
        taskType: "video_caption_update",
        context: {
          itemId: req.params.id,
          caption: {
            text: payload.captionText.trim(),
            hashtags: payload.hashtags ?? []
          }
        },
        logger,
      });

      const item = result?.item;
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
