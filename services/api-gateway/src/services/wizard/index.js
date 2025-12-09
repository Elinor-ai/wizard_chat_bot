/**
 * @file index.js
 * Re-exports for wizard services.
 */

// Job lifecycle (pure business logic)
export {
  ALLOWED_INTAKE_KEYS,
  ARRAY_FIELD_KEYS,
  ENUM_FIELD_KEYS,
  REQUIRED_FIELD_PATHS,
  isPlainObject,
  deepMerge,
  deepClone,
  getDeep,
  setDeep,
  valueProvided,
  valueProvidedAt,
  sanitizeImportValue,
  sanitizeMultilineValue,
  createBaseJob,
  normalizeStateMachine,
  normalizeIntakeValue,
  mergeIntakeIntoJob,
  computeRequiredProgress,
  applyRequiredProgress,
  applyCompanyDefaults,
  normalizeFinalJobPayload,
  deriveCompanyDisplayName,
  deriveCompanyLocation,
  buildImportedJobState,
  extractIntakeFields,
} from "./job-lifecycle.js";

// Job service
export {
  createOrUpdateDraft,
  getJobForUser,
  listJobsForUser,
  finalizeJob,
} from "./wizard-job-service.js";

// Suggestion service
export {
  mergeSuggestionIntoJob,
} from "./wizard-suggestion-service.js";

// Import service
export {
  importCompanyJob,
} from "./wizard-import-service.js";

// Assets service
export {
  getJobAssetsForUser,
  getHeroImageForUser,
  getChannelRecommendationsForUser,
} from "./wizard-assets-service.js";

// Asset generation service
export {
  AssetGenerationService,
  createAssetGenerationService,
} from "./wizard-asset-generation-service.js";
