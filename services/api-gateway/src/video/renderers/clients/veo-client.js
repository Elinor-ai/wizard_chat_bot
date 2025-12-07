import axios from "axios";
import { GoogleAuth } from "google-auth-library";
import { IVideoClient, VideoRendererError } from "../contracts.js";
import fs from "fs";
import path from "path";
import { logRawTraffic } from "../../../llm/raw-traffic-logger.js";
import { LLM_ORCHESTRATOR_TASK } from "../../../config/task-types.js";
import { VIDEO_BEHAVIOR_CONFIG } from "../../../config/llm-config.js";

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
  } catch (e) {
    return null;
  }
  return null;
}

export class VeoClient extends IVideoClient {
  /**
   * @param {Object} options
   * @param {string} [options.modelId] - Veo model ID (should come from VIDEO_RENDER_CONFIG)
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

  async startGeneration(request) {
    try {
      console.log("🚀 Starting Veo generation...");
      const headers = await this._getAuthHeaders();
      const payload = {
        instances: [{ prompt: request.prompt }],
        parameters: { sampleCount: 1 },
      };
      if (request.aspectRatio)
        payload.parameters.aspectRatio = request.aspectRatio;
      if (request.duration)
        payload.parameters.durationSeconds = request.duration.toString();

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
        } catch (_err) {
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
        return {
          id: operationName,
          status: "completed",
          videoUrl: videoData.value,
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

  _handleError(error) {
    const msg =
      error?.response?.data?.error?.message || error?.message || "Veo Error";
    console.error("💥 VEO ERROR:", msg);
    throw new VideoRendererError(msg, {
      code: "PROVIDER_ERROR",
      context: { provider: "veo" },
    });
  }
}
