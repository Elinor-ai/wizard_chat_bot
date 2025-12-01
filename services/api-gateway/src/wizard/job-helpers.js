/**
 * @file job-helpers.js
 * Shared helper functions for job-related operations across wizard, llm, and copilot routes.
 *
 * This module provides canonical implementations of common helper functions to avoid duplication
 * and ensure consistency across different parts of the codebase.
 */

import { randomUUID } from "node:crypto";
import { JobSuggestionSchema, JobRefinementSchema } from "@wizard/core";

const SUGGESTION_COLLECTION = "jobSuggestions";
const REFINEMENT_COLLECTION = "jobRefinements";

/**
 * Load suggestion document from Firestore
 * @param {Object} firestore - Firestore instance
 * @param {string} jobId - Job ID
 * @returns {Promise<Object|null>} Parsed suggestion document or null
 */
export async function loadSuggestionDocument(firestore, jobId) {
  const existing = await firestore.getDocument(SUGGESTION_COLLECTION, jobId);
  if (!existing) return null;
  const parsed = JobSuggestionSchema.safeParse(existing);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

/**
 * Load refinement document from Firestore
 *
 * This is the CANONICAL version with enhanced parameter handling.
 * Supports both direct parameters (firestore, jobId) and object parameters ({firestore, jobId}).
 *
 * @param {Object} firestore - Firestore instance or object with {firestore, jobId}
 * @param {string} jobId - Job ID (optional if firestore is an object)
 * @returns {Promise<Object|null>} Parsed refinement document or null
 */
export async function loadRefinementDocument(firestore, jobId) {
  // Handle parameter variations for backwards compatibility
  // Some callers pass { firestore, jobId } as first parameter
  if (
    jobId === undefined &&
    firestore &&
    typeof firestore === "object" &&
    firestore.firestore &&
    firestore.jobId
  ) {
    jobId = firestore.jobId;
    firestore = firestore.firestore;
  }

  const existing = await firestore.getDocument(REFINEMENT_COLLECTION, jobId);
  if (!existing) return null;
  const parsed = JobRefinementSchema.safeParse(existing);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

/**
 * Map array of candidates to object keyed by fieldId
 * @param {Array} candidates - Array of candidate objects
 * @returns {Object} Map of candidates keyed by fieldId
 */
export function mapCandidatesByField(candidates = []) {
  const map = {};
  candidates.forEach((candidate) => {
    if (candidate?.fieldId) {
      map[candidate.fieldId] = candidate;
    }
  });
  return map;
}

/**
 * Select suggestions for specific fields from candidate map
 * @param {Object} candidateMap - Map of candidates keyed by fieldId
 * @param {Array} fieldIds - Array of field IDs to select
 * @returns {Array} Array of selected suggestions
 */
export function selectSuggestionsForFields(candidateMap = {}, fieldIds = []) {
  if (!Array.isArray(fieldIds) || fieldIds.length === 0) {
    return Object.values(candidateMap ?? {});
  }
  return fieldIds
    .map((fieldId) => candidateMap?.[fieldId])
    .filter(Boolean)
    .map((candidate) => ({
      fieldId: candidate.fieldId,
      value: candidate.value,
      rationale: candidate.rationale ?? "",
      confidence: candidate.confidence ?? undefined,
      source: candidate.source ?? "expert-assistant",
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
 * Build copilot message object (extended version with stage + contextId)
 * This is the canonical version used by llm.js
 *
 * @param {Object} params - Message parameters
 * @param {string} params.role - Message role (user/assistant)
 * @param {string} params.type - Message type
 * @param {string} params.content - Message content
 * @param {Object} params.metadata - Optional metadata
 * @param {string} params.stage - Optional stage identifier
 * @param {string} params.contextId - Optional context identifier
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

