/**
 * @file index.js
 * Re-exports all repository modules for LLM-related data access.
 */

// Job repository
export {
  getJob,
  getJobRaw,
  loadJobForUser,
} from "./job-repository.js";

// Suggestion repository
export {
  loadSuggestion,
  saveSuggestion,
  mapCandidatesByField,
  selectSuggestionsForFields,
} from "./suggestion-repository.js";

// Refinement repository
export {
  loadRefinement,
  loadRefinedSnapshot,
  saveRefinement,
  syncRefinedFields,
} from "./refinement-repository.js";

// Channel recommendation repository
export {
  loadChannelRecommendation,
  saveChannelRecommendation,
  saveChannelRecommendationFailure,
} from "./channel-repository.js";

// Copilot repository
export {
  loadCopilotHistory,
  appendCopilotMessages,
  buildCopilotMessage,
  serializeMessages,
  sanitizeCopilotReply,
} from "./copilot-repository.js";

// LLM usage repository
export {
  recordToFirestore,
  recordToBigQuery,
  normalizeTokens,
  updateUserUsageCounters,
  sanitizeMetadata,
} from "./llm-usage-repository.js";

// Golden Interviewer repository
export {
  getSession,
  getSessionForUser,
  saveSession,
  createSession,
  updateSessionTurn,
  completeSession,
  getCompanyById as getCompanyByIdForInterview,
  buildUserMessage,
  buildAssistantMessage,
  extractSessionStatus,
  extractConversationHistory,
} from "./golden-interviewer-repository.js";

// Final job repository
export {
  loadFinalJob,
  saveFinalJob,
} from "./final-job-repository.js";

// Hero image repository
export {
  loadHeroImage,
  saveHeroImage,
  saveHeroImageFailure,
  serializeHeroImage,
} from "./hero-image-repository.js";

// Asset repository
export {
  loadJobAssets,
  loadLatestAssetRun,
  saveAssetRecord,
  saveAssetRun,
  serializeJobAsset,
  serializeAssetRun,
  normalizeJobAsset,
  normalizeJobAssetRun,
} from "./asset-repository.js";

// =============================================================================
// NON-LLM DOMAIN REPOSITORIES (users, subscriptions, dashboard, companies)
// =============================================================================

// User repository
export {
  getUserById,
  getUserByIdOrThrow,
  getUserByEmail,
  userExistsByEmail,
  createUser,
  updateUser,
  updateUserProfile,
  updateUserPreferences,
  updateUserPassword,
  updateUserLoginInfo,
  linkCompanyToUser,
  setUserMainCompany,
  sanitizeUserForResponse,
} from "./user-repository.js";

// Subscription repository
export {
  recordCreditPurchase,
  updateUserCredits,
  calculateCreditsAfterPurchase,
  buildPaymentRecord,
  buildPurchaseResponse,
} from "./subscription-repository.js";

// Dashboard repository
export {
  getJobsForUser,
  getAssetsForUser,
  getUserForDashboard,
  loadDashboardData,
  loadSummaryData,
  loadCampaignsData,
  loadLedgerData,
  loadActivityData,
} from "./dashboard-repository.js";

// Company repository
export {
  getCompanyById,
  getCompanyByIdParsed,
  getCompanyByDomain,
  saveCompany,
  getCompanyRefreshed,
  listDiscoveredJobs,
  listCompanyJobs,
  getCompaniesCreatedByUser,
  subscribeToCompany,
  subscribeToDiscoveredJobs,
  getUserForCompanyResolution,
  listCompaniesForUser,
  sanitizeCompanyRecord,
} from "./company-repository.js";
