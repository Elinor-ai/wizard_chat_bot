export const LLM_TASK_CONFIG = {
  // --- Text + JSON tasks ---
  suggest: { provider: "gemini", model: "gemini-flash-latest" },
  refine: { provider: "gemini", model: "gemini-flash-latest" },
  channels: { provider: "gemini", model: "gemini-flash-latest" },
  channel_picker: { provider: "gemini", model: "gemini-flash-latest" },
  chat: { provider: "gemini", model: "gemini-flash-latest" },
  copilot_agent: { provider: "gemini", model: "gemini-flash-latest" },
  company_intel: { provider: "gemini", model: "gemini-flash-latest" },
  asset_master: { provider: "gemini", model: "gemini-flash-latest" },
  asset_channel_batch: { provider: "gemini", model: "gemini-flash-latest" },
  asset_adapt: { provider: "gemini", model: "gemini-flash-latest" },
  hero_image_caption: { provider: "gemini", model: "gemini-flash-latest" },
  video_storyboard: { provider: "gemini", model: "gemini-flash-latest" },
  video_caption: { provider: "gemini", model: "gemini-flash-latest" },
  video_compliance: { provider: "gemini", model: "gemini-flash-latest" },

  // --- Image tasks defaulting to Google Imagen stack ---
  image_prompt_generation: { provider: "gemini", model: "gemini-flash-latest" },
  image_generation: { provider: "imagen", model: "imagegeneration@006" },
};
