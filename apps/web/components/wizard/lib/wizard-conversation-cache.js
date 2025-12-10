/**
 * @file wizard-conversation-cache.js
 * Pure utility functions for copilot conversation caching and serialization.
 * Extracted from use-wizard-controller.js for better modularity.
 */

const CONVERSATION_CACHE_PREFIX = "wizard/copilotConversation/";

/**
 * Extract timestamp from a conversation message.
 * @param {Object|null} message - Conversation message
 * @returns {number|null} Timestamp in milliseconds or null
 */
export function getMessageTimestamp(message) {
  if (!message) {
    return null;
  }
  const { createdAt } = message;
  if (createdAt instanceof Date) {
    return createdAt.getTime();
  }
  if (typeof createdAt === "number") {
    return createdAt;
  }
  if (typeof createdAt === "string") {
    const parsed = Date.parse(createdAt);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Derive a version number from conversation messages based on latest timestamp.
 * @param {Array} messages - Array of conversation messages
 * @returns {number} Version number (latest timestamp or current time)
 */
export function deriveConversationVersion(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 0;
  }
  let latest = 0;
  for (const message of messages) {
    const timestamp = getMessageTimestamp(message);
    if (Number.isFinite(timestamp)) {
      latest = Math.max(latest, timestamp);
    }
  }
  return latest || Date.now();
}

/**
 * Apply client message IDs to user messages for consistent tracking.
 * @param {Array} messages - Array of conversation messages
 * @returns {Array} Messages with client IDs applied
 */
export function applyClientMessageIds(messages = []) {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages.map((message) => {
    const clientId = message?.metadata?.clientMessageId;
    if (
      message?.role === "user" &&
      typeof clientId === "string" &&
      clientId.length > 0
    ) {
      return {
        ...message,
        id: clientId,
      };
    }
    return message;
  });
}

/**
 * Get the cache key for a job's conversation.
 * @param {string|null} jobId - Job ID
 * @returns {string|null} Cache key or null
 */
export function getConversationCacheKey(jobId) {
  if (!jobId) return null;
  return `${CONVERSATION_CACHE_PREFIX}${jobId}`;
}

/**
 * Serialize conversation payload for storage.
 * @param {Array} messages - Conversation messages
 * @param {number} version - Version number
 * @returns {Object} Serialized payload
 */
export function serializeConversationPayload(messages = [], version = 0) {
  return {
    version,
    messages: messages.map((message) => ({
      ...message,
      createdAt:
        message?.createdAt instanceof Date
          ? message.createdAt.toISOString()
          : message?.createdAt ?? null,
    })),
  };
}

/**
 * Deserialize conversation payload from storage.
 * @param {Object|null} payload - Stored payload
 * @returns {Object|null} Deserialized payload with messages and version
 */
export function deserializeConversationPayload(payload) {
  if (!payload || !Array.isArray(payload.messages)) {
    return null;
  }
  const messages = payload.messages.map((message) => ({
    ...message,
    createdAt:
      typeof message.createdAt === "string"
        ? new Date(message.createdAt)
        : message.createdAt,
  }));
  const version = Number(payload.version) || deriveConversationVersion(messages);
  return { messages, version };
}

/**
 * Load conversation from session storage cache.
 * @param {string} jobId - Job ID
 * @returns {Object|null} Cached conversation or null
 */
export function loadConversationFromCache(jobId) {
  if (typeof window === "undefined" || !jobId) {
    return null;
  }
  try {
    const cacheKey = getConversationCacheKey(jobId);
    if (!cacheKey) return null;
    const stored = window.sessionStorage.getItem(cacheKey);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return deserializeConversationPayload(parsed);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Failed to parse cached conversation", error);
    return null;
  }
}

/**
 * Save conversation to session storage cache.
 * @param {string} jobId - Job ID
 * @param {Array} messages - Conversation messages
 * @param {number} version - Version number
 */
export function saveConversationToCache(jobId, messages, version) {
  if (typeof window === "undefined" || !jobId) {
    return;
  }
  try {
    const cacheKey = getConversationCacheKey(jobId);
    if (!cacheKey) return;
    const payload = serializeConversationPayload(messages, version);
    window.sessionStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Failed to cache conversation", error);
  }
}

/**
 * Preview content with optional truncation.
 * @param {string} content - Content to preview
 * @param {number} limit - Character limit
 * @returns {string} Truncated content
 */
export function previewContent(content, limit = 80) {
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
 * Create a summary of conversation messages for debugging.
 * @param {Array} messages - Conversation messages
 * @returns {Array} Summarized messages
 */
export function summarizeConversationMessages(messages = []) {
  return messages.map((message) => ({
    id: message?.id,
    role: message?.role,
    createdAt:
      message?.createdAt instanceof Date
        ? message.createdAt.toISOString()
        : message?.createdAt ?? null,
    preview: previewContent(message?.content ?? "", 60),
  }));
}
