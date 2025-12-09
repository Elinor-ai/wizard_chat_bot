import { llmLogger } from "../logger.js";

function sanitize(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim().length === 0) return undefined;
  if (Array.isArray(value) && value.length === 0) return undefined;
  return value;
}

function buildJobContext(jobSnapshot = {}) {
  return Object.fromEntries(
    Object.entries(jobSnapshot)
      .map(([key, value]) => [key, sanitize(value)])
      .filter(([, value]) => value !== undefined)
  );
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function buildBrandingGuidance(branding = {}) {
  const guidance = [];
  const primaryColor = branding?.colors?.primary;
  if (primaryColor) {
    guidance.push(
      `Visual Style: Use company brand colors (Primary: ${primaryColor}).`
    );
  }
  if (branding?.tone) {
    guidance.push(`Voiceover Tone: ${branding.tone}.`);
  }
  return guidance;
}

function buildBrandingContext(branding = {}) {
  const context = {};
  if (isObject(branding.colors) && Object.keys(branding.colors).length > 0) {
    context.colors = branding.colors;
  }
  if (isObject(branding.fonts) && Object.keys(branding.fonts).length > 0) {
    context.fonts = branding.fonts;
  }
  if (branding.tone) {
    context.tone = branding.tone;
  }
  if (branding.logoUrl) {
    context.logo_url = branding.logoUrl;
  }
  return Object.keys(context).length > 0 ? context : undefined;
}

/**
 * Builds creative direction instructions from VideoConfig.
 * Used to guide tone, style, and voiceover decisions.
 *
 * @param {Object} videoConfig - VideoConfig object (may be undefined for backward compat)
 * @param {Object} renderPlanSummary - Summary of RenderPlan (may be undefined)
 * @returns {string[]} Array of instruction strings
 */
function buildCreativeDirectionInstructions(videoConfig, renderPlanSummary) {
  const instructions = [];

  // Duration guidance from RenderPlan
  const targetDuration = renderPlanSummary?.finalPlannedSeconds ?? videoConfig?.targetSeconds;
  if (targetDuration) {
    instructions.push(
      `Target total video duration: approximately ${targetDuration} seconds. Pace your shots to fit this length.`
    );
  }

  // Tone guidance from VideoConfig
  const tone = videoConfig?.tone ?? "energetic";
  instructions.push(`Tone: ${tone}. Match your visuals, pacing, and language to this tone.`);

  // Voiceover guidance
  if (videoConfig?.hasVoiceOver === false) {
    instructions.push(
      "No voiceover. Focus on strong on-screen text and compelling visuals to tell the story."
    );
  } else {
    // Default: voiceover enabled
    instructions.push(
      "Include voiceover scripts. Make them conversational, inclusive, and bias-free."
    );
  }

  // Visual style guidance
  if (videoConfig?.visualStyle) {
    instructions.push(`Visual style: ${videoConfig.visualStyle}.`);
  }

  // Audio style hint
  if (videoConfig?.audioStyle) {
    instructions.push(`Audio style: ${videoConfig.audioStyle}.`);
  }

  // Notes for storyboard (custom creative direction)
  if (videoConfig?.notesForStoryboard) {
    instructions.push(`Creative notes: ${videoConfig.notesForStoryboard}`);
  }

  // Aspect ratio context
  const aspectRatio = renderPlanSummary?.aspectRatio ?? "9:16";
  if (aspectRatio === "9:16") {
    instructions.push("Format: vertical video (9:16). Optimize for mobile-first viewing.");
  } else if (aspectRatio === "16:9") {
    instructions.push("Format: horizontal video (16:9). Optimize for desktop/TV viewing.");
  }

  return instructions;
}

export function buildVideoStoryboardPrompt({
  jobSnapshot = {},
  spec,
  channelName,
  recommendedMedium,
  branding = {},
  videoConfig,
  renderPlanSummary
}) {
  if (!spec) {
    throw new Error("Video storyboard prompt requires spec");
  }

  // Base instructions
  const instructions = [
    "Respond with valid JSON only.",
    "Create 4-6 shots, each mapped to one of: HOOK, PROOF, OFFER, ACTION.",
    "Use uppercase on-screen text that includes ROLE + CITY + PAY when available.",
    "Keep shots within the provided duration window and call out safe-zone guidance in visuals.",
    "Ensure final shot contains a clear CTA aligned to the channel experience.",
    "Do NOT change or discuss technical parameters like duration, provider, or API details."
  ];

  // Add creative direction from VideoConfig and RenderPlan
  const creativeInstructions = buildCreativeDirectionInstructions(videoConfig, renderPlanSummary);
  instructions.push(...creativeInstructions);

  // Add branding guidance
  const brandingGuidance = buildBrandingGuidance(branding);
  if (brandingGuidance.length > 0) {
    instructions.push(...brandingGuidance);
  }

  console.log("[video-storyboard-prompt] Creative direction", {
    hasBrandGuidance: brandingGuidance.length > 0,
    tone: videoConfig?.tone ?? branding?.tone,
    targetDuration: renderPlanSummary?.finalPlannedSeconds ?? videoConfig?.targetSeconds,
    hasVoiceOver: videoConfig?.hasVoiceOver ?? true,
    primaryColor: branding?.colors?.primary
  });

  const payload = {
    role: "You craft short-form recruiting video storyboards that follow Hook → Proof → Offer → Action.",
    instructions,
    channel: {
      id: spec.channelId,
      name: channelName ?? spec.placementName,
      placement: spec.placementName,
      medium: recommendedMedium ?? spec.medium,
      duration_window: spec.duration,
      aspect_ratio: spec.aspectRatio,
      captioning: spec.captionsRequired,
      safe_zones: spec.safeZones,
      compliance_notes: spec.complianceNotes
    },
    job_context: buildJobContext(jobSnapshot),
    response_contract: {
      shots: [
        {
          phase: "HOOK|PROOF|OFFER|ACTION",
          duration_seconds: 5,
          visual: "Describe the shot",
          on_screen_text: "Uppercase text limited to 32 chars",
          voice_over: "Spoken script",
          b_roll: "Optional B-roll note"
        }
      ],
      thumbnail: {
        description: "Key frame recommendation",
        overlay_text: "Suggested overlay"
      }
    }
  };

  const brandingContext = buildBrandingContext(branding);
  if (brandingContext) {
    payload.branding_context = brandingContext;
  }
  console.log("[video-storyboard-prompt] Branding context payload", {
    provided: Boolean(brandingContext),
    branding: brandingContext
  });

  const serialized = JSON.stringify(payload, null, 2);
  llmLogger.info({ task: "video_storyboard", payloadSize: serialized.length }, "LLM video storyboard prompt");
  return serialized;
}
