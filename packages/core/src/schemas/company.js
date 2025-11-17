import { z } from "zod";
import { TimestampSchema } from "../common/zod.js";

export const CompanyTypeEnum = z.enum(["company", "agency", "freelancer"]);
export const CompanyEnrichmentStatusEnum = z.enum(["PENDING", "READY", "FAILED"]);
export const CompanyJobDiscoveryStatusEnum = z.enum(["UNKNOWN", "FOUND_JOBS", "NOT_FOUND"]);

const SocialHandlesSchema = z.object({
  linkedin: z.string().url().optional(),
  facebook: z.string().url().optional(),
  instagram: z.string().url().optional(),
  tiktok: z.string().url().optional(),
  twitter: z.string().url().optional()
});

const EnrichmentErrorSchema = z
  .object({
    reason: z.string().optional(),
    message: z.string().optional(),
    occurredAt: TimestampSchema.nullable().optional()
  })
  .nullable()
  .optional();

export const CompanySchema = z.object({
  id: z.string(),
  primaryDomain: z.string().min(1),
  additionalDomains: z.array(z.string().min(1)).default([]),
  name: z.string().optional(),
  nameConfirmed: z.boolean().default(false),
  profileConfirmed: z.boolean().default(false),
  companyType: CompanyTypeEnum.default("company"),
  industry: z.string().optional(),
  employeeCountBucket: z.string().default("unknown"),
  hqCountry: z.string().optional(),
  hqCity: z.string().optional(),
  locationHint: z.string().optional(),
  website: z.string().optional(),
  careerPageUrl: z.string().nullable().optional(),
  logoUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  fontFamilyPrimary: z.string().optional(),
  toneOfVoice: z.string().optional(),
  tagline: z.string().optional(),
  intelSummary: z.string().optional(),
  socials: SocialHandlesSchema.partial().optional(),
  enrichmentStatus: CompanyEnrichmentStatusEnum.default("PENDING"),
  jobDiscoveryStatus: CompanyJobDiscoveryStatusEnum.default("UNKNOWN"),
  lastEnrichedAt: TimestampSchema.nullable().optional(),
  lastJobDiscoveryAt: TimestampSchema.nullable().optional(),
  enrichmentQueuedAt: TimestampSchema.nullable().optional(),
  enrichmentStartedAt: TimestampSchema.nullable().optional(),
  enrichmentCompletedAt: TimestampSchema.nullable().optional(),
  enrichmentLockedAt: TimestampSchema.nullable().optional(),
  enrichmentAttempts: z.number().int().nonnegative().default(0),
  enrichmentError: EnrichmentErrorSchema,
  jobDiscoveryQueuedAt: TimestampSchema.nullable().optional(),
  jobDiscoveryAttempts: z.number().int().nonnegative().default(0),
  confidenceScore: z.number().min(0).max(1).default(0),
  sourcesUsed: z.array(z.string()).default([]),
  fieldSources: z
    .record(
      z.object({
        value: z.unknown().optional(),
        sources: z.array(z.string()).default([])
      })
    )
    .default({}),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  createdByUserId: z.string().nullable().optional()
});

export const CompanyDiscoveredJobSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  companyDomain: z.string(),
  source: z.string(),
  externalId: z.string().nullable().optional(),
  title: z.string(),
  location: z.string().optional(),
  description: z.string().optional(),
  url: z.string().optional(),
  postedAt: TimestampSchema.nullable().optional(),
  discoveredAt: TimestampSchema,
  isActive: z.boolean().default(true)
});
