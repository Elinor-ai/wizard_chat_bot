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
import { estimateSchemaCompletion, detectRoleArchetypeFromSchema } from "./prompts.js";
import { validateUIToolProps } from "./tools-definition.js";
import { createInitialGoldenRecord } from "@wizard/core";
import { enhanceUITool, expandTemplateRef } from "./ui-templates.js";
import {
  getSession,
  saveSession,
  createSession as repoCreateSession,
  getCompanyById,
  buildAssistantMessage,
  buildSnapshot,
  extractSessionStatus,
  extractConversationHistory,
  extractTurnsSummary,
  getTurnByIndex,
  getUserResponseForTurn,
  getMaxTurnIndex,
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

  /**
   * Call the Saver Agent (golden_db_update) via HTTP POST /api/llm
   * This runs BEFORE the chat agent to extract and save data from user input.
   *
   * @param {object} options
   * @param {string} options.authToken - Bearer token for authentication
   * @param {object} options.context - Context for the Saver Agent
   * @returns {Promise<object>} - The extraction result { updates, reasoning, metadata }
   */
  async callSaverAgentApi({ authToken, context }) {
    const url = `${this.apiBaseUrl}/api/llm`;

    this.logger.info(
      {
        taskType: "golden_db_update",
        sessionId: context.sessionId,
        lastAskedField: context.lastAskedField,
        hasUserInput: Boolean(context.userInput || context.userMessage || context.uiResponse),
      },
      "golden-interviewer.saver_agent.request"
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        taskType: "golden_db_update",
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
        "golden-interviewer.saver_agent.http_error"
      );
      // Don't throw - Saver Agent failure shouldn't block the chat
      return { updates: {}, reasoning: null, error: errorText };
    }

    const data = await response.json();

    this.logger.info(
      {
        sessionId: context.sessionId,
        hasResult: !!data.result,
        hasError: !!data.result?.error,
        updateCount: data.result?.updates ? Object.keys(data.result.updates).length : 0,
      },
      "golden-interviewer.saver_agent.response"
    );

    return data.result || { updates: {}, reasoning: null };
  }

  /**
   * Call the Golden Refine API to validate and suggest improvements for free-text input.
   * This runs BEFORE saving data to validate user input.
   *
   * @param {object} options
   * @param {string} options.authToken - Bearer token for authentication
   * @param {object} options.context - Context for the refine request
   * @returns {Promise<object>} - The refine result { can_proceed, validation_issue, quality, suggestions, ... }
   */
  async callGoldenRefineApi({ authToken, context }) {
    const url = `${this.apiBaseUrl}/api/llm`;

    this.logger.info(
      {
        taskType: "golden_refine",
        sessionId: context.sessionId,
        lastAskedField: context.lastAskedField,
        userMessageLength: context.userMessage?.length || 0,
      },
      "golden-interviewer.refine.request"
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        taskType: "golden_refine",
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
        "golden-interviewer.refine.http_error"
      );
      // Don't throw - refine failure shouldn't block the conversation
      // Return permissive default (allow proceed)
      return { can_proceed: true, quality: "good", suggestions: [], error: errorText };
    }

    const data = await response.json();

    this.logger.info(
      {
        sessionId: context.sessionId,
        hasResult: !!data.result,
        canProceed: data.result?.can_proceed,
        quality: data.result?.quality,
        suggestionCount: data.result?.suggestions?.length || 0,
      },
      "golden-interviewer.refine.response"
    );

    return data.result || { can_proceed: true, quality: "good", suggestions: [] };
  }

  /**
   * Check if a UI tool type is a free-text input that should be refined
   * @param {string} toolType - The UI tool type (e.g., "smart_textarea", "tag_input")
   * @returns {boolean}
   */
  isRefineableToolType(toolType) {
    const REFINEABLE_TOOLS = ["smart_textarea", "tag_input"];
    return REFINEABLE_TOOLS.includes(toolType);
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
    // STEP 2: Create Golden Record with companyId reference (not full company data)
    // =========================================================================
    const resolvedCompanyName = companyData?.name || companyName || null;
    const goldenSchema = createInitialGoldenRecord(
      sessionId,
      companyId,
      resolvedCompanyName,
      userData
    );

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
      { sessionId, userId, companyId, hasCompanyData: !!companyData },
      "golden-interviewer.session.created"
    );

    // =========================================================================
    // STEP 4: Generate first turn with hydrated context (via HTTP /api/llm)
    // =========================================================================
    // Extract only the fields needed for the prompt
    const companyDataForPrompt = companyData
      ? {
          name: companyData.name,
          industry: companyData.industry,
          description: companyData.longDescription || companyData.description,
          employeeCountBucket: companyData.employeeCountBucket,
          toneOfVoice: companyData.toneOfVoice,
        }
      : null;

    const firstTurnResponse = await this.generateFirstTurn(
      session,
      authToken,
      companyDataForPrompt
    );

    // Update session with first turn via repository
    // Build snapshot for navigation
    const snapshot = buildSnapshot({
      goldenSchema: session.goldenSchema,
      completionPercentage: firstTurnResponse.completion_percentage || 0,
      currentPhase: firstTurnResponse.interview_phase || "opening",
    });

    const assistantMessage = buildAssistantMessage({
      content: firstTurnResponse.message,
      uiTool: firstTurnResponse.ui_tool,
      currentlyAskingField: firstTurnResponse.currently_asking_field,
      snapshot,
    });

    // Track lastAskedField from first turn (for skip attribution)
    // Use currently_asking_field - the field THIS turn is asking about (not next_priority_fields)
    const currentlyAskingField =
      firstTurnResponse.currently_asking_field || null;
    const currentlyAskingCategory = currentlyAskingField
      ? this.extractCategoryFromField(currentlyAskingField)
      : null;

    session.conversationHistory.push(assistantMessage);
    session.turnCount = 1;
    session.metadata.lastToolUsed = firstTurnResponse.ui_tool?.type;
    session.metadata.currentPhase =
      firstTurnResponse.interview_phase || "opening";
    session.metadata.lastAskedField = currentlyAskingField;
    session.metadata.lastAskedCategory = currentlyAskingCategory;
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
        // Current field being asked (for frontend to control skip button visibility)
        currently_asking_field: currentlyAskingField,
        // Navigation state - first turn, index 0
        navigation: {
          currentIndex: 0,
          maxIndex: 0,
          canGoBack: false,
          canGoForward: false,
          isEditing: false,
        },
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
   * @param {boolean} [options.acceptRefinedValue] - If true, skip golden_refine (user already saw suggestions)
   * @param {object} [options.navigationContext] - Navigation context when editing past turns
   * @returns {Promise<object>}
   */
  async processTurn({
    sessionId,
    authToken,
    userMessage,
    uiResponse,
    skipAction,
    acceptRefinedValue = false,
    navigationContext = null,
  }) {
    // Load session via repository
    const session = await getSession(this.firestore, sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== "active") {
      throw new Error(`Session is not active: ${session.status}`);
    }

    // Check if user is editing a past turn (not at the latest turn)
    const maxIndex = getMaxTurnIndex(session);
    const currentNavIndex = session.metadata?.navigationIndex;
    // Must check both undefined AND null - we set navigationIndex to null when clearing
    const isEditing = currentNavIndex !== undefined && currentNavIndex !== null && currentNavIndex < maxIndex;

    console.log(`🧭 [processTurn] Loaded session. navigationIndex: ${currentNavIndex}, maxIndex: ${maxIndex}, isEditing: ${isEditing}`);

    // If editing a past turn, handle it specially
    if (isEditing && (userMessage || uiResponse) && !skipAction?.isSkip) {
      return this.handleEditTurn({
        session,
        sessionId,
        authToken,
        userMessage,
        uiResponse,
        currentNavIndex,
        maxIndex,
        acceptRefinedValue,
      });
    }

    const previousTool = session.metadata?.lastToolUsed;

    // =========================================================================
    // SKIP DETECTION (explicit flag OR legacy "Skip" text fallback)
    // =========================================================================
    const isSkip =
      skipAction?.isSkip === true ||
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
            turnsToRecover:
              session.turnCount - (friction.strategyChangedAt || 0),
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
    friction.currentStrategy = this.determineFrictionStrategy(
      friction,
      skippedField
    );

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
    // FETCH COMPANY DATA FOR LLM CONTEXT (if companyId exists)
    // Moved up because we need it for golden_refine context
    // =========================================================================
    let companyData = null;
    const companyId = session.goldenSchema?.companyId;

    if (companyId) {
      try {
        const company = await getCompanyById(this.firestore, companyId);
        if (company) {
          // Extract only the fields needed for the prompt
          companyData = {
            name: company.name,
            industry: company.industry,
            description: company.longDescription || company.description,
            employeeCountBucket: company.employeeCountBucket,
            toneOfVoice: company.toneOfVoice,
          };
        }
      } catch (error) {
        this.logger.warn(
          { sessionId, companyId, err: error },
          "golden-interviewer.turn.company_fetch_error"
        );
      }
    }

    // =========================================================================
    // SERVER-SIDE EXTRACTION: Save user response BEFORE LLM call (deterministic)
    // =========================================================================
    // With single-field-per-question architecture, we know exactly which field
    // to save the user's response to: lastAskedField (from previous turn's currently_asking_field)
    const lastAskedField = session.metadata?.lastAskedField;

    // Determine what value to save: uiResponse takes priority, fallback to userMessage
    const valueToSave = uiResponse !== undefined && uiResponse !== null
      ? uiResponse
      : userMessage || null;

    // =========================================================================
    // GOLDEN REFINE: Validate free-text input before saving
    // =========================================================================
    // Check if this was a free-text input that should be refined
    // Skip refine if acceptRefinedValue=true (user already saw suggestions and confirmed)
    const previousToolType = session.metadata?.lastToolUsed;
    const shouldRefine = this.isRefineableToolType(previousToolType) &&
      valueToSave !== null &&
      typeof valueToSave === "string" &&
      valueToSave.trim().length > 0 &&
      !isSkip &&
      !acceptRefinedValue;

    let refineResult = null;

    if (shouldRefine && lastAskedField) {
      try {
        const refineContext = {
          userMessage: valueToSave,
          lastAskedField,
          currentSchema: session.goldenSchema || {},
          conversationHistory: session.conversationHistory.slice(-4),
          companyData,
          sessionId,
        };

        refineResult = await this.callGoldenRefineApi({ authToken, context: refineContext });

        console.log(
          "🔍 [GOLDEN REFINE] Result:",
          JSON.stringify({
            can_proceed: refineResult.can_proceed,
            quality: refineResult.quality,
            validation_issue: refineResult.validation_issue,
            suggestionCount: refineResult.suggestions?.length || 0,
          }, null, 2)
        );

        // If user cannot proceed, return early with validation error
        if (refineResult.can_proceed === false) {
          this.logger.info(
            {
              sessionId,
              field: lastAskedField,
              validationIssue: refineResult.validation_issue,
            },
            "golden-interviewer.refine.blocked"
          );

          return {
            message: refineResult.validation_issue || "This response doesn't match what we're looking for. Please try again.",
            ui_tool: null, // Keep current UI tool
            completion_percentage: session.metadata?.completionPercentage || 0,
            interview_phase: session.metadata?.currentPhase || "opening",
            extracted_fields: [],
            next_priority_fields: [],
            // Special flag to indicate validation failure
            refine_result: {
              can_proceed: false,
              validation_issue: refineResult.validation_issue,
              reasoning: refineResult.reasoning,
            },
          };
        }

        // If quality could improve and we have suggestions, PAUSE and return them
        // User must choose before we continue to next question
        if (refineResult.quality === "could_improve" && refineResult.suggestions?.length > 0) {
          this.logger.info(
            {
              sessionId,
              field: lastAskedField,
              suggestionCount: refineResult.suggestions.length,
            },
            "golden-interviewer.refine.suggestions_available"
          );

          // Return early - don't continue to next question yet
          // Data is NOT saved yet - user needs to confirm or pick a suggestion
          return {
            message: "", // Empty string - frontend will show suggestions instead
            ui_tool: null, // Keep current UI tool
            completion_percentage: session.metadata?.completionPercentage || 0,
            interview_phase: session.metadata?.currentPhase || "opening",
            extracted_fields: [],
            next_priority_fields: [],
            // Refine result with suggestions for the user to choose from
            refine_result: {
              can_proceed: true,
              quality: refineResult.quality,
              field: lastAskedField,
              original_value: valueToSave,
              suggestions: refineResult.suggestions,
              reasoning: refineResult.reasoning,
            },
          };
        }
      } catch (error) {
        // Refine failure should NOT block the conversation
        this.logger.warn(
          { sessionId, err: error },
          "golden-interviewer.refine.error"
        );
        // Continue without refine
      }
    }

    // Now save the value (we've passed validation if we got here)
    if (lastAskedField && valueToSave !== null && !isSkip) {
      // Save the user's response directly to the schema path
      const serverExtraction = { [lastAskedField]: valueToSave };

      console.log(
        "🔵 [SERVER EXTRACTION] Saving user response directly to field:",
        JSON.stringify({
          field: lastAskedField,
          value: valueToSave,
          source: uiResponse !== undefined && uiResponse !== null ? "uiResponse" : "userMessage",
        }, null, 2)
      );

      session.goldenSchema = this.applySchemaUpdates(
        session.goldenSchema || {},
        serverExtraction
      );

      // Save to Firestore immediately - DATA IS NOW SAFE
      await saveSession({
        firestore: this.firestore,
        sessionId,
        session,
      });

      this.logger.info(
        {
          sessionId,
          field: lastAskedField,
          valueType: typeof valueToSave,
          source: uiResponse !== undefined && uiResponse !== null ? "uiResponse" : "userMessage",
          savedBeforeLLM: true,
        },
        "golden-interviewer.server_extraction.saved"
      );
    } else if (!lastAskedField && (userMessage || uiResponse) && !isSkip) {
      // First turn or no field specified - log for debugging
      this.logger.debug(
        { sessionId, hasUserMessage: !!userMessage, hasUiResponse: !!uiResponse },
        "golden-interviewer.server_extraction.skipped_no_field"
      );
    }

    // =========================================================================
    // STEP 1: SAVER AGENT - Extract and save data BEFORE chat agent
    // =========================================================================
    // TEMPORARILY DISABLED: Saver Agent is disabled while we iterate on the
    // single-field-per-question architecture. The code is preserved for future use.
    const ENABLE_SAVER_AGENT = false;

    // Detect role archetype for context-aware extraction
    const roleArchetype = detectRoleArchetypeFromSchema(session.goldenSchema || {});

    let saverResult = { updates: {}, reasoning: null };

    if (ENABLE_SAVER_AGENT) {
      const saverContext = {
        userInput: userMessage || uiResponse,
        userMessage,
        uiResponse,
        lastAskedField: session.metadata?.lastAskedField || null,
        currentSchema: session.goldenSchema || {},
        conversationHistory: session.conversationHistory.slice(-4), // Last 4 messages for context
        sessionId,
        // Additional context for smarter extraction
        companyData,
        roleArchetype,
        frictionState: {
          isSkip,
          skipReason: isSkip ? skipReason : null,
          consecutiveSkips: friction.consecutiveSkips,
          totalSkips: friction.totalSkips,
        },
      };

      // Log schema state BEFORE Saver Agent
      console.log(
        "\n========== SCHEMA TRACKING ==========\n" +
        "📋 [BEFORE SAVER AGENT] Schema fields with values:",
        JSON.stringify(this.getFilledFields(session.goldenSchema || {}), null, 2)
      );

      try {
        saverResult = await this.callSaverAgentApi({ authToken, context: saverContext });
        console.log(
          "🤖 [SAVER AGENT] Result:",
          JSON.stringify(saverResult, null, 2)
        );

        // Apply Saver Agent extractions to schema BEFORE chat agent sees it
        if (saverResult?.updates && Object.keys(saverResult.updates).length > 0) {
          console.log(
            "✅ [SAVER AGENT] Updates to apply:",
            JSON.stringify(saverResult.updates, null, 2)
          );
          const updatedSchema = this.applySchemaUpdates(
            session.goldenSchema || {},
            saverResult.updates
          );
          session.goldenSchema = updatedSchema;

          // Log schema state AFTER Saver Agent
          console.log(
            "📋 [AFTER SAVER AGENT] Schema fields with values:",
            JSON.stringify(this.getFilledFields(session.goldenSchema || {}), null, 2)
          );

          this.logger.info(
            {
              sessionId,
              updateCount: Object.keys(saverResult.updates).length,
              fields: Object.keys(saverResult.updates),
              reasoning: saverResult.reasoning,
            },
            "golden-interviewer.saver_agent.updates_applied"
          );

          // Save immediately after Saver Agent extractions (don't wait for Chat Agent)
          await saveSession({
            firestore: this.firestore,
            sessionId,
            session,
          });
          console.log("💾 [SAVER AGENT] Saved to Firestore immediately");
        } else {
          console.log(
            "⚠️ [SAVER AGENT] No updates extracted. Reasoning:",
            saverResult?.reasoning || "none"
          );
        }
      } catch (error) {
        // Saver Agent failure should NOT block the conversation
        this.logger.warn(
          { sessionId, err: error },
          "golden-interviewer.saver_agent.error"
        );
      }
    } else {
      // Saver Agent disabled - log for debugging
      this.logger.debug(
        { sessionId },
        "golden-interviewer.saver_agent.disabled"
      );
    }

    // =========================================================================
    // STEP 2: CHAT AGENT - Generate next turn (with updated schema from Saver)
    // =========================================================================
    const llmContext = {
      // Use the UPDATED schema after Saver Agent extraction
      currentSchema: session.goldenSchema || {},
      companyData,
      conversationHistory: session.conversationHistory,
      userMessage,
      uiResponse,
      previousToolType: previousTool,
      turnNumber: session.turnCount + 1,
      isFirstTurn: false,
      sessionId,
      // Pass the field that was asked in the PREVIOUS turn (for extraction reminder)
      lastAskedField: session.metadata?.lastAskedField || null,
      // Pass friction state to LLM
      frictionState: {
        isSkip,
        skipReason: isSkip ? skipReason : null,
        skippedField: isSkip ? skippedField : null,
        consecutiveSkips: friction.consecutiveSkips,
        totalSkips: friction.totalSkips,
        currentStrategy: friction.currentStrategy,
      },
      // Pass Saver Agent result for context (chat agent knows what was just saved)
      saverResult: {
        fieldsUpdated: Object.keys(saverResult?.updates || {}),
        reasoning: saverResult?.reasoning || null,
      },
    };

    let llmResponse;
    try {
      llmResponse = await this.callLlmApi({ authToken, context: llmContext });
      console.log(
        "[Backend] RAW LLM Response:",
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
      currently_asking_field: llmResponse.currentlyAskingField,
      next_priority_fields: llmResponse.nextPriorityFields,
      completion_percentage: llmResponse.completionPercentage,
      interview_phase: llmResponse.interviewPhase,
      tool_reasoning: llmResponse.toolReasoning,
    };
    console.log("[Backend] parsed :", JSON.stringify(parsed, null, 2));

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
    // Log schema state BEFORE Chat Agent extraction
    console.log(
      "\n📋 [BEFORE CHAT AGENT EXTRACTION] Schema fields with values:",
      JSON.stringify(this.getFilledFields(session.goldenSchema || {}), null, 2)
    );

    // Apply schema extractions from Chat Agent
    if (parsed.extraction?.updates && Object.keys(parsed.extraction.updates).length > 0) {
      console.log(
        "🎯 [CHAT AGENT] Extraction updates to apply:",
        JSON.stringify(parsed.extraction.updates, null, 2)
      );
      const updatedSchema = this.applySchemaUpdates(
        session.goldenSchema || {},
        parsed.extraction.updates
      );
      session.goldenSchema = updatedSchema;

      // Log schema state AFTER Chat Agent extraction
      console.log(
        "📋 [AFTER CHAT AGENT EXTRACTION] Schema fields with values:",
        JSON.stringify(this.getFilledFields(session.goldenSchema || {}), null, 2)
      );
    } else {
      console.log(
        "⚠️ [CHAT AGENT] No extraction updates - parsed.extraction:",
        JSON.stringify(parsed.extraction, null, 2)
      );
    }

    console.log("========== END SCHEMA TRACKING ==========\n");

    // Normalize UI tool props (fix common LLM format errors)
    if (parsed.ui_tool) {
      // Phase 3: Expand template references (e.g., template_ref: "benefits")
      parsed.ui_tool = expandTemplateRef(parsed.ui_tool);

      parsed.ui_tool = this.normalizeUIToolProps(parsed.ui_tool, sessionId);

      // Apply smart defaults and generate component ID (A2UI pattern)
      const schemaPath = parsed.currently_asking_field || null;
      parsed.ui_tool = enhanceUITool(parsed.ui_tool, schemaPath);

      this.logger.debug(
        {
          sessionId,
          tool: parsed.ui_tool.type,
          componentId: parsed.ui_tool.componentId,
          schemaPath,
        },
        "golden-interviewer.ui_tool.enhanced"
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

    // Build snapshot for navigation (BEFORE updating session state)
    const turnSnapshot = buildSnapshot({
      goldenSchema: session.goldenSchema,
      completionPercentage: parsed.completion_percentage || session.metadata?.completionPercentage || 0,
      currentPhase: parsed.interview_phase || session.metadata?.currentPhase || "opening",
    });

    // Add assistant response to history
    const assistantMessage = buildAssistantMessage({
      content: parsed.message,
      uiTool: parsed.ui_tool,
      currentlyAskingField: parsed.currently_asking_field,
      snapshot: turnSnapshot,
    });
    session.conversationHistory.push(assistantMessage);

    // Update session metadata
    session.turnCount += 1;
    session.updatedAt = new Date();

    // =========================================================================
    // TRACK LAST ASKED FIELD (for skip attribution on NEXT turn)
    // Use currently_asking_field - the field THIS turn is asking about
    // =========================================================================
    const currentlyAskingField = parsed.currently_asking_field || null;
    const currentlyAskingCategory = currentlyAskingField
      ? this.extractCategoryFromField(currentlyAskingField)
      : null;

    session.metadata = {
      ...session.metadata,
      completionPercentage:
        parsed.completion_percentage ||
        estimateSchemaCompletion(session.goldenSchema),
      currentPhase: parsed.interview_phase || session.metadata?.currentPhase,
      lastToolUsed: parsed.ui_tool?.type,
      // Store the field being asked NOW (for skip attribution on next turn)
      lastAskedField: currentlyAskingField,
      lastAskedCategory: currentlyAskingCategory,
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
    console.log(
      "🔍 [Backend] BEFORE SAVE - technologies_used:",
      session.goldenSchema?.growth_trajectory?.skill_building?.technologies_used
    );
    await saveSession({
      firestore: this.firestore,
      sessionId,
      session,
    });
    console.log("💾 [CHAT AGENT] Saved to Firestore (final save)");

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
          lastAskedField: currentlyAskingField,
        },
      },
      "golden-interviewer.turn.processed"
    );

    // Calculate navigation state after this turn
    const newMaxIndex = getMaxTurnIndex(session);

    // Build response object
    const response = {
      message: parsed.message,
      ui_tool: parsed.ui_tool,
      completion_percentage: session.metadata.completionPercentage,
      interview_phase: session.metadata.currentPhase,
      extracted_fields: Object.keys(parsed.extraction?.updates || {}),
      next_priority_fields: parsed.next_priority_fields,
      // Current field being asked (for frontend to control skip button visibility)
      currently_asking_field: currentlyAskingField,
      // Include friction state for frontend awareness (optional use)
      friction_state: {
        consecutive_skips: friction.consecutiveSkips,
        total_skips: friction.totalSkips,
        current_strategy: friction.currentStrategy,
      },
      // Flag for frontend to show completion UI
      is_complete: isInterviewComplete,
      // Navigation state - user is at the latest turn
      navigation: {
        currentIndex: newMaxIndex,
        maxIndex: newMaxIndex,
        canGoBack: newMaxIndex > 0,
        canGoForward: false,
        isEditing: false,
      },
    };

    // Include refine suggestions if available (for client to show improvement options)
    if (refineResult && refineResult.quality === "could_improve" && refineResult.suggestions?.length > 0) {
      response.refine_result = {
        can_proceed: true, // We got here, so proceeding is allowed
        quality: refineResult.quality,
        suggestions: refineResult.suggestions,
        reasoning: refineResult.reasoning,
      };
    }

    console.log(`🧭 [processTurn] RETURNING (normal flow). navigation:`, response.navigation, `| field: ${response.currently_asking_field}, phase: ${response.interview_phase}`);

    return response;
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
  async generateFirstTurn(session, authToken, companyData = null) {
    const llmContext = {
      currentSchema: session.goldenSchema || {},
      companyData,
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
    // Phase 3: Expand template refs, then enhance with smart defaults and component ID
    let enhancedUiTool = llmResponse.uiTool;
    if (enhancedUiTool) {
      enhancedUiTool = expandTemplateRef(enhancedUiTool);
      enhancedUiTool = enhanceUITool(
        enhancedUiTool,
        llmResponse.currentlyAskingField
      );
    }

    return {
      message: llmResponse.message,
      extraction: llmResponse.extraction,
      ui_tool: enhancedUiTool,
      currently_asking_field: llmResponse.currentlyAskingField,
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
   * Get filled fields from schema for logging purposes
   * Returns only fields that have actual values (not null/undefined/empty objects)
   * @param {object} schema - The schema to analyze
   * @param {string} [prefix=""] - Internal prefix for recursion
   * @returns {object} Flat object with dot notation keys and their values
   */
  getFilledFields(schema, prefix = "") {
    const result = {};

    if (!schema || typeof schema !== "object") {
      return result;
    }

    for (const [key, value] of Object.entries(schema)) {
      // Skip internal/system fields
      if (["id", "companyId", "user_context"].includes(key)) {
        continue;
      }

      const fullPath = prefix ? `${prefix}.${key}` : key;

      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === "object" && !Array.isArray(value)) {
        // Recurse into nested objects
        const nested = this.getFilledFields(value, fullPath);
        Object.assign(result, nested);
      } else if (Array.isArray(value) && value.length > 0) {
        // Include non-empty arrays
        result[fullPath] = value;
      } else if (typeof value !== "object") {
        // Include primitive values
        result[fullPath] = value;
      }
    }

    return result;
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
  // NAVIGATION METHODS
  // ===========================================================================

  /**
   * Get turns summary for navigation UI
   * @param {string} sessionId
   * @returns {Promise<{turns: array, currentIndex: number, maxIndex: number}>}
   */
  async getTurnsSummary(sessionId) {
    const session = await getSession(this.firestore, sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const turns = extractTurnsSummary(session);
    const maxIndex = getMaxTurnIndex(session);
    const currentIndex = session.metadata?.navigationIndex ?? maxIndex;

    return {
      turns,
      currentIndex,
      maxIndex,
    };
  }

  /**
   * Navigate to a specific turn in the interview history
   * Returns the turn's state for the frontend to display
   * @param {object} options
   * @param {string} options.sessionId - Session ID
   * @param {number} options.targetTurnIndex - The turn index to navigate to
   * @returns {Promise<object>} Turn data with navigation state
   */
  async navigateToTurn({ sessionId, targetTurnIndex }) {
    const session = await getSession(this.firestore, sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const maxIndex = getMaxTurnIndex(session);

    // Validate target index
    if (targetTurnIndex < 0 || targetTurnIndex > maxIndex) {
      throw new Error(`Invalid turn index: ${targetTurnIndex}. Valid range: 0-${maxIndex}`);
    }

    // Get the target turn
    const turn = getTurnByIndex(session, targetTurnIndex);
    if (!turn) {
      throw new Error(`Turn not found at index: ${targetTurnIndex}`);
    }

    // Get the user's response for this turn (if any)
    const userResponse = getUserResponseForTurn(session, turn.historyIndex);

    // Update session's navigation index (track where user is browsing)
    // IMPORTANT: Only set navigationIndex when editing a past turn (targetTurnIndex < maxIndex)
    // When navigating to the latest turn, set it to null to avoid falsely entering edit mode
    const isNavigatingToPast = targetTurnIndex < maxIndex;
    session.metadata = {
      ...session.metadata,
      navigationIndex: isNavigatingToPast ? targetTurnIndex : null,
    };

    console.log(`🧭 [navigateToTurn] targetTurnIndex: ${targetTurnIndex}, maxIndex: ${maxIndex}, isNavigatingToPast: ${isNavigatingToPast}, navigationIndex set to: ${session.metadata.navigationIndex}`);

    await saveSession({
      firestore: this.firestore,
      sessionId,
      session,
    });

    this.logger.info(
      {
        sessionId,
        targetTurnIndex,
        maxIndex,
        field: turn.message.currentlyAskingField,
      },
      "golden-interviewer.navigation.navigated"
    );

    return {
      message: turn.message.content,
      ui_tool: turn.message.uiTool,
      currently_asking_field: turn.message.currentlyAskingField,
      completion_percentage: turn.message.snapshot?.completionPercentage || 0,
      interview_phase: turn.message.snapshot?.currentPhase || "opening",
      // User's previous response for this turn (to pre-fill the UI)
      previous_response: userResponse ? {
        content: userResponse.content,
        uiResponse: userResponse.uiResponse,
      } : null,
      // Navigation state
      navigation: {
        currentIndex: targetTurnIndex,
        maxIndex,
        canGoBack: targetTurnIndex > 0,
        canGoForward: targetTurnIndex < maxIndex,
        isEditing: targetTurnIndex < maxIndex, // User is editing a past turn
      },
    };
  }

  /**
   * Clear navigation index when user submits a new response
   * This is called from processTurn when user is not at the latest turn
   * @param {Object} session - Session object
   * @returns {boolean} True if navigation was cleared
   */
  clearNavigationIfNeeded(session) {
    if (session.metadata?.navigationIndex !== undefined && session.metadata?.navigationIndex !== null) {
      session.metadata.navigationIndex = null;
      console.log(`🧭 [clearNavigationIfNeeded] Cleared navigationIndex to null`);
      return true;
    }
    return false;
  }

  /**
   * Handle editing a past turn (user is not at the latest turn)
   * Updates the field value in the schema without calling LLM for next question
   * @param {object} options
   * @returns {Promise<object>}
   */
  async handleEditTurn({
    session,
    sessionId,
    authToken,
    userMessage,
    uiResponse,
    currentNavIndex,
    maxIndex,
    acceptRefinedValue,
  }) {
    console.log(`🧭 [handleEditTurn] ENTER. currentNavIndex: ${currentNavIndex}, maxIndex: ${maxIndex}, hasMessage: ${!!userMessage}, hasUiResponse: ${uiResponse !== undefined}`);

    // Get the turn being edited
    const turn = getTurnByIndex(session, currentNavIndex);
    if (!turn) {
      throw new Error(`Turn not found at index: ${currentNavIndex}`);
    }

    const fieldToUpdate = turn.message.currentlyAskingField;
    const valueToSave = uiResponse !== undefined && uiResponse !== null
      ? uiResponse
      : userMessage || null;

    this.logger.info(
      {
        sessionId,
        turnIndex: currentNavIndex,
        field: fieldToUpdate,
        valueType: typeof valueToSave,
      },
      "golden-interviewer.edit_turn.start"
    );

    // Update the schema with the new value
    if (fieldToUpdate && valueToSave !== null) {
      const update = { [fieldToUpdate]: valueToSave };
      session.goldenSchema = this.applySchemaUpdates(
        session.goldenSchema || {},
        update
      );

      this.logger.info(
        {
          sessionId,
          field: fieldToUpdate,
          updated: true,
        },
        "golden-interviewer.edit_turn.schema_updated"
      );
    }

    // Update the user response in conversation history
    const userResponseInHistory = getUserResponseForTurn(session, turn.historyIndex);
    if (userResponseInHistory) {
      // Update existing user response
      userResponseInHistory.content = userMessage || "";
      userResponseInHistory.uiResponse = uiResponse;
      userResponseInHistory.editedAt = new Date();
    } else {
      // No existing response - add one after the assistant message
      const newUserMessage = {
        role: "user",
        content: userMessage || "",
        timestamp: new Date(),
        uiResponse,
      };
      // Insert after the assistant message
      session.conversationHistory.splice(turn.historyIndex + 1, 0, newUserMessage);
    }

    // Recalculate completion percentage
    const newCompletionPercentage = estimateSchemaCompletion(session.goldenSchema);
    session.metadata.completionPercentage = newCompletionPercentage;
    session.updatedAt = new Date();

    // Save the session
    await saveSession({
      firestore: this.firestore,
      sessionId,
      session,
    });

    this.logger.info(
      {
        sessionId,
        turnIndex: currentNavIndex,
        field: fieldToUpdate,
        newCompletion: newCompletionPercentage,
      },
      "golden-interviewer.edit_turn.complete"
    );

    // After editing, advance to the next turn (or the latest turn if at the end)
    // This matches user expectation: "edit this answer, then continue"
    const nextIndex = Math.min(currentNavIndex + 1, maxIndex);
    const nextTurn = getTurnByIndex(session, nextIndex);

    // Clear navigation index since user is moving forward
    // NOTE: Using null instead of delete to ensure Firestore properly clears the field
    session.metadata.navigationIndex = null;

    console.log(`🧭 [handleEditTurn] Clearing navigationIndex. Before: ${currentNavIndex}, After: ${session.metadata.navigationIndex}`);

    await saveSession({
      firestore: this.firestore,
      sessionId,
      session,
    });

    console.log(`🧭 [handleEditTurn] Session saved. Returning nextIndex: ${nextIndex}, maxIndex: ${maxIndex}`);

    // If there's a next turn, return its content
    // Otherwise, user is at the latest turn and should continue normally
    if (nextTurn && nextIndex <= maxIndex) {
      const nextUserResponse = getUserResponseForTurn(session, nextTurn.historyIndex);
      const navState = {
        currentIndex: nextIndex,
        maxIndex,
        canGoBack: nextIndex > 0,
        canGoForward: nextIndex < maxIndex,
        isEditing: nextIndex < maxIndex,
      };

      console.log(`🧭 [handleEditTurn] RETURNING (next turn). navigation:`, navState, `| field: ${nextTurn.message.currentlyAskingField}`);

      return {
        message: nextTurn.message.content,
        ui_tool: nextTurn.message.uiTool,
        currently_asking_field: nextTurn.message.currentlyAskingField,
        completion_percentage: newCompletionPercentage,
        interview_phase: nextTurn.message.snapshot?.currentPhase || session.metadata?.currentPhase || "opening",
        extracted_fields: fieldToUpdate ? [fieldToUpdate] : [],
        next_priority_fields: [],
        was_edit: true,
        // Pre-fill previous response if available
        previous_response: nextUserResponse ? {
          content: nextUserResponse.content,
          uiResponse: nextUserResponse.uiResponse,
        } : null,
        // Navigation state - moved to next turn
        navigation: navState,
      };
    }

    console.log(`🧭 [handleEditTurn] RETURNING (fallback - no next turn). maxIndex: ${maxIndex}, field: ${fieldToUpdate}`);

    // Fallback - return the edited turn (shouldn't happen normally)
    return {
      message: turn.message.content,
      ui_tool: turn.message.uiTool,
      currently_asking_field: fieldToUpdate,
      completion_percentage: newCompletionPercentage,
      interview_phase: session.metadata?.currentPhase || "opening",
      extracted_fields: fieldToUpdate ? [fieldToUpdate] : [],
      next_priority_fields: [],
      was_edit: true,
      navigation: {
        currentIndex: maxIndex,
        maxIndex,
        canGoBack: maxIndex > 0,
        canGoForward: false,
        isEditing: false,
      },
    };
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
      .replace(/[^\w\s-]/g, "") // Remove non-word chars
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-") // Replace multiple hyphens with single
      .substring(0, 50); // Limit length
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
