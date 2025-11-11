import { llmLogger } from "../logger.js";

function buildJobContext(jobSnapshot = {}) {
  const context = {};
  Object.entries(jobSnapshot).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === "string" && value.trim().length === 0) return;
    if (Array.isArray(value) && value.length === 0) return;
    context[key] = value;
  });
  return context;
}

export function buildVideoCaptionPrompt({ jobSnapshot = {}, spec }) {
  if (!spec) {
    throw new Error("Video caption prompt requires spec");
  }

  const payload = {
    role: "You write short, inclusive captions for recruiting videos.",
    guardrails: [
      "Return valid JSON only.",
      "Caption must be between 20 and 30 words.",
      "Keep tone human, bias-free, and specific to the role.",
      "Mention pay or benefits only if provided.",
      "Hashtags optional but keep to channel guidance."
    ],
    channel: {
      id: spec.channelId,
      placement: spec.placementName,
      caption_notes: spec.captionNotes,
      default_hashtags: spec.defaultHashtags
    },
    job_context: buildJobContext(jobSnapshot),
    response_contract: {
      caption_text: "20-30 word string",
      hashtags: ["lowercase-without-spaces"],
      cta: spec.defaultCallToAction
    }
  };

  const serialized = JSON.stringify(payload, null, 2);
  llmLogger.info({ task: "video_caption", payloadSize: serialized.length }, "LLM video caption prompt");
  return serialized;
}
