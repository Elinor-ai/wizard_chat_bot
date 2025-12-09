import { z } from "zod";

// =============================================================================
// VIDEO SCHEMAS
// =============================================================================

export const videoThumbnailSchema = z
  .object({
    description: z.string().optional().nullable(),
    overlayText: z.string().optional().nullable(),
  })
  .optional()
  .transform((data) => data ?? null);

export const videoJobSnapshotSchema = z.object({
  jobId: z.string(),
  title: z.string(),
  company: z.string().nullable().optional(),
  geo: z.string().nullable().optional(),
  locationPolicy: z.string().nullable().optional(),
  payRange: z.string().nullable().optional(),
  benefits: z.array(z.string()).default([]),
  roleFamily: z.string().nullable().optional(),
});

export const storyboardShotSchema = z.object({
  id: z.string(),
  phase: z.string(),
  order: z.number(),
  startSeconds: z.number(),
  durationSeconds: z.number(),
  visual: z.string().optional().nullable(),
  onScreenText: z.string().optional().nullable(),
  voiceOver: z.string().optional().nullable(),
});

export const videoCaptionSchema = z.object({
  text: z.string(),
  hashtags: z.array(z.string()).default([]),
});

export const videoManifestSchema = z.object({
  manifestId: z.string(),
  version: z.number(),
  placementName: z.string(),
  job: videoJobSnapshotSchema,
  storyboard: z.array(storyboardShotSchema).default([]),
  caption: videoCaptionSchema,
  thumbnail: videoThumbnailSchema,
  compliance: z
    .object({
      flags: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            severity: z.string(),
            details: z.string().nullable().optional(),
          })
        )
        .default([]),
      qaChecklist: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            status: z.string(),
            details: z.string().nullable().optional(),
          })
        )
        .default([]),
    })
    .default({ flags: [], qaChecklist: [] }),
  tracking: z
    .object({
      utmSource: z.string(),
      utmMedium: z.string(),
      utmCampaign: z.string(),
      utmContent: z.string(),
    })
    .optional(),
});

export const generationMetricsSchema = z
  .object({
    secondsGenerated: z.number().nullable().optional(),
    extendsRequested: z.number().nullable().optional(),
    extendsCompleted: z.number().nullable().optional(),
    model: z.string().nullable().optional(),
    tier: z.string().nullable().optional(),
    costEstimateUsd: z.number().nullable().optional(),
    synthIdWatermark: z.boolean().nullable().optional(),
  })
  .nullable()
  .optional();

export const veoStateSchema = z
  .object({
    operationName: z.string().nullable().optional(),
    status: z.string().default("none"),
    attempts: z.number().nullable().optional(),
    lastFetchAt: z.union([z.string(), z.date()]).nullable().optional(),
    hash: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

export const videoListItemSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  jobTitle: z.string(),
  channelId: z.string(),
  channelName: z.string(),
  placementName: z.string(),
  status: z.string(),
  manifestVersion: z.number(),
  durationSeconds: z.number().nullable().optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
  thumbnail: videoThumbnailSchema,
  hasVideo: z.boolean().optional().default(false),
});

export const videoDetailSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  jobSnapshot: videoJobSnapshotSchema,
  channelId: z.string(),
  channelName: z.string(),
  placementName: z.string(),
  status: z.string(),
  manifestVersion: z.number(),
  // Manifest may be absent immediately after creation (generated async)
  manifest: videoManifestSchema.optional().nullable(),
  veo: veoStateSchema,
  renderTask: z.record(z.string(), z.unknown()).nullable().optional(),
  publishTask: z.record(z.string(), z.unknown()).nullable().optional(),
  generationMetrics: generationMetricsSchema,
  analytics: z.record(z.string(), z.unknown()).default({}),
  auditLog: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        message: z.string(),
        occurredAt: z.union([z.string(), z.date()]),
      })
    )
    .default([]),
  playback: z
    .object({
      type: z.string(),
      videoUrl: z.string().nullable().optional(),
      posterUrl: z.string().nullable().optional(),
      captionFileUrl: z.string().nullable().optional(),
      storyboard: z.array(storyboardShotSchema).optional(),
      durationSeconds: z.number().optional(),
      caption: videoCaptionSchema.optional(),
      synthesis: z
        .object({
          clipId: z.string().nullable().optional(),
          extends: z
            .array(
              z.object({
                hop: z.number().optional(),
                clipId: z.string().nullable().optional(),
              })
            )
            .optional(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  trackingString: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

export const videoJobsResponseSchema = z.object({
  jobs: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        company: z.string().nullable().optional(),
        location: z.string().optional(),
        payRange: z.string().nullable().optional(),
        benefits: z.array(z.string()).default([]),
      })
    )
    .default([]),
});
