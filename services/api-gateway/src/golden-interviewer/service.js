/**
 * Golden Interviewer Service
 *
 * Orchestrates the interview process between User, Firestore, and LLM.
 * Handles conversation turns, schema extraction, and UI tool selection.
 */

import { z } from "zod";
import { nanoid } from "nanoid";
import {
  buildSystemPrompt,
  buildFirstTurnPrompt,
  buildContinueTurnPrompt,
  estimateSchemaCompletion,
  identifyMissingFields,
} from "./prompts.js";
import { validateUIToolProps, getUIToolSchema } from "./tools-definition.js";

// =============================================================================
// CONSTANTS
// =============================================================================

const SESSIONS_COLLECTION = "golden_interview_sessions";
const DEFAULT_MODEL = "gemini-3-pro-preview";
const MAX_TOKENS = 2000;

// =============================================================================
// SCHEMAS
// =============================================================================

const SessionSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  status: z.enum(["active", "completed", "abandoned"]),
  turnCount: z.number(),
  goldenSchema: z.record(z.any()).optional(),
  conversationHistory: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      timestamp: z.date(),
      uiTool: z
        .object({
          type: z.string(),
          props: z.record(z.any()),
        })
        .optional(),
      uiResponse: z.record(z.any()).optional(),
    })
  ),
  metadata: z
    .object({
      completionPercentage: z.number().optional(),
      currentPhase: z.string().optional(),
      lastToolUsed: z.string().optional(),
    })
    .optional(),
});

const LLMResponseSchema = z.object({
  message: z.string(),
  extraction: z
    .object({
      updates: z.record(z.any()).optional(),
      confidence: z.record(z.number()).optional(),
    })
    .optional(),
  ui_tool: z
    .object({
      type: z.string(),
      props: z.record(z.any()),
    })
    .optional(),
  next_priority_fields: z.array(z.string()).optional(),
  completion_percentage: z.number().optional(),
  interview_phase: z.string().optional(),
});

// =============================================================================
// GOLDEN INTERVIEWER SERVICE CLASS
// =============================================================================

export class GoldenInterviewerService {
  /**
   * @param {object} options
   * @param {object} options.firestore - Firestore adapter
   * @param {object} options.llmAdapter - LLM adapter (OpenAI-compatible)
   * @param {object} options.logger - Logger instance
   */
  constructor({ firestore, llmAdapter, logger }) {
    this.firestore = firestore;
    this.llmAdapter = llmAdapter;
    this.logger = logger;
  }

  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================

  /**
   * Start a new interview session
   * @param {object} options
   * @param {string} options.userId - User ID
   * @param {object} [options.initialData] - Optional initial schema data
   * @returns {Promise<{sessionId: string, response: object}>}
   */
  async startSession({ userId, initialData = {} }) {
    const sessionId = nanoid(12);
    const now = new Date();

    const session = {
      sessionId,
      userId,
      createdAt: now,
      updatedAt: now,
      status: "active",
      turnCount: 0,
      goldenSchema: initialData,
      conversationHistory: [],
      metadata: {
        completionPercentage: 0,
        currentPhase: "opening",
        lastToolUsed: null,
      },
    };

    // Save session to Firestore
    await this.firestore.saveDocument(SESSIONS_COLLECTION, sessionId, session);

    this.logger.info(
      { sessionId, userId },
      "golden-interviewer.session.created"
    );

    // Generate first turn (greeting + first question)
    const firstTurnResponse = await this.generateFirstTurn(session);

    // Update session with first turn
    session.conversationHistory.push({
      role: "assistant",
      content: firstTurnResponse.message,
      timestamp: new Date(),
      uiTool: firstTurnResponse.ui_tool,
    });
    session.turnCount = 1;
    session.metadata.lastToolUsed = firstTurnResponse.ui_tool?.type;
    session.metadata.currentPhase =
      firstTurnResponse.interview_phase || "opening";
    session.updatedAt = new Date();

    await this.firestore.saveDocument(SESSIONS_COLLECTION, sessionId, session);

    return {
      sessionId,
      response: {
        message: firstTurnResponse.message,
        ui_tool: firstTurnResponse.ui_tool,
        completion_percentage: firstTurnResponse.completion_percentage || 0,
        interview_phase: firstTurnResponse.interview_phase || "opening",
      },
    };
  }

  /**
   * Process a conversation turn
   * @param {object} options
   * @param {string} options.sessionId - Session ID
   * @param {string} [options.userMessage] - User's text message
   * @param {object} [options.uiResponse] - Response from UI component
   * @returns {Promise<object>}
   */
  async processTurn({ sessionId, userMessage, uiResponse }) {
    // Load session
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== "active") {
      throw new Error(`Session is not active: ${session.status}`);
    }

    const previousTool = session.metadata?.lastToolUsed;

    // Add user message to history
    if (userMessage || uiResponse) {
      session.conversationHistory.push({
        role: "user",
        content: userMessage || "",
        timestamp: new Date(),
        uiResponse,
      });
    }

    // Generate next turn
    const turnPrompt = buildContinueTurnPrompt({
      userMessage,
      currentSchema: session.goldenSchema || {},
      uiResponse,
      previousToolType: previousTool,
      turnNumber: session.turnCount + 1,
    });

    const llmResponse = await this.invokeLLM({
      systemPrompt: buildSystemPrompt({ currentSchema: session.goldenSchema }),
      userPrompt: turnPrompt,
      conversationHistory: session.conversationHistory,
    });

    // Parse and validate LLM response
    const parsed = this.parseLLMResponse(llmResponse);

    // Apply schema extractions
    if (parsed.extraction?.updates) {
      session.goldenSchema = this.applySchemaUpdates(
        session.goldenSchema || {},
        parsed.extraction.updates
      );
    }

    // Validate UI tool props
    if (parsed.ui_tool) {
      const validation = validateUIToolProps(
        parsed.ui_tool.type,
        parsed.ui_tool.props
      );
      if (!validation.valid) {
        this.logger.warn(
          {
            sessionId,
            tool: parsed.ui_tool.type,
            errors: validation.errors,
          },
          "golden-interviewer.ui_tool.validation_warning"
        );
      }
    }

    // Add assistant response to history
    session.conversationHistory.push({
      role: "assistant",
      content: parsed.message,
      timestamp: new Date(),
      uiTool: parsed.ui_tool,
    });

    // Update session metadata
    session.turnCount += 1;
    session.updatedAt = new Date();
    session.metadata = {
      ...session.metadata,
      completionPercentage:
        parsed.completion_percentage ||
        estimateSchemaCompletion(session.goldenSchema),
      currentPhase: parsed.interview_phase || session.metadata?.currentPhase,
      lastToolUsed: parsed.ui_tool?.type,
    };

    // Check if interview is complete
    if (
      parsed.completion_percentage >= 95 ||
      parsed.interview_phase === "closing"
    ) {
      session.metadata.completionPercentage = parsed.completion_percentage;
    }

    // Save updated session
    await this.firestore.saveDocument(SESSIONS_COLLECTION, sessionId, session);

    this.logger.info(
      {
        sessionId,
        turnCount: session.turnCount,
        completion: session.metadata.completionPercentage,
        phase: session.metadata.currentPhase,
      },
      "golden-interviewer.turn.processed"
    );

    return {
      message: parsed.message,
      ui_tool: parsed.ui_tool,
      completion_percentage: session.metadata.completionPercentage,
      interview_phase: session.metadata.currentPhase,
      extracted_fields: Object.keys(parsed.extraction?.updates || {}),
      next_priority_fields: parsed.next_priority_fields,
    };
  }

  /**
   * Complete the interview and return final schema
   * @param {string} sessionId
   * @returns {Promise<object>}
   */
  async completeSession(sessionId) {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.status = "completed";
    session.updatedAt = new Date();

    await this.firestore.saveDocument(SESSIONS_COLLECTION, sessionId, session);

    this.logger.info(
      {
        sessionId,
        turnCount: session.turnCount,
        completion: session.metadata?.completionPercentage,
      },
      "golden-interviewer.session.completed"
    );

    return {
      sessionId,
      goldenSchema: session.goldenSchema,
      completionPercentage: session.metadata?.completionPercentage,
      turnCount: session.turnCount,
    };
  }

  /**
   * Load a session from Firestore
   * @param {string} sessionId
   * @returns {Promise<object|null>}
   */
  async loadSession(sessionId) {
    try {
      const doc = await this.firestore.getDocument(
        SESSIONS_COLLECTION,
        sessionId
      );
      if (!doc) return null;

      // Convert Firestore timestamps
      return {
        ...doc,
        createdAt: doc.createdAt?.toDate?.() || new Date(doc.createdAt),
        updatedAt: doc.updatedAt?.toDate?.() || new Date(doc.updatedAt),
        conversationHistory: (doc.conversationHistory || []).map((msg) => ({
          ...msg,
          timestamp: msg.timestamp?.toDate?.() || new Date(msg.timestamp),
        })),
      };
    } catch (error) {
      this.logger.error(
        { sessionId, err: error },
        "golden-interviewer.session.load_error"
      );
      return null;
    }
  }

  /**
   * Get session status and current state
   * @param {string} sessionId
   * @returns {Promise<object|null>}
   */
  async getSessionStatus(sessionId) {
    const session = await this.loadSession(sessionId);
    if (!session) return null;

    return {
      sessionId: session.sessionId,
      status: session.status,
      turnCount: session.turnCount,
      completionPercentage: session.metadata?.completionPercentage || 0,
      currentPhase: session.metadata?.currentPhase,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  // ===========================================================================
  // LLM INTEGRATION
  // ===========================================================================

  /**
   * Generate the first turn of the conversation
   * @param {object} session
   * @returns {Promise<object>}
   */
  async generateFirstTurn(session) {
    const systemPrompt = buildSystemPrompt({
      currentSchema: session.goldenSchema,
    });
    const userPrompt = buildFirstTurnPrompt();

    const response = await this.invokeLLM({
      systemPrompt,
      userPrompt,
      conversationHistory: [],
    });

    return this.parseLLMResponse(response);
  }

  /**
   * Invoke the LLM with the given prompts
   * @param {object} options
   * @param {string} options.systemPrompt
   * @param {string} options.userPrompt
   * @param {array} options.conversationHistory
   * @returns {Promise<object>}
   */
  async invokeLLM({ systemPrompt, userPrompt, conversationHistory }) {
    // Build full user prompt including conversation history context
    let fullUserPrompt = userPrompt;

    // Add relevant conversation history (last 10 turns for context)
    const recentHistory = conversationHistory.slice(-20);
    if (recentHistory.length > 0) {
      const historyText = recentHistory
        .map(
          (msg) =>
            `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`
        )
        .join("\n\n");
      fullUserPrompt = `Previous conversation:\n${historyText}\n\n---\n\nCurrent turn:\n${userPrompt}`;
    }

    try {
      const response = await this.llmAdapter.invoke({
        model: DEFAULT_MODEL,
        system: systemPrompt,
        user: fullUserPrompt,
        mode: "json",
        temperature: 0.7,
        maxTokens: MAX_TOKENS,
        taskType: "golden_interviewer",
      });

      return response;
    } catch (error) {
      this.logger.error(
        { err: error },
        "golden-interviewer.llm.invocation_error"
      );
      throw error;
    }
  }

  /**
   * Parse and validate LLM response
   * @param {object} response
   * @returns {object}
   */
  parseLLMResponse(response) {
    let parsed;

    try {
      // Handle both direct JSON and text response
      if (response.json) {
        parsed = response.json;
      } else if (response.text) {
        // Try to extract JSON from text
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found in response");
        }
      } else {
        throw new Error("Invalid response format");
      }

      // Validate against schema
      const result = LLMResponseSchema.safeParse(parsed);
      if (!result.success) {
        this.logger.warn(
          { errors: result.error.errors },
          "golden-interviewer.llm.response_validation_warning"
        );
        // Return what we have, with defaults
        return {
          message: parsed.message || "Let me ask you another question...",
          extraction: parsed.extraction || {},
          ui_tool: parsed.ui_tool,
          next_priority_fields: parsed.next_priority_fields || [],
          completion_percentage: parsed.completion_percentage || 0,
          interview_phase: parsed.interview_phase || "opening",
        };
      }

      return result.data;
    } catch (error) {
      this.logger.error(
        { err: error, rawResponse: response?.text?.slice(0, 500) },
        "golden-interviewer.llm.parse_error"
      );

      // Return a fallback response
      return {
        message:
          "I had trouble processing that. Let me try asking differently...",
        extraction: {},
        ui_tool: {
          type: "smart_textarea",
          props: {
            title: "Tell me more",
            prompts: [
              "What else would you like to share about this role?",
              "Is there anything specific you'd like to add?",
            ],
          },
        },
        completion_percentage: 0,
        interview_phase: "opening",
      };
    }
  }

  // ===========================================================================
  // SCHEMA MANAGEMENT
  // ===========================================================================

  /**
   * Apply extracted updates to the golden schema
   * @param {object} currentSchema
   * @param {object} updates - Key-value pairs with dot notation keys
   * @returns {object}
   */
  applySchemaUpdates(currentSchema, updates) {
    const schema = JSON.parse(JSON.stringify(currentSchema));

    Object.entries(updates).forEach(([path, value]) => {
      if (value === null || value === undefined) return;

      const keys = path.split(".");
      let current = schema;

      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!(key in current)) {
          current[key] = {};
        }
        current = current[key];
      }

      const finalKey = keys[keys.length - 1];
      current[finalKey] = value;
    });

    return schema;
  }

  /**
   * Get the current golden schema for a session
   * @param {string} sessionId
   * @returns {Promise<object|null>}
   */
  async getGoldenSchema(sessionId) {
    const session = await this.loadSession(sessionId);
    return session?.goldenSchema || null;
  }

  /**
   * Get conversation history for a session
   * @param {string} sessionId
   * @returns {Promise<array>}
   */
  async getConversationHistory(sessionId) {
    const session = await this.loadSession(sessionId);
    if (!session) return [];

    return session.conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      uiTool: msg.uiTool ? { type: msg.uiTool.type } : undefined,
      hasUiResponse: !!msg.uiResponse,
    }));
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a Golden Interviewer service instance
 * @param {object} options
 * @param {object} options.firestore - Firestore adapter
 * @param {object} options.llmAdapter - LLM adapter
 * @param {object} options.logger - Logger instance
 * @returns {GoldenInterviewerService}
 */
export function createGoldenInterviewerService({
  firestore,
  llmAdapter,
  logger,
}) {
  return new GoldenInterviewerService({ firestore, llmAdapter, logger });
}
