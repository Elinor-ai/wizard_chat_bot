/**
 * @file wizard.js
 * Thin HTTP router for wizard endpoints.
 *
 * ARCHITECTURE:
 * - PROTECTED: This router is mounted behind requireAuth middleware in server.js.
 *   The router assumes req.user is already set and does NOT verify JWTs directly.
 * - All business logic is delegated to services/wizard/*.
 */

import { Router } from "express";
import { z } from "zod";
import { wrapAsync, httpError } from "@wizard/utils";
import { ConfirmedJobDetailsSchema } from "@wizard/core";

// Import wizard services
import {
  createOrUpdateDraft,
  getJobForUser,
  listJobsForUser,
  finalizeJob,
  mergeSuggestionIntoJob,
  importCompanyJob,
  getJobAssetsForUser,
  getHeroImageForUser,
  getChannelRecommendationsForUser,
} from "../services/wizard/index.js";

// Re-export channel functions for backwards compatibility
export {
  loadChannelRecommendation as loadChannelRecommendationDocument,
  saveChannelRecommendation as overwriteChannelRecommendationDocument,
  saveChannelRecommendationFailure as persistChannelRecommendationFailure,
} from "../services/repositories/channel-repository.js";

// =============================================================================
// REQUEST SCHEMAS
// =============================================================================

const looseObjectSchema = z.object({}).catchall(z.unknown());

const draftRequestSchema = z.object({
  jobId: z.string().optional(),
  state: looseObjectSchema.default({}),
  intent: looseObjectSchema.optional(),
  currentStepId: z.string(),
  companyId: z.string().nullable().optional(),
});

const mergeRequestSchema = z.object({
  jobId: z.string(),
  fieldId: z.string(),
  value: z.unknown(),
});

const finalizeRequestSchema = z.object({
  jobId: z.string(),
  finalJob: ConfirmedJobDetailsSchema,
  source: z.enum(["original", "refined", "edited"]).optional(),
});

const assetStatusRequestSchema = z.object({
  jobId: z.string(),
});

const importCompanyJobRequestSchema = z.object({
  companyJobId: z.string().min(1, "companyJobId is required"),
  companyId: z.string().optional(),
});

// =============================================================================
// HELPERS
// =============================================================================

function getAuthenticatedUserId(req) {
  const userId = req.user?.id;
  if (!userId) {
    throw httpError(401, "Unauthorized");
  }
  return userId;
}

// =============================================================================
// ROUTER
// =============================================================================

export function wizardRouter({ firestore, logger }) {
  const router = Router();

  // -------------------------------------------------------------------------
  // POST /wizard/import-company-job
  // -------------------------------------------------------------------------
  router.post(
    "/import-company-job",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = importCompanyJobRequestSchema.parse(req.body ?? {});
      const userProfile = req.user?.profile ?? {};

      const result = await importCompanyJob({
        firestore,
        logger,
        userId,
        payload,
        user: req.user,
        userProfile,
      });

      res.status(201).json(result);
    })
  );

  // -------------------------------------------------------------------------
  // POST /wizard/draft
  // -------------------------------------------------------------------------
  router.post(
    "/draft",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = draftRequestSchema.parse(req.body ?? {});
      const userProfile = req.user?.profile ?? {};

      const result = await createOrUpdateDraft({
        firestore,
        logger,
        userId,
        payload,
        userProfile,
      });

      res.json(result);
    })
  );

  // -------------------------------------------------------------------------
  // POST /wizard/suggestions/merge
  // -------------------------------------------------------------------------
  router.post(
    "/suggestions/merge",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = mergeRequestSchema.parse(req.body ?? {});

      const result = await mergeSuggestionIntoJob({
        firestore,
        logger,
        userId,
        payload,
      });

      res.json(result);
    })
  );

  // -------------------------------------------------------------------------
  // POST /wizard/refine/finalize
  // -------------------------------------------------------------------------
  router.post(
    "/refine/finalize",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = finalizeRequestSchema.parse(req.body ?? {});

      const result = await finalizeJob({
        firestore,
        logger,
        userId,
        payload,
      });

      res.json(result);
    })
  );

  // -------------------------------------------------------------------------
  // GET /wizard/assets
  // -------------------------------------------------------------------------
  router.get(
    "/assets",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const jobIdRaw = Array.isArray(req.query.jobId)
        ? req.query.jobId[0]
        : req.query.jobId;
      if (!jobIdRaw || typeof jobIdRaw !== "string") {
        throw httpError(400, "jobId query parameter required");
      }
      const payload = assetStatusRequestSchema.parse({ jobId: jobIdRaw });

      const result = await getJobAssetsForUser({
        firestore,
        userId,
        jobId: payload.jobId,
      });

      res.json(result);
    })
  );

  // -------------------------------------------------------------------------
  // GET /wizard/hero-image
  // -------------------------------------------------------------------------
  router.get(
    "/hero-image",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const jobIdRaw = Array.isArray(req.query.jobId)
        ? req.query.jobId[0]
        : req.query.jobId;
      if (!jobIdRaw || typeof jobIdRaw !== "string") {
        throw httpError(400, "jobId query parameter required");
      }

      const result = await getHeroImageForUser({
        firestore,
        userId,
        jobId: jobIdRaw,
      });

      res.json(result);
    })
  );

  // -------------------------------------------------------------------------
  // GET /wizard/channels
  // -------------------------------------------------------------------------
  router.get(
    "/channels",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const jobIdRaw = Array.isArray(req.query.jobId)
        ? req.query.jobId[0]
        : req.query.jobId;
      if (!jobIdRaw || typeof jobIdRaw !== "string") {
        throw httpError(400, "jobId query parameter required");
      }

      const result = await getChannelRecommendationsForUser({
        firestore,
        userId,
        jobId: jobIdRaw,
      });

      res.json(result);
    })
  );

  // -------------------------------------------------------------------------
  // GET /wizard/jobs
  // -------------------------------------------------------------------------
  router.get(
    "/jobs",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);

      const result = await listJobsForUser({
        firestore,
        userId,
      });

      res.json(result);
    })
  );

  // -------------------------------------------------------------------------
  // GET /wizard/:jobId
  // -------------------------------------------------------------------------
  router.get(
    "/:jobId",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const { jobId } = req.params;

      const result = await getJobForUser({
        firestore,
        userId,
        jobId,
      });

      res.json(result);
    })
  );

  return router;
}
