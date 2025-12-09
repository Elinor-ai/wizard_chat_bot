/**
 * @file job-helpers.js
 * Shared helper functions for job-related operations across wizard, llm, and copilot routes.
 *
 * This module re-exports from the repository layer and provides backwards-compatible
 * aliases for callers that haven't migrated yet.
 */

// Re-export from repositories (canonical implementations)
export {
  loadSuggestion as loadSuggestionDocument,
  mapCandidatesByField,
  selectSuggestionsForFields,
} from "../services/repositories/suggestion-repository.js";

export {
  loadRefinement as loadRefinementDocument,
} from "../services/repositories/refinement-repository.js";

export {
  sanitizeCopilotReply,
  serializeMessages,
  buildCopilotMessage,
} from "../services/repositories/copilot-repository.js";
