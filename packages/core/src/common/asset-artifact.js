import { z } from "zod";
import { TimestampSchema } from "./zod.js";
import { AssetVersionSchema } from "./asset-version.js";

export const JobAssetSchema = z.object({
  assetId: z.string(),
  type: z.enum(["jd", "image", "video", "lp", "post"]),
  status: z.enum(["queued", "ok", "failed", "review", "approved", "archived"]),
  currentVersion: z.number().int().min(1),
  versions: z.array(AssetVersionSchema).min(1),
  selectedForDistribution: z.boolean().default(false),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema.optional(),
  provenance: z
    .object({
      confirmedVersionId: z.string().optional(),
      suggestionIds: z.array(z.string()).default([]),
      costCredits: z.number().optional()
    })
    .optional()
});
