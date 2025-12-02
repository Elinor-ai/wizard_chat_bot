/**
 * @file task-types.js
 * Single source of truth for all LLM task type identifiers.
 *
 * This module defines the complete taxonomy of task types used across the LLM platform:
 * - LLM_CORE_TASK: Constants for atomic tasks that directly invoke LLM providers
 * - LLM_ORCHESTRATOR_TASK: Constants for high-level pipeline tasks
 * - LLM_LOGGING_TASK: Constants for task names used only in usage logs/analytics
 * - LLM_SPECIAL_TASK: Constants for tasks with custom implementation patterns
 *
 * Usage:
 * - Import these constants for validation, documentation, and type checking
 * - Use the constant objects (e.g., LLM_CORE_TASK.SUGGEST) instead of string literals
 * - Do NOT modify these without updating corresponding handlers in routes/llm.js
 */

/**
 * Constant identifiers for atomic LLM tasks that make direct calls to AI providers.
 * Each task has a corresponding entry in TASK_REGISTRY and TASK_METHOD_MAP.
 */
export const LLM_CORE_TASK = {
  SUGGEST: "suggest",
  REFINE: "refine",
  CHANNELS: "channels",
  COPILOT_AGENT: "copilot_agent",
  ASSET_MASTER: "asset_master",
  ASSET_CHANNEL_BATCH: "asset_channel_batch",
  ASSET_ADAPT: "asset_adapt",
  VIDEO_STORYBOARD: "video_storyboard",
  VIDEO_CAPTION: "video_caption",
  VIDEO_COMPLIANCE: "video_compliance",
  COMPANY_INTEL: "company_intel",
  IMAGE_PROMPT_GENERATION: "image_prompt_generation",
  IMAGE_GENERATION: "image_generation",
  IMAGE_CAPTION: "image_caption",
};

/**
 * Constant identifiers for orchestrator tasks that coordinate multiple LLM calls.
 * These are client-facing but don't directly call LLMs themselves.
 */
export const LLM_ORCHESTRATOR_TASK = {
  GENERATE_CAMPAIGN_ASSETS: "generate_campaign_assets",
  HERO_IMAGE: "hero_image",
  VIDEO_CREATE_MANIFEST: "video_create_manifest",
  VIDEO_REGENERATE: "video_regenerate",
  VIDEO_CAPTION_UPDATE: "video_caption_update",
  VIDEO_RENDER: "video_render",
};

/**
 * Constant identifiers for logging-only task names that appear in analytics/BigQuery.
 * These are never used as request taskType values.
 */
export const LLM_LOGGING_TASK = {
  SUGGESTIONS: "suggestions",
  REFINEMENT: "refinement",
};

/**
 * Constant identifiers for special-case tasks with non-standard implementation.
 */
export const LLM_SPECIAL_TASK = {
  VIDEO_GENERATION: "video_generation",
};

/**
 * Array of atomic LLM task type values.
 * Derived from LLM_CORE_TASK constant object.
 */
export const CORE_LLM_TASKS = Object.values(LLM_CORE_TASK);

/**
 * Array of orchestrator task type values.
 * Derived from LLM_ORCHESTRATOR_TASK constant object.
 */
export const ORCHESTRATOR_TASKS = Object.values(LLM_ORCHESTRATOR_TASK);

/**
 * Array of logging-only task type values.
 * Derived from LLM_LOGGING_TASK constant object.
 */
export const LOGGING_ALIAS_TASKS = Object.values(LLM_LOGGING_TASK);

/**
 * Array of special-case task type values.
 * Derived from LLM_SPECIAL_TASK constant object.
 *
 * video_generation:
 * - NOT a client-facing taskType (cannot be sent to POST /api/llm)
 * - NOT in TASK_REGISTRY (doesn't use the orchestrator)
 * - Used ONLY for logging after video rendering completes
 * - Called directly from video/service.js via recordLlmUsage()
 * - Tracks Veo API usage (seconds generated, cost, model metadata)
 * - Configured in LLM_TASK_CONFIG with provider/model for consistency
 */
export const SPECIAL_CASE_TASKS = Object.values(LLM_SPECIAL_TASK);

/**
 * Complete set of all known task types across the platform.
 * Includes atomic tasks, orchestrators, logging aliases, and special cases.
 */
export const ALL_TASK_TYPES = [
  ...CORE_LLM_TASKS,
  ...ORCHESTRATOR_TASKS,
  ...LOGGING_ALIAS_TASKS,
  ...SPECIAL_CASE_TASKS,
];

/**
 * Mapping of request taskType to logged taskType.
 * Documents cases where the logged name differs from the request name.
 *
 * Examples:
 * - Client sends taskType: "suggest" → Logs as "suggestions"
 * - Client sends taskType: "refine" → Logs as "refinement"
 */
export const TASK_LOGGING_ALIASES = {
  [LLM_CORE_TASK.SUGGEST]: LLM_LOGGING_TASK.SUGGESTIONS,
  [LLM_CORE_TASK.REFINE]: LLM_LOGGING_TASK.REFINEMENT,
};
