import { VeoClient } from "./clients/veo-client.js";
import { SoraClient } from "./clients/sora-client.js";
import { VideoRendererError } from "./contracts.js";
import { persistRemoteVideo } from "../storage.js";
import { logRawTraffic } from "../../llm/raw-traffic-logger.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class UnifiedVideoRenderer {
  constructor(options = {}) {
    const veoKey = options.veoApiKey ?? process.env.GEMINI_API_KEY ?? null;
    const soraToken =
      options.soraApiToken ?? process.env.SORA_API_TOKEN ?? null;
    this.clients = {
      veo: new VeoClient({ apiKey: veoKey }),
      sora: new SoraClient({ apiToken: soraToken }),
    };
    this.pollIntervalMs = Number(process.env.RENDER_POLL_INTERVAL_MS ?? 2000);
    // Default timeout bumped to 10 minutes to accommodate slower providers
    this.pollTimeoutMs = Number(process.env.RENDER_POLL_TIMEOUT_MS ?? 600000);
    this.logger = options.logger ?? console;
  }

  selectClient(provider) {
    const key = String(provider || "")?.toLowerCase();
    const client = this.clients[key];
    if (!client) {
      throw new VideoRendererError(`Unknown video provider: ${provider}`, {
        code: "INVALID_PROVIDER",
      });
    }
    return { client, key };
  }

  async renderVideo(provider, request, context = {}) {
    const { client, key } = this.selectClient(provider);
    const trafficContext = {
      provider: key,
      jobId: context.jobId,
      itemId: context.itemId,
      ownerUserId: context.ownerUserId,
      manifestVersion: context.manifestVersion,
    };

    this.logger?.info?.(
      { provider: key, aspectRatio: request.aspectRatio, duration: request.duration, jobId: context.jobId, itemId: context.itemId },
      "[Renderer] Starting generation"
    );

    try {
      await logRawTraffic({
        taskId: "video_render",
        direction: "REQUEST",
        payload: { provider: key, request, context: trafficContext },
      });
    } catch (err) {
      this.logger?.debug?.({ err, provider: key }, "[Renderer] Failed to log video_render request");
    }

    const start = await client.startGeneration(request);
    if (!start?.id) {
      throw new VideoRendererError("Provider did not return an operation id", {
        code: "PROVIDER_ERROR",
        context: { provider: key },
      });
    }

    this.logger?.info?.(
      { provider: key, jobId: context.jobId, itemId: context.itemId, opId: start.id },
      "[Renderer] Job started"
    );

    try {
      await logRawTraffic({
        taskId: "video_render",
        direction: "RESPONSE",
        payload: { provider: key, response: start, context: trafficContext },
      });
    } catch (err) {
      this.logger?.debug?.({ err, provider: key }, "[Renderer] Failed to log video_render response");
    }

    const deadline = Date.now() + this.pollTimeoutMs;
    let status = start;

    while (Date.now() < deadline) {
      await sleep(this.pollIntervalMs);

      try {
        status = await client.checkStatus(status.id ?? start.id);

        this.logger?.debug?.(
          { provider: key, status: status.status, opId: status.id, jobId: context.jobId, itemId: context.itemId, videoUrl: status.videoUrl },
          "[Renderer] Poll status"
        );

        if (status.status === "completed") {
          if (!status.videoUrl) {
            throw new VideoRendererError(
              "Provider completed without a video URL",
              {
                code: "PROVIDER_ERROR",
                context: { provider: key, rawStatus: status },
              }
            );
          }
          let finalUrl = status.videoUrl;
          if (key === "sora") {
            finalUrl = await this.persistSoraVideo({
              client,
              videoUrl: status.videoUrl,
              context,
            });
          }
          this.logger?.info?.(
            { provider: key, opId: status.id, jobId: context.jobId, itemId: context.itemId, videoUrl: finalUrl },
            "[Renderer] Success"
          );
          return finalUrl;
        }

        if (status.status === "failed") {
          const errorMessage =
            status.error?.message ?? "Video generation failed";
          this.logger?.error?.(
            { provider: key, opId: status.id, jobId: context.jobId, itemId: context.itemId, error: status.error },
            "[Renderer] Failed"
          );
          throw new VideoRendererError(errorMessage, {
            code: "PROVIDER_ERROR",
            context: { provider: key, details: status.error },
          });
        }
      } catch (err) {
        if (err instanceof VideoRendererError) throw err;

        this.logger?.error?.(
          { err, provider: key, jobId: context.jobId, itemId: context.itemId },
          "[Renderer] Error during polling"
        );
        throw new VideoRendererError(err.message || "Polling failed", {
          code: "PROVIDER_ERROR",
          context: { provider: key },
        });
      }
    }

    this.logger?.error?.(
      { provider: key, jobId: context.jobId, itemId: context.itemId },
      "[Renderer] Timeout"
    );
    throw new VideoRendererError("Video generation timed out", {
      code: "TIMEOUT",
      context: { provider: key },
    });
  }

  async persistSoraVideo({ client, videoUrl, context }) {
    try {
      const headers =
        client?.apiToken && typeof client.apiToken === "string"
          ? { Authorization: `Bearer ${client.apiToken}` }
          : undefined;
      const persisted = await persistRemoteVideo({
        sourceUrl: videoUrl,
        jobId: context.jobId ?? context.itemId ?? context.ownerUserId ?? null,
        provider: "sora",
        headers,
        logger: this.logger,
      });
      if (!persisted?.videoUrl) {
        throw new Error("Video persistence did not return a URL");
      }
      return persisted.videoUrl;
    } catch (error) {
      this.logger?.error?.(
        { err: error, provider: "sora", jobId: context.jobId },
        "Failed to persist Sora video output"
      );
      if (error instanceof VideoRendererError) {
        throw error;
      }
      throw new VideoRendererError(error.message ?? "Failed to persist video", {
        code: "PERSISTENCE_ERROR",
        context: { provider: "sora" },
      });
    }
  }
}
