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

export function buildVideoStoryboardPrompt({
  jobSnapshot = {},
  spec,
  channelName,
  recommendedMedium,
  branding = {}
}) {
  if (!spec) {
    throw new Error("Video storyboard prompt requires spec");
  }

  const instructions = [
    "Respond with valid JSON only.",
    "Create 4-6 shots, each mapped to one of: HOOK, PROOF, OFFER, ACTION.",
    "Use uppercase on-screen text that includes ROLE + CITY + PAY when available.",
    "Keep shots within the provided duration window and call out safe-zone guidance in visuals.",
    "Voiceover should be inclusive, bias-free, and energetic.",
    "Ensure final shot contains a clear CTA aligned to the channel experience."
  ];
  const brandingGuidance = buildBrandingGuidance(branding);
  if (brandingGuidance.length > 0) {
    instructions.push(...brandingGuidance);
  }
  console.log("[video-storyboard-prompt] Branding instructions", {
    hasBrandGuidance: brandingGuidance.length > 0,
    tone: branding?.tone,
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
