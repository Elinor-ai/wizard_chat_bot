import { z } from "zod";
import { v4 as uuid } from "uuid";

/**
 * Shared validators
 */
const NonNegativeNumber = z.number().min(0);
const TimestampSchema = z.coerce.date();
const NullableString = z.string().nullable().optional();

/**
 * LLM suggestion payloads used across wizard/chat experiences.
 */
export const SuggestionSchema = z.object({
  id: z.string().uuid(),
  fieldId: z.string(),
  proposal: z.string(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  createdAt: TimestampSchema.optional(),
  source: z.string().optional()
});

/**
 * Deterministic state machine helper for orchestrations.
 */
export class DeterministicStateMachine {
  constructor(name) {
    this.name = name;
    this.transitions = new Map();
  }

  registerTransition(from, to) {
    const current = this.transitions.get(from) ?? new Set();
    current.add(to);
    this.transitions.set(from, current);
  }

  canTransition(current, next) {
    const allowed = this.transitions.get(current);
    return allowed ? allowed.has(next) : false;
  }

  assertTransition(current, next) {
    if (!this.canTransition(current, next)) {
      throw new Error(`Invalid transition for ${this.name}: ${current} → ${next}`);
    }
  }
}

/**
 * Prompt definitions for LLM orchestration.
 */
export const PromptSchema = z.object({
  id: z.string(),
  version: z.string(),
  template: z.string(),
  variables: z.array(z.string()),
  guardrails: z.object({
    schema: z.unknown().optional(),
    maxTokens: z.number().optional(),
    temperature: z.number().optional()
  })
});

/**
 * Chat thread schema (cost-aware transcripts).
 */
export const ChatMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
  createdAt: TimestampSchema,
  costCredits: z.number().optional()
});

export const ChatThreadSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().optional(),
  messages: z.array(ChatMessageSchema),
  totalCredits: NonNegativeNumber.default(0)
});

/**
 * Asset + campaign schemas (provenance + attribution).
 */
export const AssetArtifactSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string(),
  type: z.enum([
    "JOB_TITLE",
    "JOB_DESCRIPTION",
    "LANDING_PAGE",
    "SOCIAL_POST",
    "VIDEO_SCRIPT",
    "IMAGE",
    "INTERVIEW_GUIDE"
  ]),
  status: z.enum(["QUEUED", "DRAFT", "REVIEW", "APPROVED", "FAILED", "ARCHIVED"]),
  model: z.string(),
  promptVersion: z.string(),
  payload: z.unknown(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  provenance: z.object({
    confirmedVersionId: z.string(),
    suggestionIds: z.array(z.string()).default([]),
    costCredits: z.number().optional()
  })
});

export const CampaignSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string(),
  channel: z.enum([
    "job_board",
    "facebook",
    "tiktok",
    "reddit",
    "instagram",
    "discord",
    "linkedin",
    "telegram",
    "other"
  ]),
  status: z.enum(["DRAFT", "SCHEDULED", "RUNNING", "PAUSED", "COMPLETED", "FAILED"]),
  budget: NonNegativeNumber,
  objective: z.enum(["apply_volume", "qualified_apply", "hire_speed"]).optional(),
  audience: z.record(z.string(), z.unknown()).default({}),
  creatives: z.array(z.string()).default([]),
  tracking: z.object({
    utmParameters: z.record(z.string(), z.string()).default({}),
    attributionModel: z.enum(["LAST_TOUCH", "FIRST_TOUCH", "MULTI_TOUCH"]).optional()
  }),
  metrics: z.object({
    impressions: NonNegativeNumber.default(0),
    clicks: NonNegativeNumber.default(0),
    qualifiedLeads: NonNegativeNumber.default(0),
    spend: NonNegativeNumber.default(0)
  }),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema
});

/**
 * Credit ledger entries shared across services.
 */
export const CreditLedgerEntrySchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().optional(),
  workflow: z.string(),
  type: z.enum(["RESERVE", "CHARGE", "REFUND"]),
  credits: z.number(),
  status: z.enum(["PENDING", "RESERVED", "SETTLED", "REFUNDED", "FAILED"]),
  correlationId: z.string(),
  occurredAt: TimestampSchema,
  metadata: z.record(z.string(), z.unknown()).default({})
});

/**
 * Event envelope for pubs/subs.
 */
export const EventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  source: z.string(),
  occurredAt: TimestampSchema,
  partitionKey: z.string(),
  version: z.string().default("v1"),
  payload: z.unknown(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

/**
 * USER SCHEMA
 * Represents workspace customers, entitlements, billing, and usage.
 */
export const UserRoleEnum = z.enum(["owner", "admin", "member"]);
export const AuthProviderEnum = z.enum(["password", "google"]);
export const PlanIdEnum = z.enum(["free", "starter", "pro", "enterprise"]);
export const PlanStatusEnum = z.enum(["trial", "active", "past_due", "canceled"]);

export const UserSchema = z.object({
  id: z.string(),
  orgId: z.string().nullable().optional(),
  auth: z.object({
    provider: AuthProviderEnum,
    providerUid: z.string(),
    email: z.string().email(),
    emailVerified: z.boolean(),
    roles: z.array(UserRoleEnum).min(1)
  }),
  profile: z.object({
    name: z.string(),
    companyName: z.string().optional(),
    timezone: z.string(),
    locale: z.string(),
    phone: z.string().optional()
  }),
  plan: z.object({
    planId: PlanIdEnum,
    status: PlanStatusEnum,
    seatCount: z.number().int().min(1),
    currency: z.string().length(3),
    trialEndsAt: TimestampSchema.nullable().optional(),
    entitlements: z.record(z.string(), z.union([z.boolean(), z.number()]))
  }),
  billing: z.object({
    billingAccountId: z.string(),
    taxId: z.string().optional(),
    invoiceEmail: z.string().email(),
    address: z.record(z.string(), z.unknown()).optional(),
    paymentMethodLast4: z.string().optional(),
    billingCycleAnchor: TimestampSchema
  }),
  credits: z.object({
    balance: NonNegativeNumber,
    reserved: NonNegativeNumber,
    lifetimeUsed: NonNegativeNumber,
    pricingVersion: z.string()
  }),
  limits: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])),
  preferences: z.object({
    emailNotifications: z.boolean(),
    marketingOptIn: z.boolean(),
    languagesPreferred: z.array(z.string()).optional()
  }),
  experiments: z.record(z.string(), z.string()),
  security: z.object({
    mfaEnabled: z.boolean(),
    lastLoginAt: TimestampSchema.nullable(),
    riskScore: z.number().min(0).max(100)
  }),
  attribution: z
    .object({
      signupUtm: z.record(z.string(), z.string()).optional(),
      referrer: z.string().optional(),
      source: z.string().optional()
    })
    .optional(),
  usage: z.object({
    jobsCreated: z.number().int().min(0),
    assetsGenerated: z.number().int().min(0),
    tokensMonth: z.number().int().min(0),
    lastActiveAt: TimestampSchema.nullable()
  }),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema
});

/**
 * JOB SCHEMA
 * Canonical job lifecycle state, AI suggestions, assets, campaigns, metrics.
 */
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
    currentStep: z.string(),
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
    requirements: z.object({
      mustHave: z.array(z.string()),
      niceToHave: z.array(z.string()).default([])
    }),
    benefits: z.array(z.string()).default([]),
    experienceLevel: ExperienceLevelEnum.optional(),
    licenses: z.array(z.string()).default([]),
    language: z.string(),
    industry: z.string().optional(),
    applyMethod: ApplyMethodEnum,
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
  pendingSuggestions: z.object({
    salaryRanges: z
      .array(
        z.object({
          min: z.number().optional(),
          max: z.number().optional(),
          confidence: z.number().min(0).max(1),
          source: z.string().optional()
        })
      )
      .default([]),
    benefitIdeas: z
      .array(z.object({ text: z.string(), source: z.string().optional() }))
      .default([]),
    titleVariants: z
      .array(
        z.object({
          text: z.string(),
          score: z.number().optional(),
          goal: z.enum(["CTR", "SEO", "ApplyRate"]).optional()
        })
      )
      .default([]),
    descriptionDrafts: z
      .array(
        z.object({
          id: z.string(),
          text: z.string(),
          promptVersion: z.string(),
          model: z.string(),
          score: z.number().optional()
        })
      )
      .default([]),
    channelRecommendations: z
      .array(
        z.object({
          channel: CampaignSchema.shape.channel,
          reason: z.string(),
          expectedCPA: z.number().optional()
        })
      )
      .default([])
  }),
  approvals: z.object({
    fieldsApproved: z.array(z.string()).default([]),
    approvedBy: z.string().nullable().optional(),
    approvedAt: TimestampSchema.nullable().optional()
  }),
  assets: z
    .array(
      z.object({
        assetId: z.string(),
        type: z.enum(["jd", "image", "video", "lp", "post"]),
        status: z.enum(["queued", "ok", "failed"]),
        promptVersion: z.string(),
        model: z.string(),
        createdAt: TimestampSchema,
        updatedAt: TimestampSchema.optional(),
        summary: z.string().optional()
      })
    )
    .default([]),
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
    byChannel: z.record(
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
    ).default({})
  }),
  credits: z.object({
    reserved: NonNegativeNumber,
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
    policy: z.record(z.string(), z.unknown()).default({})
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

/**
 * Minimal job draft helper for wizard sessions.
 */
export const JobStepSchema = z.object({
  id: z.string(),
  required: z.boolean(),
  fields: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      required: z.boolean(),
      value: z.string().optional()
    })
  )
});

export const JobVersionSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  state: z.record(z.string(), z.string()),
  confirmedAt: TimestampSchema,
  confirmedBy: z.string()
});

export class JobRecord {
  constructor(args = {}) {
    this.jobId = args.jobId ?? uuid();
    this.versions = args.versions ?? [];
    this.draftState = args.draftState ?? {};
  }

  get latestVersion() {
    return this.versions.at(-1);
  }

  get currentDraft() {
    return { ...this.draftState };
  }

  upsertDraft(fieldId, value) {
    this.draftState[fieldId] = value;
  }

  confirmDraft(actorId) {
    const versionNumber = (this.latestVersion?.version ?? 0) + 1;
    const record = {
      id: uuid(),
      version: versionNumber,
      state: { ...this.draftState },
      confirmedAt: new Date(),
      confirmedBy: actorId
    };
    this.versions.push(record);
    return record;
  }
}
