/**
 * @file copilot-repository.js
 * Repository for copilot chat history access.
 * Firestore access for the "wizardCopilotChats" collection.
 */

import { randomUUID } from "node:crypto";
import { WizardCopilotChatSchema } from "@wizard/core";

const COPILOT_CHAT_COLLECTION = "wizardCopilotChats";

/**
 * Load copilot conversation history from Firestore
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.jobId - Job ID
 * @param {number} [params.limit=12] - Maximum number of messages to return
 * @returns {Promise<Array>} Array of messages (most recent last)
 */
export async function loadCopilotHistory({ firestore, jobId, limit = 12 }) {
  if (!jobId) return [];
  const existing = await firestore.getDocument(COPILOT_CHAT_COLLECTION, jobId);
  if (!existing) {
    return [];
  }
  const parsed = WizardCopilotChatSchema.safeParse(existing);
  if (!parsed.success) {
    return [];
  }
  const messages = parsed.data.messages ?? [];
  if (!limit || limit <= 0) {
    return messages;
  }
  return messages.slice(-limit);
}

/**
 * Append messages to copilot conversation history
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.jobId - Job ID
 * @param {Array} params.messages - Messages to append
 * @param {number} [params.limit=20] - Maximum messages to keep
 * @param {Date} [params.now] - Timestamp for update
 * @returns {Promise<Array>} Updated messages array
 */
export async function appendCopilotMessages({
  firestore,
  jobId,
  messages,
  limit = 20,
  now = new Date()
}) {
  if (!jobId) {
    throw new Error("jobId is required to append copilot messages");
  }
  const existing = await firestore.getDocument(COPILOT_CHAT_COLLECTION, jobId);
  const parsed = existing ? WizardCopilotChatSchema.safeParse(existing) : null;
  const base = parsed?.success
    ? parsed.data
    : {
        id: jobId,
        jobId,
        messages: [],
        updatedAt: now
      };

  const merged = [...(base.messages ?? []), ...(messages ?? [])];
  const trimmed =
    limit && limit > 0 ? merged.slice(-limit) : merged;

  const payload = WizardCopilotChatSchema.parse({
    ...base,
    messages: trimmed,
    updatedAt: now
  });

  await firestore.saveDocument(COPILOT_CHAT_COLLECTION, jobId, payload);
  return payload.messages;
}

/**
 * Build a copilot message object with standard fields
 * @param {Object} params - Message parameters
 * @param {string} params.role - Message role (user/assistant)
 * @param {string} params.type - Message type
 * @param {string} params.content - Message content
 * @param {Object} [params.metadata] - Optional metadata
 * @param {string} [params.stage] - Optional stage identifier
 * @param {string} [params.contextId] - Optional context identifier
 * @returns {Object} Message object
 */
export function buildCopilotMessage({ role, type, content, metadata, stage, contextId }) {
  return {
    id: randomUUID(),
    role,
    type,
    content,
    metadata: metadata ?? null,
    stage: stage ?? null,
    contextId: contextId ?? null,
    createdAt: new Date()
  };
}

/**
 * Serialize messages for API response
 * Converts Date objects to ISO strings
 * @param {Array} messages - Array of message objects
 * @returns {Array} Serialized messages
 */
export function serializeMessages(messages = []) {
  return messages.map((message) => ({
    ...message,
    createdAt:
      message.createdAt instanceof Date
        ? message.createdAt.toISOString()
        : message.createdAt
  }));
}

/**
 * Sanitize copilot reply by removing markdown formatting
 * @param {string} input - Raw copilot reply text
 * @returns {string} Sanitized text
 */
export function sanitizeCopilotReply(input) {
  if (!input) return "";
  return input
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/#+\s*/g, "")
    .trim();
}
