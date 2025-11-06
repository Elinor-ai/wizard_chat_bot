import { z } from "zod";
import { ConfirmedJobDetailsSchema } from "./job.js";
import { TimestampSchema } from "../common/zod.js";

export const JobFinalSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  schema_version: z.literal("1"),
  job: ConfirmedJobDetailsSchema,
  source: z.enum(["original", "refined", "edited"]).default("refined"),
  updatedAt: TimestampSchema
});

