import { z } from "zod";

// =============================================================================
// COPILOT CONVERSATION SCHEMAS
// =============================================================================

export const copilotMessageSchema = z
  .object({
    id: z.string(),
    role: z.string(),
    type: z.string().optional().nullable(),
    content: z.string(),
    createdAt: z.union([z.string(), z.instanceof(Date)]),
    metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .transform((data) => ({
    ...data,
    createdAt:
      data.createdAt instanceof Date
        ? data.createdAt
        : new Date(data.createdAt),
  }));

export const copilotActionSchema = z
  .object({
    type: z.string(),
    fieldId: z.string().optional(),
    value: z.unknown().optional(),
  })
  .catchall(z.unknown());

export const copilotConversationResponseSchema = z.object({
  jobId: z.string(),
  messages: z.array(copilotMessageSchema).default([]),
  actions: z.array(copilotActionSchema).optional(),
  updatedJobSnapshot: z
    .record(z.string(), z.unknown())
    .optional()
    .nullable(),
  updatedRefinedSnapshot: z
    .record(z.string(), z.unknown())
    .optional()
    .nullable(),
  updatedAssets: z.array(z.unknown()).optional().nullable(),
});
