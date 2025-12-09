import { z } from "zod";

// =============================================================================
// BASE / SHARED VALUE SCHEMAS
// =============================================================================

export const valueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.record(z.string(), z.unknown()),
  z.array(z.unknown()),
  z.null(),
]);

// Generic failure schema factory for consistent failure handling
export const createFailureSchema = (options = {}) =>
  z
    .object({
      reason: z.string(),
      message: z.string().optional().nullable(),
      rawPreview: z.string().optional().nullable(),
      occurredAt: z.union([z.string(), z.instanceof(Date)]).optional(),
      ...(options.additionalFields ?? {}),
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
      ...Object.fromEntries(
        Object.keys(options.additionalFields ?? {}).map((key) => [
          key,
          data[key] ?? null,
        ])
      ),
    }));

// Standard failure schema used across multiple domains
export const standardFailureSchema = createFailureSchema();
