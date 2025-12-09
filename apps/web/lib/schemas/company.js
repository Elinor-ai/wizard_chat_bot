import { z } from "zod";
import { CompanySchema } from "@wizard/core";
import { jobImportContextSchema } from "./job.js";

// =============================================================================
// COMPANY SCHEMAS
// =============================================================================

export const companyOverviewResponseSchema = z.object({
  company: CompanySchema,
  hasDiscoveredJobs: z.boolean().optional().default(false),
});

export const discoveredJobListItemSchema = z
  .object({
    id: z.string(),
    roleTitle: z.string().optional(),
    location: z.string().optional(),
    status: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    externalUrl: z.string().nullable().optional(),
    importContext: jobImportContextSchema.optional(),
    createdAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
    updatedAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
  })
  .transform((data) => ({
    id: data.id,
    roleTitle: data.roleTitle ?? "",
    location: data.location ?? "",
    status: data.status ?? null,
    source: data.source ?? null,
    externalUrl: data.externalUrl ?? null,
    importContext: data.importContext ?? null,
    createdAt: data.createdAt
      ? data.createdAt instanceof Date
        ? data.createdAt
        : new Date(data.createdAt)
      : null,
    updatedAt: data.updatedAt
      ? data.updatedAt instanceof Date
        ? data.updatedAt
        : new Date(data.updatedAt)
      : null,
  }));

export const companyJobsResponseSchema = z.object({
  companyId: z.string().nullable(),
  jobs: z.array(discoveredJobListItemSchema).default([]),
});

export const companyListResponseSchema = z.object({
  companies: z.array(CompanySchema).default([]),
});

export const companyUpdateResponseSchema = z.object({
  company: CompanySchema,
});

export const companyCreateResponseSchema = z.object({
  company: CompanySchema,
});

export const setMainCompanyResponseSchema = z.object({
  success: z.boolean().optional(),
  mainCompanyId: z.string(),
});
