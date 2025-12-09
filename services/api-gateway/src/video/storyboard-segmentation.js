/**
 * Storyboard Segmentation Module
 *
 * Maps storyboard shots to multi-extend video segments for Veo.
 * Each segment gets specific shots from the storyboard based on phase:
 *   - Segment 1 (initial): Hook shots - grabbing attention
 *   - Segment 2..N-1 (middle): Proof/Offer shots - building the narrative
 *   - Segment N (final): Action/CTA shots - driving conversion
 *
 * This enables segment-aware prompting where each Veo API call
 * receives only the shots relevant to that segment, reducing repetition.
 */

/**
 * Normalized phase values for segment mapping.
 * @typedef {"hook" | "middle" | "cta"} NormalizedPhase
 */

/**
 * @typedef {Object} StoryboardShot
 * @property {string} id - Unique shot identifier
 * @property {string} phase - Original phase from LLM (e.g., "HOOK", "PROOF")
 * @property {NormalizedPhase} normalizedPhase - Normalized phase for segmentation
 * @property {string} visual - Visual description
 * @property {string} onScreenText - Text overlay
 * @property {string} voiceOver - Voiceover script
 * @property {number} [durationSeconds] - Shot duration
 * @property {number} [startSeconds] - Shot start time
 */

/**
 * @typedef {Object} SegmentContext
 * @property {number} segmentIndex - 0-based segment index
 * @property {number} totalSegments - Total number of segments
 * @property {NormalizedPhase} phase - Primary phase for this segment
 * @property {StoryboardShot[]} shots - Shots assigned to this segment
 * @property {number} durationSeconds - Duration of this segment
 */

/**
 * Maps raw storyboard phase strings to normalized phases.
 * Handles various LLM outputs and normalizes to: "hook", "middle", "cta"
 *
 * @param {string} rawPhase - Raw phase string from storyboard LLM
 * @returns {NormalizedPhase} - Normalized phase value
 */
export function normalizePhase(rawPhase) {
  if (!rawPhase || typeof rawPhase !== "string") {
    return "middle"; // Default to middle for unknown phases
  }

  const lower = rawPhase.trim().toLowerCase();

  // Hook phase: opening, attention-grabbing
  if (
    lower === "hook" ||
    lower === "intro" ||
    lower === "introduction" ||
    lower === "opening" ||
    lower === "attention"
  ) {
    return "hook";
  }

  // CTA phase: call to action, closing
  if (
    lower === "cta" ||
    lower === "action" ||
    lower === "call to action" ||
    lower === "closing" ||
    lower === "close" ||
    lower === "finale" ||
    lower === "end"
  ) {
    return "cta";
  }

  // Middle phase: everything else (proof, offer, body, details, etc.)
  // This includes: "proof", "offer", "body", "details", "middle", "content"
  return "middle";
}

/**
 * Normalizes all shots in a storyboard by adding normalizedPhase.
 * This is called after storyboard generation to prepare shots for segmentation.
 *
 * @param {Object[]} storyboard - Array of shot objects from LLM
 * @returns {StoryboardShot[]} - Shots with normalizedPhase added
 */
export function normalizeStoryboardPhases(storyboard) {
  if (!Array.isArray(storyboard)) {
    return [];
  }

  return storyboard.map((shot, index) => ({
    ...shot,
    id: shot.id ?? `shot-${index + 1}`,
    normalizedPhase: normalizePhase(shot.phase),
  }));
}

/**
 * Groups storyboard shots by their normalized phase.
 *
 * @param {StoryboardShot[]} shots - Normalized storyboard shots
 * @returns {{ hook: StoryboardShot[], middle: StoryboardShot[], cta: StoryboardShot[] }}
 */
function groupShotsByPhase(shots) {
  const groups = {
    hook: [],
    middle: [],
    cta: [],
  };

  for (const shot of shots) {
    const phase = shot.normalizedPhase ?? "middle";
    if (groups[phase]) {
      groups[phase].push(shot);
    } else {
      groups.middle.push(shot);
    }
  }

  return groups;
}

/**
 * Determines the primary phase for a segment based on its position.
 *
 * @param {number} segmentIndex - 0-based segment index
 * @param {number} totalSegments - Total number of segments
 * @returns {NormalizedPhase}
 */
function getPhaseForSegment(segmentIndex, totalSegments) {
  if (totalSegments <= 1) {
    return "hook"; // Single segment covers everything
  }

  if (segmentIndex === 0) {
    return "hook"; // First segment is always hook
  }

  if (segmentIndex === totalSegments - 1) {
    return "cta"; // Last segment is always CTA
  }

  return "middle"; // Everything in between is middle
}

/**
 * Distributes middle shots across middle segments evenly.
 *
 * @param {StoryboardShot[]} middleShots - All middle-phase shots
 * @param {number} middleSegmentCount - Number of middle segments
 * @returns {StoryboardShot[][]} - Array of shot arrays for each middle segment
 */
function distributeMiddleShots(middleShots, middleSegmentCount) {
  if (middleSegmentCount <= 0 || middleShots.length === 0) {
    return [];
  }

  if (middleSegmentCount === 1) {
    return [middleShots];
  }

  // Distribute evenly with remainder going to earlier segments
  const result = [];
  const baseCount = Math.floor(middleShots.length / middleSegmentCount);
  const remainder = middleShots.length % middleSegmentCount;
  let currentIndex = 0;

  for (let i = 0; i < middleSegmentCount; i++) {
    const count = baseCount + (i < remainder ? 1 : 0);
    result.push(middleShots.slice(currentIndex, currentIndex + count));
    currentIndex += count;
  }

  return result;
}

/**
 * Builds SegmentContext[] from storyboard and RenderPlan.
 * This is the main function called by manifest-builder to prepare
 * segment-aware prompting data for Veo multi-extend.
 *
 * @param {StoryboardShot[]} storyboard - Normalized storyboard shots
 * @param {Object} renderPlan - RenderPlan with strategy and segments
 * @returns {SegmentContext[]} - Array of segment contexts for Veo prompting
 */
export function buildSegmentContextsFromStoryboard(storyboard, renderPlan) {
  // Only build segment contexts for multi_extend strategy
  if (!renderPlan || renderPlan.strategy !== "multi_extend") {
    return [];
  }

  const segments = renderPlan.segments ?? [];
  const totalSegments = segments.length;

  if (totalSegments === 0) {
    return [];
  }

  // Normalize phases if not already done
  const normalizedShots = storyboard.map((shot, index) => ({
    ...shot,
    id: shot.id ?? `shot-${index + 1}`,
    normalizedPhase: shot.normalizedPhase ?? normalizePhase(shot.phase),
  }));

  // Group shots by phase
  const grouped = groupShotsByPhase(normalizedShots);

  // Count middle segments (exclude first and last)
  const middleSegmentCount = Math.max(0, totalSegments - 2);

  // Distribute middle shots across middle segments
  const distributedMiddle = distributeMiddleShots(grouped.middle, middleSegmentCount);

  // Build SegmentContext for each segment
  const contexts = [];
  let middleIndex = 0;

  for (let i = 0; i < totalSegments; i++) {
    const segment = segments[i];
    const phase = getPhaseForSegment(i, totalSegments);

    let shots;
    if (phase === "hook") {
      // First segment gets all hook shots
      // If no hook shots, include first part of middle shots
      shots = grouped.hook.length > 0
        ? grouped.hook
        : grouped.middle.slice(0, Math.ceil(grouped.middle.length / totalSegments));
    } else if (phase === "cta") {
      // Last segment gets all CTA shots
      // If no CTA shots, include last part of middle shots
      shots = grouped.cta.length > 0
        ? grouped.cta
        : grouped.middle.slice(-Math.ceil(grouped.middle.length / totalSegments));
    } else {
      // Middle segments get distributed middle shots
      shots = distributedMiddle[middleIndex] ?? [];
      middleIndex++;
    }

    contexts.push({
      segmentIndex: i,
      totalSegments,
      phase,
      shots,
      durationSeconds: segment.seconds ?? 8,
    });
  }

  return contexts;
}

/**
 * Creates a short text summary of shots for recap purposes.
 * Used in extension prompts to summarize what happened in previous segments.
 *
 * @param {StoryboardShot[]} shots - Shots to summarize
 * @param {number} [maxLength=150] - Maximum summary length
 * @returns {string}
 */
export function summarizeShots(shots, maxLength = 150) {
  if (!shots || shots.length === 0) {
    return "";
  }

  // Take key visual descriptions from shots
  const visuals = shots
    .map((s) => s.visual)
    .filter((v) => v && typeof v === "string")
    .slice(0, 3); // Max 3 visuals for recap

  if (visuals.length === 0) {
    return "";
  }

  // Create a concise summary
  const joined = visuals.join("; ");
  if (joined.length <= maxLength) {
    return joined;
  }

  // Truncate if too long
  return joined.slice(0, maxLength - 3) + "...";
}

/**
 * Formats shots for inclusion in a Veo prompt.
 * Each shot is formatted with phase, visual, text overlay, and voiceover.
 *
 * @param {StoryboardShot[]} shots - Shots to format
 * @returns {string}
 */
export function formatShotsForPrompt(shots) {
  if (!shots || shots.length === 0) {
    return "Continue the narrative naturally.";
  }

  return shots
    .map((shot, index) => {
      const parts = [];
      parts.push(`Shot ${index + 1} (${shot.phase ?? shot.normalizedPhase ?? "content"}):`);

      if (shot.visual) {
        parts.push(`  Visual: ${shot.visual}`);
      }

      if (shot.onScreenText) {
        parts.push(`  Text: ${shot.onScreenText}`);
      }

      if (shot.voiceOver) {
        parts.push(`  VO: ${shot.voiceOver}`);
      }

      return parts.join("\n");
    })
    .join("\n\n");
}
