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

export function buildVideoStoryboardPrompt({ jobSnapshot = {}, spec, channelName, recommendedMedium }) {
  if (!spec) {
    throw new Error("Video storyboard prompt requires spec");
  }

  const payload = {
    role: "You craft short-form recruiting video storyboards that follow Hook → Proof → Offer → Action.",
    instructions: [
      "Respond with valid JSON only.",
      "Create 4-6 shots, each mapped to one of: HOOK, PROOF, OFFER, ACTION.",
      "Use uppercase on-screen text that includes ROLE + CITY + PAY when available.",
      "Keep shots within the provided duration window and call out safe-zone guidance in visuals.",
      "Voiceover should be inclusive, bias-free, and energetic.",
      "Ensure final shot contains a clear CTA aligned to the channel experience."
    ],
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

  const serialized = JSON.stringify(payload, null, 2);
  llmLogger.info({ task: "video_storyboard", payloadSize: serialized.length }, "LLM video storyboard prompt");
  return serialized;
}
