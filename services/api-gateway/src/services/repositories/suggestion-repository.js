/**
 * @file suggestion-repository.js
 * Repository for job suggestions document access.
 * Firestore access for the "jobSuggestions" collection.
 */

import { JobSuggestionSchema } from "@wizard/core";

const SUGGESTION_COLLECTION = "jobSuggestions";

/**
 * Load suggestion document from Firestore
 * @param {Object} firestore - Firestore instance
 * @param {string} jobId - Job ID
 * @returns {Promise<Object|null>} Parsed suggestion document or null
 */
export async function loadSuggestion(firestore, jobId) {
  const existing = await firestore.getDocument(SUGGESTION_COLLECTION, jobId);
  if (!existing) return null;
  const parsed = JobSuggestionSchema.safeParse(existing);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

/**
 * Save a suggestion document to Firestore
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.jobId - Job ID
 * @param {Object} params.payload - Validated suggestion payload (already parsed with JobSuggestionSchema)
 * @returns {Promise<void>}
 */
export async function saveSuggestion({ firestore, jobId, payload }) {
  await firestore.saveDocument(SUGGESTION_COLLECTION, jobId, payload);
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
