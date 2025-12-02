/**
 * @file llm-tasks.js
 * Frontend-local constants for LLM task type identifiers.
 *
 * This module defines the task types that the web frontend sends to POST /api/llm.
 * These constants mirror the backend task-types.js but are intentionally decoupled
 * to avoid cross-boundary imports between frontend and backend services.
 *
 * Usage:
 * - Import LLM_TASK in frontend code that calls /api/llm
 * - Use LLM_TASK.SUGGEST instead of "suggest" for type safety and centralization
 * - Do NOT import backend task-types.js into frontend code
 */

/**
 * LLM task type constants used by the frontend to call /api/llm.
 * These values must match the backend's accepted taskType values.
 */
export const LLM_TASK = {
  // Core LLM tasks
  SUGGEST: "suggest",
  REFINE: "refine",
  CHANNELS: "channels",
  COPILOT_AGENT: "copilot_agent",

  // Orchestrator tasks
  GENERATE_CAMPAIGN_ASSETS: "generate_campaign_assets",
  HERO_IMAGE: "hero_image",
  VIDEO_CREATE_MANIFEST: "video_create_manifest",
  VIDEO_REGENERATE: "video_regenerate",
  VIDEO_RENDER: "video_render",
  VIDEO_CAPTION_UPDATE: "video_caption_update",
};
