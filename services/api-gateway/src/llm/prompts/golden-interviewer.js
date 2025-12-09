/**
 * Golden Interviewer Prompt Builder
 *
 * Builds prompts for the Golden Interviewer LLM task.
 * This module adapts the existing golden-interviewer/prompts.js logic
 * to work with the orchestrator pattern.
 */

import { llmLogger } from "../logger.js";
import {
  buildSystemPrompt as buildGoldenSystemPrompt,
  buildFirstTurnPrompt as buildGoldenFirstTurnPrompt,
  buildContinueTurnPrompt as buildGoldenContinueTurnPrompt,
} from "../../golden-interviewer/prompts.js";

/**
 * Builds the complete prompt for a Golden Interviewer turn.
 *
 * This function combines the system prompt context with the turn-specific prompt
 * into a single user prompt for the orchestrator.
 *
 * @param {object} context - The context for the turn
 * @param {object} context.currentSchema - Current state of the golden schema
 * @param {array} context.conversationHistory - Previous conversation messages
 * @param {string} [context.userMessage] - User's text message (if any)
 * @param {object} [context.uiResponse] - Response from UI component (if any)
 * @param {string} [context.previousToolType] - The UI tool that was displayed
 * @param {number} [context.turnNumber] - Current turn number
 * @param {boolean} [context.isFirstTurn] - Whether this is the first turn
 * @param {number} [context.attempt] - Retry attempt number
 * @param {boolean} [context.strictMode] - Whether to use strict mode for retries
 * @returns {string} - The complete prompt for the LLM
 */
export function buildGoldenInterviewerTurnPrompt(context = {}) {
  const {
    currentSchema = {},
    conversationHistory = [],
    userMessage,
    uiResponse,
    previousToolType,
    turnNumber = 1,
    isFirstTurn = false,
    attempt = 0,
    strictMode = false,
  } = context;

  // Build the appropriate turn prompt
  let turnPrompt;

  if (isFirstTurn) {
    turnPrompt = buildGoldenFirstTurnPrompt();
  } else {
    turnPrompt = buildGoldenContinueTurnPrompt({
      userMessage,
      currentSchema,
      uiResponse,
      previousToolType,
      turnNumber,
    });
  }

  // Build conversation history context
  let historyContext = "";
  const recentHistory = conversationHistory.slice(-20);
  if (recentHistory.length > 0) {
    const historyText = recentHistory
      .map(
        (msg) =>
          `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`
      )
      .join("\n\n");
    historyContext = `Previous conversation:\n${historyText}\n\n---\n\n`;
  }

  // Add strict mode guidance for retries
  const strictGuidance = strictMode
    ? "\n\n## CRITICAL: RETRY MODE\nYour previous response was not valid JSON. You MUST respond with ONLY a valid JSON object. No text before or after the JSON."
    : "";

  // Combine into final prompt
  const fullPrompt = `${historyContext}Current turn:\n${turnPrompt}${strictGuidance}`;

  llmLogger.info(
    {
      task: "golden_interviewer",
      isFirstTurn,
      turnNumber,
      historyLength: recentHistory.length,
      attempt,
      strictMode,
    },
    "Golden Interviewer prompt built"
  );

  return fullPrompt;
}

/**
 * Builds the system prompt for Golden Interviewer.
 *
 * This is exported separately for use in TASK_REGISTRY as a getter,
 * since the system prompt includes dynamic schema context.
 *
 * @param {object} context - The context containing current schema
 * @returns {string} - The system prompt
 */
export function buildGoldenInterviewerSystemPrompt(context = {}) {
  return buildGoldenSystemPrompt({
    currentSchema: context.currentSchema || {},
  });
}
