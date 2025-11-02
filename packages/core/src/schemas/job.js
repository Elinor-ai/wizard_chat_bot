import { z } from "zod";
import {
  NonNegativeNumber,
  TimestampSchema
} from "./common.js";
import { JobCreationStateEnum } from "./job-states.js";
import { LlmSuggestionBucketSchema, EMPTY_SUGGESTIONS } from "./llm-suggestions.js";
import { JobAssetSchema } from "./asset-artifact.js";
import { CampaignSchema } from "./campaign.js";

export const JobStatusEnum = z.enum([
  "draft",
  "intake_in_progress",
  "awaiting_confirmation",
  "approved",
  "assets_generating",
  "campaigns_planned",
  "publishing",
  "live",
  "paused",
  "closed",
  "archived"
]);

export const WorkModelEnum = z.enum(["on_site", "hybrid", "remote"]);
export const EmploymentTypeEnum = z.enum([
  "full_time",
  "part_time",
  "contract",
  "temp",
  "intern"
]);
export const ScheduleEnum = z.enum(["day", "night", "weekend", "shift"]);
export const SalaryPeriodEnum = z.enum(["hour", "month", "year"]);
export const ApplyMethodEnum = z.enum(["internal_form", "external_link", "both"]);
export const ExperienceLevelEnum = z.enum(["entry", "mid", "senior"]);

const GeoPointSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  })
  .nullable();

export const JobSchema = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  orgId: z.string().nullable().optional(),
  status: JobStatusEnum,
  schemaVersion: z.string(),
  stateMachine: z.object({
    currentState: JobCreationStateEnum,
    previousState: JobCreationStateEnum.nullable().optional(),
    history: z
      .array(
        z.object({
          from: JobCreationStateEnum,
          to: JobCreationStateEnum,
          at: TimestampSchema,
          reason: z.string().optional()
        })
      )
      .default([]),
    requiredComplete: z.boolean(),
    optionalOffered: z.array(z.string()).default([]),
    lastTransitionAt: TimestampSchema,
    lockedByRequestId: z.string().nullable().optional()
  }),
  confirmed: z.object({
    title: z.string(),
    roleCategory: z.string(),
    location: z.object({
      geo: GeoPointSchema,
      city: z.string(),
      country: z.string().length(2),
      radiusKm: z.number().min(0).optional()
    }),
    workModel: WorkModelEnum,
    employmentType: EmploymentTypeEnum,
    schedule: z.array(ScheduleEnum).optional(),
    salary: z
      .object({
        currency: z.string().length(3),
        min: z.number().optional(),
        max: z.number().optional(),
        period: SalaryPeriodEnum,
        overtime: z.boolean()
      })
      .nullable()
      .optional(),
    description: z.string(),
    requirements: z
      .object({
        mustHave: z.array(z.string()).default([]),
        niceToHave: z.array(z.string()).default([])
      })
      .default({}),
    benefits: z.array(z.string()).default([]),
    experienceLevel: ExperienceLevelEnum.optional(),
    licenses: z.array(z.string()).default([]),
    language: z.string().default("en-US"),
    industry: z.string().optional(),
    applyMethod: ApplyMethodEnum.default("internal_form"),
    applicationFormId: z.string().nullable().optional(),
    externalApplyUrl: z.string().nullable().optional(),
    brand: z
      .object({
        logoUrl: z.string().url().optional(),
        color: z.string().optional(),
        tone: z.string().optional()
      })
      .optional(),
    notesCompliance: z.string().optional()
  }),
  pendingSuggestions: LlmSuggestionBucketSchema.default(EMPTY_SUGGESTIONS),
  llm: z
    .object({
      predictions: LlmSuggestionBucketSchema.default(EMPTY_SUGGESTIONS),
      lastRunAt: TimestampSchema.nullable().optional(),
      modelsUsed: z
        .array(
          z.object({
            task: z.string(),
            provider: z.string(),
            model: z.string(),
            tokens: NonNegativeNumber.optional(),
            credits: NonNegativeNumber.optional(),
            ranAt: TimestampSchema
          })
        )
        .default([])
    })
    .default({
      predictions: EMPTY_SUGGESTIONS,
      modelsUsed: []
    }),
  approvals: z.object({
    fieldsApproved: z.array(z.string()).default([]),
    approvedBy: z.string().nullable().optional(),
    approvedAt: TimestampSchema.nullable().optional()
  }),
  assets: z.array(JobAssetSchema).default([]),
  campaigns: z
    .array(
      z.object({
        campaignId: z.string(),
        channel: CampaignSchema.shape.channel,
        status: CampaignSchema.shape.status,
        budget: NonNegativeNumber,
        objective: CampaignSchema.shape.objective.optional(),
        createdAt: TimestampSchema
      })
    )
    .default([]),
  screening: z.object({
    knockoutQuestions: z
      .array(
        z.object({
          id: z.string(),
          text: z.string(),
          answerType: z.enum(["text", "select", "boolean", "number"]),
          options: z.array(z.string()).optional(),
          required: z.boolean()
        })
      )
      .default([]),
    assessments: z
      .array(
        z.object({
          provider: z.string(),
          testId: z.string(),
          link: z.string()
        })
      )
      .default([]),
    scorecard: z.record(z.string(), z.number()).default({})
  }),
  metrics: z.object({
    impressions: z.number().int().min(0).default(0),
    clicks: z.number().int().min(0).default(0),
    applies: z.number().int().min(0).default(0),
    qualifiedApplies: z.number().int().min(0).default(0),
    interviews: z.number().int().min(0).default(0),
    offers: z.number().int().min(0).default(0),
    hires: z.number().int().min(0).default(0),
    byChannel: z
      .record(
        z.string(),
        z.object({
          impressions: NonNegativeNumber.default(0),
          clicks: NonNegativeNumber.default(0),
          applies: NonNegativeNumber.default(0),
          spend: NonNegativeNumber.default(0),
          cpa: NonNegativeNumber.optional(),
          ctr: z.number().optional(),
          cvr: z.number().optional()
        })
      )
      .default({})
  }),
  credits: z.object({
    reserved: NonNegativeNumber,
    reservations: z
      .array(
        z.object({
          reservationId: z.string(),
          amount: z.number(),
          reason: z.string(),
          at: TimestampSchema,
          status: z.enum(["pending", "released", "cancelled"]).optional(),
          releasedAt: TimestampSchema.optional()
        })
      )
      .default([]),
    charges: z
      .array(
        z.object({
          ledgerId: z.string(),
          amount: z.number(),
          reason: z.string(),
          at: TimestampSchema
        })
      )
      .default([]),
    pricingVersion: z.string(),
    policy: z.record(z.string(), z.unknown()).default({}),
    tokenToCreditRatio: z.number().optional()
  }),
  publishing: z.object({
    selectedChannels: z.array(z.string()).default([]),
    scheduleAt: TimestampSchema.nullable().optional(),
    budgetTotal: NonNegativeNumber.default(0),
    goal: CampaignSchema.shape.objective.default("qualified_apply")
  }),
  attribution: z
    .object({
      utm: z.record(z.string(), z.string()).default({}),
      audiences: z.array(z.string()).default([]),
      personas: z.array(z.string()).default([])
    })
    .optional(),
  shortCircuitFlow: z
    .object({
      primaryAssetType: z.string()
    })
    .nullable()
    .optional(),
  versioning: z.object({
    currentVersion: z.number().int().min(1),
    previousVersionId: z.string().nullable().optional()
  }),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  archivedAt: TimestampSchema.nullable().optional()
});
