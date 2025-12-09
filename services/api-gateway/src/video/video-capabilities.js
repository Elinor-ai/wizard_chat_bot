/**
 * @file video-capabilities.js
 * Defines video model capabilities for Sora and Veo providers.
 * This is the single source of truth for what each video model can do.
 */

import {
  SORA_ALLOWED_SECONDS,
  SORA_ALLOWED_SIZES,
  VEO3_ALLOWED_DURATIONS,
  VEO_ALLOWED_ASPECT_RATIOS,
  VEO_ALLOWED_RESOLUTIONS,
} from "./renderers/contracts.js";

/**
 * Video model capabilities definition.
 *
 * @typedef {Object} VideoModelCapabilities
 * @property {"sora" | "veo" | string} provider - The provider name
 * @property {string} modelId - The specific model identifier
 * @property {number[]} [supportedDurations] - Discrete duration options (e.g., [4, 8, 12])
 * @property {number} maxSingleShotSeconds - Maximum duration for a single generation
 * @property {boolean} supportsExtend - Whether the model supports video extension
 * @property {number} [extendStepSeconds] - Duration added per extension (if supported)
 * @property {number} maxTotalSeconds - Maximum total duration with extensions
 * @property {string[]} supportedAspectRatios - Supported aspect ratios (e.g., ["9:16", "16:9"])
 * @property {string[]} supportedResolutions - Supported resolutions (e.g., ["720p", "1080p"])
 */

/**
 * Sora model capabilities
 * @type {VideoModelCapabilities}
 */
const SORA_CAPABILITIES = {
  provider: "sora",
  modelId: "sora-2-pro",
  supportedDurations: SORA_ALLOWED_SECONDS.map(Number), // [4, 8, 12]
  maxSingleShotSeconds: 12,
  supportsExtend: false,
  extendStepSeconds: undefined,
  maxTotalSeconds: 12,
  supportedAspectRatios: ["9:16", "16:9"],
  supportedResolutions: SORA_ALLOWED_SIZES.slice(), // ["720x1280", "1280x720", ...]
};

/**
 * Veo model capabilities
 * @type {VideoModelCapabilities}
 */
const VEO_CAPABILITIES = {
  provider: "veo",
  modelId: "veo-3.1-generate-preview",
  supportedDurations: VEO3_ALLOWED_DURATIONS.slice(), // [4, 6, 8]
  maxSingleShotSeconds: 8,
  supportsExtend: true,
  extendStepSeconds: 7,
  maxTotalSeconds: 140, // Veo can extend up to ~140s total
  supportedAspectRatios: VEO_ALLOWED_ASPECT_RATIOS.slice(), // ["16:9", "9:16"]
  supportedResolutions: VEO_ALLOWED_RESOLUTIONS.slice(), // ["720p", "1080p"]
};

/**
 * Capabilities lookup by provider
 * @type {Record<string, VideoModelCapabilities>}
 */
const CAPABILITIES_BY_PROVIDER = {
  sora: SORA_CAPABILITIES,
  veo: VEO_CAPABILITIES,
};

/**
 * Returns the capabilities for a given video provider and model.
 *
 * @param {string} provider - The provider name ("sora" or "veo")
 * @param {string} [modelId] - The model identifier (optional, for future model-specific caps)
 * @returns {VideoModelCapabilities}
 */
export function getVideoModelCapabilities(provider, modelId) {
  const base = CAPABILITIES_BY_PROVIDER[provider];
  if (!base) {
    // Return a safe fallback for unknown providers
    return {
      provider,
      modelId: modelId ?? "unknown",
      supportedDurations: [8],
      maxSingleShotSeconds: 8,
      supportsExtend: false,
      extendStepSeconds: undefined,
      maxTotalSeconds: 8,
      supportedAspectRatios: ["9:16"],
      supportedResolutions: ["1080x1920"],
    };
  }

  // Return a copy with the modelId overridden if provided
  return {
    ...base,
    modelId: modelId ?? base.modelId,
  };
}

/**
 * Formats capabilities as human-readable text for LLM prompts.
 *
 * @param {VideoModelCapabilities} caps
 * @returns {string}
 */
export function formatCapabilitiesForPrompt(caps) {
  const lines = [
    `Video Provider: ${caps.provider}`,
    `Model: ${caps.modelId}`,
    `Maximum single clip duration: ${caps.maxSingleShotSeconds} seconds`,
    `Supported durations: ${caps.supportedDurations?.join(", ") ?? caps.maxSingleShotSeconds} seconds`,
    `Can extend clips: ${caps.supportsExtend ? "Yes" : "No"}`,
  ];

  if (caps.supportsExtend && caps.extendStepSeconds) {
    lines.push(`Extension step: ${caps.extendStepSeconds} seconds per extension`);
    lines.push(`Maximum total duration: ${caps.maxTotalSeconds} seconds`);
  }

  lines.push(`Supported aspect ratios: ${caps.supportedAspectRatios.join(", ")}`);

  return lines.join("\n");
}

export { SORA_CAPABILITIES, VEO_CAPABILITIES };
