/**
 * @file copilot-service.js
 * Service for handling Copilot agent tasks.
 * Extracted from routes/llm.js to support the thin-router architecture.
 */

import { z } from "zod";
import { httpError } from "@wizard/utils";
import { buildJobSnapshot } from "../../wizard/job-intake.js";
import { loadCompanyContext } from "../company-context.js";
import { appendCopilotMessages, loadCopilotHistory } from "../../copilot/chat-store.js";
import {
  DEFAULT_COPILOT_STAGE,
  getToolsForStage,
  listSupportedStages,
  resolveStageConfig
} from "../../copilot/stages.js";
import { WizardCopilotAgent } from "../../copilot/agent.js";
import { COPILOT_TOOLS } from "../../copilot/tools.js";
import {
  loadSuggestionDocument,
  sanitizeCopilotReply,
  serializeMessages,
  buildCopilotMessage
} from "../../wizard/job-helpers.js";
import { loadJobForUser, syncRefinedFields, loadRefinedSnapshot } from "./context-enrichment.js";
import { LLM_CORE_TASK } from "../../config/task-types.js";

const COPILOT_STAGE_ENUM = z.enum(listSupportedStages());

const copilotSchema = z.object({
  jobId: z.string(),
  userMessage: z.string().min(1),
  currentStepId: z.string().optional(),
  clientMessageId: z.string().optional(),
  stage: COPILOT_STAGE_ENUM.default(DEFAULT_COPILOT_STAGE),
  contextId: z.string().optional().nullable(),
});

/**
 * Handle the copilot_agent task - orchestrates Copilot agent conversation.
 * This is called by the router after validation.
 *
 * Note: This service uses an internal usage tracker callback to record LLM usage
 * because the Copilot agent may make multiple LLM calls during tool execution.
 *
 * @param {Object} params
 * @param {Object} params.llmClient - LLM client instance
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.bigQuery - BigQuery instance (for usage tracking)
 * @param {Object} params.logger - Logger instance
 * @param {string} params.userId - User ID
 * @param {Object} params.context - Request context
 * @param {Function} params.usageTracker - Callback for recording LLM usage
 * @returns {Promise<Object>} Result object with messages, actions, and snapshots
 */
export async function handleCopilotAgentTask({
  llmClient,
  firestore,
  bigQuery,
  logger,
  userId,
  context,
  usageTracker
}) {
  const payload = copilotSchema.parse(context ?? {});
  const job = await loadJobForUser({
    firestore,
    jobId: payload.jobId,
    userId,
  });

  const companyContext = await loadCompanyContext({
    firestore,
    companyId: job.companyId ?? null,
    taskType: LLM_CORE_TASK.COPILOT_AGENT,
    logger,
  });

  const [conversation, suggestionDoc] = await Promise.all([
    loadCopilotHistory({ firestore, jobId: payload.jobId, limit: 8 }),
    loadSuggestionDocument(firestore, payload.jobId),
  ]);

  const suggestions = suggestionDoc?.candidates
    ? Object.values(suggestionDoc.candidates)
    : [];

  const stageConfig = resolveStageConfig(payload.stage);
  const stageTools = getToolsForStage(stageConfig);

  const agent = new WizardCopilotAgent({
    llmClient,
    tools: COPILOT_TOOLS,
    logger,
    usageTracker,
  });

  const toolContext = {
    firestore,
    logger,
    cache: {},
  };

  const agentResult = await agent.run({
    jobId: payload.jobId,
    userId,
    userMessage: payload.userMessage,
    currentStepId: payload.currentStepId,
    stage: stageConfig.id,
    stageConfig,
    tools: stageTools,
    conversation,
    jobSnapshot: buildJobSnapshot(job),
    suggestions,
    toolContext,
    companyContext,
  });

  const assistantReply =
    sanitizeCopilotReply(agentResult.reply) ||
    "All set—let me know what you'd like to adjust next.";

  const history = await appendCopilotMessages({
    firestore,
    jobId: payload.jobId,
    messages: [
      buildCopilotMessage({
        role: "user",
        type: "user",
        content: payload.userMessage,
        metadata: payload.clientMessageId
          ? { clientMessageId: payload.clientMessageId }
          : null,
        stage: stageConfig.id,
        contextId: payload.contextId ?? null,
      }),
      buildCopilotMessage({
        role: "assistant",
        type: "assistant",
        content: assistantReply,
        metadata: { actions: agentResult.actions ?? [] },
        stage: stageConfig.id,
        contextId: payload.contextId ?? null,
      }),
    ],
    limit: 20,
    now: new Date(),
  });

  const actions = Array.isArray(agentResult.actions)
    ? agentResult.actions
    : [];

  let updatedJobSnapshot = null;
  let updatedRefinedSnapshot = null;
  let updatedAssets = null;

  if (actions.length > 0) {
    const latestJob = await loadJobForUser({
      firestore,
      jobId: payload.jobId,
      userId,
    });
    updatedJobSnapshot = buildJobSnapshot(latestJob);

    const touchedRefinedFields = actions.some((action) =>
      typeof action?.type === "string"
        ? action.type.startsWith("refined_")
        : false
    );
    if (touchedRefinedFields) {
      updatedRefinedSnapshot = await loadRefinedSnapshot({
        firestore,
        jobId: payload.jobId,
      });
    }

    const assetActions = actions.filter(
      (action) =>
        action?.type === "asset_update" ||
        action?.type === "asset_batch_update"
    );
    if (assetActions.length > 0) {
      const collected = [];
      assetActions.forEach((action) => {
        if (Array.isArray(action.assets)) {
          collected.push(...action.assets);
        } else if (action.asset) {
          collected.push(action.asset);
        }
      });
      updatedAssets = collected.length > 0 ? collected : null;
    }
  }

  if (payload.stage === "refine" && actions.length > 0) {
    const refinedUpdates = [];
    actions.forEach((action) => {
      if (action?.type === "field_update" && action.fieldId) {
        refinedUpdates.push({
          fieldId: action.fieldId,
          value: action.value,
        });
      } else if (
        action?.type === "field_batch_update" &&
        action.fields &&
        typeof action.fields === "object"
      ) {
        Object.entries(action.fields).forEach(([fieldId, value]) => {
          refinedUpdates.push({ fieldId, value });
        });
      }
    });
    if (refinedUpdates.length > 0) {
      await syncRefinedFields({
        firestore,
        job,
        jobId: payload.jobId,
        updates: refinedUpdates,
      });
      updatedRefinedSnapshot = await loadRefinedSnapshot({
        firestore,
        jobId: payload.jobId,
      });
    }
  }

  // Copilot agent handles its own usage tracking via the usageTracker callback
  // so we don't return llmResult for the router to track
  return {
    skipped: false,
    // Note: No llmResult returned - usage tracking is handled by the agent internally
    result: {
      jobId: payload.jobId,
      messages: serializeMessages(history),
      actions,
      updatedJobSnapshot,
      updatedRefinedSnapshot,
      updatedAssets,
    },
  };
}
