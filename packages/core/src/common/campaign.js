import { z } from "zod";
import { NonNegativeNumber, TimestampSchema } from "./zod.js";
import { ChannelIdEnum } from "./channels.js";

export const CampaignSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string(),
  channel: ChannelIdEnum,
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
