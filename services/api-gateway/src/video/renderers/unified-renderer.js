import { VeoClient } from "./clients/veo-client.js";
import { SoraClient } from "./clients/sora-client.js";
import { VideoRendererError } from "./contracts.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class UnifiedVideoRenderer {
  constructor(options = {}) {
    const veoKey = options.veoApiKey ?? process.env.GEMINI_API_KEY ?? null;
    const soraToken =
      options.soraApiToken ??
      process.env.SORA_API_TOKEN ??
      "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";
    this.clients = {
      veo: new VeoClient({ apiKey: veoKey }),
      sora: new SoraClient({ apiToken: soraToken }),
    };
    this.pollIntervalMs = Number(process.env.RENDER_POLL_INTERVAL_MS ?? 2000);
    this.pollTimeoutMs = Number(process.env.RENDER_POLL_TIMEOUT_MS ?? 240000);
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

  async renderVideo(provider, request) {
    const { client, key } = this.selectClient(provider);
    console.log(`[Renderer] Starting generation with ${key}...`); // LOG

    const start = await client.startGeneration(request);
    if (!start?.id) {
      throw new VideoRendererError("Provider did not return an operation id", {
        code: "PROVIDER_ERROR",
        context: { provider: key },
      });
    }

    console.log(`[Renderer] Job started. ID: ${start.id}`); // LOG

    const deadline = Date.now() + this.pollTimeoutMs;
    let status = start;

    while (Date.now() < deadline) {
      await sleep(this.pollIntervalMs);

      try {
        status = await client.checkStatus(status.id ?? start.id);

        if (status.status === "completed" || status.status === "failed") {
          console.log(
            `[Renderer] Status update from ${key}:`,
            JSON.stringify(status)
          );
        }

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
          console.log(`[Renderer] Success! Video URL: ${status.videoUrl}`);
          return status.videoUrl;
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
}
