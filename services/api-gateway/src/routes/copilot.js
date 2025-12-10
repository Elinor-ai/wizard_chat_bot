/**
 * @file copilot.js
 * Copilot API Router - handles chat history retrieval
 *
 * ARCHITECTURE:
 * - This router does NOT access Firestore directly.
 * - All Firestore access goes through services/repositories/*.
 * - This router ONLY handles GET /chat for chat history
 * - All LLM operations (POST copilot_agent) go through POST /api/llm
 * - This router does NOT import or call llmClient directly
 */

import { Router } from "express";
import { z } from "zod";
import { wrapAsync, httpError } from "@wizard/utils";
import { loadJobForUser } from "../services/repositories/index.js";
import { loadCopilotHistory, serializeMessages } from "../services/repositories/index.js";

const getRequestSchema = z.object({
  jobId: z.string()
});

/**
 * Preview content string with truncation
 * @param {string} content - Content to preview
 * @param {number} limit - Maximum length
 * @returns {string} Truncated content
 */
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

/**
 * Summarize messages for logging
 * @param {Array} messages - Messages to summarize
 * @returns {Array} Summarized messages
 */
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

export function copilotRouter({ firestore, logger }) {
  const router = Router();

  // GET /chat - Retrieve chat history
  // Note: POST operations for copilot_agent go through POST /api/llm
  router.get(
    "/chat",
    wrapAsync(async (req, res) => {
      // 1. Extract authenticated user
      const userId = getAuthenticatedUserId(req);

      // 2. Validate query params
      const query = getRequestSchema.parse(req.query ?? {});

      // 3. Verify job access via repository
      await loadJobForUser({ firestore, jobId: query.jobId, userId });

      // 4. Load chat history via repository
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

      // 5. Serialize and respond
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
