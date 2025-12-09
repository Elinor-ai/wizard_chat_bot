// ═══════════════════════════════════════════════════════════════════════════════
// SORA (OpenAI Videos API) - Request Types
// Endpoint: POST https://api.openai.com/v1/videos
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sora-specific generation options.
 * These map directly to the OpenAI Videos API create-video request body.
 *
 * @typedef {Object} SoraGenerationOptions
 * @property {"sora-2" | "sora-2-pro"} [model] - Sora model to use. Defaults to config default.
 * @property {"4" | "8" | "12"} [seconds] - Clip duration in seconds. API default is "4".
 * @property {"720x1280" | "1280x720" | "1024x1792" | "1792x1024"} [size] - Output resolution WxH. API default is "720x1280".
 * @property {string} [inputReferenceFileId] - Optional file ID for input reference image (future use).
 */

/**
 * Allowed Sora seconds values
 * @type {readonly ["4", "8", "12"]}
 */
export const SORA_ALLOWED_SECONDS = Object.freeze(["4", "8", "12"]);

/**
 * Allowed Sora size values
 * @type {readonly ["720x1280", "1280x720", "1024x1792", "1792x1024"]}
 */
export const SORA_ALLOWED_SIZES = Object.freeze([
  "720x1280",
  "1280x720",
  "1024x1792",
  "1792x1024",
]);

/**
 * Allowed Sora model values
 * @type {readonly ["sora-2", "sora-2-pro"]}
 */
export const SORA_ALLOWED_MODELS = Object.freeze(["sora-2", "sora-2-pro"]);

// ═══════════════════════════════════════════════════════════════════════════════
// VEO (Google Vertex AI) - Request Types
// Endpoint: POST .../publishers/google/models/MODEL_ID:predictLongRunning
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Veo reference image for style/asset guidance.
 *
 * @typedef {Object} VeoReferenceImage
 * @property {string} [imageBase64] - Base64-encoded image data
 * @property {string} [imageGcsUri] - GCS URI for the image (gs://bucket/path)
 * @property {"asset" | "style"} referenceType - How the image should be used
 */

/**
 * Veo-specific generation options.
 * These map directly to the Veo predictLongRunning request body.
 *
 * @typedef {Object} VeoGenerationOptions
 * @property {"16:9" | "9:16"} [aspectRatio] - Video aspect ratio
 * @property {"optimized" | "lossless"} [compressionQuality] - Output compression quality
 * @property {number} [durationSeconds] - Video duration. Veo 3: 4, 6, or 8 seconds.
 * @property {boolean} [enhancePrompt] - Whether to enhance the prompt (Veo 2 only)
 * @property {boolean} [generateAudio] - Whether to generate audio. REQUIRED for Veo 3.x models.
 * @property {string} [negativePrompt] - Things to avoid in the video
 * @property {"allow_adult" | "dont_allow" | "allow_all"} [personGeneration] - Person generation policy
 * @property {"pad" | "crop"} [resizeMode] - How to handle aspect ratio mismatch (Veo 3 image-to-video)
 * @property {"720p" | "1080p"} [resolution] - Output resolution (Veo 3 only)
 * @property {number} [sampleCount] - Number of videos to generate (1-4)
 * @property {number} [seed] - Random seed for reproducibility (uint32)
 * @property {string} [storageUri] - GCS URI for output storage (gs://bucket/path/)
 *
 * // Future extension fields (image-to-video, video extension, inpainting)
 * @property {string} [imageBase64] - Base64-encoded input image for image-to-video
 * @property {string} [imageGcsUri] - GCS URI for input image
 * @property {string} [lastFrameBase64] - Base64-encoded last frame for video extension
 * @property {string} [lastFrameGcsUri] - GCS URI for last frame
 * @property {string} [videoBase64] - Base64-encoded input video for extension/inpainting
 * @property {string} [videoGcsUri] - GCS URI for input video
 * @property {string} [maskBase64] - Base64-encoded mask for inpainting
 * @property {string} [maskGcsUri] - GCS URI for mask
 * @property {string} [maskMode] - Mask mode for inpainting
 * @property {VeoReferenceImage[]} [referenceImages] - Reference images for style/asset guidance
 */

/**
 * Allowed Veo 3 duration values (in seconds)
 * @type {readonly [4, 6, 8]}
 */
export const VEO3_ALLOWED_DURATIONS = Object.freeze([4, 6, 8]);

/**
 * Allowed Veo aspect ratio values
 * @type {readonly ["16:9", "9:16"]}
 */
export const VEO_ALLOWED_ASPECT_RATIOS = Object.freeze(["16:9", "9:16"]);

/**
 * Allowed Veo resolution values (Veo 3 only)
 * @type {readonly ["720p", "1080p"]}
 */
export const VEO_ALLOWED_RESOLUTIONS = Object.freeze(["720p", "1080p"]);

/**
 * Allowed Veo person generation values
 * @type {readonly ["allow_adult", "dont_allow", "allow_all"]}
 */
export const VEO_ALLOWED_PERSON_GENERATION = Object.freeze([
  "allow_adult",
  "dont_allow",
  "allow_all",
]);

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED PROVIDER OPTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Provider-specific options container.
 * Allows passing Sora and Veo options through the unified pipeline.
 *
 * @typedef {Object} ProviderOptions
 * @property {SoraGenerationOptions} [sora] - Sora-specific options
 * @property {VeoGenerationOptions} [veo] - Veo-specific options
 */

// ═══════════════════════════════════════════════════════════════════════════════
// VIDEO CONFIG (LLM Intent Layer)
// Represents the creative/strategic intent for video generation.
// Currently populated with system defaults; will be LLM-generated in the future.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Allowed length preset values for video configuration.
 * @type {readonly ["short", "medium", "long"]}
 */
export const VIDEO_LENGTH_PRESETS = Object.freeze(["short", "medium", "long"]);

/**
 * VideoConfig represents the creative/strategic intent for video generation.
 * All fields are optional - system will use sensible defaults for any missing values.
 *
 * In the future, a "Video Config LLM" will generate this based on job context.
 * For now, these are populated with system defaults.
 *
 * @typedef {Object} VideoConfig
 * @property {"short" | "medium" | "long"} [lengthPreset] - Desired video length category
 * @property {number} [targetSeconds] - Specific duration target in seconds
 * @property {string | null} [primaryChannelFocus] - Channel the video is primarily optimized for
 * @property {"energetic" | "professional" | "friendly" | string} [tone] - Overall tone/mood
 * @property {boolean} [hasVoiceOver] - Whether the video should include voice-over narration
 * @property {"music_only" | "voiceover_with_music" | "silent" | string} [audioStyle] - Audio approach
 * @property {"native_tiktok" | "polished_corporate" | "cinematic" | string} [visualStyle] - Visual treatment
 * @property {string} [notesForStoryboard] - Free-form guidance for storyboard generation
 */

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER PLAN (Execution Layer)
// Deterministic execution plan derived from VideoConfig + channel specs.
// Tells the renderer exactly how to execute the video generation.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Allowed render strategy values.
 * @type {readonly ["single_shot", "multi_extend", "fallback_shorter"]}
 */
export const RENDER_STRATEGIES = Object.freeze([
  "single_shot",
  "multi_extend",
  "fallback_shorter",
]);

/**
 * A single segment of the render plan.
 * For "single_shot" strategy, there's one segment.
 * For "multi_extend", there's an initial + one or more extend segments.
 *
 * @typedef {Object} RenderSegment
 * @property {"initial" | "extend"} kind - Type of segment
 * @property {number} seconds - Duration of this segment in seconds
 */

/**
 * RenderPlan is the deterministic execution plan for video rendering.
 * Derived from VideoConfig + channel specs + provider constraints.
 *
 * @typedef {Object} RenderPlan
 * @property {"sora" | "veo" | string} provider - Video generation provider
 * @property {string} modelId - Specific model identifier (e.g., "veo-3.1-generate-preview", "sora-2-pro")
 * @property {"single_shot" | "multi_extend" | "fallback_shorter"} strategy - Rendering strategy
 * @property {RenderSegment[]} segments - Ordered list of render segments
 * @property {number} finalPlannedSeconds - Total planned duration (sum of segments)
 * @property {string} [aspectRatio] - Target aspect ratio (e.g., "9:16")
 * @property {string} [resolution] - Target resolution (e.g., "1080x1920")
 */

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED VIDEO GENERATION REQUEST/RESULT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Unified video generation request passed through the render pipeline.
 *
 * @typedef {Object} VideoGenerationRequest
 * @property {string} prompt - The text prompt for video generation
 * @property {number} [duration] - Requested duration in seconds (may be adjusted per provider)
 * @property {string} [aspectRatio] - Requested aspect ratio (e.g., "9:16", "16:9")
 * @property {ProviderOptions} [providerOptions] - Provider-specific overrides
 */

/**
 * Result from a video generation operation.
 *
 * @typedef {Object} VideoGenerationResult
 * @property {string} id - Provider operation/job ID
 * @property {'pending' | 'completed' | 'failed'} status - Current status
 * @property {string | null} [videoUrl] - URL to the generated video (when completed)
 * @property {number | null} [seconds] - Actual duration of generated video
 * @property {Error | null} [error] - Error details (when failed)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

export class VideoRendererError extends Error {
  constructor(message, { code = "UNKNOWN", context = null } = {}) {
    super(message);
    this.name = "VideoRendererError";
    this.code = code;
    this.context = context;
  }
}

export class IVideoClient {
  /**
   * @param {VideoGenerationRequest} _request
   * @returns {Promise<VideoGenerationResult>}
   */
  async startGeneration(_request) {
    throw new Error("startGeneration not implemented");
  }

  /**
   * @param {string} _id
   * @returns {Promise<VideoGenerationResult>}
   */
  async checkStatus(_id) {
    throw new Error("checkStatus not implemented");
  }
}
