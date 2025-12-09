/**
 * @file channel-service.js
 * Service for handling LLM channel recommendation tasks.
 * Extracted from routes/llm.js to support the thin-router architecture.
 */

import { httpError } from "@wizard/utils";
import { CampaignSchema } from "@wizard/core";
import { buildJobSnapshot } from "../../wizard/job-intake.js";
import { loadCompanyContext } from "../company-context.js";
import {
  saveChannelRecommendation,
  saveChannelRecommendationFailure
} from "../repositories/channel-repository.js";

const SUPPORTED_CHANNELS = CampaignSchema.shape.channel.options;

/**
 * Handle the channels task - generates channel recommendations for a job.
 * This is called by the router after validation.
 *
 * @param {Object} params
 * @param {Object} params.llmClient - LLM client instance
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {string} params.userId - User ID
 * @param {Object} params.context - Request context
 * @returns {Promise<Object>} Result object with recommendations and LLM result for usage tracking
 */
export async function handleChannelsTask({
  llmClient,
  firestore,
  logger,
  userId,
  context
}) {
  const jobId = context.jobId ?? context.job?.id ?? null;
  if (!jobId) {
    throw httpError(400, "jobId is required");
  }

  const job = await firestore.getDocument("jobs", jobId);
  if (!job) {
    throw httpError(404, "Job not found");
  }
  if (job.ownerUserId && job.ownerUserId !== userId) {
    throw httpError(403, "You do not have access to this job");
  }
  if (!job.stateMachine?.requiredComplete) {
    throw httpError(
      409,
      "Complete all required questions before generating channels."
    );
  }

  const companyContext = await loadCompanyContext({
    firestore,
    companyId: job.companyId ?? null,
    taskType: "channel_recommendations",
    logger,
  });

  const result = await llmClient.askChannelRecommendations({
    jobSnapshot: buildJobSnapshot(job),
    confirmed: job.confirmed ?? {},
    supportedChannels: SUPPORTED_CHANNELS,
    existingChannels: Array.isArray(job.campaigns)
      ? job.campaigns
          .map((campaign) => campaign?.channel)
          .filter((channel) => typeof channel === "string")
      : [],
    companyContext,
  });

  const now = new Date();
  let channelDoc = null;

  if (result?.recommendations?.length > 0) {
    channelDoc = await saveChannelRecommendation({
      firestore,
      logger,
      jobId,
      companyId: job.companyId ?? null,
      recommendations: result.recommendations,
      provider: result.provider,
      model: result.model,
      metadata: result.metadata,
      now,
    });
  } else if (result?.error) {
    channelDoc = await saveChannelRecommendationFailure({
      firestore,
      logger,
      jobId,
      companyId: job.companyId ?? null,
      reason: result.error.reason ?? "unknown_error",
      message: result.error.message ?? null,
      rawPreview: result.error.rawPreview ?? null,
      now,
    });
  } else {
    channelDoc = await saveChannelRecommendationFailure({
      firestore,
      logger,
      jobId,
      companyId: job.companyId ?? null,
      reason: "no_recommendations",
      message: "LLM returned no channel recommendations",
      rawPreview: null,
      now,
    });
  }

  return {
    skipped: false,
    llmResult: result,
    result: {
      jobId,
      recommendations: channelDoc?.recommendations ?? [],
      updatedAt: channelDoc?.updatedAt ?? null,
      refreshed: true,
      failure: channelDoc?.lastFailure ?? null,
    },
  };
}
