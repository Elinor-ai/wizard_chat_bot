import { z } from "zod";
import { TimestampSchema } from "../common/zod.js";
import {
  AssetArtifactTypeEnum,
  AssetFormatEnum,
  ASSET_BLUEPRINT_VERSION
} from "../common/asset-formats.js";
import { ChannelIdEnum } from "../common/channels.js";

export const JobAssetStatusEnum = z.enum(["PENDING", "GENERATING", "READY", "FAILED"]);
export const JobAssetRunStatusEnum = z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED"]);

const AssetFailureSchema = z
  .object({
    reason: z.string(),
    message: z.string().nullable().optional(),
    rawPreview: z.string().nullable().optional(),
    occurredAt: TimestampSchema.nullable().optional()
  })
  .optional();

export const JobAssetRecordSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  companyId: z.string().nullable().optional(),
  ownerUserId: z.string(),
  channelId: ChannelIdEnum,
  formatId: AssetFormatEnum,
  artifactType: AssetArtifactTypeEnum,
  blueprintVersion: z.string().default(ASSET_BLUEPRINT_VERSION),
  status: JobAssetStatusEnum.default("PENDING"),
  planId: z.string(),
  batchKey: z.string(),
  requiresMaster: z.boolean().default(false),
  derivedFromAssetId: z.string().nullable().optional(),
  derivedFromFormatId: AssetFormatEnum.nullable().optional(),
  sourceJobVersion: z.enum(["refined", "final", "edited"]).default("refined"),
  llmRationale: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  metadata: z
    .object({
      promptTokens: z.number().nullable().optional(),
      responseTokens: z.number().nullable().optional(),
      totalTokens: z.number().nullable().optional(),
      finishReason: z.string().nullable().optional()
    })
    .optional(),
  content: z
    .object({
      title: z.string().optional(),
      subtitle: z.string().optional(),
      body: z.string().optional(),
      bullets: z.array(z.string()).optional(),
      script: z
        .array(
          z.object({
            beat: z.string(),
            details: z.string().optional(),
            visual: z.string().optional()
          })
        )
        .optional(),
      imagePrompt: z.string().optional(),
      hashtags: z.array(z.string()).optional(),
      callToAction: z.string().optional(),
      notes: z.string().optional(),
      raw: z.unknown().optional()
    })
    .partial()
    .nullable()
    .optional(),
  failure: AssetFailureSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema
});

export const JobAssetRunSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  companyId: z.string().nullable().optional(),
  ownerUserId: z.string(),
  blueprintVersion: z.string().default(ASSET_BLUEPRINT_VERSION),
  channelIds: z.array(ChannelIdEnum).default([]),
  formatIds: z.array(AssetFormatEnum).default([]),
  status: JobAssetRunStatusEnum.default("QUEUED"),
  error: AssetFailureSchema,
  stats: z
    .object({
      assetsPlanned: z.number().default(0),
      assetsCompleted: z.number().default(0),
      promptTokens: z.number().default(0),
      responseTokens: z.number().default(0)
    })
    .default({
      assetsPlanned: 0,
      assetsCompleted: 0,
      promptTokens: 0,
      responseTokens: 0
    }),
  startedAt: TimestampSchema,
  completedAt: TimestampSchema.nullable().optional()
});
