import { v4 as uuid } from "uuid";
import {
  CHANNEL_CATALOG_MAP,
  VideoLibraryItemSchema,
  VideoLibraryStatusEnum,
  CaptionSchema
} from "@wizard/core";
import { buildVideoManifest } from "./manifest-builder.js";
import { incrementMetric } from "./metrics.js";

const COLLECTION = "videoLibraryItems";
const AUTO_RENDER = process.env.VIDEO_RENDER_AUTOSTART !== "false";
const USE_FAST_TIER = process.env.VIDEO_USE_FAST_FOR_DRAFTS !== "false";
const VEO_POLL_INTERVAL_MS = 30000;
const EMPTY_VEO_STATE = Object.freeze({
  operationName: null,
  status: "none",
  attempts: 0,
  lastFetchAt: null,
  hash: null
});

function deriveChannelName(channelId) {
  return CHANNEL_CATALOG_MAP[channelId]?.name ?? channelId;
}

const LEGACY_STATUS_MAP = {
  rendered: "ready",
  rendering: "generating",
  draft: "planned"
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
    veo: normaliseVeoState(raw?.veo)
  };
  const parsed = VideoLibraryItemSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn({ err: parsed.error }, "Failed to parse video library item");
    return null;
  }
  return parsed.data;
}

function createAuditEntry(type, message, metadata = {}) {
  return {
    id: uuid(),
    type,
    message,
    metadata,
    occurredAt: new Date().toISOString()
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
  if (!state) return { ...EMPTY_VEO_STATE };
  return {
    operationName: state.operationName ?? null,
    status: state.status ?? "none",
    attempts: Number.isFinite(Number(state.attempts)) ? Number(state.attempts) : 0,
    lastFetchAt: state.lastFetchAt ?? null,
    hash: state.hash ?? null
  };
}

export function createVideoLibraryService({ firestore, llmClient, renderer, publisherRegistry, logger }) {
  const veoPollers = new Map();
  async function listItems({ ownerUserId, filters = {} }) {
    const docs = await firestore.listCollection(COLLECTION, [
      { field: "ownerUserId", operator: "==", value: ownerUserId }
    ]);
    return docs
      .map((doc) => normalizeItem(doc, logger))
      .filter(Boolean)
      .filter((item) => {
        if (filters.status && item.status !== filters.status) return false;
        if (filters.channelId && item.channelId !== filters.channelId) return false;
        if (
          filters.geo &&
          item.jobSnapshot?.geo &&
          !item.jobSnapshot.geo.toLowerCase().includes(filters.geo.toLowerCase())
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

  async function createItem({ job, channelId, recommendedMedium, ownerUserId }) {
    const itemId = uuid();
    const channelName = deriveChannelName(channelId);
    const manifest = await buildVideoManifest({
      job,
      channelId,
      channelName,
      recommendedMedium,
      llmClient,
      logger,
      version: 1
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
      veo: { ...EMPTY_VEO_STATE },
      renderTask: null,
      publishTask: null,
      analytics: { impressions: 0, clicks: 0, applies: 0 },
      auditLog: appendAuditLog(
        { auditLog: [] },
        createAuditEntry("created", "Video manifest created", {
          channelId,
          placement: manifest.placementName
        })
      ),
      createdAt: now,
      updatedAt: now
    };

    await saveItem(itemId, baseItem);
    incrementMetric(logger, "video_manifests_created", 1, { ownerUserId });

    if (AUTO_RENDER) {
      const outcome = await triggerRender({ ownerUserId, itemId });
      return outcome?.item ?? null;
    }

    return getItem({ ownerUserId, itemId });
  }

  async function updateItem(item, updates, auditEntry) {
    const payload = {
      ...item,
      ...updates,
      veo: normaliseVeoState(updates.veo ?? item.veo),
      updatedAt: new Date().toISOString()
    };
    if (auditEntry) {
      payload.auditLog = appendAuditLog(item, auditEntry);
    }
    await saveItem(item.id, payload);
    return getItem({ ownerUserId: item.ownerUserId, itemId: item.id });
  }

  async function regenerateManifest({ ownerUserId, itemId, job, recommendedMedium }) {
    const existing = await getItem({ ownerUserId, itemId });
    if (!existing) {
      return null;
    }
    const manifest = await buildVideoManifest({
      job,
      channelId: existing.channelId,
      channelName: existing.channelName,
      recommendedMedium,
      llmClient,
      logger,
      version: existing.manifestVersion + 1
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
      veo: { ...EMPTY_VEO_STATE }
    };
    const auditEntry = createAuditEntry("manifest_regenerated", "Manifest regenerated", {
      version: manifest.version
    });
    const updated = await updateItem(existing, updates, auditEntry);
    if (AUTO_RENDER) {
      const outcome = await triggerRender({ ownerUserId, itemId });
      return outcome?.item ?? null;
    }
    return updated;
  }

  async function triggerRender({ ownerUserId, itemId }) {
    const existing = await getItem({ ownerUserId, itemId });
    if (!existing) {
      return null;
    }
    const tier = resolveTier(existing);
    const outcome = await renderer.render({
      manifest: existing.activeManifest,
      tier,
      item: existing
    });
    const renderTask = outcome?.renderTask ?? outcome;
    const veo = normaliseVeoState(outcome?.veo ?? existing.veo);
    let status = existing.status;
    if (renderTask.status === "completed") {
      status = VideoLibraryStatusEnum.enum.ready;
    } else if (renderTask.status === "failed") {
      status = VideoLibraryStatusEnum.enum.planned;
    } else {
      status = VideoLibraryStatusEnum.enum.generating;
    }
    const auditEntry = createAuditEntry("render_completed", "Render task updated", {
      status: renderTask.status,
      veoStatus: veo.status
    });
    const updated = await updateItem(
      existing,
      {
        renderTask,
        status,
        veo
      },
      auditEntry
    );
    if (renderTask.status === "completed") {
      incrementMetric(logger, "video_renders_completed", 1, { ownerUserId });
    } else if (renderTask.status === "failed") {
      incrementMetric(logger, "video_renders_failed", 1, { ownerUserId });
    }
    const response = { item: updated, httpStatus: outcome?.httpStatus ?? 200 };
    if (response.httpStatus === 202) {
      clearVeoPoll(itemId);
      scheduleVeoPoll({ ownerUserId, itemId });
    } else {
      clearVeoPoll(itemId);
    }
    return response;
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
        status: VideoLibraryStatusEnum.enum.approved
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
      logger
    });
    const status = publishTask.status === "published"
      ? VideoLibraryStatusEnum.enum.published
      : existing.status;
    const auditEntry = createAuditEntry("publish", "Publish request processed", {
      status: publishTask.status
    });
    const updated = await updateItem(
      existing,
      {
        publishTask,
        status
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
      preview: parsedCaption.text.slice(0, 60)
    });
    return updateItem(
      existing,
      {
        manifests,
        activeManifest: { ...existing.activeManifest, caption: parsedCaption }
      },
      auditEntry
    );
  }

  function scheduleVeoPoll({ ownerUserId, itemId }) {
    if (!ownerUserId || !itemId || veoPollers.has(itemId)) {
      return;
    }
    const timeout = setTimeout(async () => {
      veoPollers.delete(itemId);
      try {
        await triggerRender({ ownerUserId, itemId });
      } catch (error) {
        logger.warn({ err: error, itemId }, "Veo auto-fetch failed; retrying");
        scheduleVeoPoll({ ownerUserId, itemId });
      }
    }, VEO_POLL_INTERVAL_MS);
    veoPollers.set(itemId, timeout);
  }

  function clearVeoPoll(itemId) {
    const timeout = veoPollers.get(itemId);
    if (timeout) {
      clearTimeout(timeout);
      veoPollers.delete(itemId);
    }
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
    updateCaption
  };
}

function resolveTier(item) {
  if (item?.status === VideoLibraryStatusEnum.enum.approved) {
    return "standard";
  }
  return USE_FAST_TIER ? "fast" : "standard";
}
