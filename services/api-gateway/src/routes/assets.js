import { Router } from "express";
import { wrapAsync, httpError } from "@wizard/utils";
import { JobAssetRecordSchema } from "@wizard/core";

function getAuthenticatedUserId(req) {
  const userId = req.user?.id;
  if (!userId) {
    throw httpError(401, "Unauthorized");
  }
  return userId;
}

const JOB_COLLECTION = "jobs";
const JOB_ASSET_COLLECTION = "jobAssets";

function deriveJobTitle(job) {
  if (!job) return "Untitled role";
  if (typeof job.roleTitle === "string" && job.roleTitle.trim().length > 0) {
    return job.roleTitle.trim();
  }
  if (typeof job.companyName === "string" && job.companyName.trim().length > 0) {
    return `${job.companyName.trim()} role`;
  }
  return "Untitled role";
}

function normalizeAsset(record) {
  const parsed = JobAssetRecordSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
}

export function assetsRouter({ firestore, logger }) {
  const router = Router();

  router.get(
    "/",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);

      const jobs = await firestore.listCollection(JOB_COLLECTION, [
        { field: "ownerUserId", operator: "==", value: userId }
      ]);
      const assets = await firestore.queryDocuments(
        JOB_ASSET_COLLECTION,
        "ownerUserId",
        "==",
        userId
      );

      const jobMap = new Map(jobs.map((job) => [job.id, job]));
      const normalized = assets
        .map(normalizeAsset)
        .filter(Boolean)
        .map((asset) => ({
          id: asset.id,
          jobId: asset.jobId,
          jobTitle: deriveJobTitle(jobMap.get(asset.jobId)),
          channelId: asset.channelId,
          formatId: asset.formatId,
          artifactType: asset.artifactType,
          status: asset.status,
          provider: asset.provider ?? null,
          model: asset.model ?? null,
          updatedAt: asset.updatedAt ?? asset.createdAt ?? null,
          summary:
            asset.content?.summary ??
            asset.content?.body ??
            asset.llmRationale ??
            null
        }));

      logger.info(
        { userId, assetCount: normalized.length },
        "Fetched assets for user"
      );
      res.json({ assets: normalized });
    })
  );

  return router;
}
