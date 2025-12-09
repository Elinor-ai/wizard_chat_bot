// =============================================================================
// SCHEMAS INDEX - Re-exports all schemas from domain-specific files
// =============================================================================

// Base / Shared
export { valueSchema, createFailureSchema, standardFailureSchema } from "./base.js";

// Authentication & User
export {
  userResponseSchema,
  authResponseSchema,
  userUpdateResponseSchema,
  changePasswordResponseSchema,
} from "./auth.js";

// Suggestions
export {
  suggestionSchema,
  suggestionFailureSchema,
  copilotSuggestionResponseSchema,
} from "./suggestion.js";

// Channel Recommendations
export {
  channelRecommendationSchema,
  channelRecommendationFailureSchema,
  channelRecommendationResponseSchema,
} from "./channel.js";

// Job Assets
export {
  jobAssetFailureSchema,
  jobAssetSchema,
  jobAssetRunSchema,
  jobAssetResponseSchema,
} from "./asset.js";

// Jobs
export {
  jobImportContextSchema,
  jobDetailsSchema,
  wizardJobResponseSchema,
  wizardJobSummarySchema,
  refinementFailureSchema,
  refinementResponseSchema,
  finalizeResponseSchema,
  persistResponseSchema,
  mergeResponseSchema,
  heroImageSchema,
} from "./job.js";

// Companies
export {
  companyOverviewResponseSchema,
  discoveredJobListItemSchema,
  companyJobsResponseSchema,
  companyListResponseSchema,
  companyUpdateResponseSchema,
  companyCreateResponseSchema,
  setMainCompanyResponseSchema,
} from "./company.js";

// Copilot Conversation
export {
  copilotMessageSchema,
  copilotActionSchema,
  copilotConversationResponseSchema,
} from "./copilot.js";

// Dashboard
export {
  dashboardSummarySchema,
  dashboardSummaryResponseSchema,
  dashboardCampaignSchema,
  dashboardCampaignResponseSchema,
  dashboardLedgerEntrySchema,
  dashboardLedgerResponseSchema,
  dashboardActivityEventSchema,
  dashboardActivityResponseSchema,
} from "./dashboard.js";

// Subscriptions
export {
  subscriptionPlanSchema,
  subscriptionPlanListResponseSchema,
  subscriptionPurchaseResponseSchema,
} from "./subscription.js";

// Video
export {
  videoThumbnailSchema,
  videoJobSnapshotSchema,
  storyboardShotSchema,
  videoCaptionSchema,
  videoManifestSchema,
  generationMetricsSchema,
  veoStateSchema,
  videoListItemSchema,
  videoDetailSchema,
  videoJobsResponseSchema,
} from "./video.js";

// Golden Interview
export {
  goldenInterviewStartResponseSchema,
  goldenInterviewChatResponseSchema,
} from "./interview.js";
