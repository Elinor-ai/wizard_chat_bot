import { z } from "zod";
import { TimestampSchema } from "./common.js";

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
