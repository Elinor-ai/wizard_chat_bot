import { z } from "zod";
import { TimestampSchema } from "./common.js";

export const JobVersionSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  state: z.record(z.string(), z.string()),
  confirmedAt: TimestampSchema,
  confirmedBy: z.string()
});
