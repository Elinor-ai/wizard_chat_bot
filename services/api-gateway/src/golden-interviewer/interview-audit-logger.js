/**
 * Interview Audit Logger
 *
 * Logs interview turns for quality review and debugging.
 * Each session gets its own JSONL file with:
 * - Each LLM response (raw JSON output)
 * - Each user response (text or UI selection)
 * - Final complete golden schema when interview ends
 *
 * Files are stored in: logs/interview_audit/
 * Format: {sessionId}_{timestamp}.jsonl
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../../..");
const LOG_DIR = path.join(ROOT_DIR, "logs", "interview_audit");

// Cache for session file paths
const sessionFiles = new Map();

/**
 * Ensure the log directory exists
 */
async function ensureLogDir() {
  try {
    await fs.promises.mkdir(LOG_DIR, { recursive: true });
  } catch {
    // swallow
  }
}

/**
 * Get or create the log file path for a session
 */
function getSessionLogFile(sessionId) {
  if (!sessionFiles.has(sessionId)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${sessionId}_${timestamp}.jsonl`;
    sessionFiles.set(sessionId, path.join(LOG_DIR, fileName));
  }
  return sessionFiles.get(sessionId);
}

/**
 * Write an entry to the session's log file
 */
async function appendToLog(sessionId, entry) {
  try {
    await ensureLogDir();
    const logFile = getSessionLogFile(sessionId);
    const line = `${JSON.stringify(entry)}\n`;
    await fs.promises.appendFile(logFile, line, "utf8");
  } catch (error) {
    // Avoid breaking the main flow if logging fails
    console.error("[InterviewAuditLogger] Failed to write log:", error.message);
  }
}

/**
 * Log user's response to a question (SHORT - just what was saved)
 *
 * @param {object} params
 * @param {string} params.sessionId - Session ID
 * @param {number} params.turnNumber - Turn number this response belongs to
 * @param {string} params.field - The field that was answered
 * @param {string|object|null} params.value - The value (what was saved to DB)
 * @param {boolean} [params.isSkip] - Whether user skipped
 */
export async function logUserResponse({
  sessionId,
  turnNumber,
  field,
  value,
  isSkip = false,
}) {
  const entry = {
    type: "user_response",
    ts: new Date().toISOString(),
    turn: turnNumber,
    field,
    value: isSkip ? "[SKIPPED]" : value,
  };

  await appendToLog(sessionId, entry);
}

/**
 * Log LLM response (the question/UI tool)
 *
 * @param {object} params
 * @param {string} params.sessionId - Session ID
 * @param {number} params.turnNumber - Turn number
 * @param {object} params.llmResponse - Raw LLM response
 */
export async function logLlmResponse({
  sessionId,
  turnNumber,
  llmResponse,
}) {
  const entry = {
    type: "llm_response",
    ts: new Date().toISOString(),
    turn: turnNumber,
    field: llmResponse.currently_asking_field,
    phase: llmResponse.interview_phase,
    completion: llmResponse.completion_percentage,
    message: llmResponse.message,
    ui_tool: llmResponse.ui_tool
      ? {
          type: llmResponse.ui_tool.type,
          props: llmResponse.ui_tool.props,
        }
      : null,
    tool_reasoning: llmResponse.tool_reasoning,
  };

  await appendToLog(sessionId, entry);
}

/**
 * Log a turn in the interview (DEPRECATED - use logLlmResponse + logUserResponse)
 */
export async function logInterviewTurn({
  sessionId,
  turnNumber,
  llmResponse,
  userInput = null,
}) {
  // Log user's response from PREVIOUS turn first
  if (userInput && (userInput.message || userInput.uiResponse !== undefined)) {
    // Note: We need the previous turn's field - this is a limitation
    // For now, just log the raw input
  }

  // Log this turn's LLM response
  await logLlmResponse({ sessionId, turnNumber, llmResponse });
}

/**
 * Log the first turn of the interview (no user input)
 *
 * @param {object} params
 * @param {string} params.sessionId - Session ID
 * @param {object} params.llmResponse - Raw LLM response
 * @param {object} [params.companyData] - Company data used for context
 */
export async function logFirstTurn({ sessionId, llmResponse, companyData = null }) {
  const entry = {
    type: "first_turn",
    timestamp: new Date().toISOString(),
    sessionId,
    turnNumber: 1,
    // Company context that was provided
    companyContext: companyData
      ? {
          name: companyData.name,
          industry: companyData.industry,
          description: companyData.description?.slice(0, 200),
        }
      : null,
    // Raw LLM output
    llmResponse: {
      message: llmResponse.message,
      ui_tool: llmResponse.ui_tool,
      currently_asking_field: llmResponse.currently_asking_field,
      interview_phase: llmResponse.interview_phase,
      completion_percentage: llmResponse.completion_percentage,
      next_priority_fields: llmResponse.next_priority_fields,
      tool_reasoning: llmResponse.tool_reasoning,
      context_explanation: llmResponse.context_explanation,
    },
  };

  await appendToLog(sessionId, entry);
}

/**
 * Log the final golden schema when interview completes
 *
 * @param {object} params
 * @param {string} params.sessionId - Session ID
 * @param {object} params.goldenSchema - The complete final golden schema
 * @param {number} params.totalTurns - Total number of turns in the interview
 * @param {number} params.completionPercentage - Final completion percentage
 */
export async function logInterviewComplete({
  sessionId,
  goldenSchema,
  totalTurns,
  completionPercentage,
}) {
  const entry = {
    type: "interview_complete",
    timestamp: new Date().toISOString(),
    sessionId,
    summary: {
      totalTurns,
      completionPercentage,
    },
    // The complete final golden schema - everything, filled and unfilled
    finalGoldenSchema: goldenSchema,
  };

  await appendToLog(sessionId, entry);

  // Clean up session file cache
  sessionFiles.delete(sessionId);
}

/**
 * Log an error that occurred during the interview
 *
 * @param {object} params
 * @param {string} params.sessionId - Session ID
 * @param {number} params.turnNumber - Turn number where error occurred
 * @param {string} params.errorType - Type of error
 * @param {string} params.errorMessage - Error message
 * @param {object} [params.context] - Additional context
 */
export async function logInterviewError({
  sessionId,
  turnNumber,
  errorType,
  errorMessage,
  context = null,
}) {
  const entry = {
    type: "error",
    timestamp: new Date().toISOString(),
    sessionId,
    turnNumber,
    error: {
      type: errorType,
      message: errorMessage,
    },
    context,
  };

  await appendToLog(sessionId, entry);
}
