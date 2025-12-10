/**
 * Golden Interviewer Service
 *
 * Orchestrates the interview process between User, Firestore (via repository), and LLM.
 * Handles conversation turns, schema extraction, and UI tool selection.
 *
 * ARCHITECTURE:
 * - All LLM calls go through HTTP POST /api/llm.
 * - All Firestore access goes through the golden-interviewer-repository.
 * - The service does NOT import or call llmClient, recordLlmUsageFromResult, or Firestore directly.
 */

import { nanoid } from "nanoid";
import { estimateSchemaCompletion } from "./prompts.js";
import { validateUIToolProps } from "./tools-definition.js";
import { createInitialGoldenRecord } from "@wizard/core";
import {
  getSession,
  saveSession,
  createSession as repoCreateSession,
  getCompanyById,
  buildAssistantMessage,
  extractSessionStatus,
  extractConversationHistory,
  completeSession as repoCompleteSession,
} from "../services/repositories/golden-interviewer-repository.js";

// =============================================================================
// GOLDEN INTERVIEWER SERVICE CLASS
// =============================================================================

export class GoldenInterviewerService {
  /**
   * @param {object} options
   * @param {object} options.firestore - Firestore adapter (passed to repository functions)
   * @param {object} options.logger - Logger instance
   * @param {string} options.apiBaseUrl - Base URL for internal API calls (e.g., "http://127.0.0.1:4000")
   */
  constructor({ firestore, logger, apiBaseUrl }) {
    this.firestore = firestore;
    this.logger = logger;
    this.apiBaseUrl = apiBaseUrl;
  }

  // ===========================================================================
  // INTERNAL: HTTP call to /api/llm
  // ===========================================================================

  /**
   * Call the LLM via HTTP POST /api/llm
   * This is the ONLY way this service invokes LLM models.
   *
   * @param {object} options
   * @param {string} options.authToken - Bearer token for authentication
   * @param {object} options.context - Context to pass to the LLM
   * @returns {Promise<object>} - The LLM result
   */
  async callLlmApi({ authToken, context }) {
    const url = `${this.apiBaseUrl}/api/llm`;

    this.logger.info(
      {
        taskType: "golden_interviewer",
        sessionId: context.sessionId,
        turnNumber: context.turnNumber,
        isFirstTurn: context.isFirstTurn,
      },
      "golden-interviewer.llm_api.request"
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        taskType: "golden_interviewer",
        context,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      this.logger.error(
        {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          sessionId: context.sessionId,
        },
        "golden-interviewer.llm_api.http_error"
      );
      throw new Error(
        `LLM API call failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    this.logger.info(
      {
        sessionId: context.sessionId,
        hasResult: !!data.result,
        hasError: !!data.result?.error,
      },
      "golden-interviewer.llm_api.response"
    );

    return data.result;
  }

  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================

  /**
   * Start a new interview session with optional company hydration
   * @param {object} options
   * @param {string} options.userId - User ID
   * @param {string} options.authToken - Bearer token for LLM API calls
   * @param {string} [options.companyId] - Optional company ID to pre-load context
   * @param {string} [options.companyName] - Optional company name fallback
   * @returns {Promise<{sessionId: string, response: object}>}
   */
  async startSession({
    userId,
    authToken,
    companyId = null,
    companyName = null,
  }) {
    const sessionId = nanoid(12);

    // =========================================================================
    // STEP 1: Fetch company data if companyId is provided (via repository)
    // =========================================================================
    let companyData = null;

    if (companyId) {
      try {
        companyData = await getCompanyById(this.firestore, companyId);

        if (companyData) {
          this.logger.info(
            { sessionId, companyId, companyName: companyData.name },
            "golden-interviewer.session.company_hydrated"
          );
        } else {
          this.logger.warn(
            { sessionId, companyId },
            "golden-interviewer.session.company_not_found"
          );
        }
      } catch (error) {
        this.logger.error(
          { sessionId, companyId, err: error },
          "golden-interviewer.session.company_fetch_error"
        );
      }
    }

    // Fallback: if no company data but we have a name, create minimal context
    if (!companyData && companyName) {
      companyData = { name: companyName };
    }

    // =========================================================================
    // STEP 2: Create hydrated Golden Record using factory function
    // =========================================================================
    const goldenSchema = createInitialGoldenRecord(sessionId, companyData);

    // =========================================================================
    // STEP 3: Create session via repository
    // =========================================================================
    const session = await repoCreateSession({
      firestore: this.firestore,
      sessionId,
      userId,
      companyId,
      goldenSchema,
    });

    this.logger.info(
      { sessionId, userId, companyId, hasCompanyContext: !!companyData },
      "golden-interviewer.session.created"
    );

    // =========================================================================
    // STEP 4: Generate first turn with hydrated context (via HTTP /api/llm)
    // =========================================================================
    const firstTurnResponse = await this.generateFirstTurn(session, authToken);

    // Update session with first turn via repository
    const assistantMessage = buildAssistantMessage({
      content: firstTurnResponse.message,
      uiTool: firstTurnResponse.ui_tool,
    });

    session.conversationHistory.push(assistantMessage);
    session.turnCount = 1;
    session.metadata.lastToolUsed = firstTurnResponse.ui_tool?.type;
    session.metadata.currentPhase = firstTurnResponse.interview_phase || "opening";
    session.updatedAt = new Date();

    await saveSession({
      firestore: this.firestore,
      sessionId,
      session,
    });

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
   * @param {string} options.authToken - Bearer token for LLM API calls
   * @param {string} [options.userMessage] - User's text message
   * @param {object} [options.uiResponse] - Response from UI component
   * @returns {Promise<object>}
   */
  async processTurn({ sessionId, authToken, userMessage, uiResponse }) {
    // Load session via repository
    const session = await getSession(this.firestore, sessionId);
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

    // Generate next turn via HTTP POST /api/llm
    const llmContext = {
      currentSchema: session.goldenSchema || {},
      conversationHistory: session.conversationHistory,
      userMessage,
      uiResponse,
      previousToolType: previousTool,
      turnNumber: session.turnCount + 1,
      isFirstTurn: false,
      sessionId,
    };

    let llmResponse;
    try {
      llmResponse = await this.callLlmApi({ authToken, context: llmContext });
      console.log(
        "🔍 [Backend] RAW LLM Response:",
        JSON.stringify(llmResponse, null, 2)
      );
    } catch (error) {
      this.logger.error(
        { sessionId, err: error },
        "golden-interviewer.turn.llm_api_error"
      );
      // Return a fallback response that keeps the conversation going
      return {
        message:
          "I had trouble processing that. Let me try asking differently...",
        ui_tool: {
          type: "smart_textarea",
          props: {
            title: "Tell me more",
            prompts: ["What else would you like to share about this role?"],
          },
        },
        completion_percentage: session.metadata?.completionPercentage || 0,
        interview_phase: session.metadata?.currentPhase || "opening",
        extracted_fields: [],
        next_priority_fields: [],
      };
    }

    // Handle error from LLM
    if (llmResponse.error) {
      this.logger.error(
        { sessionId, error: llmResponse.error },
        "golden-interviewer.turn.llm_error"
      );
      // Return a fallback response that keeps the conversation going
      return {
        message:
          "I had trouble processing that. Let me try asking differently...",
        ui_tool: {
          type: "smart_textarea",
          props: {
            title: "Tell me more",
            prompts: ["What else would you like to share about this role?"],
          },
        },
        completion_percentage: session.metadata?.completionPercentage || 0,
        interview_phase: session.metadata?.currentPhase || "opening",
        extracted_fields: [],
        next_priority_fields: [],
      };
    }

    // Convert from camelCase (llm-client) to snake_case for internal use
    const parsed = {
      message: llmResponse.message,
      extraction: llmResponse.extraction,
      ui_tool: llmResponse.uiTool,
      next_priority_fields: llmResponse.nextPriorityFields,
      completion_percentage: llmResponse.completionPercentage,
      interview_phase: llmResponse.interviewPhase,
    };
    console.log("🔍 [Backend] parsed :", JSON.stringify(parsed, null, 2));
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
    const assistantMessage = buildAssistantMessage({
      content: parsed.message,
      uiTool: parsed.ui_tool,
    });
    session.conversationHistory.push(assistantMessage);

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

    // Save updated session via repository
    await saveSession({
      firestore: this.firestore,
      sessionId,
      session,
    });

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
    const session = await getSession(this.firestore, sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const result = await repoCompleteSession({
      firestore: this.firestore,
      session,
    });

    this.logger.info(
      {
        sessionId,
        turnCount: result.turnCount,
        completion: result.completionPercentage,
      },
      "golden-interviewer.session.completed"
    );

    return result;
  }

  /**
   * Get session status and current state
   * @param {string} sessionId
   * @returns {Promise<object|null>}
   */
  async getSessionStatus(sessionId) {
    const session = await getSession(this.firestore, sessionId);
    return extractSessionStatus(session);
  }

  // ===========================================================================
  // LLM INTEGRATION (via HTTP POST /api/llm)
  // ===========================================================================

  /**
   * Generate the first turn of the conversation via HTTP POST /api/llm.
   * @param {object} session
   * @param {string} authToken - Bearer token for LLM API calls
   * @returns {Promise<object>}
   */
  async generateFirstTurn(session, authToken) {
    const llmContext = {
      currentSchema: session.goldenSchema || {},
      conversationHistory: [],
      isFirstTurn: true,
      turnNumber: 1,
      sessionId: session.sessionId,
    };

    let llmResponse;
    try {
      llmResponse = await this.callLlmApi({ authToken, context: llmContext });
    } catch (error) {
      this.logger.error(
        { sessionId: session.sessionId, err: error },
        "golden-interviewer.first_turn.llm_api_error"
      );
      // Return fallback response
      return {
        message:
          "Hello! I'm here to learn about your job opportunity. Let's start with something simple.",
        ui_tool: {
          type: "smart_textarea",
          props: {
            title: "Tell me about the role",
            prompts: ["What position are you hiring for?"],
          },
        },
        completion_percentage: 0,
        interview_phase: "opening",
      };
    }

    // Handle error from LLM
    if (llmResponse.error) {
      this.logger.error(
        {
          sessionId: session.sessionId,
          error: llmResponse.error,
        },
        "golden-interviewer.first_turn.llm_error"
      );
      // Return fallback response
      return {
        message:
          "Hello! I'm here to learn about your job opportunity. Let's start with something simple.",
        ui_tool: {
          type: "smart_textarea",
          props: {
            title: "Tell me about the role",
            prompts: ["What position are you hiring for?"],
          },
        },
        completion_percentage: 0,
        interview_phase: "opening",
      };
    }

    // Convert from camelCase (llm-client) to snake_case (API contract)
    return {
      message: llmResponse.message,
      extraction: llmResponse.extraction,
      ui_tool: llmResponse.uiTool,
      next_priority_fields: llmResponse.nextPriorityFields,
      completion_percentage: llmResponse.completionPercentage,
      interview_phase: llmResponse.interviewPhase,
    };
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
    const session = await getSession(this.firestore, sessionId);
    return session?.goldenSchema || null;
  }

  /**
   * Get conversation history for a session
   * @param {string} sessionId
   * @returns {Promise<array>}
   */
  async getConversationHistory(sessionId) {
    const session = await getSession(this.firestore, sessionId);
    return extractConversationHistory(session);
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a Golden Interviewer service instance
 *
 * ARCHITECTURE:
 * - The service uses HTTP POST /api/llm for all LLM calls.
 * - The service uses the golden-interviewer-repository for all Firestore access.
 * - It does NOT import or call llmClient, recordLlmUsageFromResult, or Firestore directly.
 *
 * @param {object} options
 * @param {object} options.firestore - Firestore adapter (passed to repository functions)
 * @param {object} options.logger - Logger instance
 * @param {string} options.apiBaseUrl - Base URL for internal API calls
 * @returns {GoldenInterviewerService}
 */
export function createGoldenInterviewerService({
  firestore,
  logger,
  apiBaseUrl,
}) {
  return new GoldenInterviewerService({ firestore, logger, apiBaseUrl });
}
