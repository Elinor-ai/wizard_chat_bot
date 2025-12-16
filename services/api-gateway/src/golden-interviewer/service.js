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
import { getUserById } from "../services/repositories/user-repository.js";

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
    // STEP 1.5: Fetch user data for personalization
    // =========================================================================
    let userData = null;

    try {
      const userDoc = await getUserById(this.firestore, userId);

      if (userDoc?.profile) {
        userData = {
          name: userDoc.profile.name || null,
          timezone: userDoc.profile.timezone || null,
        };

        this.logger.info(
          { sessionId, userId, userName: userData.name },
          "golden-interviewer.session.user_hydrated"
        );
      }
    } catch (error) {
      this.logger.error(
        { sessionId, userId, err: error },
        "golden-interviewer.session.user_fetch_error"
      );
    }

    // =========================================================================
    // STEP 2: Create hydrated Golden Record using factory function
    // =========================================================================
    const goldenSchema = createInitialGoldenRecord(sessionId, companyData, userData);

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

    // Track lastAskedField from first turn (for skip attribution)
    const firstPriorityField = firstTurnResponse.next_priority_fields?.[0] || null;
    const firstPriorityCategory = firstPriorityField
      ? this.extractCategoryFromField(firstPriorityField)
      : null;

    session.conversationHistory.push(assistantMessage);
    session.turnCount = 1;
    session.metadata.lastToolUsed = firstTurnResponse.ui_tool?.type;
    session.metadata.currentPhase = firstTurnResponse.interview_phase || "opening";
    session.metadata.lastAskedField = firstPriorityField;
    session.metadata.lastAskedCategory = firstPriorityCategory;
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
        next_priority_fields: firstTurnResponse.next_priority_fields,
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
   * @param {object} [options.skipAction] - Explicit skip signal { isSkip, reason }
   * @returns {Promise<object>}
   */
  async processTurn({ sessionId, authToken, userMessage, uiResponse, skipAction }) {
    // Load session via repository
    const session = await getSession(this.firestore, sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== "active") {
      throw new Error(`Session is not active: ${session.status}`);
    }

    const previousTool = session.metadata?.lastToolUsed;

    // =========================================================================
    // SKIP DETECTION (explicit flag OR legacy "Skip" text fallback)
    // =========================================================================
    const isSkip = skipAction?.isSkip === true ||
      (userMessage && userMessage.toLowerCase().trim() === "skip");
    const skipReason = skipAction?.reason || "unknown";

    // Get the field that was being asked (from previous turn)
    const skippedField = session.metadata?.lastAskedField || null;
    const skippedCategory = session.metadata?.lastAskedCategory || null;

    // =========================================================================
    // FRICTION METRICS UPDATE
    // =========================================================================
    // Ensure friction object exists (for legacy sessions)
    if (!session.metadata.friction) {
      session.metadata.friction = {
        totalSkips: 0,
        consecutiveSkips: 0,
        skippedFields: [],
        recoveryAttempts: 0,
        recoverySuccesses: 0,
        lastRecoveryTurn: null,
        currentStrategy: "standard",
        strategyChangedAt: null,
      };
    }

    const friction = session.metadata.friction;
    const wasInRecoveryMode = friction.currentStrategy !== "standard";

    if (isSkip) {
      // User skipped - update friction metrics
      friction.totalSkips += 1;
      friction.consecutiveSkips += 1;

      // Record which field was skipped
      if (skippedField) {
        friction.skippedFields.push({
          field: skippedField,
          category: skippedCategory,
          reason: skipReason,
          turnNumber: session.turnCount + 1,
          timestamp: new Date(),
        });
      }

      this.logger.info(
        {
          sessionId,
          skippedField,
          skipReason,
          consecutiveSkips: friction.consecutiveSkips,
          totalSkips: friction.totalSkips,
        },
        "golden-interviewer.turn.skip_detected"
      );
    } else {
      // User engaged (not a skip)
      // Check if this is a recovery success
      if (wasInRecoveryMode && (userMessage || uiResponse)) {
        friction.recoverySuccesses += 1;
        this.logger.info(
          {
            sessionId,
            turnsToRecover: session.turnCount - (friction.strategyChangedAt || 0),
            previousStrategy: friction.currentStrategy,
          },
          "golden-interviewer.turn.recovery_success"
        );
      }

      // Reset consecutive skips on engagement
      friction.consecutiveSkips = 0;
    }

    // =========================================================================
    // STRATEGY DETERMINATION
    // =========================================================================
    const previousStrategy = friction.currentStrategy;
    friction.currentStrategy = this.determineFrictionStrategy(friction, skippedField);

    if (friction.currentStrategy !== previousStrategy) {
      friction.strategyChangedAt = session.turnCount + 1;
      if (friction.currentStrategy !== "standard") {
        friction.recoveryAttempts += 1;
        friction.lastRecoveryTurn = session.turnCount + 1;
      }

      this.logger.info(
        {
          sessionId,
          previousStrategy,
          newStrategy: friction.currentStrategy,
          consecutiveSkips: friction.consecutiveSkips,
        },
        "golden-interviewer.turn.strategy_changed"
      );
    }

    // =========================================================================
    // ADD USER MESSAGE TO HISTORY (with skip metadata if applicable)
    // =========================================================================
    if (userMessage || uiResponse || isSkip) {
      const userHistoryEntry = {
        role: "user",
        content: userMessage || "",
        timestamp: new Date(),
        uiResponse,
      };

      // Add skip metadata when applicable
      if (isSkip) {
        userHistoryEntry.skipAction = {
          isSkip: true,
          reason: skipReason,
          skippedField,
          skippedCategory,
        };
      }

      session.conversationHistory.push(userHistoryEntry);
    }

    // =========================================================================
    // GENERATE NEXT TURN VIA LLM (with friction context)
    // =========================================================================
    const llmContext = {
      currentSchema: session.goldenSchema || {},
      conversationHistory: session.conversationHistory,
      userMessage,
      uiResponse,
      previousToolType: previousTool,
      turnNumber: session.turnCount + 1,
      isFirstTurn: false,
      sessionId,
      // Pass friction state to LLM
      frictionState: {
        isSkip,
        skipReason: isSkip ? skipReason : null,
        skippedField: isSkip ? skippedField : null,
        consecutiveSkips: friction.consecutiveSkips,
        totalSkips: friction.totalSkips,
        currentStrategy: friction.currentStrategy,
      },
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
      tool_reasoning: llmResponse.toolReasoning, // Capture the new field
    };
    console.log("🔍 [Backend] parsed :", JSON.stringify(parsed, null, 2));

    // Log tool selection reasoning for debugging
    this.logger.info(
      {
        sessionId,
        tool: parsed.ui_tool?.type,
        reasoning: parsed.tool_reasoning,
        phase: parsed.interview_phase,
      },
      "golden-interviewer.tool_selection.reasoning"
    );
    // Apply schema extractions
    if (parsed.extraction?.updates) {
      session.goldenSchema = this.applySchemaUpdates(
        session.goldenSchema || {},
        parsed.extraction.updates
      );
    }

    // Normalize UI tool props (fix common LLM format errors)
    if (parsed.ui_tool) {
      parsed.ui_tool = this.normalizeUIToolProps(parsed.ui_tool, sessionId);
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

    // =========================================================================
    // TRACK LAST ASKED FIELD (for skip attribution on NEXT turn)
    // IMPORTANT: Only store the first item (index 0) for 1:1 skip attribution
    // =========================================================================
    const nextPriorityField = parsed.next_priority_fields?.[0] || null;
    const nextPriorityCategory = nextPriorityField
      ? this.extractCategoryFromField(nextPriorityField)
      : null;

    session.metadata = {
      ...session.metadata,
      completionPercentage:
        parsed.completion_percentage ||
        estimateSchemaCompletion(session.goldenSchema),
      currentPhase: parsed.interview_phase || session.metadata?.currentPhase,
      lastToolUsed: parsed.ui_tool?.type,
      // Store the primary field being asked (for skip attribution)
      lastAskedField: nextPriorityField,
      lastAskedCategory: nextPriorityCategory,
      // Preserve friction state (already updated above)
      friction: session.metadata.friction,
    };

    // Check if interview is complete
    const isInterviewComplete = parsed.interview_phase === "complete";

    if (
      parsed.completion_percentage >= 95 ||
      parsed.interview_phase === "closing" ||
      isInterviewComplete
    ) {
      session.metadata.completionPercentage = parsed.completion_percentage;
    }

    // Save updated session via repository
    await saveSession({
      firestore: this.firestore,
      sessionId,
      session,
    });

    // Auto-complete session if interview is done
    if (isInterviewComplete) {
      try {
        await repoCompleteSession({
          firestore: this.firestore,
          session,
        });

        this.logger.info(
          {
            sessionId,
            turnCount: session.turnCount,
            completion: session.metadata.completionPercentage,
          },
          "golden-interviewer.session.auto_completed"
        );
      } catch (completeError) {
        this.logger.error(
          { sessionId, err: completeError },
          "golden-interviewer.session.auto_complete_failed"
        );
        // Don't throw - return success with isComplete flag anyway
      }
    }

    this.logger.info(
      {
        sessionId,
        turnCount: session.turnCount,
        completion: session.metadata.completionPercentage,
        phase: session.metadata.currentPhase,
        friction: {
          totalSkips: friction.totalSkips,
          consecutiveSkips: friction.consecutiveSkips,
          strategy: friction.currentStrategy,
          lastAskedField: nextPriorityField,
        },
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
      // Include friction state for frontend awareness (optional use)
      friction_state: {
        consecutive_skips: friction.consecutiveSkips,
        total_skips: friction.totalSkips,
        current_strategy: friction.currentStrategy,
      },
      // Flag for frontend to show completion UI
      is_complete: isInterviewComplete,
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

  // ===========================================================================
  // FRICTION MANAGEMENT
  // ===========================================================================

  /**
   * Sensitive fields that commonly trigger privacy concerns
   * @type {string[]}
   */
  static SENSITIVE_FIELDS = [
    "financial_reality.base_compensation",
    "financial_reality.equity",
    "financial_reality.variable_compensation",
    "financial_reality.bonuses",
    "stability_signals.company_health.revenue_trend",
    "stability_signals.company_health.funding_status",
    "humans_and_culture.turnover_context",
  ];

  /**
   * Determine the friction handling strategy based on current metrics
   * @param {object} friction - Current friction state
   * @param {string|null} skippedField - The field that was just skipped
   * @returns {string} - Strategy: "standard" | "education" | "low_disclosure" | "defer"
   */
  determineFrictionStrategy(friction, skippedField) {
    const { consecutiveSkips, totalSkips } = friction;
    const turnCount = friction.skippedFields?.length || 0;
    const skipRate = turnCount > 0 ? totalSkips / (turnCount + totalSkips) : 0;

    // Check if skipped field is sensitive
    const isSensitiveField = skippedField
      ? GoldenInterviewerService.SENSITIVE_FIELDS.some((sensitive) =>
          skippedField.startsWith(sensitive)
        )
      : false;

    // Level 3: High friction - defer and move on
    if (consecutiveSkips >= 3 || skipRate > 0.4) {
      return "defer";
    }

    // Level 2: Moderate friction on sensitive topic - offer low disclosure options
    if (consecutiveSkips >= 1 && isSensitiveField) {
      return "low_disclosure";
    }

    // Level 2: Moderate friction - educate about value
    if (consecutiveSkips >= 2) {
      return "education";
    }

    // Level 1: Single skip - pivot naturally (still "standard" but LLM should acknowledge)
    // Level 0: No friction
    return "standard";
  }

  /**
   * Extract the top-level category from a dot-notation field path
   * @param {string} fieldPath - e.g., "financial_reality.base_compensation.amount_or_range"
   * @returns {string|null} - e.g., "financial_reality"
   */
  extractCategoryFromField(fieldPath) {
    if (!fieldPath || typeof fieldPath !== "string") {
      return null;
    }
    const parts = fieldPath.split(".");
    return parts[0] || null;
  }

  /**
   * Check if a field is considered sensitive for privacy purposes
   * @param {string} fieldPath - The field path to check
   * @returns {boolean}
   */
  isSensitiveField(fieldPath) {
    if (!fieldPath) return false;
    return GoldenInterviewerService.SENSITIVE_FIELDS.some((sensitive) =>
      fieldPath.startsWith(sensitive)
    );
  }

  // ===========================================================================
  // UI TOOL NORMALIZATION
  // ===========================================================================

  /**
   * Normalize UI tool props to fix common LLM format errors
   * This ensures the frontend receives correctly formatted data even if the LLM
   * outputs slightly malformed structures.
   *
   * @param {object} uiTool - The ui_tool object from LLM response
   * @param {string} sessionId - For logging
   * @returns {object} - Normalized ui_tool object
   */
  normalizeUIToolProps(uiTool, sessionId) {
    if (!uiTool || !uiTool.type || !uiTool.props) {
      return uiTool;
    }

    const { type, props } = uiTool;
    let normalized = { ...uiTool, props: { ...props } };
    let wasNormalized = false;

    switch (type) {
      case "chip_cloud":
        // Fix: items should be objects { id, label }, not strings
        if (Array.isArray(props.groups)) {
          normalized.props.groups = props.groups.map((group) => {
            if (!Array.isArray(group.items)) return group;

            const normalizedItems = group.items.map((item) => {
              if (typeof item === "string") {
                wasNormalized = true;
                return {
                  id: this.slugify(item),
                  label: item,
                };
              }
              // Ensure object has required properties
              if (typeof item === "object" && item !== null) {
                return {
                  id: item.id || this.slugify(item.label || "item"),
                  label: item.label || item.id || "Unknown",
                };
              }
              return item;
            });

            return { ...group, items: normalizedItems };
          });
        }
        break;

      case "icon_grid":
      case "detailed_cards":
      case "gradient_cards":
        // Fix: options should be objects { id, label, icon?, ... }, not strings
        if (Array.isArray(props.options)) {
          normalized.props.options = props.options.map((option) => {
            if (typeof option === "string") {
              wasNormalized = true;
              return {
                id: this.slugify(option),
                label: option,
                icon: "circle", // Default icon
              };
            }
            // Ensure object has required properties
            if (typeof option === "object" && option !== null) {
              return {
                id: option.id || this.slugify(option.label || "option"),
                label: option.label || option.id || "Unknown",
                icon: option.icon || "circle",
                ...option,
              };
            }
            return option;
          });
        }
        break;

      case "bipolar_scale":
        // Fix: items should use leftLabel/rightLabel, not left/right
        if (Array.isArray(props.items)) {
          normalized.props.items = props.items.map((item, index) => {
            if (typeof item !== "object" || item === null) return item;

            const fixed = { ...item };

            // Fix common key naming errors
            if (item.left && !item.leftLabel) {
              fixed.leftLabel = item.left;
              delete fixed.left;
              wasNormalized = true;
            }
            if (item.right && !item.rightLabel) {
              fixed.rightLabel = item.right;
              delete fixed.right;
              wasNormalized = true;
            }
            // Ensure id exists
            if (!fixed.id) {
              fixed.id = `scale-${index}`;
              wasNormalized = true;
            }
            // Ensure value exists
            if (fixed.value === undefined) {
              fixed.value = 0;
            }

            return fixed;
          });
        }
        break;

      default:
        // No normalization needed for other tools
        break;
    }

    if (wasNormalized) {
      this.logger.info(
        {
          sessionId,
          tool: type,
          action: "normalized",
        },
        "golden-interviewer.ui_tool.normalized"
      );
    }

    return normalized;
  }

  /**
   * Convert a string to a URL-friendly slug
   * @param {string} str - Input string
   * @returns {string} - Slugified string
   */
  slugify(str) {
    if (!str || typeof str !== "string") return "item";
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")  // Remove non-word chars
      .replace(/\s+/g, "-")       // Replace spaces with hyphens
      .replace(/-+/g, "-")        // Replace multiple hyphens with single
      .substring(0, 50);          // Limit length
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
