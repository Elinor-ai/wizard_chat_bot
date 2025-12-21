/**
 * @file golden-interviewer-repository.js
 * Repository for Golden Interviewer session data access.
 * Firestore access for the "golden_interview_sessions" and "companies" collections.
 */

import { httpError } from "@wizard/utils";

const SESSIONS_COLLECTION = "golden_interview_sessions";
const COMPANIES_COLLECTION = "companies";

// =============================================================================
// SESSION OPERATIONS
// =============================================================================

/**
 * Load a session document from Firestore
 * @param {Object} firestore - Firestore instance
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object|null>} Session document or null if not found
 */
export async function getSession(firestore, sessionId) {
  const doc = await firestore.getDocument(SESSIONS_COLLECTION, sessionId);
  if (!doc) return null;

  // Convert Firestore timestamps to JS Dates
  return normalizeSessionTimestamps(doc);
}

/**
 * Load a session document with ownership validation
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.sessionId - Session ID
 * @param {string} params.userId - User ID for ownership check
 * @returns {Promise<Object>} Session document
 * @throws {HttpError} If session not found or access denied
 */
export async function getSessionForUser({ firestore, sessionId, userId }) {
  const session = await getSession(firestore, sessionId);

  if (!session) {
    throw httpError(404, "Session not found");
  }

  if (session.userId !== userId) {
    throw httpError(403, "Access denied to this session");
  }

  return session;
}

/**
 * Save or update a session document in Firestore
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.sessionId - Session ID
 * @param {Object} params.session - Session document to save
 * @returns {Promise<void>}
 */
export async function saveSession({ firestore, sessionId, session }) {
  await firestore.saveDocument(SESSIONS_COLLECTION, sessionId, session);
}

/**
 * Create a new session document
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.sessionId - Session ID
 * @param {string} params.userId - User ID
 * @param {string|null} params.companyId - Optional company ID
 * @param {Object} params.goldenSchema - Initial golden schema
 * @returns {Promise<Object>} Created session document
 */
export async function createSession({
  firestore,
  sessionId,
  userId,
  companyId = null,
  goldenSchema,
}) {
  const now = new Date();

  const session = {
    sessionId,
    userId,
    companyId,
    createdAt: now,
    updatedAt: now,
    status: "active",
    turnCount: 0,
    goldenSchema,
    conversationHistory: [],
    metadata: {
      completionPercentage: 0,
      currentPhase: "opening",
      lastToolUsed: null,

      // Last question context (for skip attribution)
      lastAskedField: null,      // Primary field from next_priority_fields[0]
      lastAskedCategory: null,   // Top-level category (e.g., "financial_reality")

      // Friction tracking
      friction: {
        totalSkips: 0,           // Lifetime skips in this session
        consecutiveSkips: 0,     // Resets when user engages
        skippedFields: [],       // Array of { field, reason, turnNumber, timestamp }
        recoveryAttempts: 0,     // Times we tried adaptive strategy
        recoverySuccesses: 0,    // Times user engaged after adaptation
        lastRecoveryTurn: null,  // Turn number of last recovery attempt
        currentStrategy: "standard", // "standard" | "education" | "low_disclosure" | "defer"
        strategyChangedAt: null, // Turn number when strategy last changed
      },
    },
  };

  await saveSession({ firestore, sessionId, session });
  return session;
}

/**
 * Update session with a new turn
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.session - Current session object (will be mutated)
 * @param {Object} params.assistantMessage - Assistant message to add
 * @param {Object} [params.userMessage] - Optional user message to add
 * @param {Object} params.metadata - Metadata updates
 * @param {Object} [params.goldenSchema] - Updated golden schema
 * @returns {Promise<void>}
 */
export async function updateSessionTurn({
  firestore,
  session,
  assistantMessage,
  userMessage,
  metadata,
  goldenSchema,
}) {
  // Add user message if provided
  if (userMessage) {
    session.conversationHistory.push(userMessage);
  }

  // Add assistant message
  session.conversationHistory.push(assistantMessage);

  // Update session fields
  session.turnCount += 1;
  session.updatedAt = new Date();
  session.metadata = {
    ...session.metadata,
    ...metadata,
  };

  if (goldenSchema) {
    session.goldenSchema = goldenSchema;
  }

  await saveSession({
    firestore,
    sessionId: session.sessionId,
    session,
  });
}

/**
 * Mark a session as completed
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.session - Session to complete
 * @returns {Promise<Object>} Completion result
 */
export async function completeSession({ firestore, session }) {
  session.status = "completed";
  session.updatedAt = new Date();

  await saveSession({
    firestore,
    sessionId: session.sessionId,
    session,
  });

  return {
    sessionId: session.sessionId,
    goldenSchema: session.goldenSchema,
    completionPercentage: session.metadata?.completionPercentage,
    turnCount: session.turnCount,
  };
}

// =============================================================================
// COMPANY OPERATIONS
// =============================================================================

/**
 * Load company document for context hydration
 * @param {Object} firestore - Firestore instance
 * @param {string} companyId - Company ID
 * @returns {Promise<Object|null>} Company document with id field, or null if not found
 */
export async function getCompanyById(firestore, companyId) {
  if (!companyId) return null;

  const doc = await firestore.getDocument(COMPANIES_COLLECTION, companyId);
  if (!doc) return null;

  return { id: companyId, ...doc };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Normalize Firestore timestamps in session document to JS Dates
 * @param {Object} doc - Raw Firestore document
 * @returns {Object} Document with normalized timestamps
 */
function normalizeSessionTimestamps(doc) {
  return {
    ...doc,
    createdAt: doc.createdAt?.toDate?.() || new Date(doc.createdAt),
    updatedAt: doc.updatedAt?.toDate?.() || new Date(doc.updatedAt),
    conversationHistory: (doc.conversationHistory || []).map((msg) => ({
      ...msg,
      timestamp: msg.timestamp?.toDate?.() || new Date(msg.timestamp),
    })),
  };
}

/**
 * Build a user message object for conversation history
 * @param {Object} params
 * @param {string} [params.content] - Message content
 * @param {Object} [params.uiResponse] - UI component response
 * @returns {Object} User message object
 */
export function buildUserMessage({ content, uiResponse }) {
  return {
    role: "user",
    content: content || "",
    timestamp: new Date(),
    uiResponse,
  };
}

/**
 * Build an assistant message object for conversation history
 * @param {Object} params
 * @param {string} params.content - Message content
 * @param {Object} [params.uiTool] - UI tool to display
 * @param {string} [params.currentlyAskingField] - Schema field this question targets
 * @param {Object} [params.snapshot] - State snapshot for navigation
 * @returns {Object} Assistant message object
 */
export function buildAssistantMessage({ content, uiTool, currentlyAskingField, snapshot }) {
  return {
    role: "assistant",
    content,
    timestamp: new Date(),
    uiTool,
    currentlyAskingField: currentlyAskingField || null,
    snapshot: snapshot || null,
  };
}

/**
 * Extract session status for API response
 * @param {Object} session - Session document
 * @returns {Object} Session status object
 */
export function extractSessionStatus(session) {
  if (!session) return null;

  return {
    sessionId: session.sessionId,
    userId: session.userId,
    status: session.status,
    turnCount: session.turnCount,
    completionPercentage: session.metadata?.completionPercentage || 0,
    currentPhase: session.metadata?.currentPhase,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/**
 * Extract conversation history for API response
 * @param {Object} session - Session document
 * @returns {Array} Formatted conversation history
 */
export function extractConversationHistory(session) {
  if (!session) return [];

  return session.conversationHistory.map((msg) => ({
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    uiTool: msg.uiTool ? { type: msg.uiTool.type } : undefined,
    hasUiResponse: !!msg.uiResponse,
  }));
}

// =============================================================================
// NAVIGATION OPERATIONS
// =============================================================================

/**
 * Get assistant turns with their indices for navigation
 * Returns only assistant messages (which represent interview turns)
 * @param {Object} session - Session document
 * @returns {Array<{index: number, message: Object}>} Array of turns with indices
 */
export function getAssistantTurns(session) {
  if (!session?.conversationHistory) return [];

  const turns = [];
  let turnIndex = 0;

  for (let i = 0; i < session.conversationHistory.length; i++) {
    const msg = session.conversationHistory[i];
    if (msg.role === "assistant") {
      turns.push({
        index: turnIndex,
        historyIndex: i,
        message: msg,
      });
      turnIndex++;
    }
  }

  return turns;
}

/**
 * Get a specific turn by its navigation index
 * @param {Object} session - Session document
 * @param {number} turnIndex - The turn index (0-based)
 * @returns {Object|null} The turn with its history index, or null if not found
 */
export function getTurnByIndex(session, turnIndex) {
  const turns = getAssistantTurns(session);
  return turns[turnIndex] || null;
}

/**
 * Get the user response that follows a specific assistant turn
 * @param {Object} session - Session document
 * @param {number} historyIndex - The history index of the assistant message
 * @returns {Object|null} The user message that follows, or null if not found
 */
export function getUserResponseForTurn(session, historyIndex) {
  if (!session?.conversationHistory) return null;

  // Look for the next user message after this assistant message
  for (let i = historyIndex + 1; i < session.conversationHistory.length; i++) {
    const msg = session.conversationHistory[i];
    if (msg.role === "user") {
      return msg;
    }
    // If we hit another assistant message, there's no user response for this turn
    if (msg.role === "assistant") {
      return null;
    }
  }

  return null;
}

/**
 * Get the maximum turn index (0-based)
 * @param {Object} session - Session document
 * @returns {number} The max turn index, or -1 if no turns
 */
export function getMaxTurnIndex(session) {
  const turns = getAssistantTurns(session);
  return turns.length - 1;
}

/**
 * Build a snapshot object for navigation
 * @param {Object} params
 * @param {Object} params.goldenSchema - Current schema state
 * @param {number} params.completionPercentage - Current completion percentage
 * @param {string} params.currentPhase - Current interview phase
 * @returns {Object} Snapshot object
 */
export function buildSnapshot({ goldenSchema, completionPercentage, currentPhase }) {
  return {
    goldenSchema: JSON.parse(JSON.stringify(goldenSchema || {})),
    completionPercentage: completionPercentage || 0,
    currentPhase: currentPhase || "opening",
    timestamp: new Date(),
  };
}

/**
 * Extract turns summary for navigation UI
 * @param {Object} session - Session document
 * @returns {Array} Array of turn summaries
 */
export function extractTurnsSummary(session) {
  const turns = getAssistantTurns(session);

  return turns.map((turn) => {
    const userResponse = getUserResponseForTurn(session, turn.historyIndex);

    return {
      index: turn.index,
      field: turn.message.currentlyAskingField || null,
      phase: turn.message.snapshot?.currentPhase || null,
      hasUserResponse: !!userResponse,
      uiToolType: turn.message.uiTool?.type || null,
      timestamp: turn.message.timestamp,
    };
  });
}
