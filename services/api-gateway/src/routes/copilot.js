/**
 * @file copilot.js
 * Copilot API Router - handles chat history retrieval
 *
 * ARCHITECTURE:
 * - This router ONLY handles GET /chat for chat history
 * - All LLM operations (POST copilot_agent) go through POST /api/llm
 * - This router does NOT import or call llmClient directly
 */

import { Router } from "express";
import { z } from "zod";
import { wrapAsync, httpError } from "@wizard/utils";
import { JobSchema } from "@wizard/core";
import { loadCopilotHistory } from "../copilot/chat-store.js";
import { serializeMessages } from "../wizard/job-helpers.js";

const JOB_COLLECTION = "jobs";

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

export function copilotRouter({ firestore, logger }) {
  const router = Router();

  // GET /chat - Retrieve chat history
  // Note: POST operations for copilot_agent go through POST /api/llm
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
