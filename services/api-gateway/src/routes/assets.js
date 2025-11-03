import { Router } from "express";
import { wrapAsync, httpError } from "@wizard/utils";

export function assetsRouter({ firestore, logger }) {
  const router = Router();

  router.get(
    "/",
    wrapAsync(async (req, res) => {
      const userId = req.headers["x-user-id"];
      if (!userId || typeof userId !== "string") {
        throw httpError(401, "Missing x-user-id header");
      }

      const jobs = await firestore.listCollection("jobs", [
        { field: "ownerUserId", operator: "==", value: userId }
      ]);

      const assets = jobs.flatMap((job) => {
        const jobAssets = job.assets ?? [];
        const jobTitle =
          typeof job.roleTitle === "string" && job.roleTitle.trim().length > 0
            ? job.roleTitle.trim()
            : typeof job.companyName === "string" && job.companyName.trim().length > 0
            ? `${job.companyName.trim()} role`
            : "Untitled role";
        return jobAssets.map((asset) => ({
          jobId: job.id,
          jobTitle,
          ...asset,
          latestVersion: asset.versions?.[asset.versions.length - 1] ?? null
        }));
      });

      logger.info({ userId, assetCount: assets.length }, "Fetched assets for user");
      res.json({ assets });
    })
  );

  return router;
}
