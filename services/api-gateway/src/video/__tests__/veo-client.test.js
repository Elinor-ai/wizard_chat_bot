import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { VeoClient } from "../veo-client.js";

const PROJECT_ENV_KEYS = ["GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT", "GOOGLE_PROJECT_ID", "GCP_PROJECT"];

function createQuotaMock() {
  return {
    noteAttempt: vi.fn().mockReturnValue({ perMinCount: 0 }),
    noteSuccess: vi.fn().mockReturnValue({ perMinCount: 0 }),
    noteFailure: vi.fn().mockReturnValue({ perMinCount: 0 }),
    note429: vi.fn().mockReturnValue({ perMinCount: 0 }),
    getSnapshot: vi.fn().mockReturnValue({
      perMinCount: 0,
      last429At: null,
      inFlight: 0,
      softLimit: 1,
      warn: false
    })
  };
}

function createAuthStub({ projectId = "test-project", token = "stub-token" } = {}) {
  const client = {
    getAccessToken: vi.fn().mockResolvedValue(token),
    credentials: { expiry_date: Date.now() + 3600000 }
  };
  return {
    getProjectId: vi.fn().mockResolvedValue(projectId),
    getClient: vi.fn().mockResolvedValue(client)
  };
}

function createLoggerStub() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

describe("VeoClient", () => {
  let quotaMock;
  let authStub;
  let logger;
  let originalProjectEnv;

  beforeEach(() => {
    originalProjectEnv = {};
    for (const key of PROJECT_ENV_KEYS) {
      originalProjectEnv[key] = process.env[key];
      delete process.env[key];
    }
    quotaMock = createQuotaMock();
    authStub = createAuthStub();
    logger = createLoggerStub();
  });

  afterEach(() => {
    for (const key of PROJECT_ENV_KEYS) {
      if (typeof originalProjectEnv[key] === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = originalProjectEnv[key];
      }
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("builds the Vertex predict URL and attaches bearer token", async () => {
    const fetchSpy = vi.fn(async (url, options) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          predictions: [{ uri: "https://vertex.example/video.mp4" }]
        })
      };
    });

    const client = new VeoClient({
      auth: authStub,
      quotaMeter: quotaMock,
      logger,
      fetchFn: fetchSpy,
      minSpacingMs: 0
    });

    const { clip } = await client.generateVideo({ prompt: "Test prompt", aspectRatio: "9:16", resolution: "720p" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/publishers/google/models/veo-3.1-generate-preview:predict"
    );
    expect(options.headers.Authorization).toBe("Bearer stub-token");
    expect(clip.videoUrl).toBe("https://vertex.example/video.mp4");
  });

  it("returns metadata when only inline bytes are present", async () => {
    const inlineBuffer = Buffer.from("video");
    const inlineBytes = inlineBuffer.toString("base64");
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        predictions: [{ bytesBase64Encoded: inlineBytes }]
      })
    }));
    const client = new VeoClient({
      auth: authStub,
      quotaMeter: quotaMock,
      logger,
      fetchFn: fetchSpy,
      minSpacingMs: 0
    });

    const { clip } = await client.generateVideo({ prompt: "bytes only" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(clip.videoUrl).toBeNull();
    expect(clip.inlineVideos).toHaveLength(1);
    expect(clip.inlineVideos[0].buffer.equals(inlineBuffer)).toBe(true);
  });

  it("retries once on HTTP 429 responses", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => ""
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          predictions: [{ uri: "https://vertex.example/retry.mp4" }]
        })
      });

    const client = new VeoClient({
      auth: authStub,
      quotaMeter: quotaMock,
      logger,
      fetchFn: fetchSpy,
      minSpacingMs: 0
    });

    const renderPromise = client.generateVideo({ prompt: "retry please" });
    await vi.advanceTimersByTimeAsync(20000);
    const { clip } = await renderPromise;

    randomSpy.mockRestore();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(quotaMock.note429).toHaveBeenCalledTimes(1);
    expect(quotaMock.noteSuccess).toHaveBeenCalledTimes(1);
    expect(clip.videoUrl).toBe("https://vertex.example/retry.mp4");
  }, 30000);

  it("throws a descriptive error on non-429 failures", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => "internal error"
    }));
    const client = new VeoClient({
      auth: authStub,
      quotaMeter: quotaMock,
      logger,
      fetchFn: fetchSpy,
      minSpacingMs: 0
    });

    await expect(client.generateVideo({ prompt: "fail me" })).rejects.toMatchObject({
      message: expect.stringContaining("Vertex predict failed (500)"),
      code: "veo_http_error"
    });
    expect(quotaMock.noteFailure).toHaveBeenCalled();
  });

  it("enforces minimum spacing between preview requests", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        predictions: [{ uri: "https://vertex.example/video.mp4" }]
      })
    }));
    const client = new VeoClient({
      auth: authStub,
      quotaMeter: quotaMock,
      logger,
      fetchFn: fetchSpy,
      minSpacingMs: 50
    });

    const first = client.generateVideo({ prompt: "first" });
    await vi.advanceTimersByTimeAsync(0);
    await first;

    const second = client.generateVideo({ prompt: "second" });
    await vi.advanceTimersByTimeAsync(40);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10);
    await second;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns operation names when Vertex responds with an LRO handle", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ name: "operations/vertex-test" })
    }));
    const client = new VeoClient({
      auth: authStub,
      quotaMeter: quotaMock,
      logger,
      fetchFn: fetchSpy,
      minSpacingMs: 0
    });
    const result = await client.generateVideo({ prompt: "Long running" });
    expect(result).toEqual({ operationName: "operations/vertex-test" });
  });

  it("fetches an operation until done", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ done: false })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          done: true,
          response: { predictions: [{ uri: "https://vertex.example/ready.mp4" }] }
        })
      });
    const client = new VeoClient({
      auth: authStub,
      quotaMeter: quotaMock,
      logger,
      fetchFn: fetchSpy,
      minSpacingMs: 0
    });
    const pending = await client.fetchPredictOperation("operations/xyz");
    expect(pending).toEqual({ done: false, status: "pending" });
    const ready = await client.fetchPredictOperation("operations/xyz");
    expect(ready.done).toBe(true);
    expect(ready.clip.videoUrl).toBe("https://vertex.example/ready.mp4");
  });
});
