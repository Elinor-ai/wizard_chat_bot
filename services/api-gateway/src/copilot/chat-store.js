/**
 * @file chat-store.js
 * Copilot chat history access.
 *
 * This module re-exports from the repository layer and provides backwards-compatible
 * aliases for callers that haven't migrated yet.
 */

// Re-export from repositories (canonical implementations)
export {
  loadCopilotHistory,
  appendCopilotMessages,
} from "../services/repositories/copilot-repository.js";
