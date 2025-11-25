import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { wrapAsync, httpError } from "@wizard/utils";
import { JobSchema, JobSuggestionSchema } from "@wizard/core";
import { WizardCopilotAgent } from "../copilot/agent.js";
import { recordLlmUsageFromResult } from "../services/llm-usage-ledger.js";
import { COPILOT_TOOLS } from "../copilot/tools.js";
import {
  DEFAULT_COPILOT_STAGE,
  getToolsForStage,
  listSupportedStages,
  resolveStageConfig
} from "../copilot/stages.js";
import { loadCopilotHistory, appendCopilotMessages } from "../copilot/chat-store.js";
import { buildJobSnapshot } from "../wizard/job-intake.js";
import { loadCompanyContext } from "../services/company-context.js";

const JOB_COLLECTION = "jobs";
const SUGGESTION_COLLECTION = "jobSuggestions";

const stageEnum = z.enum(listSupportedStages());

const postRequestSchema = z.object({
  jobId: z.string(),
  userMessage: z.string().min(1),
  currentStepId: z.string().optional(),
  clientMessageId: z.string().optional(),
  stage: stageEnum.default(DEFAULT_COPILOT_STAGE),
  contextId: z.string().optional().nullable()
});

const getRequestSchema = z.object({
  jobId: z.string()
});

function previewContent(content, limit = 120) {
  if (typeof content !== "string") {
    return "";
  }
  const trimmed = content.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit - 3)}...`;
}

function summarizeMessages(messages = []) {
  return messages.map((message) => ({
    id: message?.id,
    role: message?.role,
    createdAt:
      message?.createdAt instanceof Date
        ? message.createdAt.toISOString()
        : message?.createdAt ?? null,
    preview: previewContent(message?.content ?? ""),
  }));
}

function getAuthenticatedUserId(req) {
  const userId = req.user?.id;
  if (!userId) {
    throw httpError(401, "Unauthorized");
  }
  return userId;
}

async function loadJobForUser({ firestore, jobId, userId }) {
  const doc = await firestore.getDocument(JOB_COLLECTION, jobId);
  if (!doc) {
    throw httpError(404, "Job not found");
  }
  if (doc.ownerUserId && doc.ownerUserId !== userId) {
    throw httpError(403, "You do not have access to this job");
  }
  const parsed = JobSchema.safeParse(doc);
  if (!parsed.success) {
    throw httpError(500, "Job document is invalid");
  }
  return parsed.data;
}

async function loadSuggestionSnapshot({ firestore, jobId }) {
  const doc = await firestore.getDocument(SUGGESTION_COLLECTION, jobId);
  if (!doc) return [];
  const parsed = JobSuggestionSchema.safeParse(doc);
  if (!parsed.success || !parsed.data.candidates) {
    return [];
  }
  return Object.values(parsed.data.candidates);
}

function serializeMessages(messages = []) {
  return messages.map((message) => ({
    ...message,
    createdAt:
      message.createdAt instanceof Date
        ? message.createdAt.toISOString()
        : message.createdAt
  }));
}

function buildMessage({ role, type, content, metadata }) {
  return {
    id: randomUUID(),
    role,
    type,
    content,
    metadata: metadata ?? null,
    createdAt: new Date()
  };
}

function sanitizeCopilotReply(input) {
  if (!input) return "";
  return input
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/#+\s*/g, "")
    .trim();
}

export function copilotRouter({ firestore, llmClient, logger }) {
  const router = Router();
  const agent = new WizardCopilotAgent({
    llmClient,
    tools: COPILOT_TOOLS,
    logger,
    usageTracker: ({ result, usageContext }) =>
      recordLlmUsageFromResult({
        firestore,
        logger,
        usageContext,
        result
      })
  });

  router.get(
    "/chat",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const query = getRequestSchema.parse(req.query ?? {});
      await loadJobForUser({ firestore, jobId: query.jobId, userId });
      const history = await loadCopilotHistory({
        firestore,
        jobId: query.jobId,
        limit: 20
      });
      logger.info(
        {
          jobId: query.jobId,
          messageCount: history.length,
          messages: summarizeMessages(history)
        },
        "copilot.history.loaded"
      );
      const payload = {
        jobId: query.jobId,
        messages: serializeMessages(history)
      };
      res.json(payload);
      logger.info(
        {
          jobId: query.jobId,
          messageCount: payload.messages.length
        },
        "copilot.history.responded"
      );
    })
  );

  router.post(
    "/chat",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = postRequestSchema.parse(req.body ?? {});
      const job = await loadJobForUser({
        firestore,
        jobId: payload.jobId,
        userId
      });
      const companyContext = await loadCompanyContext({
        firestore,
        companyId: job.companyId ?? null,
        taskType: "copilot_agent",
        logger
      });

      const [conversation, suggestions] = await Promise.all([
        loadCopilotHistory({ firestore, jobId: payload.jobId, limit: 8 }),
        loadSuggestionSnapshot({ firestore, jobId: payload.jobId })
      ]);
      logger.info(
        {
          jobId: payload.jobId,
          userId,
          stage: payload.stage,
          existingMessages: summarizeMessages(conversation),
          incomingUserPreview: previewContent(payload.userMessage, 200)
        },
        "copilot.chat.request"
      );

      const toolContext = {
        firestore,
        logger,
        cache: {}
      };

      const stageConfig = resolveStageConfig(payload.stage);
      const stageTools = getToolsForStage(stageConfig);

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
        companyContext
      });

      const assistantReply =
        sanitizeCopilotReply(agentResult.reply) ||
        "All set—let me know what you’d like to adjust next.";
      const history = await appendCopilotMessages({
        firestore,
        jobId: payload.jobId,
        messages: [
          buildMessage({
            role: "user",
            type: "user",
            content: payload.userMessage,
            metadata: payload.clientMessageId
              ? { clientMessageId: payload.clientMessageId }
              : null,
            stage: stageConfig.id,
            contextId: payload.contextId ?? null
          }),
          buildMessage({
            role: "assistant",
            type: "assistant",
            content: assistantReply,
            metadata: {
              actions: agentResult.actions ?? []
            },
            stage: stageConfig.id,
            contextId: payload.contextId ?? null
          })
        ],
        limit: 20,
        now: new Date()
      });
      logger.info(
        {
          jobId: payload.jobId,
          userId,
          appendedMessages: summarizeMessages(history),
          clientMessageId: payload.clientMessageId ?? null,
          stage: payload.stage
        },
        "copilot.chat.appended"
      );

      let updatedJobSnapshot = null;
      if (Array.isArray(agentResult.actions) && agentResult.actions.length > 0) {
        const latestJob = await loadJobForUser({
          firestore,
          jobId: payload.jobId,
          userId
        });
        updatedJobSnapshot = buildJobSnapshot(latestJob);
        logger.debug(
          {
            jobId: payload.jobId,
            updatedKeys: Object.keys(updatedJobSnapshot ?? {})
          },
          "copilot.chat.updated_snapshot_built"
        );
      }

      const responsePayload = {
        jobId: payload.jobId,
        messages: serializeMessages(history),
        actions: agentResult.actions ?? [],
        updatedJobSnapshot
      };
      res.json(responsePayload);
      logger.info(
        {
          jobId: payload.jobId,
          userId,
          messageCount: responsePayload.messages.length,
          clientMessageId: payload.clientMessageId ?? null,
          stage: payload.stage,
          hasUpdatedSnapshot: Boolean(updatedJobSnapshot)
        },
        "copilot.chat.responded"
      );
    })
  );

  return router;
}
