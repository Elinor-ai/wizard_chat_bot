import { z } from "zod";
import { ChannelIdEnum } from "../common/channels.js";
import { TimestampSchema } from "../common/zod.js";
import { VideoSpecSchema } from "../common/video-specs.js";

export const ShotPhaseEnum = z.enum(["HOOK", "PROOF", "OFFER", "ACTION", "BRIDGE"]);

export const VideoJobSnapshotSchema = z.object({
  jobId: z.string(),
  title: z.string(),
  company: z.string().nullable().optional(),
  geo: z.string().default("global"),
  locationPolicy: z.string().nullable().optional(),
  payRange: z.string().nullable().optional(),
  benefits: z.array(z.string()).default([]),
  roleFamily: z.string().nullable().optional(),
  description: z.string().nullable().optional()
});

export const StoryboardShotSchema = z.object({
  id: z.string(),
  phase: ShotPhaseEnum,
  order: z.number().int().min(1),
  startSeconds: z.number().nonnegative(),
  durationSeconds: z.number().positive(),
  visual: z.string(),
  onScreenText: z.string(),
  voiceOver: z.string(),
  bRoll: z.string().nullable().optional(),
  callout: z.string().nullable().optional()
});

export const CaptionSchema = z.object({
  text: z.string().max(400),
  hashtags: z.array(z.string()).max(8).default([])
});

export const ComplianceFlagSchema = z.object({
  id: z.string(),
  label: z.string(),
  severity: z.enum(["info", "warning", "blocking"]).default("info"),
  details: z.string().nullable().optional()
});

export const VideoQaItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["pass", "fail", "attention"]).default("pass"),
  details: z.string().nullable().optional()
});

export const VideoTrackingSchema = z.object({
  utmSource: z.string(),
  utmMedium: z.string().default("video"),
  utmCampaign: z.string().default("jobs"),
  utmContent: z.string(),
  shortLink: z.string().nullable().optional()
});

export const VideoThumbnailSchema = z.object({
  description: z.string(),
  overlayText: z.string().nullable().optional()
});

export const VideoAssetManifestSchema = z.object({
  manifestId: z.string(),
  version: z.number().int().min(1),
  createdAt: TimestampSchema,
  channelId: ChannelIdEnum,
  channelName: z.string(),
  placementName: z.string(),
  medium: z.string().default("video"),
  spec: VideoSpecSchema,
  job: VideoJobSnapshotSchema,
  storyboard: z.array(StoryboardShotSchema).min(4),
  caption: CaptionSchema,
  thumbnail: VideoThumbnailSchema,
  compliance: z.object({
    flags: z.array(ComplianceFlagSchema).default([]),
    qaChecklist: z.array(VideoQaItemSchema).default([])
  }),
  tracking: VideoTrackingSchema,
  generator: z.object({
    mode: z.enum(["llm", "fallback"]).default("llm"),
    provider: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    promptVersion: z.string().default("2024.11.video"),
    warnings: z.array(z.string()).default([]),
    targetDurationSeconds: z.number().positive().nullable().optional(),
    plannedExtends: z.number().int().nonnegative().nullable().optional()
  })
});

export const RenderModeEnum = z.enum(["file", "dry_run"]);
export const RenderStatusEnum = z.enum(["pending", "rendering", "completed", "failed", "skipped"]);

export const VideoGenerationMetricsSchema = z.object({
  secondsGenerated: z.number().nonnegative().default(0),
  extendsRequested: z.number().int().nonnegative().default(0),
  extendsCompleted: z.number().int().nonnegative().default(0),
  model: z.string().nullable().optional(),
  tier: z.enum(["fast", "standard"]).nullable().optional(),
  costEstimateUsd: z.number().nonnegative().nullable().optional(),
  synthIdWatermark: z.boolean().default(true)
});

export const VeoStateStatusEnum = z.enum(["none", "predicting", "fetching", "ready", "failed", "rate_limited"]);

export const VeoStateSchema = z.object({
  operationName: z.string().nullable().optional(),
  status: VeoStateStatusEnum.default("none"),
  attempts: z.number().int().nonnegative().default(0),
  lastFetchAt: TimestampSchema.nullable().optional(),
  hash: z.string().nullable().optional()
});

export const VideoRenderTaskSchema = z.object({
  id: z.string(),
  manifestVersion: z.number().int().min(1),
  mode: RenderModeEnum.default("dry_run"),
  status: RenderStatusEnum.default("pending"),
  renderer: z.string().nullable().optional(),
  requestedAt: TimestampSchema,
  completedAt: TimestampSchema.nullable().optional(),
  metrics: VideoGenerationMetricsSchema.optional(),
  result: z
    .object({
      videoUrl: z.string().url().nullable().optional(),
      captionFileUrl: z.string().url().nullable().optional(),
      posterUrl: z.string().url().nullable().optional(),
      synthesis: z
        .object({
          clipId: z.string().nullable().optional(),
          extends: z
            .array(
              z.object({
                hop: z.number().int().nonnegative(),
                clipId: z.string().nullable().optional()
              })
            )
            .optional()
        })
        .optional(),
      dryRunBundle: z
        .object({
          storyboard: z.array(StoryboardShotSchema).optional(),
          caption: CaptionSchema.optional(),
          thumbnail: VideoThumbnailSchema.optional(),
              checklist: z.array(VideoQaItemSchema).optional()
            })
            .nullable()
            .optional()
    })
    .nullable()
    .optional(),
  error: z
    .object({
      reason: z.string(),
      message: z.string().nullable().optional()
    })
    .nullable()
    .optional()
});

export const PublishStatusEnum = z.enum(["idle", "ready", "publishing", "published", "failed"]);

export const VideoPublishTaskSchema = z.object({
  id: z.string(),
  channelId: ChannelIdEnum,
  adapter: z.string(),
  status: PublishStatusEnum.default("idle"),
  payload: z.record(z.string(), z.unknown()).default({}),
  response: z.record(z.string(), z.unknown()).nullable().optional(),
  error: z
    .object({
      reason: z.string(),
      message: z.string().nullable().optional()
    })
    .nullable()
    .optional(),
  requestedAt: TimestampSchema,
  completedAt: TimestampSchema.nullable().optional()
});

export const VideoAuditLogEntrySchema = z.object({
  id: z.string(),
  type: z.string(),
  message: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  occurredAt: TimestampSchema
});

export const VideoLibraryStatusEnum = z.enum([
  "planned",
  "generating",
  "extending",
  "ready",
  "approved",
  "published",
  "archived"
]);

export const VideoLibraryItemSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  ownerUserId: z.string(),
  channelId: ChannelIdEnum,
  channelName: z.string(),
  placementName: z.string(),
  status: VideoLibraryStatusEnum.default("draft"),
  manifestVersion: z.number().int().min(1),
  jobSnapshot: VideoJobSnapshotSchema,
  manifests: z.array(VideoAssetManifestSchema).min(1),
  activeManifest: VideoAssetManifestSchema,
  veo: VeoStateSchema.default({ status: "none", attempts: 0 }),
  renderTask: VideoRenderTaskSchema.nullable().optional(),
  publishTask: VideoPublishTaskSchema.nullable().optional(),
  analytics: z
    .object({
      impressions: z.number().nonnegative().default(0),
      clicks: z.number().nonnegative().default(0),
      applies: z.number().nonnegative().default(0)
    })
    .default({ impressions: 0, clicks: 0, applies: 0 }),
  auditLog: z.array(VideoAuditLogEntrySchema).default([]),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema
});
