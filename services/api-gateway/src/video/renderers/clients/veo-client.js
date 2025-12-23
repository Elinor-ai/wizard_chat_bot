import axios from "axios";
import { GoogleAuth } from "google-auth-library";
import { Storage } from "@google-cloud/storage";
import { execSync } from "child_process";
import {
  IVideoClient,
  VideoRendererError,
  VEO3_ALLOWED_DURATIONS,
  VEO_ALLOWED_ASPECT_RATIOS,
  VEO_ALLOWED_RESOLUTIONS,
  VEO_ALLOWED_PERSON_GENERATION,
} from "../contracts.js";
import fs from "fs";
import path from "path";
import { logRawTraffic } from "../../../llm/raw-traffic-logger.js";
import { LLM_ORCHESTRATOR_TASK } from "../../../config/task-types.js";
import { VIDEO_BEHAVIOR_CONFIG } from "../../../config/llm-config.js";
import {
  summarizeShots,
  formatShotsForPrompt,
} from "../../storyboard-segmentation.js";

// Common ffmpeg paths on macOS/Linux
const FFMPEG_PATHS = [
  "/opt/homebrew/bin/ffmpeg",  // macOS ARM (Apple Silicon)
  "/usr/local/bin/ffmpeg",     // macOS Intel / Homebrew
  "/usr/bin/ffmpeg",           // Linux
  "ffmpeg"                     // Fall back to PATH
];

// Find ffmpeg executable (cached)
let ffmpegPath = null;
let ffmpegChecked = false;

function getFfmpegPath() {
  if (ffmpegChecked) return ffmpegPath;
  ffmpegChecked = true;

  for (const candidate of FFMPEG_PATHS) {
    try {
      execSync(`"${candidate}" -version`, { stdio: "ignore", timeout: 5000 });
      ffmpegPath = candidate;
      console.log(`[Veo] Found ffmpeg at: ${candidate}`);
      return ffmpegPath;
    } catch {
      // Try next path
    }
  }

  console.warn("[Veo] ffmpeg not found in any known location");
  return null;
}

/**
 * Optimizes an MP4 file for web streaming by moving the moov atom to the beginning.
 * This enables browsers to start playing immediately without downloading the entire file.
 * Requires ffmpeg to be installed. If ffmpeg is not available, returns the original path.
 *
 * @param {string} inputPath - Path to the input MP4 file
 * @returns {string} - Path to the optimized file (or original if ffmpeg not available)
 */
function faststartVideo(inputPath) {
  const ffmpeg = getFfmpegPath();
  if (!ffmpeg) {
    console.debug("[Veo] ffmpeg not available, skipping faststart optimization");
    return inputPath;
  }

  try {
    const dir = path.dirname(inputPath);
    const ext = path.extname(inputPath);
    const base = path.basename(inputPath, ext);
    const outputPath = path.join(dir, `${base}_faststart${ext}`);

    // Use ffmpeg to remux with faststart flag (no re-encoding, very fast)
    execSync(
      `"${ffmpeg}" -i "${inputPath}" -c copy -movflags +faststart "${outputPath}" -y`,
      { stdio: "ignore", timeout: 60000 }
    );

    // Replace original with optimized version
    fs.unlinkSync(inputPath);
    fs.renameSync(outputPath, inputPath);

    console.log(`🚀 [Veo] Faststart optimization applied: ${inputPath}`);
    return inputPath;
  } catch (err) {
    console.warn(`[Veo] Faststart optimization failed: ${err.message}`);
    return inputPath;
  }
}

// GCS bucket for video extensions (required by Veo when extending videos)
// Read lazily to ensure loadEnv() has been called before accessing
function getVideoStorageBucket() {
  return process.env.VIDEO_STORAGE_BUCKET ?? "";
}

let gcsStorageClient = null;
function getGcsClient() {
  const bucket = getVideoStorageBucket();
  if (!bucket) return null;
  if (!gcsStorageClient) {
    gcsStorageClient = new Storage();
  }
  return gcsStorageClient;
}

/**
 * Checks if a model ID is a Veo 3.x model.
 * Veo 3 models have different requirements (e.g., generateAudio is required).
 *
 * @param {string} modelId
 * @returns {boolean}
 */
function isVeo3Model(modelId) {
  return modelId?.includes("veo-3") || modelId?.includes("veo3");
}

/**
 * Clamps a duration value to the closest valid Veo 3 duration.
 * Veo 3 only accepts 4, 6, or 8 seconds.
 *
 * @param {number} duration
 * @returns {number}
 */
function clampToVeo3Duration(duration) {
  if (!Number.isFinite(duration) || duration <= 0) {
    return VEO3_ALLOWED_DURATIONS[0]; // Default to 4
  }
  // Find the closest allowed value
  let closest = VEO3_ALLOWED_DURATIONS[0];
  let minDiff = Math.abs(duration - closest);
  for (const val of VEO3_ALLOWED_DURATIONS) {
    const diff = Math.abs(duration - val);
    if (diff < minDiff) {
      minDiff = diff;
      closest = val;
    }
  }
  return closest;
}

/**
 * Recursively searches for video data in a response object.
 * Handles various response formats from Vertex AI.
 *
 * @param {Object} obj
 * @returns {{ type: "url" | "base64", value: string } | null}
 */
function findVideoDataRecursive(obj) {
  try {
    if (!obj) return null;
    if (typeof obj === "string") {
      if (
        obj.startsWith("gs://") ||
        (obj.startsWith("http") && obj.includes("video"))
      )
        return { type: "url", value: obj };
    }
    if (typeof obj === "object" && !Array.isArray(obj)) {
      if (obj.video && typeof obj.video === "string" && obj.video.length > 100)
        return { type: "base64", value: obj.video };
      if (obj.videoBytes && typeof obj.videoBytes === "string")
        return { type: "base64", value: obj.videoBytes };
      if (obj.mimeType === "video/mp4" && obj.bytesBase64Encoded)
        return { type: "base64", value: obj.bytesBase64Encoded };
    }
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = findVideoDataRecursive(item);
        if (found) return found;
      }
    }
    if (typeof obj === "object") {
      for (const key in obj) {
        if (key !== "context") {
          const found = findVideoDataRecursive(obj[key]);
          if (found) return found;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * VeoClient - Google Vertex AI Veo Video Generation API Client
 *
 * API Reference: POST .../publishers/google/models/MODEL_ID:predictLongRunning
 *
 * Request body structure:
 * {
 *   instances: [{
 *     prompt: string,
 *     image?: { bytesBase64Encoded?, gcsUri?, mimeType? },
 *     lastFrame?: { bytesBase64Encoded?, gcsUri?, mimeType? },
 *     video?: { bytesBase64Encoded?, gcsUri?, mimeType? },
 *     mask?: { bytesBase64Encoded?, gcsUri?, mimeType?, maskMode? },
 *     referenceImages?: [{ image: {...}, referenceType: "asset" | "style" }]
 *   }],
 *   parameters: {
 *     aspectRatio?: "16:9" | "9:16",
 *     compressionQuality?: "optimized" | "lossless",
 *     durationSeconds?: number (4|6|8 for Veo 3),
 *     enhancePrompt?: boolean (Veo 2 only),
 *     generateAudio?: boolean (REQUIRED for Veo 3.x),
 *     negativePrompt?: string,
 *     personGeneration?: "allow_adult" | "dont_allow" | "allow_all",
 *     resizeMode?: "pad" | "crop",
 *     resolution?: "720p" | "1080p" (Veo 3 only),
 *     sampleCount?: number (1-4),
 *     seed?: number (uint32),
 *     storageUri?: string (gs://bucket/path/)
 *   }
 * }
 *
 * @extends IVideoClient
 */
export class VeoClient extends IVideoClient {
  /**
   * @param {Object} options
   * @param {string} [options.modelId] - Veo model ID (from VIDEO_RENDER_CONFIG)
   * @param {string} [options.location] - GCP location (defaults to env or "us-central1")
   * @param {string} [options.projectId] - GCP project ID (defaults to env)
   */
  constructor({
    modelId = "veo-3.1-generate-preview",
    location = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1",
    projectId = process.env.FIRESTORE_PROJECT_ID,
  } = {}) {
    super();
    this.auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    this.projectId = projectId;
    this.location = location;
    this.modelId = modelId;
    this.baseUrl = `https://${this.location}-aiplatform.googleapis.com/v1`;
  }

  async _getAuthHeaders() {
    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();
    return {
      Authorization: `Bearer ${accessToken.token}`,
      "Content-Type": "application/json",
    };
  }

  buildPredictUrl() {
    return `${this.baseUrl}/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.modelId}:predictLongRunning`;
  }

  /**
   * Builds the Veo API request payload from the unified request and provider options.
   *
   * Priority order for each field:
   * 1. Explicit providerOptions.veo.* override
   * 2. Mapped value from unified request (aspectRatio, duration)
   * 3. Model-specific defaults (e.g., generateAudio for Veo 3)
   * 4. API default (omit field to use provider default)
   *
   * @param {import('../contracts.js').VideoGenerationRequest} request
   * @returns {Object} - Veo API request payload
   */
  buildPayload(request) {
    const veoOptions = request.providerOptions?.veo ?? {};

    // Required: prompt
    if (!request.prompt || typeof request.prompt !== "string") {
      throw new VideoRendererError("Prompt is required for Veo video generation", {
        code: "INVALID_REQUEST",
      });
    }

    // Build instances array (currently text-to-video only)
    const instance = {
      prompt: request.prompt,
    };

    // TODO: Future extension - image-to-video, video extension, inpainting
    // These fields are accepted but not wired to any UI/logic yet
    if (veoOptions.imageBase64 || veoOptions.imageGcsUri) {
      instance.image = {};
      if (veoOptions.imageBase64) instance.image.bytesBase64Encoded = veoOptions.imageBase64;
      if (veoOptions.imageGcsUri) instance.image.gcsUri = veoOptions.imageGcsUri;
      instance.image.mimeType = "image/png"; // Default, could be parameterized
    }

    if (veoOptions.lastFrameBase64 || veoOptions.lastFrameGcsUri) {
      instance.lastFrame = {};
      if (veoOptions.lastFrameBase64) instance.lastFrame.bytesBase64Encoded = veoOptions.lastFrameBase64;
      if (veoOptions.lastFrameGcsUri) instance.lastFrame.gcsUri = veoOptions.lastFrameGcsUri;
      instance.lastFrame.mimeType = "image/png";
    }

    if (veoOptions.videoBase64 || veoOptions.videoGcsUri) {
      instance.video = {};
      if (veoOptions.videoBase64) instance.video.bytesBase64Encoded = veoOptions.videoBase64;
      if (veoOptions.videoGcsUri) instance.video.gcsUri = veoOptions.videoGcsUri;
      instance.video.mimeType = "video/mp4";
    }

    if (veoOptions.maskBase64 || veoOptions.maskGcsUri) {
      instance.mask = {};
      if (veoOptions.maskBase64) instance.mask.bytesBase64Encoded = veoOptions.maskBase64;
      if (veoOptions.maskGcsUri) instance.mask.gcsUri = veoOptions.maskGcsUri;
      if (veoOptions.maskMode) instance.mask.maskMode = veoOptions.maskMode;
      instance.mask.mimeType = "image/png";
    }

    if (veoOptions.referenceImages && Array.isArray(veoOptions.referenceImages)) {
      instance.referenceImages = veoOptions.referenceImages.map((ref) => ({
        image: {
          ...(ref.imageBase64 ? { bytesBase64Encoded: ref.imageBase64 } : {}),
          ...(ref.imageGcsUri ? { gcsUri: ref.imageGcsUri } : {}),
          mimeType: "image/png",
        },
        referenceType: ref.referenceType,
      }));
    }

    // Build parameters object
    const parameters = {};

    // sampleCount: explicit override or default to 1
    parameters.sampleCount = veoOptions.sampleCount ?? 1;

    // durationSeconds: explicit override → unified request duration → clamp for Veo 3
    // Note: Video extensions have different duration rules (only 7s is allowed)
    let duration = veoOptions.durationSeconds ?? request.duration;
    const isExtensionRequest = Boolean(veoOptions.videoGcsUri);
    if (duration !== undefined && duration !== null) {
      const numDuration = Number(duration);
      if (Number.isFinite(numDuration) && numDuration > 0) {
        if (isExtensionRequest) {
          // Video extensions only support 7 seconds - don't clamp
          parameters.durationSeconds = 7;
          if (numDuration !== 7) {
            console.debug(`[Veo] Extension duration fixed to 7s (requested ${numDuration}s)`);
          }
        } else if (isVeo3Model(this.modelId)) {
          // Veo 3 single-shot only accepts 5, 6, 7, 8 seconds
          const clamped = clampToVeo3Duration(numDuration);
          if (clamped !== numDuration) {
            console.debug(`[Veo] Clamping duration ${numDuration} to ${clamped} for Veo 3 model`);
          }
          parameters.durationSeconds = clamped;
        } else {
          // Veo 2 might have different constraints - pass as-is
          parameters.durationSeconds = numDuration;
        }
      }
    }

    // aspectRatio: explicit override → unified request → omit for API default
    const aspectRatio = veoOptions.aspectRatio ?? request.aspectRatio;
    if (aspectRatio) {
      if (VEO_ALLOWED_ASPECT_RATIOS.includes(aspectRatio)) {
        parameters.aspectRatio = aspectRatio;
      } else {
        // Try to normalize common formats
        const normalized = aspectRatio.trim().toLowerCase();
        if (normalized === "16:9" || normalized === "9:16") {
          parameters.aspectRatio = normalized;
        } else {
          console.warn(`[Veo] Invalid aspectRatio "${aspectRatio}", omitting`);
        }
      }
    }

    // generateAudio: explicit override → default true for Veo 3 (REQUIRED)
    if (veoOptions.generateAudio !== undefined) {
      parameters.generateAudio = Boolean(veoOptions.generateAudio);
    } else if (isVeo3Model(this.modelId)) {
      // Veo 3.x REQUIRES generateAudio field - default to true
      parameters.generateAudio = true;
    }

    // Optional parameters - only include if explicitly provided
    if (veoOptions.compressionQuality) {
      if (["optimized", "lossless"].includes(veoOptions.compressionQuality)) {
        parameters.compressionQuality = veoOptions.compressionQuality;
      }
    }

    if (veoOptions.enhancePrompt !== undefined) {
      // Veo 2 only - include if specified
      parameters.enhancePrompt = Boolean(veoOptions.enhancePrompt);
    }

    if (veoOptions.negativePrompt) {
      parameters.negativePrompt = String(veoOptions.negativePrompt);
    }

    if (veoOptions.personGeneration) {
      if (VEO_ALLOWED_PERSON_GENERATION.includes(veoOptions.personGeneration)) {
        parameters.personGeneration = veoOptions.personGeneration;
      }
    }

    if (veoOptions.resizeMode) {
      if (["pad", "crop"].includes(veoOptions.resizeMode)) {
        parameters.resizeMode = veoOptions.resizeMode;
      }
    }

    if (veoOptions.resolution) {
      if (VEO_ALLOWED_RESOLUTIONS.includes(veoOptions.resolution)) {
        parameters.resolution = veoOptions.resolution;
      }
    }

    if (veoOptions.seed !== undefined) {
      const seedNum = Number(veoOptions.seed);
      if (Number.isInteger(seedNum) && seedNum >= 0 && seedNum <= 4294967295) {
        parameters.seed = seedNum;
      }
    }

    if (veoOptions.storageUri) {
      if (veoOptions.storageUri.startsWith("gs://")) {
        parameters.storageUri = veoOptions.storageUri;
      }
    }

    return {
      instances: [instance],
      parameters,
    };
  }

  /**
   * Starts a Veo video generation job.
   *
   * @param {import('../contracts.js').VideoGenerationRequest} request
   * @returns {Promise<import('../contracts.js').VideoGenerationResult>}
   */
  async startGeneration(request) {
    try {
      console.log("🚀 Starting Veo generation...");
      const headers = await this._getAuthHeaders();
      const payload = this.buildPayload(request);

      // Log request details (excluding prompt/images for privacy)
      console.debug("[Veo] startGeneration request", {
        model: this.modelId,
        parameters: {
          ...payload.parameters,
          // Redact any large fields
        },
        hasImage: !!payload.instances[0]?.image,
        hasLastFrame: !!payload.instances[0]?.lastFrame,
        hasVideo: !!payload.instances[0]?.video,
        hasMask: !!payload.instances[0]?.mask,
        hasReferenceImages: !!payload.instances[0]?.referenceImages?.length,
      });

      try {
        await logRawTraffic({
          taskId: LLM_ORCHESTRATOR_TASK.VIDEO_RENDER,
          direction: "REQUEST",
          providerEndpoint: this.buildPredictUrl(),
          payload: { provider: "veo", payload },
        });
      } catch (err) {
        console.debug("Failed to log Veo request", err);
      }

      const response = await axios.post(this.buildPredictUrl(), payload, {
        headers,
      });
      console.log("⏳ Generation started. Op ID:", response.data?.name);

      try {
        await logRawTraffic({
          taskId: LLM_ORCHESTRATOR_TASK.VIDEO_RENDER,
          direction: "RESPONSE",
          providerEndpoint: this.buildPredictUrl(),
          payload: { provider: "veo", response: response.data },
        });
      } catch (err) {
        console.debug("Failed to log Veo start response", err);
      }

      return { id: response.data?.name, status: "pending" };
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * Checks the status of a Veo video generation job.
   *
   * @param {string} operationName - The operation ID
   * @returns {Promise<import('../contracts.js').VideoGenerationResult>}
   */
  async checkStatus(operationName) {
    if (!operationName)
      throw new VideoRendererError("Op ID required", {
        code: "INVALID_REQUEST",
      });

    try {
      const headers = await this._getAuthHeaders();
      const fetchUrl = `${this.baseUrl}/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.modelId}:fetchPredictOperation`;

      const response = await axios.post(
        fetchUrl,
        { operationName },
        { headers }
      );
      const data = response.data ?? {};

      console.debug("[Veo] checkStatus response", {
        operationName,
        done: data.done,
        hasError: !!data.error,
      });

      if (!data.done) return { id: operationName, status: "pending" };
      if (data.error) throw new Error(data.error.message || "Vertex AI Error");

      const videoData = findVideoDataRecursive(data.response);
      if (data.done) {
        const sanitized = JSON.parse(JSON.stringify(data));
        try {
          const videos = sanitized?.response?.videos;
          if (Array.isArray(videos)) {
            videos.forEach((vid) => {
              if (vid && "bytesBase64Encoded" in vid) {
                delete vid.bytesBase64Encoded;
              }
            });
          }
        } catch {
          // ignore sanitization errors
        }
        try {
          await logRawTraffic({
            taskId: LLM_ORCHESTRATOR_TASK.VIDEO_RENDER,
            direction: "RESPONSE",
            providerEndpoint: fetchUrl,
            payload: { provider: "veo", response: sanitized },
          });
        } catch (err) {
          console.debug("Failed to log Veo completion response", err);
        }
      }

      if (videoData && videoData.type === "base64") {
        try {
          // Output directory is now configured in code (VIDEO_BEHAVIOR_CONFIG), not via .env
          const absOutputDir = path.resolve(VIDEO_BEHAVIOR_CONFIG.outputDir);

          if (!fs.existsSync(absOutputDir)) {
            fs.mkdirSync(absOutputDir, { recursive: true });
          }

          const fileName = `veo_${Date.now()}.mp4`;
          const filePath = path.join(absOutputDir, fileName);

          let base64String = videoData.value;
          if (base64String.includes(","))
            base64String = base64String.split(",")[1];

          fs.writeFileSync(filePath, Buffer.from(base64String, "base64"));

          // Optimize video for web streaming (moves moov atom to start)
          faststartVideo(filePath);

          const finalUrl = `/video-assets/${fileName}`;

          console.log(`✅ SUCCESS! Saved to: ${filePath}`);
          console.log(`🔗 Routing URL: ${finalUrl}`);

          return {
            id: operationName,
            status: "completed",
            videoUrl: finalUrl,
          };
        } catch (writeErr) {
          console.error("❌ FS Error:", writeErr);
          return {
            id: operationName,
            status: "failed",
            error: new Error("Disk write failed"),
          };
        }
      }

      if (videoData && videoData.type === "url") {
        let finalUrl = videoData.value;

        // If URL is a GCS URI (gs://...), download to local storage for frontend playback
        if (finalUrl.startsWith("gs://")) {
          try {
            const client = getGcsClient();
            if (client) {
              // Parse gs://bucket/path format
              const gcsMatch = finalUrl.match(/^gs:\/\/([^/]+)\/(.+)$/);
              if (gcsMatch) {
                const [, bucketName, objectPath] = gcsMatch;
                const bucket = client.bucket(bucketName);

                // If path ends with /, it's a directory - find the video file inside
                let targetPath = objectPath;
                if (objectPath.endsWith("/")) {
                  const [files] = await bucket.getFiles({ prefix: objectPath });
                  const videoFile = files.find(f => f.name.endsWith(".mp4"));
                  if (videoFile) {
                    targetPath = videoFile.name;
                  }
                }

                const file = bucket.file(targetPath);
                const absOutputDir = path.resolve(VIDEO_BEHAVIOR_CONFIG.outputDir);
                if (!fs.existsSync(absOutputDir)) {
                  fs.mkdirSync(absOutputDir, { recursive: true });
                }

                const fileName = `veo_${Date.now()}.mp4`;
                const localPath = path.join(absOutputDir, fileName);

                console.log(`📥 [Video Debug] Downloading from GCS...`);
                console.log(`   GCS URI: ${videoData.value}`);
                console.log(`   Target path: ${targetPath}`);
                console.log(`   Local path: ${localPath}`);

                await file.download({ destination: localPath });

                // Verify file was downloaded
                const stats = fs.statSync(localPath);
                console.log(`📦 [Video Debug] Downloaded file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

                // Optimize video for web streaming (moves moov atom to start)
                console.log(`🔧 [Video Debug] Applying faststart optimization...`);
                faststartVideo(localPath);

                // Verify file still exists after faststart
                const finalStats = fs.statSync(localPath);
                console.log(`📦 [Video Debug] Final file size: ${(finalStats.size / 1024 / 1024).toFixed(2)} MB`);

                finalUrl = `/video-assets/${fileName}`;

                console.log(`☁️  Downloaded from GCS: ${videoData.value}`);
                console.log(`✅ Saved locally: ${localPath}`);
                console.log(`🔗 Routing URL: ${finalUrl}`);
              }
            }
          } catch (downloadErr) {
            console.error("❌ GCS download failed:", downloadErr);
            // Keep the GCS URL as fallback (won't play in browser but at least we have a reference)
          }
        }

        return {
          id: operationName,
          status: "completed",
          videoUrl: finalUrl,
        };
      }

      return {
        id: operationName,
        status: "failed",
        videoUrl: null,
        error: new Error("No video data found"),
      };
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * Handles errors and converts them to VideoRendererError.
   *
   * @param {Error} error
   * @throws {VideoRendererError}
   */
  _handleError(error) {
    const msg =
      error?.response?.data?.error?.message || error?.message || "Veo Error";
    console.error("💥 VEO ERROR:", msg);
    throw new VideoRendererError(msg, {
      code: "PROVIDER_ERROR",
      context: { provider: "veo" },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTI-EXTEND ORCHESTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Polls for operation completion with timeout.
   *
   * @param {string} operationId - The operation ID to poll
   * @param {number} [timeoutMs=600000] - Timeout in milliseconds (default 10 min)
   * @param {number} [intervalMs=3000] - Poll interval in milliseconds
   * @returns {Promise<import('../contracts.js').VideoGenerationResult>}
   */
  async _pollUntilComplete(operationId, timeoutMs = 600000, intervalMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    let status;

    while (Date.now() < deadline) {
      status = await this.checkStatus(operationId);

      if (status.status === "completed") {
        return status;
      }

      if (status.status === "failed") {
        throw new VideoRendererError(
          status.error?.message ?? "Video generation failed",
          { code: "PROVIDER_ERROR", context: { provider: "veo", operationId } }
        );
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new VideoRendererError("Video generation timed out", {
      code: "TIMEOUT",
      context: { provider: "veo", operationId },
    });
  }

  /**
   * Converts a video URL to a local filesystem path.
   *
   * @param {string} videoUrl - Video URL (local path, /video-assets/..., or file://)
   * @returns {string} - Absolute filesystem path
   */
  _resolveVideoPath(videoUrl) {
    if (videoUrl.startsWith("/video-assets/")) {
      const absOutputDir = path.resolve(VIDEO_BEHAVIOR_CONFIG.outputDir);
      const fileName = videoUrl.replace("/video-assets/", "");
      return path.join(absOutputDir, fileName);
    } else if (videoUrl.startsWith("file://")) {
      return new URL(videoUrl).pathname;
    }
    return videoUrl;
  }

  /**
   * Reads video file and returns base64 encoded content.
   *
   * @param {string} videoUrl - Local video URL (e.g., /video-assets/veo_xxx.mp4)
   * @returns {string} - Base64 encoded video data
   */
  _readVideoAsBase64(videoUrl) {
    const filePath = this._resolveVideoPath(videoUrl);

    if (!fs.existsSync(filePath)) {
      throw new VideoRendererError(`Video file not found: ${filePath}`, {
        code: "INVALID_REQUEST",
        context: { provider: "veo", videoUrl },
      });
    }

    const videoBuffer = fs.readFileSync(filePath);
    return videoBuffer.toString("base64");
  }

  /**
   * Uploads a local video file to GCS and returns the GCS URI.
   *
   * @param {string} videoUrl - Local video URL or path
   * @param {string} [prefix="veo-extend"] - Object name prefix
   * @returns {Promise<string>} - GCS URI (gs://bucket/path)
   */
  async _uploadVideoToGcs(videoUrl, prefix = "veo-extend") {
    const client = getGcsClient();
    if (!client) {
      throw new VideoRendererError(
        "VIDEO_STORAGE_BUCKET not configured. GCS is required for video extensions.",
        { code: "CONFIGURATION_ERROR", context: { provider: "veo" } }
      );
    }

    const filePath = this._resolveVideoPath(videoUrl);
    if (!fs.existsSync(filePath)) {
      throw new VideoRendererError(`Video file not found: ${filePath}`, {
        code: "INVALID_REQUEST",
        context: { provider: "veo", videoUrl },
      });
    }

    const bucketName = getVideoStorageBucket();
    const timestamp = Date.now();
    const objectName = `videos/extensions/${prefix}-${timestamp}.mp4`;
    const bucket = client.bucket(bucketName);
    const file = bucket.file(objectName);

    await file.save(fs.readFileSync(filePath), {
      contentType: "video/mp4",
      resumable: false,
    });

    const gcsUri = `gs://${bucketName}/${objectName}`;
    console.log(`☁️  Uploaded video to GCS: ${gcsUri}`);
    return gcsUri;
  }

  /**
   * Generates a unique GCS output URI for video extension.
   *
   * @param {string} [prefix="veo-output"] - Object name prefix
   * @returns {string} - GCS URI directory (gs://bucket/path/)
   */
  _generateGcsOutputUri(prefix = "veo-output") {
    const bucketName = getVideoStorageBucket();
    if (!bucketName) {
      throw new VideoRendererError(
        "VIDEO_STORAGE_BUCKET not configured. GCS is required for video extensions.",
        { code: "CONFIGURATION_ERROR", context: { provider: "veo" } }
      );
    }
    const timestamp = Date.now();
    // Veo requires a directory path (ending with /) for storageUri
    return `gs://${bucketName}/videos/extensions/${prefix}-${timestamp}/`;
  }

  /**
   * Starts a single-shot generation with specific duration.
   * Used internally by generateWithRenderPlan for initial segment.
   *
   * @param {import('../contracts.js').VideoGenerationRequest} request
   * @param {number} durationSeconds - Duration for this segment
   * @returns {Promise<import('../contracts.js').VideoGenerationResult>}
   */
  async _startSingleShotGeneration(request, durationSeconds) {
    // Create a modified request with the specific duration
    const modifiedRequest = {
      ...request,
      duration: durationSeconds,
      providerOptions: {
        ...request.providerOptions,
        veo: {
          ...request.providerOptions?.veo,
          durationSeconds,
        },
      },
    };
    return this.startGeneration(modifiedRequest);
  }

  /**
   * Builds a segment-specific prompt using SegmentContext.
   * Each segment gets focused content based on its phase and assigned shots.
   *
   * @param {string} basePrompt - The original full prompt (contains global context like job/company)
   * @param {number} segmentIndex - 0-based segment index
   * @param {Object[]} segmentContexts - Array of SegmentContext objects
   * @returns {string} - Segment-specific prompt
   */
  _buildSegmentPrompt(basePrompt, segmentIndex, segmentContexts) {
    // Fallback to base prompt if no segment contexts available
    if (!segmentContexts || segmentContexts.length === 0) {
      return basePrompt;
    }

    const context = segmentContexts[segmentIndex];
    if (!context) {
      return basePrompt;
    }

    const totalSegments = context.totalSegments ?? segmentContexts.length;
    const phase = context.phase ?? "middle";
    const shots = context.shots ?? [];
    const isInitial = segmentIndex === 0;
    const isFinal = segmentIndex === totalSegments - 1;

    // Extract global context from base prompt (job title, company, channel info)
    // The base prompt typically starts with "Create a recruiting short-form video for..."
    const globalContextMatch = basePrompt.match(/^(.*?)(?:Storyboard:|$)/s);
    const globalContext = globalContextMatch?.[1]?.trim() ?? basePrompt.split("\n").slice(0, 3).join("\n");

    // Build recap of previous segments (if not initial)
    let recapSection = "";
    if (!isInitial && segmentContexts.length > 1) {
      const previousContexts = segmentContexts.slice(0, segmentIndex);
      const previousShots = previousContexts.flatMap(c => c.shots ?? []);
      const recap = summarizeShots(previousShots, 120);
      if (recap) {
        recapSection = `
[PREVIOUSLY IN THIS VIDEO]
${recap}
`;
      }
    }

    // Build phase-specific guidance
    let phaseGuidance = "";
    if (phase === "hook") {
      phaseGuidance = `
[SEGMENT FOCUS: HOOK / OPENING]
This is the opening segment. Your goal is to:
- Capture attention immediately with a compelling visual hook
- Establish the brand identity and tone
- Create curiosity that makes viewers want to continue watching
- Set up the narrative arc for what's to come
`;
    } else if (phase === "middle") {
      phaseGuidance = `
[SEGMENT FOCUS: PROOF / BODY]
This is the middle segment. Your goal is to:
- Deepen the story and showcase the opportunity
- Show what it's like to work at the company (culture, team, environment)
- Build credibility and emotional connection
- Maintain viewer engagement through variety and progression
`;
    } else if (phase === "cta") {
      phaseGuidance = `
[SEGMENT FOCUS: CALL TO ACTION / CLOSING]
This is the final segment. Your goal is to:
- Drive toward a clear, compelling call-to-action
- Summarize the key value proposition
- Create urgency and motivation to apply
- End with a strong, memorable conclusion
`;
    }

    // Format shots for this segment
    const shotsSection = shots.length > 0
      ? `
[SHOTS FOR THIS SEGMENT]
${formatShotsForPrompt(shots)}
`
      : "";

    // Build continuation instructions for non-initial segments
    let continuationInstructions = "";
    if (!isInitial) {
      continuationInstructions = `
[CONTINUATION REQUIREMENTS]
This video is a CONTINUATION of an existing video. You MUST:
1. Continue seamlessly from the last frame of the previous video
2. DO NOT restart the scene, narrative, or visual theme
3. DO NOT repeat any content shown in previous segments
4. Progress the story forward with NEW content and visuals
5. Maintain visual and tonal consistency with what came before
`;
    }

    // Build final instructions for last segment
    let finalInstructions = "";
    if (isFinal) {
      finalInstructions = `
[FINAL SEGMENT - IMPORTANT]
This is the FINAL segment of the video:
- Build toward a satisfying conclusion
- End with a strong, clear call-to-action
- Create a sense of completion and urgency
`;
    }

    // Combine all parts into segment-specific prompt
    const segmentPrompt = `${globalContext}

[SEGMENT ${segmentIndex + 1} OF ${totalSegments}] (${context.durationSeconds ?? 8}s)
${phaseGuidance}
${recapSection}${shotsSection}${continuationInstructions}${finalInstructions}`.trim();

    console.log(`📝 [Veo] Built segment-specific prompt for segment ${segmentIndex + 1}/${totalSegments} (phase: ${phase}, shots: ${shots.length})`);

    return segmentPrompt;
  }

  /**
   * Builds a continuation-aware prompt for video extensions.
   * Falls back to generic continuation if no segment contexts available.
   *
   * @param {string} basePrompt - The original full prompt
   * @param {number} stepIndex - Current extension step index (1 for first extension)
   * @param {number} totalSegments - Total number of segments
   * @param {Object[]} [segmentContexts] - Optional segment contexts for segment-aware prompting
   * @returns {string} - Modified prompt with continuation context
   */
  _buildExtensionPrompt(basePrompt, stepIndex, totalSegments, segmentContexts = null) {
    // If segment contexts are available, use segment-specific prompting
    if (segmentContexts && segmentContexts.length > 0) {
      return this._buildSegmentPrompt(basePrompt, stepIndex, segmentContexts);
    }

    // Fallback: generic continuation prompt (legacy behavior)
    const segmentNumber = stepIndex + 1;
    const isFinal = segmentNumber === totalSegments;

    let continuationContext = `

[CONTINUATION INSTRUCTIONS - Segment ${segmentNumber} of ${totalSegments}]
This video is a CONTINUATION of an existing video. You MUST:
1. Continue seamlessly from the last frame of the previous video
2. DO NOT restart the scene, narrative, or visual theme
3. DO NOT repeat any content that was shown in previous segments
4. Progress the story forward - show NEW content, NEW angles, NEW moments
5. Maintain visual and tonal consistency with what came before
`;

    if (isFinal) {
      continuationContext += `
This is the FINAL segment of the video:
- Build toward a clear, satisfying conclusion
- End with a strong call-to-action
- Create a sense of completion
`;
    } else {
      continuationContext += `
This is a MIDDLE segment:
- Continue building the narrative momentum
- Transition smoothly toward the next phase
- Maintain energy and engagement
`;
    }

    return basePrompt + continuationContext;
  }

  /**
   * Starts an extension generation using a previous video.
   * Uses GCS for both input video and output (required by Veo for extensions).
   * Uses segment-specific prompting if segmentContexts are provided.
   *
   * @param {import('../contracts.js').VideoGenerationRequest} request
   * @param {string} previousVideoUrl - URL/path of video to extend (local, GCS, or /video-assets/)
   * @param {number} extendSeconds - Duration to add
   * @param {number} stepIndex - Extension step index (1 for first extension, 2 for second, etc.)
   * @param {number} [totalSegments=3] - Total number of segments in the video
   * @param {Object[]} [segmentContexts=null] - Optional segment contexts for segment-aware prompting
   * @returns {Promise<import('../contracts.js').VideoGenerationResult>}
   */
  async _startExtensionGeneration(request, previousVideoUrl, extendSeconds, stepIndex = 1, totalSegments = 3, segmentContexts = null) {
    console.log(`🔗 Starting Veo extension (+${extendSeconds}s)...`);

    // Determine if video is already in GCS or needs upload
    let videoGcsUri;
    if (previousVideoUrl.startsWith("gs://")) {
      // Already in GCS, use directly
      videoGcsUri = previousVideoUrl;
    } else {
      // Upload local video to GCS (required for extension)
      videoGcsUri = await this._uploadVideoToGcs(previousVideoUrl, `extend-input-${stepIndex}`);
    }

    // Generate output URI for the extended video
    const storageUri = this._generateGcsOutputUri(`extend-output-${stepIndex}`);

    console.log(`📤 Extension input: ${videoGcsUri}`);
    console.log(`📥 Extension output: ${storageUri}`);

    // Build segment-aware or continuation-aware prompt for this extension
    const extensionPrompt = this._buildExtensionPrompt(
      request.prompt,
      stepIndex,
      totalSegments,
      segmentContexts  // Pass segment contexts for segment-specific prompting
    );

    const hasSegmentContext = segmentContexts && segmentContexts[stepIndex];
    console.log(`📝 [Veo] Extension prompt: segment ${stepIndex + 1}/${totalSegments} (segment-aware: ${hasSegmentContext ? "yes" : "no"})`);

    // Build extension request using GCS URIs (much faster than base64)
    const modifiedRequest = {
      ...request,
      prompt: extensionPrompt,  // Use segment-aware or continuation-aware prompt
      duration: extendSeconds,
      providerOptions: {
        ...request.providerOptions,
        veo: {
          ...request.providerOptions?.veo,
          durationSeconds: extendSeconds,
          // Use GCS URI for input video (more efficient than base64)
          videoGcsUri,
          // Output to GCS (required for extensions - inline response too large)
          storageUri,
        },
      },
    };

    return this.startGeneration(modifiedRequest);
  }

  /**
   * Generates video using a RenderPlan with multi-extend support.
   * For multi_extend strategy: performs initial generation + N extension calls.
   * For single_shot/fallback_shorter: performs single generation.
   *
   * @param {import('../contracts.js').VideoGenerationRequest} request - Base request with prompt
   * @param {import('../contracts.js').RenderPlan} renderPlan - Render plan with segments
   * @param {Object[]} [segmentContexts=null] - Optional segment contexts for segment-aware prompting
   * @returns {Promise<import('../contracts.js').VideoGenerationResult>}
   */
  async generateWithRenderPlan(request, renderPlan, segmentContexts = null) {
    // Validate renderPlan
    if (!renderPlan || !renderPlan.segments?.length) {
      console.warn("[Veo] generateWithRenderPlan: Invalid renderPlan, falling back to single shot");
      return this._pollUntilComplete(
        (await this.startGeneration(request)).id
      );
    }

    const segments = renderPlan.segments;
    const strategy = renderPlan.strategy ?? "single_shot";
    const hasSegmentContexts = segmentContexts && segmentContexts.length > 0;

    console.log(`🎬 [Veo] generateWithRenderPlan: strategy=${strategy}, segments=${segments.length}, segmentContexts=${hasSegmentContexts ? segmentContexts.length : 0}`);

    // ═══════════════════════════════════════════════════════════════════════════
    // SINGLE_SHOT / FALLBACK_SHORTER: Just one call
    // ═══════════════════════════════════════════════════════════════════════════
    if (strategy === "single_shot" || strategy === "fallback_shorter") {
      const initialSegment = segments[0];
      const startResult = await this._startSingleShotGeneration(request, initialSegment.seconds);
      return this._pollUntilComplete(startResult.id);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MULTI_EXTEND: Initial generation + N extensions with segment-aware prompting
    // ═══════════════════════════════════════════════════════════════════════════
    if (strategy === "multi_extend") {
      // Check if GCS is available (required for video extensions)
      if (!getGcsClient()) {
        console.warn(
          `⚠️  [Veo] VIDEO_STORAGE_BUCKET not configured. GCS is required for video extensions.`
        );
        console.warn(
          `⚠️  [Veo] Falling back to single-shot (${segments[0].seconds}s) instead of multi_extend (${renderPlan.finalPlannedSeconds}s).`
        );
        const fallbackStart = await this._startSingleShotGeneration(request, segments[0].seconds);
        return this._pollUntilComplete(fallbackStart.id);
      }

      const [initialSegment, ...extendSegments] = segments;
      const totalSegments = segments.length;

      // Step 1: Initial generation with segment-specific prompt (if available)
      console.log(`📹 [Veo] Multi-extend step 1/${totalSegments}: Initial generation (${initialSegment.seconds}s)`);

      // Build segment-specific prompt for initial segment (index 0)
      const initialPrompt = hasSegmentContexts
        ? this._buildSegmentPrompt(request.prompt, 0, segmentContexts)
        : request.prompt;

      const initialRequest = { ...request, prompt: initialPrompt };
      const initialStart = await this._startSingleShotGeneration(initialRequest, initialSegment.seconds);
      let currentResult = await this._pollUntilComplete(initialStart.id);

      if (!currentResult.videoUrl) {
        throw new VideoRendererError("Initial generation completed without video URL", {
          code: "PROVIDER_ERROR",
          context: { provider: "veo", step: "initial" },
        });
      }

      // Step 2+: Extensions with segment-aware prompts
      for (let i = 0; i < extendSegments.length; i++) {
        const segment = extendSegments[i];
        const stepIndex = i + 1; // 1 for first extension, 2 for second, etc.
        console.log(`📹 [Veo] Multi-extend step ${i + 2}/${totalSegments}: Extension (+${segment.seconds}s)`);

        const extendStart = await this._startExtensionGeneration(
          request,
          currentResult.videoUrl,
          segment.seconds,
          stepIndex,
          totalSegments,
          segmentContexts  // Pass segment contexts for segment-specific prompting
        );

        currentResult = await this._pollUntilComplete(extendStart.id);

        if (!currentResult.videoUrl) {
          throw new VideoRendererError(`Extension step ${i + 1} completed without video URL`, {
            code: "PROVIDER_ERROR",
            context: { provider: "veo", step: `extend_${i + 1}` },
          });
        }
      }

      console.log(`✅ [Veo] Multi-extend complete. Final duration: ${renderPlan.finalPlannedSeconds}s`);

      // Return final result with planned duration
      return {
        ...currentResult,
        seconds: renderPlan.finalPlannedSeconds,
      };
    }

    // Unknown strategy - fall back to single shot
    console.warn(`[Veo] Unknown strategy "${strategy}", falling back to single shot`);
    const fallbackStart = await this._startSingleShotGeneration(request, segments[0]?.seconds ?? 8);
    return this._pollUntilComplete(fallbackStart.id);
  }
}
