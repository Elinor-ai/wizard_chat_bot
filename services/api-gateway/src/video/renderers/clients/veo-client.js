import axios from "axios";
import { GoogleAuth } from "google-auth-library";
import { IVideoClient, VideoRendererError } from "../contracts.js";
import fs from "fs";
import path from "path";

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
  constructor({
    location = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1",
    projectId = process.env.FIRESTORE_PROJECT_ID,
    modelId = process.env.VIDEO_MODEL ?? "veo-3.1-generate-preview",
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

      const response = await axios.post(this.buildPredictUrl(), payload, {
        headers,
      });
      console.log("⏳ Generation started. Op ID:", response.data?.name);
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

      if (videoData && videoData.type === "base64") {
        try {
          const outputDir =
            process.env.VIDEO_RENDER_OUTPUT_DIR ?? "./tmp/video-renders";
          const absOutputDir = path.resolve(outputDir);

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
