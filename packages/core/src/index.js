export { NonNegativeNumber, TimestampSchema, NullableString } from "./common/zod.js";

export {
  JobCreationStateEnum,
  JOB_CREATION_STATES,
  JobStateToStatusMap,
  deriveJobStatusFromState,
  DeterministicStateMachine,
  createJobCreationStateMachine
} from "./schemas/job.js";

export { SuggestionSchema } from "./common/suggestion.js";
export { PromptSchema } from "./common/prompt.js";
export { ChatMessageSchema, ChatThreadSchema } from "./common/chat.js";
export {
  LlmSuggestionBucketSchema,
  ChannelRecommendationSchema,
  EMPTY_SUGGESTIONS
} from "./common/llm-suggestions.js";
export { AssetVersionSchema } from "./common/asset-version.js";
export { JobAssetSchema } from "./common/asset-artifact.js";
export {
  AssetArtifactTypeEnum,
  AssetFormatEnum,
  ASSET_BLUEPRINT_VERSION,
  buildAssetPlan,
  splitAssetPlan,
  getBlueprintForChannel
} from "./common/asset-formats.js";
export { CampaignSchema } from "./common/campaign.js";
export {
  CHANNEL_CATALOG,
  CHANNEL_CATALOG_MAP,
  CHANNEL_IDS,
  ChannelIdEnum
} from "./common/channels.js";
export {
  VIDEO_CHANNEL_SPECS,
  VIDEO_CHANNEL_SPEC_MAP,
  VideoSpecSchema,
  resolveVideoSpec
} from "./common/video-specs.js";
export { CreditLedgerEntrySchema } from "./common/credit-ledger.js";
export { EventEnvelopeSchema } from "./common/event-envelope.js";
export {
  UserSchema,
  UserRoleEnum,
  AuthProviderEnum,
  PlanIdEnum,
  PlanStatusEnum
} from "./schemas/user.js";
export {
  JobSchema,
  JobStatusEnum,
  WorkModelEnum,
  EmploymentTypeEnum,
  ExperienceLevelEnum,
  ConfirmedJobDetailsSchema
} from "./schemas/job.js";
export { JobStepSchema } from "./common/job-step.js";
export { JobVersionSchema } from "./common/job-version.js";
export { JobSuggestionSchema } from "./schemas/job-suggestion.js";

export { JobRecord } from "./job-record.js";
export { JobChannelRecommendationSchema } from "./schemas/job-channel-recommendation.js";
export { JobRefinementSchema } from "./schemas/job-refinement.js";
export { JobFinalSchema } from "./schemas/job-final.js";
export {
  JobAssetRecordSchema,
  JobAssetRunSchema,
  JobAssetStatusEnum,
  JobAssetRunStatusEnum
} from "./schemas/job-asset.js";
export {
  JobHeroImageSchema,
  HeroImageStatusEnum,
  HeroImageFailureSchema
} from "./schemas/job-hero-image.js";
export {
  CompanySchema,
  CompanyTypeEnum,
  CompanyEnrichmentStatusEnum,
  CompanyJobDiscoveryStatusEnum,
  CompanyDiscoveredJobSchema
} from "./schemas/company.js";
export {
  LlmUsageEntrySchema,
  LlmUsageStatusEnum
} from "./schemas/llm-usage.js";
export {
  CopilotMessageSchema,
  WizardCopilotChatSchema
} from "./schemas/copilot-chat.js";
export {
  ShotPhaseEnum,
  VideoJobSnapshotSchema,
  StoryboardShotSchema,
  CaptionSchema,
  VideoThumbnailSchema,
  ComplianceFlagSchema,
  VideoQaItemSchema,
  VideoTrackingSchema,
  VideoAssetManifestSchema,
  VideoGenerationMetricsSchema,
  VideoRenderTaskSchema,
  VideoPublishTaskSchema,
  VideoAuditLogEntrySchema,
  VideoLibraryStatusEnum,
  VideoLibraryItemSchema
} from "./schemas/video-library.js";

// Golden Schema exports
export {
  // Enums
  PayFrequencyEnum,
  VariableCompensationTypeEnum,
  VariableCompensationFrequencyEnum,
  EquityTypeEnum,
  PaymentMethodEnum,
  ScheduleTypeEnum,
  RemoteFrequencyEnum,
  PtoStructureEnum,
  OvertimeExpectedEnum,
  PhysicalSpaceTypeEnum,
  NoiseLevelEnum,
  ManagementApproachEnum,
  SocialPressureEnum,
  MeetingLoadEnum,
  CompanyStageEnum,
  RevenueTrendEnum,
  PositionTypeEnum,
  EmploymentTypeGoldenEnum,
  VarietyLevelEnum,
  DecisionAuthorityEnum,
  SupervisionLevelEnum,
  WorkloadIntensityEnum,
  WorkloadPredictabilityEnum,
  SeniorityDetectedEnum,
  // Sub-schemas
  FinancialRealitySchema,
  TimeAndLifeSchema,
  EnvironmentSchema,
  HumansAndCultureSchema,
  GrowthTrajectorySchema,
  StabilitySignalsSchema,
  RoleRealitySchema,
  UniqueValueSchema,
  ExtractionMetadataSchema,
  // Main schema
  UniversalGoldenSchema
} from "./schemas/golden-schema.js";
