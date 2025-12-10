/**
 * @file assets.js
 * Assets API Router - thin controller for unified asset views.
 *
 * ARCHITECTURE:
 * - This router does NOT access Firestore directly.
 * - All Firestore access goes through services/repositories/*.
 * - No LLM calls are made from this router.
 * - Business logic (mapping, merging) lives in services/assets-query-service.js.
 */

import { Router } from "express";
import { wrapAsync, httpError } from "@wizard/utils";
import { loadUnifiedAssetsForUser } from "../services/assets-query-service.js";

/**
 * Extract authenticated user ID from request
 * @param {Object} req - Express request
 * @returns {string} User ID
 * @throws {HttpError} If not authenticated
 */
function getAuthenticatedUserId(req) {
  const userId = req.user?.id;
  if (!userId) {
    throw httpError(401, "Unauthorized");
  }
  return userId;
}

export function assetsRouter({ firestore, logger }) {
  const router = Router();

  router.get(
    "/",
    wrapAsync(async (req, res) => {
      // 1. Extract authenticated user
      const userId = getAuthenticatedUserId(req);

      // 2. Parse optional jobId filter from query
      const jobIdRaw = Array.isArray(req.query.jobId)
        ? req.query.jobId[0]
        : req.query.jobId;
      const jobIdFilter = typeof jobIdRaw === "string" ? jobIdRaw.trim() : null;

      // 3. Call service to load unified assets
      const assets = await loadUnifiedAssetsForUser({
        firestore,
        userId,
        jobId: jobIdFilter || null
      });

      // 4. Log and respond
      logger.info(
        { userId, assetCount: assets.length, jobId: jobIdFilter ?? null },
        "Fetched assets for user"
      );
      res.json({ assets });
    })
  );

  return router;
}
