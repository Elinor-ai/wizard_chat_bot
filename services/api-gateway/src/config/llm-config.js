const GEMINI_DEFAULT_MODEL = "gemini-3-pro-preview";
const IMAGEN_DEFAULT_MODEL = "imagegeneration@006";

const GEMINI_TASKS = [
  "suggest",
  "refine",
  "channels",
  "channel_picker",
  "chat",
  "copilot_agent",
  "company_intel",
  "asset_master",
  "asset_channel_batch",
  "asset_adapt",
  "video_storyboard",
  "video_caption",
  "video_compliance",
  "hero_image_caption",
  "image_prompt_generation"
];

const config = GEMINI_TASKS.reduce((acc, task) => {
  acc[task] = { provider: "gemini", model: GEMINI_DEFAULT_MODEL };
  return acc;
}, {});

config.image_generation = {
  provider: "imagen",
  model: IMAGEN_DEFAULT_MODEL
};

export const LLM_TASK_CONFIG = Object.freeze(config);
