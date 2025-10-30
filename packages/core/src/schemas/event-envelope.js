import { z } from "zod";
import { TimestampSchema } from "./common.js";

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
