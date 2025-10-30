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
        return jobAssets.map((asset) => ({
          jobId: job.id,
          jobTitle: job.confirmed?.title ?? "Untitled",
          ...asset
        }));
      });

      logger.info({ userId, assetCount: assets.length }, "Fetched assets for user");
      res.json({ assets });
    })
  );

  return router;
}
