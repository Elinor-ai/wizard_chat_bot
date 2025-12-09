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

/**
 * Builds tone-specific caption guidance based on VideoConfig.
 *
 * @param {Object} videoConfig - VideoConfig object (may be undefined)
 * @param {string} channelId - Target channel ID
 * @returns {string[]} Array of tone-specific guardrails
 */
function buildToneGuidance(videoConfig, channelId) {
  const tone = videoConfig?.tone ?? "energetic";
  const guidance = [];

  // Tone-based guidance
  if (tone.includes("professional") || tone.includes("formal")) {
    guidance.push("Use professional language. Avoid slang or overly casual phrases.");
  } else if (tone.includes("playful") || tone.includes("casual") || tone.includes("fun")) {
    guidance.push("Use casual, playful language. Emojis are welcome if channel-appropriate.");
  } else {
    // Default energetic tone
    guidance.push("Use energetic, engaging language that feels authentic and human.");
  }

  // Channel-specific guidance
  const channelLower = channelId?.toLowerCase() ?? "";
  if (channelLower.includes("tiktok")) {
    guidance.push("TikTok style: short, punchy, trend-aware. Use relevant hashtags.");
  } else if (channelLower.includes("linkedin")) {
    guidance.push("LinkedIn style: professional but personable. Focus on career opportunity.");
  } else if (channelLower.includes("instagram")) {
    guidance.push("Instagram style: visual-forward language. Use 3-5 relevant hashtags.");
  } else if (channelLower.includes("facebook") || channelLower.includes("meta")) {
    guidance.push("Facebook style: conversational and community-focused.");
  }

  return guidance;
}

export function buildVideoCaptionPrompt({
  jobSnapshot = {},
  spec,
  videoConfig,
  storyboardSummary
}) {
  if (!spec) {
    throw new Error("Video caption prompt requires spec");
  }

  // Base guardrails
  const guardrails = [
    "Return valid JSON only.",
    "Caption must be between 20 and 30 words.",
    "Keep tone human, bias-free, and specific to the role.",
    "Mention pay or benefits only if provided.",
    "Hashtags optional but keep to channel guidance."
  ];

  // Add tone and channel-specific guidance
  const toneGuidance = buildToneGuidance(videoConfig, spec.channelId);
  guardrails.push(...toneGuidance);

  const payload = {
    role: "You write short, inclusive captions for recruiting videos.",
    guardrails,
    creative_context: {
      tone: videoConfig?.tone ?? "energetic",
      primary_channel: videoConfig?.primaryChannelFocus ?? spec.channelId,
      storyboard_phases: storyboardSummary?.phases ?? "HOOK → PROOF → OFFER → ACTION"
    },
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
  llmLogger.info({
    task: "video_caption",
    payloadSize: serialized.length,
    tone: videoConfig?.tone ?? "energetic",
    channelId: spec.channelId
  }, "LLM video caption prompt");
  return serialized;
}
