import { LLM_CORE_TASK, LLM_SPECIAL_TASK } from "./task-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TEXT & IMAGE LLM CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

// Gemini Models (Default)
const GEMINI_DEFAULT_MODEL = "gemini-3-pro-preview";
const GEMINI_FLASH_MODEL = "gemini-2.0-flash-001"; // Fast & cheap for simple tasks
const GEMINI_IMAGE_MODEL = "gemini-3-pro-image-preview";

// ═══════════════════════════════════════════════════════════════════════════════
// ANTHROPIC CLAUDE MODELS (requires ANTHROPIC_API_KEY in .env)
// ═══════════════════════════════════════════════════════════════════════════════
const CLAUDE_OPUS_MODEL = "claude-opus-4-5-20251101";      // Best: $5/$25 per MTok
// const CLAUDE_SONNET_MODEL = "claude-sonnet-4-5-20250929";  // Balanced: $3/$15 per MTok
// const CLAUDE_HAIKU_MODEL = "claude-haiku-4-5-20250929";    // Fast: $1/$5 per MTok
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// VIDEO RENDER CONFIGURATION
// This is the single source of truth for video provider+model defaults.
// All video rendering code (service, unified renderer, VeoClient, SoraClient)
// must read provider/model from here, not from env vars.
//
// IMPORTANT: Provider and model selection is CODE-ONLY configuration.
// Do NOT use process.env to choose providers or models.
// .env should only contain keys, endpoints, and timeouts.
// ═══════════════════════════════════════════════════════════════════════════════
const DEFAULT_VIDEO_PROVIDER = "veo";
const DEFAULT_VEO_MODEL = "veo-3.1-fast-generate-preview";
const DEFAULT_SORA_MODEL = "sora-2-pro";

/**
 * Centralized video rendering configuration.
 * - defaultProvider: which provider to use when none is specified ("veo" or "sora")
 * - providers: per-provider settings including default model
 *
 * Model names must match keys in pricing-rates.js for accurate cost tracking:
 * - veo.video.models["veo-3.1-generate-preview"]
 * - sora.video.models["sora-2-pro"]
 */
export const VIDEO_RENDER_CONFIG = Object.freeze({
  defaultProvider: DEFAULT_VIDEO_PROVIDER,
  providers: Object.freeze({
    veo: Object.freeze({
      model: DEFAULT_VEO_MODEL,
    }),
    sora: Object.freeze({
      model: DEFAULT_SORA_MODEL,
    }),
  }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// VIDEO BEHAVIOR CONFIGURATION
// Controls video feature flags and paths. These are CODE-ONLY settings.
// Do NOT use process.env for these - .env should only contain secrets/infra.
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Video behavior settings:
 * - autoRender: whether to auto-trigger video rendering after manifest creation
 * - outputDir: filesystem path for storing rendered video assets
 * - llmEnabled: whether to use LLM (Gemini) for storyboard/caption generation
 */
export const VIDEO_BEHAVIOR_CONFIG = Object.freeze({
  autoRender: true,
  outputDir: "./tmp/video-renders",
  llmEnabled: true,
});

// All CORE_LLM_TASKS that use Gemini (all except image_generation which uses Imagen)
const GEMINI_TASKS = [
  LLM_CORE_TASK.SUGGEST,
  LLM_CORE_TASK.REFINE,
  LLM_CORE_TASK.CHANNELS,
  LLM_CORE_TASK.COPILOT_AGENT,
  LLM_CORE_TASK.COMPANY_INTEL,
  LLM_CORE_TASK.ASSET_MASTER,
  LLM_CORE_TASK.ASSET_CHANNEL_BATCH,
  LLM_CORE_TASK.ASSET_ADAPT,
  LLM_CORE_TASK.VIDEO_CONFIG,
  LLM_CORE_TASK.VIDEO_STORYBOARD,
  LLM_CORE_TASK.VIDEO_CAPTION,
  LLM_CORE_TASK.VIDEO_COMPLIANCE,
  LLM_CORE_TASK.IMAGE_CAPTION,
  LLM_CORE_TASK.IMAGE_PROMPT_GENERATION,
  LLM_CORE_TASK.GOLDEN_INTERVIEWER,
  LLM_CORE_TASK.GOLDEN_DB_UPDATE,
  LLM_CORE_TASK.GOLDEN_REFINE,
];

const config = GEMINI_TASKS.reduce((acc, task) => {
  acc[task] = { provider: "gemini", model: GEMINI_DEFAULT_MODEL };
  return acc;
}, {});

config[LLM_CORE_TASK.IMAGE_GENERATION] = {
  provider: "gemini",
  model: GEMINI_IMAGE_MODEL
};

config[LLM_CORE_TASK.IMAGE_PROMPT_GENERATION] = {
  provider: "gemini",
  // Use the text model here—this task only crafts prompts and shouldn't incur image-model billing
  model: GEMINI_DEFAULT_MODEL
};

// Golden tasks - using Claude Opus 4.5 for best quality
config[LLM_CORE_TASK.GOLDEN_REFINE] = {
  provider: "anthropic",
  model: CLAUDE_OPUS_MODEL
};

config[LLM_CORE_TASK.GOLDEN_INTERVIEWER] = {
  provider: "anthropic",
  model: CLAUDE_OPUS_MODEL
};

// Video render still goes through the shared LLM usage pipeline for pricing/logging.
// The model here is used for Veo logging; Sora uses its own model from VIDEO_RENDER_CONFIG.
// Note: This is primarily for usage tracking - actual video generation uses VIDEO_RENDER_CONFIG.
config[LLM_SPECIAL_TASK.VIDEO_GENERATION] = {
  provider: DEFAULT_VIDEO_PROVIDER,
  model: DEFAULT_VEO_MODEL
};

export const LLM_TASK_CONFIG = Object.freeze(config);
