import { VeoClient } from "./clients/veo-client.js";
import { SoraClient } from "./clients/sora-client.js";
import { VideoRendererError } from "./contracts.js";
import { persistRemoteVideo } from "../storage.js";

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
    this.pollTimeoutMs = Number(process.env.RENDER_POLL_TIMEOUT_MS ?? 240000);
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
    console.log(`[Renderer] Starting generation with ${key}...`);

    const start = await client.startGeneration(request);
    if (!start?.id) {
      throw new VideoRendererError("Provider did not return an operation id", {
        code: "PROVIDER_ERROR",
        context: { provider: key },
      });
    }

    console.log(`[Renderer] Job started. ID: ${start.id}`);

    const deadline = Date.now() + this.pollTimeoutMs;
    let status = start;

    while (Date.now() < deadline) {
      await sleep(this.pollIntervalMs);

      try {
        // בדיקת סטטוס
        status = await client.checkStatus(status.id ?? start.id);

        // לוג קריטי - בוא נראה מה חוזר מהקלאיינט
        if (status.status === "completed" || status.status === "failed") {
          console.log(
            `[Renderer] Status update from ${key}:`,
            JSON.stringify(status)
          );
        }

        if (status.status === "completed") {
          if (!status.videoUrl) {
            // אם זה הושלם אבל אין URL, זו שגיאה
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
          console.log(`[Renderer] Success! Video URL: ${finalUrl}`);
          return finalUrl;
        }

        if (status.status === "failed") {
          const errorMessage =
            status.error?.message ?? "Video generation failed";
          console.error(`[Renderer] Failed: ${errorMessage}`);
          throw new VideoRendererError(errorMessage, {
            code: "PROVIDER_ERROR",
            context: { provider: key, details: status.error },
          });
        }
      } catch (err) {
        // תופס שגיאות שקרו תוך כדי הבדיקה כדי לא להקריס את הכל
        // אם השגיאה היא כבר מסוג VideoRendererError, זרוק אותה הלאה
        if (err instanceof VideoRendererError) throw err;

        console.error(`[Renderer] Error during polling:`, err);
        throw new VideoRendererError(err.message || "Polling failed", {
          code: "PROVIDER_ERROR",
          context: { provider: key },
        });
      }
    }

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
