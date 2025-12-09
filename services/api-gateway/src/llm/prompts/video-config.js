/**
 * @file video-config.js
 * Prompt builder for the VideoConfig LLM task.
 * Generates creative/strategic intent for video generation.
 */

import { llmLogger } from "../logger.js";
import { formatCapabilitiesForPrompt } from "../../video/video-capabilities.js";

/**
 * Sanitizes a value for inclusion in the prompt.
 * @param {any} value
 * @returns {any}
 */
function sanitize(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim().length === 0) return undefined;
  if (Array.isArray(value) && value.length === 0) return undefined;
  return value;
}

/**
 * Builds a clean job context object for the prompt.
 * @param {Object} jobSnapshot
 * @returns {Object}
 */
function buildJobContext(jobSnapshot = {}) {
  return Object.fromEntries(
    Object.entries(jobSnapshot)
      .map(([key, value]) => [key, sanitize(value)])
      .filter(([, value]) => value !== undefined)
  );
}

/**
 * Builds the prompt for the VideoConfig LLM task.
 *
 * @param {Object} params
 * @param {Object} params.jobSnapshot - The job data (title, company, location, etc.)
 * @param {string[]} params.selectedChannels - Target channels for the video
 * @param {import('../../video/video-capabilities.js').VideoModelCapabilities} params.capabilities - Video model capabilities
 * @param {Object} [params.branding] - Company branding context
 * @returns {string} - JSON-serialized prompt
 */
export function buildVideoConfigPrompt({
  jobSnapshot = {},
  selectedChannels = [],
  capabilities,
  branding = {}
}) {
  if (!capabilities) {
    throw new Error("VideoConfig prompt requires capabilities");
  }

  const capabilitiesSummary = formatCapabilitiesForPrompt(capabilities);

  const payload = {
    role: "You are a video creative strategist for short-form recruiting videos.",
    instructions: [
      "Respond with valid JSON only. No explanations, no markdown.",
      "You are deciding HIGH-LEVEL creative intent, NOT technical API details.",
      "Do NOT mention API calls, multi-step processes, or video generation internals.",
      "Focus on: tone, pacing, style, and messaging strategy.",
      `The video platform supports clips up to ${capabilities.maxSingleShotSeconds} seconds in a single generation.`,
      capabilities.supportsExtend
        ? `Longer videos (up to ${capabilities.maxTotalSeconds}s) are possible but require more processing time.`
        : `The maximum video duration is ${capabilities.maxTotalSeconds} seconds.`,
      "For recruiting videos, shorter is often better (15-30 seconds performs well on social).",
      "Consider the target channels when choosing tone and style.",
      "TikTok and Instagram Reels favor energetic, native-feeling content.",
      "LinkedIn and YouTube may suit more polished, professional styles."
    ],
    video_capabilities: capabilitiesSummary,
    job_context: buildJobContext(jobSnapshot),
    target_channels: selectedChannels.length > 0 ? selectedChannels : ["general"],
    branding_hints: {
      tone: branding?.tone ?? "professional and engaging",
      has_logo: Boolean(branding?.logoUrl),
      primary_color: branding?.colors?.primary ?? null
    },
    response_contract: {
      lengthPreset: "short | medium | long (short=under 15s, medium=15-30s, long=30s+)",
      targetSeconds: "number (recommended duration in seconds)",
      primaryChannelFocus: "string | null (which channel to optimize for, or null for general)",
      tone: "energetic | professional | friendly (overall video mood)",
      hasVoiceOver: "boolean (true if video should have narration)",
      audioStyle: "music_only | voiceover_with_music | silent",
      visualStyle: "native_tiktok | polished_corporate | cinematic",
      notesForStoryboard: "string (free-form guidance for the storyboard generator)"
    },
    example_response: {
      lengthPreset: "short",
      targetSeconds: 15,
      primaryChannelFocus: "TIKTOK_LEAD",
      tone: "energetic",
      hasVoiceOver: true,
      audioStyle: "voiceover_with_music",
      visualStyle: "native_tiktok",
      notesForStoryboard: "Open with a bold hook about the salary. Show fast cuts of workplace energy. End with clear CTA."
    }
  };

  const serialized = JSON.stringify(payload, null, 2);
  llmLogger.info(
    { task: "video_config", payloadSize: serialized.length },
    "LLM video config prompt"
  );
  return serialized;
}
