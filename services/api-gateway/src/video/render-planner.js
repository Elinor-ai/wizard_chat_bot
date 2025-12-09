/**
 * @file render-planner.js
 * Produces a RenderPlan from VideoConfig + VideoModelCapabilities.
 * This is the deterministic execution plan for video rendering.
 */

/**
 * Snaps a duration to the closest supported duration.
 * If no supportedDurations are provided, returns the input clamped to [4, max].
 *
 * @param {number} duration - Desired duration in seconds
 * @param {number[]} [supportedDurations] - Array of allowed durations (e.g., [4, 8, 12])
 * @param {number} [maxDuration=60] - Maximum allowed duration
 * @returns {number} - The snapped duration
 */
export function snapToSupportedDuration(duration, supportedDurations, maxDuration = 60) {
  const clamped = Math.max(4, Math.min(duration, maxDuration));

  if (!supportedDurations || supportedDurations.length === 0) {
    return Math.round(clamped);
  }

  // Find the closest supported duration
  let closest = supportedDurations[0];
  let minDiff = Math.abs(clamped - closest);

  for (const supported of supportedDurations) {
    const diff = Math.abs(clamped - supported);
    if (diff < minDiff) {
      minDiff = diff;
      closest = supported;
    }
  }

  return closest;
}

/**
 * Plans how to render a video based on VideoConfig and model capabilities.
 * Produces one of three strategies:
 * - "single_shot": Video fits within maxSingleShotSeconds
 * - "multi_extend": Video requires extensions (Veo only, when supportsExtend=true)
 * - "fallback_shorter": Video exceeds single-shot but provider can't extend
 *
 * @param {import('./renderers/contracts.js').VideoConfig} videoConfig - The creative intent configuration
 * @param {import('./video-capabilities.js').VideoModelCapabilities} capabilities - Video model capabilities
 * @param {string} provider - The video provider name
 * @param {string} modelId - The model identifier
 * @param {string} [aspectRatio="9:16"] - Target aspect ratio
 * @param {string} [resolution] - Target resolution
 * @returns {import('./renderers/contracts.js').RenderPlan}
 */
export function planRenderForVideo(
  videoConfig,
  capabilities,
  provider,
  modelId,
  aspectRatio = "9:16",
  resolution
) {
  // 1. Start from the desired seconds
  const desired = Number.isFinite(videoConfig?.targetSeconds)
    ? videoConfig.targetSeconds
    : 8;

  // 2. Clamp to sane range: [4, capabilities.maxTotalSeconds]
  const clamped = Math.min(
    Math.max(desired, 4),
    capabilities.maxTotalSeconds
  );

  // 3. Determine single-shot cap and extension capability
  const singleCap = capabilities.maxSingleShotSeconds;
  const canExtend =
    capabilities.supportsExtend === true &&
    capabilities.extendStepSeconds &&
    capabilities.extendStepSeconds > 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // CASE A: SINGLE_SHOT - Video fits within single-shot capacity
  // ═══════════════════════════════════════════════════════════════════════════
  if (clamped <= singleCap) {
    const snapped = snapToSupportedDuration(
      clamped,
      capabilities.supportedDurations,
      singleCap
    );
    return {
      provider,
      modelId,
      strategy: "single_shot",
      segments: [{ kind: "initial", seconds: snapped }],
      finalPlannedSeconds: snapped,
      aspectRatio,
      resolution: resolution ?? undefined
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CASE B: MULTI_EXTEND - Provider supports extension (Veo)
  // ═══════════════════════════════════════════════════════════════════════════
  if (canExtend) {
    const base = snapToSupportedDuration(
      singleCap,
      capabilities.supportedDurations,
      singleCap
    );
    const step = capabilities.extendStepSeconds;

    // Calculate how many extends we need to reach the desired duration
    let extendsNeeded = Math.ceil((clamped - base) / step);
    let total = base + extendsNeeded * step;

    // Ensure we don't exceed maxTotalSeconds
    while (total > capabilities.maxTotalSeconds && extendsNeeded > 0) {
      extendsNeeded--;
      total = base + extendsNeeded * step;
    }

    // If no extensions possible, fall back to single-shot with base duration
    if (extendsNeeded === 0) {
      return {
        provider,
        modelId,
        strategy: "single_shot",
        segments: [{ kind: "initial", seconds: base }],
        finalPlannedSeconds: base,
        aspectRatio,
        resolution: resolution ?? undefined
      };
    }

    // Build segments: initial + N extends
    const segments = [
      { kind: "initial", seconds: base },
      ...Array.from({ length: extendsNeeded }, () => ({
        kind: "extend",
        seconds: step
      }))
    ];

    const finalPlannedSeconds = base + extendsNeeded * step;

    return {
      provider,
      modelId,
      strategy: "multi_extend",
      segments,
      finalPlannedSeconds,
      aspectRatio,
      resolution: resolution ?? undefined
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CASE C: FALLBACK_SHORTER - Provider doesn't support extension (Sora)
  // ═══════════════════════════════════════════════════════════════════════════
  const fallback = snapToSupportedDuration(
    singleCap,
    capabilities.supportedDurations,
    singleCap
  );

  return {
    provider,
    modelId,
    strategy: "fallback_shorter",
    segments: [{ kind: "initial", seconds: fallback }],
    finalPlannedSeconds: fallback,
    aspectRatio,
    resolution: resolution ?? undefined
  };
}

/**
 * Creates a RenderPlan from duration-planner output as a migration path.
 * This allows existing code to gradually migrate to the new planner.
 *
 * @param {Object} durationPlan - Output from computeDurationPlan()
 * @param {string} provider - The video provider name
 * @param {string} modelId - The model identifier
 * @param {Object} spec - Channel video spec
 * @returns {import('./renderers/contracts.js').RenderPlan}
 */
export function planFromDurationPlan(durationPlan, provider, modelId, spec) {
  // For backward compatibility, convert old duration-planner output to RenderPlan
  // This ensures existing behavior is preserved during migration
  const segments = [{ kind: "initial", seconds: durationPlan.baseSeconds }];

  // Note: We're not adding extend segments yet (multi-extend not implemented)
  // The old duration-planner calculated extendsNeeded but we're not using them

  return {
    provider,
    modelId,
    strategy: "single_shot",
    segments,
    finalPlannedSeconds: durationPlan.baseSeconds,
    aspectRatio: spec?.aspectRatio ?? "9:16",
    resolution: spec?.resolution ?? undefined
  };
}
