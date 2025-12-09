import { z } from "zod";
import { channelRecommendationSchema, channelRecommendationFailureSchema } from "./channel.js";

// =============================================================================
// JOB IMPORT CONTEXT SCHEMA
// =============================================================================

export const jobImportContextSchema = z
  .object({
    source: z.string().optional(),
    externalSource: z.string().optional(),
    externalUrl: z.string().optional(),
    sourceUrl: z.string().optional(),
    companyJobId: z.string().optional(),
    companyIntelSource: z.string().optional(),
    discoveredAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
    originalPostedAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
    importedAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
    overallConfidence: z.number().optional(),
    fieldConfidence: z.record(z.number()).optional(),
    evidenceSources: z.array(z.string()).optional(),
  })
  .partial()
  .nullable()
  .transform((data) => {
    if (!data) {
      return null;
    }
    const toDate = (value) =>
      value ? (value instanceof Date ? value : new Date(value)) : null;
    return {
      ...data,
      discoveredAt: toDate(data.discoveredAt ?? null),
      originalPostedAt: toDate(data.originalPostedAt ?? null),
      importedAt: toDate(data.importedAt ?? null),
    };
  });

// =============================================================================
// JOB DETAILS SCHEMA
// =============================================================================

export const jobDetailsSchema = z
  .object({
    roleTitle: z.string().optional().nullable(),
    companyName: z.string().optional().nullable(),
    location: z.string().optional().nullable(),
    zipCode: z.string().optional().nullable(),
    industry: z.string().optional().nullable(),
    seniorityLevel: z.string().optional().nullable(),
    employmentType: z.string().optional().nullable(),
    workModel: z.string().optional().nullable(),
    jobDescription: z.string().optional().nullable(),
    coreDuties: z.array(z.string()).optional().nullable(),
    mustHaves: z.array(z.string()).optional().nullable(),
    benefits: z.array(z.string()).optional().nullable(),
    salary: z.string().optional().nullable(),
    salaryPeriod: z.string().optional().nullable(),
    currency: z.string().optional().nullable(),
  })
  .transform((data) => ({
    roleTitle: data.roleTitle ?? "",
    companyName: data.companyName ?? "",
    location: data.location ?? "",
    zipCode: data.zipCode ?? "",
    industry: data.industry ?? "",
    seniorityLevel: data.seniorityLevel ?? "",
    employmentType: data.employmentType ?? "",
    workModel: data.workModel ?? "",
    jobDescription: data.jobDescription ?? "",
    coreDuties: Array.isArray(data.coreDuties) ? data.coreDuties : [],
    mustHaves: Array.isArray(data.mustHaves) ? data.mustHaves : [],
    benefits: Array.isArray(data.benefits) ? data.benefits : [],
    salary: data.salary ?? "",
    salaryPeriod: data.salaryPeriod ?? "",
    currency: data.currency ?? "",
  }));

// =============================================================================
// WIZARD JOB SCHEMAS
// =============================================================================

export const wizardJobResponseSchema = z
  .object({
    jobId: z.string(),
    state: z.record(z.string(), z.unknown()).optional(),
    includeOptional: z.boolean().optional(),
    updatedAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
    status: z.string().nullable().optional(),
    companyId: z.string().nullable().optional(),
    importContext: jobImportContextSchema.optional(),
  })
  .transform((data) => ({
    jobId: data.jobId,
    state: data.state ?? {},
    includeOptional: Boolean(data.includeOptional),
    updatedAt: data.updatedAt
      ? data.updatedAt instanceof Date
        ? data.updatedAt
        : new Date(data.updatedAt)
      : null,
    status: data.status ?? null,
    companyId: data.companyId ?? null,
    importContext: data.importContext ?? null,
  }));

export const wizardJobSummarySchema = z
  .object({
    id: z.string(),
    roleTitle: z.string().nullable().optional(),
    companyName: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    updatedAt: z.union([z.string(), z.instanceof(Date)]).nullable().optional(),
  })
  .transform((data) => ({
    id: data.id,
    roleTitle: data.roleTitle ?? "Untitled role",
    companyName: data.companyName ?? null,
    status: data.status ?? "draft",
    location: data.location ?? "",
    updatedAt: data.updatedAt
      ? data.updatedAt instanceof Date
        ? data.updatedAt
        : new Date(data.updatedAt)
      : null,
  }));

// =============================================================================
// REFINEMENT SCHEMAS
// =============================================================================

export const refinementFailureSchema = z
  .object({
    reason: z.string(),
    message: z.string().optional().nullable(),
    rawPreview: z.string().optional().nullable(),
    occurredAt: z.union([z.string(), z.instanceof(Date)]).optional(),
  })
  .transform((data) => ({
    reason: data.reason,
    message: data.message ?? null,
    rawPreview: data.rawPreview ?? null,
    occurredAt:
      data.occurredAt instanceof Date
        ? data.occurredAt
        : data.occurredAt
          ? new Date(data.occurredAt)
          : null,
  }));

export const refinementResponseSchema = z
  .object({
    jobId: z.string(),
    refinedJob: jobDetailsSchema,
    originalJob: jobDetailsSchema,
    summary: z.string().optional().nullable(),
    provider: z.string().optional().nullable(),
    model: z.string().optional().nullable(),
    updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
    refreshed: z.boolean().optional(),
    failure: refinementFailureSchema.optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .transform((data) => ({
    jobId: data.jobId,
    refinedJob: data.refinedJob,
    originalJob: data.originalJob,
    summary: data.summary ?? "",
    provider: data.provider ?? null,
    model: data.model ?? null,
    updatedAt: data.updatedAt ? new Date(data.updatedAt) : null,
    refreshed: Boolean(data.refreshed),
    failure: data.failure ?? null,
    metadata: data.metadata ?? null,
  }));

// =============================================================================
// FINALIZE SCHEMA
// =============================================================================

export const finalizeResponseSchema = z
  .object({
    jobId: z.string(),
    finalJob: jobDetailsSchema,
    source: z.string().optional().nullable(),
    channelRecommendations: z.array(channelRecommendationSchema).optional(),
    channelUpdatedAt: z.union([z.string(), z.date()]).nullable().optional(),
    channelFailure: channelRecommendationFailureSchema.optional().nullable(),
  })
  .transform((data) => ({
    jobId: data.jobId,
    finalJob: data.finalJob,
    source: data.source ?? null,
    channelRecommendations: data.channelRecommendations ?? [],
    channelUpdatedAt: data.channelUpdatedAt
      ? new Date(data.channelUpdatedAt)
      : null,
    channelFailure: data.channelFailure ?? null,
  }));

// =============================================================================
// PERSIST & MERGE SCHEMAS
// =============================================================================

export const persistResponseSchema = z
  .object({
    jobId: z.string().optional(),
    draftId: z.string().optional(),
    status: z.string(),
    state: z.string().optional(),
    companyId: z.string().nullable().optional(),
    intake: z.record(z.string(), z.unknown()).optional(),
  })
  .transform((data) => {
    const jobId = data.jobId ?? data.draftId;
    if (!jobId) {
      throw new Error("Response missing jobId");
    }
    return {
      jobId,
      status: data.status,
      state: data.state ?? null,
      companyId: data.companyId ?? null,
      intake: data.intake ?? null,
    };
  });

export const mergeResponseSchema = z.object({
  status: z.string(),
});

// =============================================================================
// HERO IMAGE SCHEMA
// =============================================================================

export const heroImageSchema = z
  .object({
    jobId: z.string(),
    status: z.string(),
    prompt: z.string().nullable().optional(),
    promptProvider: z.string().nullable().optional(),
    promptModel: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    imageBase64: z.string().nullable().optional(),
    imageMimeType: z.string().nullable().optional(),
    imageProvider: z.string().nullable().optional(),
    imageModel: z.string().nullable().optional(),
    failure: z
      .object({
        reason: z.string(),
        message: z.string().nullable().optional(),
        rawPreview: z.string().nullable().optional(),
        occurredAt: z
          .union([z.string(), z.instanceof(Date)])
          .nullable()
          .optional(),
      })
      .nullable()
      .optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    updatedAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
    caption: z.string().nullable().optional(),
    captionHashtags: z.array(z.string()).nullable().optional(),
  })
  .transform((data) => ({
    ...data,
    updatedAt: data.updatedAt
      ? data.updatedAt instanceof Date
        ? data.updatedAt
        : new Date(data.updatedAt)
      : null,
    failure: data.failure
      ? {
          ...data.failure,
          occurredAt: data.failure.occurredAt
            ? data.failure.occurredAt instanceof Date
              ? data.failure.occurredAt
              : new Date(data.failure.occurredAt)
            : null,
        }
      : null,
    caption: data.caption ?? null,
    captionHashtags: data.captionHashtags ?? null,
  }));
