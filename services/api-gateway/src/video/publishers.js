import { v4 as uuid } from "uuid";
import { VideoPublishTaskSchema } from "@wizard/core";

const CHANNEL_ADAPTER_KEYS = {
  META_FB_IG_LEAD: "instagram-reels",
  TIKTOK_LEAD: "tiktok",
  YOUTUBE_LEAD: "youtube-shorts",
  SNAPCHAT_LEADS: "snapchat",
  X_HIRING: "x-video"
};

function buildAdapter(key) {
  return {
    key,
    async publish({ manifest, renderTask, logger }) {
      const hasRenderableFile =
        renderTask?.mode === "file" &&
        renderTask?.status === "completed" &&
        renderTask?.result?.videoUrl;

      const payload = {
        manifestId: manifest.manifestId,
        channelId: manifest.channelId,
        placement: manifest.placementName,
        caption: manifest.caption?.text,
        videoUrl: hasRenderableFile ? renderTask.result.videoUrl : null,
        posterUrl: hasRenderableFile ? renderTask.result.posterUrl : null,
        utm: manifest.tracking,
        checklist: manifest.compliance?.qaChecklist ?? []
      };

      logger.info({ adapter: key, manifestId: manifest.manifestId }, "Video publish payload prepared");

      if (!hasRenderableFile) {
        return {
          status: "ready",
          requestPayload: payload,
          response: {
            message: "No rendered file attached; flagged for manual upload"
          }
        };
      }

      return {
        status: "published",
        requestPayload: payload,
        response: {
          externalId: `${key}-${manifest.manifestId}`,
          publishedAt: new Date().toISOString()
        }
      };
    }
  };
}

const ADAPTERS = new Map(
  Object.entries(CHANNEL_ADAPTER_KEYS).map(([channelId, key]) => [channelId, buildAdapter(key)])
);

const DEFAULT_ADAPTER = buildAdapter("video-generic");

export function createPublisherRegistry({ logger }) {
  async function publish({ manifest, renderTask }) {
    const taskId = uuid();
    const requestedAt = new Date().toISOString();
    const adapter = ADAPTERS.get(manifest.channelId) ?? DEFAULT_ADAPTER;

    try {
      const result = await adapter.publish({ manifest, renderTask, logger });
      const payload = {
        id: taskId,
        channelId: manifest.channelId,
        adapter: adapter.key,
        status: result.status === "published" ? "published" : "ready",
        payload: result.requestPayload ?? {},
        response: result.response ?? null,
        requestedAt,
        completedAt: new Date().toISOString()
      };
      return VideoPublishTaskSchema.parse(payload);
    } catch (error) {
      logger.error({ err: error }, "Video publish adapter failed");
      return VideoPublishTaskSchema.parse({
        id: taskId,
        channelId: manifest.channelId,
        adapter: adapter.key,
        status: "failed",
        payload: {},
        requestedAt,
        completedAt: new Date().toISOString(),
        error: {
          reason: "adapter_failed",
          message: error?.message ?? "Adapter failed"
        }
      });
    }
  }

  return {
    publish
  };
}
