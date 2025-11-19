import axios from "axios";
import { GoogleAuth } from "google-auth-library";
import { IVideoClient, VideoRendererError } from "../contracts.js";

export class VeoClient extends IVideoClient {
  constructor({
    location = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1",
    projectId = process.env.FIRESTORE_PROJECT_ID,
    modelId = process.env.VIDEO_MODEL ?? "veo-001-mp4",
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
    if (!accessToken?.token) {
      throw new VideoRendererError(
        "Missing access token for Google Vertex AI",
        {
          code: "AUTH_ERROR",
          context: { provider: "veo" },
        }
      );
    }
    return {
      Authorization: `Bearer ${accessToken.token}`,
      "Content-Type": "application/json",
    };
  }

  buildPredictUrl() {
    if (!this.projectId) {
      throw new VideoRendererError("GOOGLE_CLOUD_PROJECT_ID is required", {
        code: "CONFIGURATION_ERROR",
        context: { provider: "veo" },
      });
    }
    return `${this.baseUrl}/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.modelId}:predict`;
  }

  async startGeneration(request) {
    try {
      const headers = await this._getAuthHeaders();
      const payload = {
        instances: [
          {
            prompt: request.prompt,
          },
        ],
        parameters: {},
      };
      if (request.aspectRatio) {
        payload.parameters.aspectRatio = request.aspectRatio;
      }

      const response = await axios.post(this.buildPredictUrl(), payload, {
        headers,
      });

      return {
        id: response.data?.name,
        status: "pending",
      };
    } catch (error) {
      this._handleError(error);
    }
  }

  async checkStatus(operationName) {
    if (!operationName) {
      throw new VideoRendererError("Operation name is required", {
        code: "INVALID_REQUEST",
        context: { provider: "veo" },
      });
    }
    try {
      const headers = await this._getAuthHeaders();
      const url = operationName.startsWith("projects/")
        ? `${this.baseUrl}/${operationName}`
        : `${this.baseUrl}/${operationName.replace(/^\/+/, "")}`;
      const response = await axios.get(url, { headers });
      const data = response.data ?? {};
      if (!data.done) {
        return {
          id: operationName,
          status: "pending",
        };
      }

      const videoUrl =
        data.response?.videoUri ??
        data.metadata?.outputUri ??
        data.response?.generatedVideo?.uri ??
        null;

      const status = videoUrl ? "completed" : "failed";
      return {
        id: operationName,
        status,
        videoUrl,
        error:
          status === "failed"
            ? new Error("Vertex AI response missing video URL")
            : null,
      };
    } catch (error) {
      this._handleError(error);
    }
  }

  _handleError(error) {
    const responseData = error?.response?.data;
    const statusCode = error?.response?.status ?? null;

    if (responseData !== undefined) {
      const serialized =
        typeof responseData === "string"
          ? responseData
          : JSON.stringify(responseData, null, 2);
      // eslint-disable-next-line no-console
      console.error("Veo API error response:", serialized);
    }

    let message;
    if (typeof responseData === "string" && responseData.trim().length > 0) {
      message = responseData.trim();
    } else if (responseData?.error?.message) {
      message = responseData.error.message;
    } else if (responseData && typeof responseData === "object") {
      message = JSON.stringify(responseData);
    } else if (error?.message) {
      message = error.message;
    } else {
      message = "Veo request failed";
    }

    throw new VideoRendererError(message, {
      code: "PROVIDER_ERROR",
      context: {
        provider: "veo",
        statusCode,
        details: message,
      },
    });
  }
}
