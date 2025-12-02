import { LLM_CORE_TASK, LLM_SPECIAL_TASK } from "./task-types.js";

const GEMINI_DEFAULT_MODEL = "gemini-3-pro-preview";
const GEMINI_IMAGE_MODEL = "gemini-3-pro-image-preview";

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
  LLM_CORE_TASK.VIDEO_STORYBOARD,
  LLM_CORE_TASK.VIDEO_CAPTION,
  LLM_CORE_TASK.VIDEO_COMPLIANCE,
  LLM_CORE_TASK.IMAGE_CAPTION,
  LLM_CORE_TASK.IMAGE_PROMPT_GENERATION,
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

// Video render (Veo via Vertex) still goes through the shared LLM usage pipeline for pricing/logging.
// Provider remains "gemini" for consistency with the rest of the stack; the specific model is Veo.
config[LLM_SPECIAL_TASK.VIDEO_GENERATION] = {
  provider: "gemini",
  model: "veo-3.1-generate-preview"
};

export const LLM_TASK_CONFIG = Object.freeze(config);
