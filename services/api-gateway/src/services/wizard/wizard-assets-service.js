/**
 * @file wizard-assets-service.js
 * Service layer for asset reading operations in the wizard.
 */

import { httpError } from "@wizard/utils";
import {
  loadJobAssets,
  loadLatestAssetRun,
  serializeJobAsset,
  serializeAssetRun,
} from "../repositories/asset-repository.js";
import {
  loadHeroImage,
  serializeHeroImage,
} from "../repositories/hero-image-repository.js";
import {
  loadChannelRecommendation,
} from "../repositories/channel-repository.js";

const JOB_COLLECTION = "jobs";

/**
 * Get assets for a job.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.userId - User ID
 * @param {string} params.jobId - Job ID
 * @returns {Promise<Object>} Assets response
 */
export async function getJobAssetsForUser({ firestore, userId, jobId }) {
  const job = await firestore.getDocument(JOB_COLLECTION, jobId);
  if (!job) {
    throw httpError(404, "Job not found");
  }
  if (job.ownerUserId && job.ownerUserId !== userId) {
    throw httpError(403, "You do not have access to this job");
  }

  const [assets, run] = await Promise.all([
    loadJobAssets(firestore, jobId),
    loadLatestAssetRun(firestore, jobId),
  ]);

  return {
    jobId,
    assets: assets.map(serializeJobAsset),
    run: serializeAssetRun(run),
  };
}

/**
 * Get hero image for a job.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.userId - User ID
 * @param {string} params.jobId - Job ID
 * @returns {Promise<Object>} Hero image response
 */
export async function getHeroImageForUser({ firestore, userId, jobId }) {
  const job = await firestore.getDocument(JOB_COLLECTION, jobId);
  if (!job) {
    throw httpError(404, "Job not found");
  }
  if (job.ownerUserId && job.ownerUserId !== userId) {
    throw httpError(403, "You do not have access to this job");
  }

  const document = await loadHeroImage(firestore, jobId);
  return {
    jobId,
    heroImage: serializeHeroImage(document),
  };
}

/**
 * Get channel recommendations for a job.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.userId - User ID
 * @param {string} params.jobId - Job ID
 * @returns {Promise<Object>} Channel recommendations response
 */
export async function getChannelRecommendationsForUser({ firestore, userId, jobId }) {
  const job = await firestore.getDocument(JOB_COLLECTION, jobId);
  if (!job) {
    throw httpError(404, "Job not found");
  }
  if (job.ownerUserId && job.ownerUserId !== userId) {
    throw httpError(403, "You do not have access to this job");
  }

  const document = await loadChannelRecommendation(firestore, jobId);
  return {
    jobId,
    recommendations: document?.recommendations ?? [],
    updatedAt: document?.updatedAt ?? null,
    failure: document?.lastFailure ?? null,
  };
}
