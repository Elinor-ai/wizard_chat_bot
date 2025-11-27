import { v4 as uuid } from "uuid";
import {
  CHANNEL_CATALOG_MAP,
  VideoLibraryItemSchema,
  VideoLibraryStatusEnum,
  CaptionSchema,
} from "@wizard/core";
import { buildVideoManifest } from "./manifest-builder.js";
import { incrementMetric } from "./metrics.js";
import { recordLlmUsage, recordLlmUsageFromResult } from "../services/llm-usage-ledger.js";
import { VERTEX_DEFAULTS } from "../vertex/constants.js";

const COLLECTION = "videoLibraryItems";
const AUTO_RENDER = process.env.VIDEO_RENDER_AUTOSTART !== "false";
const DEFAULT_RENDER_PROVIDER = (process.env.VIDEO_DEFAULT_PROVIDER ?? "veo")
  .toString()
  .toLowerCase();
const INITIAL_RENDER_STATE = Object.freeze({
  operationName: null,
  status: "none",
  attempts: 0,
  lastFetchAt: null,
  hash: null,
});
const ASYNC_RENDER_PROVIDERS = new Set(["sora"]);

function deriveChannelName(channelId) {
  return CHANNEL_CATALOG_MAP[channelId]?.name ?? channelId;
}

const LEGACY_STATUS_MAP = {
  rendered: "ready",
  rendering: "generating",
  draft: "planned",
};

function normaliseStatus(status) {
  if (!status) return status;
  const lowered = String(status).toLowerCase();
  return LEGACY_STATUS_MAP[lowered] ?? lowered;
}

function normalizeItem(raw, logger) {
  const payload = {
    ...raw,
    status: normaliseStatus(raw?.status),
    veo: normaliseVeoState(raw?.veo),
  };
  const parsed = VideoLibraryItemSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn({ err: parsed.error }, "Failed to parse video library item");
    return null;
  }
  const provider = resolveStoredProvider(raw);
  return {
    ...parsed.data,
    provider,
  };
}

function createAuditEntry(type, message, metadata = {}) {
  return {
    id: uuid(),
    type,
    message,
    metadata,
    occurredAt: new Date().toISOString(),
  };
}

function appendAuditLog(item, entry) {
  const nextLog = [...(item.auditLog ?? []), entry];
  if (nextLog.length > 50) {
    return nextLog.slice(nextLog.length - 50);
  }
  return nextLog;
}

function normaliseVeoState(state) {
  if (!state) return { ...INITIAL_RENDER_STATE };
  return {
    operationName: state.operationName ?? INITIAL_RENDER_STATE.operationName,
    status: state.status ?? INITIAL_RENDER_STATE.status,
    attempts: Number.isFinite(Number(state.attempts))
      ? Number(state.attempts)
      : INITIAL_RENDER_STATE.attempts,
    lastFetchAt: state.lastFetchAt ?? INITIAL_RENDER_STATE.lastFetchAt,
    hash: state.hash ?? INITIAL_RENDER_STATE.hash,
  };
}

function normalizeProviderValue(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "sora") return "sora";
  if (normalized === "veo") return "veo";
  return null;
}

function isAsyncRenderProvider(provider) {
  const normalized = normalizeProviderValue(provider);
  return Boolean(normalized) && ASYNC_RENDER_PROVIDERS.has(normalized);
}

function scheduleBackgroundWork(task) {
  if (typeof setImmediate === "function") {
    return setImmediate(task);
  }
  return setTimeout(task, 0);
}

function resolveStoredProvider(raw) {
  return (
    normalizeProviderValue(raw?.provider) ??
    normalizeProviderValue(raw?.picker?.provider) ??
    normalizeProviderValue(raw?.channelPicker?.provider) ??
    DEFAULT_RENDER_PROVIDER
  );
}

function resolveRenderProvider(item) {
  return normalizeProviderValue(item?.provider) ?? DEFAULT_RENDER_PROVIDER;
}

export function createVideoLibraryService({
  firestore,
  llmClient,
  renderer,
  publisherRegistry,
  logger,
}) {
  const usageTracker = ({ result, usageContext }) =>
    recordLlmUsageFromResult({
      firestore,
      logger,
      usageContext,
      result,
    });

  const loadCompanyForJob = async (job) => {
    if (!job?.companyId) {
      return null;
    }
    try {
      const companyDoc = await firestore.getDocument("companies", job.companyId);
      console.log("[video-service] Loaded company branding", {
        companyId: job.companyId,
        hasBrand: Boolean(companyDoc?.brand),
      });
      return companyDoc;
    } catch (error) {
      logger.warn(
        { err: error, companyId: job.companyId },
        "Failed to load company for video manifest"
      );
      return null;
    }
  };

  async function listItems({ ownerUserId, filters = {} }) {
    const docs = await firestore.listCollection(COLLECTION, [
      { field: "ownerUserId", operator: "==", value: ownerUserId },
    ]);
    return docs
      .map((doc) => normalizeItem(doc, logger))
      .filter(Boolean)
      .filter((item) => {
        if (filters.status && item.status !== filters.status) return false;
        if (filters.channelId && item.channelId !== filters.channelId)
          return false;
        if (
          filters.geo &&
          item.jobSnapshot?.geo &&
          !item.jobSnapshot.geo
            .toLowerCase()
            .includes(filters.geo.toLowerCase())
        )
          return false;
        if (
          filters.roleFamily &&
          item.jobSnapshot?.roleFamily &&
          item.jobSnapshot.roleFamily !== filters.roleFamily
        )
          return false;
        return true;
      });
  }

  async function getItem({ ownerUserId, itemId }) {
    const doc = await firestore.getDocument(COLLECTION, itemId);
    if (!doc || doc.ownerUserId !== ownerUserId) {
      return null;
    }
    return normalizeItem(doc, logger);
  }

  async function saveItem(itemId, payload) {
    return firestore.saveDocument(COLLECTION, itemId, payload);
  }

  async function createItem({
    job,
    channelId,
    recommendedMedium,
    ownerUserId,
  }) {
    const itemId = uuid();
    const channelName = deriveChannelName(channelId);
    const company = await loadCompanyForJob(job);
    const manifest = await buildVideoManifest({
      job,
      company,
      channelId,
      channelName,
      recommendedMedium,
      llmClient,
      logger,
      version: 1,
      usageTracker,
    });
    const now = new Date().toISOString();
    const baseItem = {
      id: itemId,
      jobId: job.id,
      ownerUserId,
      channelId,
      channelName,
      placementName: manifest.placementName,
      status: VideoLibraryStatusEnum.enum.planned,
      manifestVersion: manifest.version,
      jobSnapshot: manifest.job,
      manifests: [manifest],
      activeManifest: manifest,
      provider: DEFAULT_RENDER_PROVIDER,
      veo: { ...INITIAL_RENDER_STATE },
      renderTask: null,
      publishTask: null,
      analytics: { impressions: 0, clicks: 0, applies: 0 },
      auditLog: appendAuditLog(
        { auditLog: [] },
        createAuditEntry("created", "Video manifest created", {
          channelId,
          placement: manifest.placementName,
        })
      ),
      createdAt: now,
      updatedAt: now,
    };

    await saveItem(itemId, baseItem);
    incrementMetric(logger, "video_manifests_created", 1, { ownerUserId });

    const provider =
      normalizeProviderValue(baseItem.provider) ?? DEFAULT_RENDER_PROVIDER;

    if (AUTO_RENDER) {
      if (isAsyncRenderProvider(provider)) {
        const queued = await enqueueAsyncRender({ ownerUserId, itemId });
        return { item: queued, renderQueued: true };
      }
      const outcome = await triggerRender({ ownerUserId, itemId });
      return { item: outcome?.item ?? null, renderQueued: false };
    }

    const item = await getItem({ ownerUserId, itemId });
    return { item, renderQueued: false };
  }

  async function updateItem(item, updates, auditEntry) {
    const provider =
      normalizeProviderValue(updates.provider) ??
      normalizeProviderValue(item.provider) ??
      DEFAULT_RENDER_PROVIDER;
    const payload = {
      ...item,
      ...updates,
      provider,
      veo: normaliseVeoState(updates.veo ?? item.veo),
      updatedAt: new Date().toISOString(),
    };
    if (auditEntry) {
      payload.auditLog = appendAuditLog(item, auditEntry);
    }
    await saveItem(item.id, payload);
    return getItem({ ownerUserId: item.ownerUserId, itemId: item.id });
  }

  async function regenerateManifest({
    ownerUserId,
    itemId,
    job,
    recommendedMedium,
  }) {
    const existing = await getItem({ ownerUserId, itemId });
    if (!existing) {
      return null;
    }
    const company = await loadCompanyForJob(job);
    const manifest = await buildVideoManifest({
      job,
      company,
      channelId: existing.channelId,
      channelName: existing.channelName,
      recommendedMedium,
      llmClient,
      logger,
      version: existing.manifestVersion + 1,
      usageTracker,
    });
    const manifests = [...existing.manifests, manifest];
    const updates = {
      manifestVersion: manifest.version,
      manifests,
      activeManifest: manifest,
      jobSnapshot: manifest.job,
      renderTask: null,
      publishTask: null,
      status: VideoLibraryStatusEnum.enum.planned,
      veo: { ...INITIAL_RENDER_STATE },
    };
    const auditEntry = createAuditEntry(
      "manifest_regenerated",
      "Manifest regenerated",
      {
        version: manifest.version,
      }
    );
    const updated = await updateItem(existing, updates, auditEntry);
    if (AUTO_RENDER) {
      const provider = resolveRenderProvider(updated);
      if (isAsyncRenderProvider(provider)) {
        return enqueueAsyncRender({ ownerUserId, itemId });
      }
      const outcome = await triggerRender({ ownerUserId, itemId });
      return outcome?.item ?? null;
    }
    return updated;
  }

  async function enqueueAsyncRender({ ownerUserId, itemId }) {
    const existing = await getItem({ ownerUserId, itemId });
    if (!existing) {
      return null;
    }
    const provider = resolveRenderProvider(existing);
    const renderTask = {
      id: existing.renderTask?.id ?? uuid(),
      manifestVersion: existing.activeManifest.version,
      mode: "file",
      status: "pending",
      renderer: provider,
      requestedAt: new Date().toISOString(),
      completedAt: null,
      result: null,
      error: null,
    };
    const auditEntry = createAuditEntry(
      "render_enqueued",
      "Render queued for asynchronous processing",
      {
        provider,
      }
    );
    const updated = await updateItem(
      existing,
      {
        renderTask,
        status: VideoLibraryStatusEnum.enum.generating,
      },
      auditEntry
    );
    scheduleBackgroundWork(() => {
      triggerRender({ ownerUserId, itemId }).catch((error) => {
        logger.error(
          { err: error, itemId, ownerUserId, provider },
          "Asynchronous video render failed"
        );
      });
    });
    return updated;
  }

  async function triggerRender({ ownerUserId, itemId }) {
    let existing = await getItem({ ownerUserId, itemId });
    if (!existing) {
      return null;
    }
    const provider = resolveRenderProvider(existing);

    const renderTask = await renderer.render({
      manifest: existing.activeManifest,
      provider,
      jobId: existing.jobId,
      itemId: existing.id,
      ownerUserId,
    });
    const veo = { ...INITIAL_RENDER_STATE, status: "ready" };
    let status = existing.status;
    if (renderTask.status === "completed") {
      status = VideoLibraryStatusEnum.enum.ready;
    } else if (renderTask.status === "failed") {
      status = VideoLibraryStatusEnum.enum.planned;
    } else {
      status = VideoLibraryStatusEnum.enum.generating;
    }
    const auditEntry = createAuditEntry(
      "render_completed",
      "Render task updated",
      {
        status: renderTask.status,
        veoStatus: veo.status,
      }
    );
    const updated = await updateItem(
      existing,
      {
        renderTask,
        status,
        veo,
      },
      auditEntry
    );
    if (renderTask.status === "completed" && provider === "veo") {
      const secondsGenerated = Number.isFinite(Number(renderTask.metrics?.secondsGenerated))
        ? Number(renderTask.metrics.secondsGenerated)
        : Number(existing?.activeManifest?.generator?.targetDurationSeconds ?? 0) || 0;
      const videoModel =
        renderTask.metrics?.model ??
        process.env.VIDEO_MODEL ??
        VERTEX_DEFAULTS.VEO_MODEL_ID;
      try {
        await recordLlmUsage({
          firestore,
          logger,
          usageContext: {
            userId: ownerUserId,
            jobId: existing.jobId,
            taskType: "video_generation"
          },
          provider: "veo",
          model: videoModel,
          metadata: {},
          status: "success",
          usageType: "video",
          usageMetrics: {
            seconds: secondsGenerated,
            units: 1
          }
        });
      } catch (error) {
        logger?.warn?.(
          { err: error, jobId: existing.jobId, provider: "veo" },
          "video.render.usage_log_failed"
        );
      }
    }
    if (renderTask.status === "completed") {
      incrementMetric(logger, "video_renders_completed", 1, { ownerUserId });
    } else if (renderTask.status === "failed") {
      incrementMetric(logger, "video_renders_failed", 1, { ownerUserId });
    }
    return { item: updated, httpStatus: 200 };
  }

  async function approveItem({ ownerUserId, itemId }) {
    const existing = await getItem({ ownerUserId, itemId });
    if (!existing) return null;
    if (existing.status === VideoLibraryStatusEnum.enum.approved) {
      return existing;
    }
    const auditEntry = createAuditEntry("approved", "Video marked approved");
    const updated = await updateItem(
      existing,
      {
        status: VideoLibraryStatusEnum.enum.approved,
      },
      auditEntry
    );
    incrementMetric(logger, "video_approvals", 1, { ownerUserId });
    return updated;
  }

  async function publishItem({ ownerUserId, itemId }) {
    const existing = await getItem({ ownerUserId, itemId });
    if (!existing) return null;
    const publishTask = await publisherRegistry.publish({
      manifest: existing.activeManifest,
      renderTask: existing.renderTask,
      logger,
    });
    const status =
      publishTask.status === "published"
        ? VideoLibraryStatusEnum.enum.published
        : existing.status;
    const auditEntry = createAuditEntry(
      "publish",
      "Publish request processed",
      {
        status: publishTask.status,
      }
    );
    const updated = await updateItem(
      existing,
      {
        publishTask,
        status,
      },
      auditEntry
    );
    if (publishTask.status === "published") {
      incrementMetric(logger, "video_publishes", 1, { ownerUserId });
    }
    return updated;
  }

  async function bulkUpdate({ ownerUserId, itemIds = [], action }) {
    const results = [];
    for (const itemId of itemIds) {
      if (action === "approve") {
        const approved = await approveItem({ ownerUserId, itemId });
        if (approved) {
          results.push(approved);
        }
      } else if (action === "archive") {
        const existing = await getItem({ ownerUserId, itemId });
        if (!existing) continue;
        const auditEntry = createAuditEntry("archived", "Video archived");
        const updated = await updateItem(
          existing,
          { status: VideoLibraryStatusEnum.enum.archived },
          auditEntry
        );
        results.push(updated);
      }
    }
    return results;
  }

  async function updateCaption({ ownerUserId, itemId, caption }) {
    const existing = await getItem({ ownerUserId, itemId });
    if (!existing) return null;
    const parsedCaption = CaptionSchema.parse(caption);
    const manifests = existing.manifests.map((manifest) =>
      manifest.version === existing.manifestVersion
        ? { ...manifest, caption: parsedCaption }
        : manifest
    );
    const auditEntry = createAuditEntry("caption_updated", "Caption edited", {
      preview: parsedCaption.text.slice(0, 60),
    });
    return updateItem(
      existing,
      {
        manifests,
        activeManifest: { ...existing.activeManifest, caption: parsedCaption },
      },
      auditEntry
    );
  }

  return {
    listItems,
    getItem,
    createItem,
    regenerateManifest,
    triggerRender,
    approveItem,
    publishItem,
    bulkUpdate,
    updateCaption,
  };
}
