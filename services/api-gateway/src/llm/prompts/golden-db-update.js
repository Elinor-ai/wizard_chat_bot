/**
 * Golden DB Update Prompt Builder
 *
 * Builds prompts for the golden_db_update task.
 * This task is responsible for extracting and mapping user responses
 * to the Golden Schema fields.
 */

import { llmLogger } from "../logger.js";

/**
 * Builds the system prompt for the golden_db_update task.
 *
 * @param {object} context - The context object
 * @returns {string} The system prompt
 */
export function buildGoldenDbUpdateSystemPrompt(context = {}) {
  // TODO: Implement system prompt
  return "You are a data extraction assistant. Extract structured data from user responses.";
}

/**
 * Builds the user prompt for the golden_db_update task.
 *
 * @param {object} context - The context object
 * @param {object} [context.userInput] - The user's input to extract from
 * @param {string} [context.targetField] - The schema field being targeted
 * @param {object} [context.currentSchema] - Current state of the golden schema
 * @param {number} [context.attempt] - Current retry attempt (0-based)
 * @param {boolean} [context.strictMode] - True on retry attempts
 * @returns {string} The user prompt
 */
export function buildGoldenDbUpdatePrompt(context = {}) {
  const {
    userInput = null,
    targetField = null,
    currentSchema = {},
    attempt = 0,
    strictMode = false,
  } = context;

  // Strict mode instructions for retries
  const strictNotes = strictMode
    ? "CRITICAL: Previous output was invalid JSON. Return ONLY a valid JSON object matching the exact contract below."
    : null;

  // TODO: Build actual prompt logic
  const prompt = [
    "Extract data from the user input and map it to the schema.",
    "",
    `Target Field: ${targetField || "not specified"}`,
    "",
    `User Input: ${JSON.stringify(userInput)}`,
    "",
    strictNotes ? `STRICT MODE: ${strictNotes}` : "",
    `ATTEMPT: ${attempt}`,
  ]
    .filter(Boolean)
    .join("\n");

  llmLogger.info(
    {
      task: "golden_db_update",
      promptLength: prompt.length,
      attempt,
      strictMode,
      targetField,
    },
    "golden_db_update prompt built"
  );

  return prompt;
}
