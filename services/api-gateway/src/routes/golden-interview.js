/**
 * @file golden-interview.js
 * Golden Interview API Router - handles HTTP endpoints for the Golden Interviewer service.
 *
 * ARCHITECTURE:
 * - PROTECTED: This router is mounted behind requireAuth middleware in server.js.
 *   The router assumes req.user is already set and does NOT verify JWTs directly.
 * - All LLM calls go through HTTP POST /api/llm.
 * - The Golden Interviewer service does NOT import or call llmClient
 *   or recordLlmUsageFromResult directly.
 * - It uses fetch() to call the /api/llm endpoint.
 */

import { Router } from "express";
import { z } from "zod";
import { wrapAsync, httpError, loadEnv } from "@wizard/utils";
import { createGoldenInterviewerService } from "../golden-interviewer/service.js";

// =============================================================================
// REQUEST SCHEMAS
// =============================================================================

const StartSessionSchema = z.object({
  initialData: z.record(z.any()).optional(),
});

// Skip reason enum for explicit skip signals
const SkipReasonEnum = z.enum([
  "unknown", // Default - user just clicked skip
  "dont_know", // "I don't know this information"
  "prefer_not_to_say", // Privacy concern
  "not_applicable", // Doesn't apply to this role
  "come_back_later", // Wants to answer later
]);

const SkipActionSchema = z.object({
  isSkip: z.boolean(),
  reason: SkipReasonEnum.optional().default("unknown"),
});

const ChatRequestSchema = z.object({
  sessionId: z.string().min(1),
  userMessage: z.string().optional(),
  uiResponse: z.any().optional(),
  // Explicit skip signal (machine-readable, locale-agnostic)
  skipAction: SkipActionSchema.optional(),
});

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get authenticated user ID from request
 * @param {Request} req
 * @returns {string}
 */
function getAuthenticatedUserId(req) {
  const userId = req.user?.id;
  if (!userId) {
    throw httpError(401, "Unauthorized");
  }
  return userId;
}

/**
 * Get auth token from request
 * @param {Request} req
 * @returns {string}
 */
function getAuthToken(req) {
  const token = req.user?.token;
  if (!token) {
    throw httpError(401, "Missing auth token");
  }
  return token;
}

/**
 * Verify session belongs to user
 * @param {object} session
 * @param {string} userId
 */
function verifySessionOwnership(session, userId) {
  if (!session) {
    throw httpError(404, "Session not found");
  }
  if (session.userId !== userId) {
    throw httpError(403, "Access denied to this session");
  }
}

// =============================================================================
// ROUTER FACTORY
// =============================================================================

/**
 * Create the Golden Interview router
 * @param {object} options
 * @param {object} options.firestore - Firestore adapter
 * @param {object} options.logger - Logger instance
 * @returns {Router}
 */
export function goldenInterviewRouter({ firestore, logger }) {
  const router = Router();

  // Determine API base URL for internal HTTP calls
  const env = loadEnv();
  const port = Number(env.PORT ?? 4000);
  const apiBaseUrl = `http://127.0.0.1:${port}`;

  // Create service instance - NO llmClient, NO bigQuery
  // All LLM calls go through HTTP POST /api/llm
  const interviewService = createGoldenInterviewerService({
    firestore,
    logger,
    apiBaseUrl,
  });

  // ===========================================================================
  // ROUTES
  // ===========================================================================

  /**
   * POST /golden-interview/start
   *
   * Start a new interview session
   *
   * Request body:
   * {
   *   "initialData": {} // Optional initial schema data
   * }
   *
   * Response:
   * {
   *   "sessionId": "abc123",
   *   "response": {
   *     "message": "Welcome! Let's learn about this role...",
   *     "ui_tool": { "type": "...", "props": {...} },
   *     "completion_percentage": 0,
   *     "interview_phase": "opening"
   *   }
   * }
   */
  router.post(
    "/start",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const authToken = getAuthToken(req);
      const body = StartSessionSchema.parse(req.body || {});

      logger.info({ userId }, "golden-interview.start.request");

      // Extract companyId and companyName from initialData for proper service hydration
      const initialData = body.initialData || {};
      const { companyId, companyName } = initialData;

      const result = await interviewService.startSession({
        userId,
        authToken,
        companyId: companyId || null,
        companyName: companyName || null,
      });

      logger.info(
        { userId, sessionId: result.sessionId },
        "golden-interview.start.success"
      );

      res.json({
        success: true,
        sessionId: result.sessionId,
        response: result.response,
      });
    })
  );

  /**
   * POST /golden-interview/chat
   *
   * Process a conversation turn
   *
   * Request body:
   * {
   *   "sessionId": "abc123",
   *   "userMessage": "Optional text message",
   *   "uiResponse": { ... } // Response from UI component
   * }
   *
   * Response:
   * {
   *   "message": "Great! Now let's talk about...",
   *   "ui_tool": { "type": "...", "props": {...} },
   *   "completion_percentage": 15,
   *   "interview_phase": "compensation",
   *   "extracted_fields": ["financial_reality.base_compensation.amount_or_range"],
   *   "next_priority_fields": ["...", "..."]
   * }
   */
  router.post(
    "/chat",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const authToken = getAuthToken(req);
      const body = ChatRequestSchema.parse(req.body);

      // Verify session ownership
      const sessionStatus = await interviewService.getSessionStatus(
        body.sessionId
      );
      verifySessionOwnership(sessionStatus, userId);

      logger.info(
        {
          userId,
          sessionId: body.sessionId,
          hasMessage: !!body.userMessage,
          hasUiResponse: !!body.uiResponse,
          isSkip: body.skipAction?.isSkip || false,
          skipReason: body.skipAction?.reason,
        },
        "golden-interview.chat.request"
      );

      const result = await interviewService.processTurn({
        sessionId: body.sessionId,
        authToken,
        userMessage: body.userMessage,
        uiResponse: body.uiResponse,
        skipAction: body.skipAction || null,
      });

      logger.info(
        {
          sessionId: body.sessionId,
          completion: result.completion_percentage,
          phase: result.interview_phase,
          extractedCount: result.extracted_fields?.length || 0,
        },
        "golden-interview.chat.success"
      );

      // Add this log:
      console.log(
        "📤 [API] Sending to Client:",
        JSON.stringify(
          {
            tool_reasoning: result.tool_reasoning,
            ui_tool: result.ui_tool,
            message: result.message,
          },
          null,
          2
        )
      );

      res.json({
        success: true,
        ...result,
      });
    })
  );

  /**
   * GET /golden-interview/session/:sessionId
   *
   * Get session status and current state
   *
   * Response:
   * {
   *   "sessionId": "abc123",
   *   "status": "active",
   *   "turnCount": 5,
   *   "completionPercentage": 35,
   *   "currentPhase": "environment",
   *   "createdAt": "...",
   *   "updatedAt": "..."
   * }
   */
  router.get(
    "/session/:sessionId",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const { sessionId } = req.params;

      const sessionStatus = await interviewService.getSessionStatus(sessionId);
      verifySessionOwnership(sessionStatus, userId);

      res.json({
        success: true,
        session: sessionStatus,
      });
    })
  );

  /**
   * GET /golden-interview/session/:sessionId/schema
   *
   * Get the current golden schema for a session
   *
   * Response:
   * {
   *   "sessionId": "abc123",
   *   "goldenSchema": { ... }
   * }
   */
  router.get(
    "/session/:sessionId/schema",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const { sessionId } = req.params;

      const sessionStatus = await interviewService.getSessionStatus(sessionId);
      verifySessionOwnership(sessionStatus, userId);

      const schema = await interviewService.getGoldenSchema(sessionId);

      res.json({
        success: true,
        sessionId,
        goldenSchema: schema || {},
      });
    })
  );

  /**
   * GET /golden-interview/session/:sessionId/history
   *
   * Get conversation history for a session
   *
   * Response:
   * {
   *   "sessionId": "abc123",
   *   "history": [
   *     { "role": "assistant", "content": "...", "timestamp": "...", "uiTool": {...} },
   *     { "role": "user", "content": "...", "timestamp": "...", "hasUiResponse": true }
   *   ]
   * }
   */
  router.get(
    "/session/:sessionId/history",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const { sessionId } = req.params;

      const sessionStatus = await interviewService.getSessionStatus(sessionId);
      verifySessionOwnership(sessionStatus, userId);

      const history = await interviewService.getConversationHistory(sessionId);

      res.json({
        success: true,
        sessionId,
        history,
      });
    })
  );

  /**
   * POST /golden-interview/session/:sessionId/complete
   *
   * Complete the interview and get final schema
   *
   * Response:
   * {
   *   "sessionId": "abc123",
   *   "goldenSchema": { ... },
   *   "completionPercentage": 87,
   *   "turnCount": 15
   * }
   */
  router.post(
    "/session/:sessionId/complete",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const { sessionId } = req.params;

      const sessionStatus = await interviewService.getSessionStatus(sessionId);
      verifySessionOwnership(sessionStatus, userId);

      if (sessionStatus.status !== "active") {
        throw httpError(400, `Session is already ${sessionStatus.status}`);
      }

      const result = await interviewService.completeSession(sessionId);

      logger.info(
        {
          sessionId,
          turnCount: result.turnCount,
          completion: result.completionPercentage,
        },
        "golden-interview.complete.success"
      );

      res.json({
        success: true,
        ...result,
      });
    })
  );

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================

  router.use((err, req, res, next) => {
    // Handle Zod validation errors
    if (err.name === "ZodError") {
      logger.warn({ errors: err.errors }, "golden-interview.validation_error");
      return res.status(400).json({
        success: false,
        error: "Validation error",
        details: err.errors,
      });
    }

    // Pass to global error handler
    next(err);
  });

  return router;
}
