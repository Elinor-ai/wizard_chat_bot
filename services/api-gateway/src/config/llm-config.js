const GEMINI_DEFAULT_MODEL = "gemini-3-pro-preview";
const IMAGEN_DEFAULT_MODEL = "imagegeneration@006";
const GEMINI_IMAGE_MODEL = "gemini-3-pro-image-preview";

const GEMINI_TASKS = [
  "suggest",
  "refine",
  "channels",
  "chat",
  "copilot_agent",
  "company_intel",
  "asset_master",
  "asset_channel_batch",
  "asset_adapt",
  "video_storyboard",
  "video_caption",
  "video_compliance",
  "image_caption",
  "image_prompt_generation"
];

const config = GEMINI_TASKS.reduce((acc, task) => {
  acc[task] = { provider: "gemini", model: GEMINI_DEFAULT_MODEL };
  return acc;
}, {});

config.image_generation = {
  provider: "gemini",
  model: GEMINI_IMAGE_MODEL
};

config.image_prompt_generation = {
  provider: "gemini",
  // Use the text model here—this task only crafts prompts and shouldn't incur image-model billing
  model: GEMINI_DEFAULT_MODEL
};

// Video render (Veo via Vertex) still goes through the shared LLM usage pipeline for pricing/logging.
// Provider remains "gemini" for consistency with the rest of the stack; the specific model is Veo.
config.video_generation = {
  provider: "gemini",
  model: "veo-3.1-generate-preview"
};

export const LLM_TASK_CONFIG = Object.freeze(config);
