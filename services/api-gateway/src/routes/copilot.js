import { Router } from "express";
import { z } from "zod";
import { wrapAsync, httpError } from "@wizard/utils";
import { JobSchema } from "@wizard/core";
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
import { loadCompanyContext } from "../services/company-context.js";
import { serializeMessages } from "../wizard/job-helpers.js";

const JOB_COLLECTION = "jobs";

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

export function copilotRouter({ firestore, bigQuery, llmClient, logger }) {
  const router = Router();
  const agent = new WizardCopilotAgent({
    llmClient,
    tools: COPILOT_TOOLS,
    logger,
    usageTracker: ({ result, usageContext }) =>
      recordLlmUsageFromResult({
        firestore,
        bigQuery,
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

  return router;
}
