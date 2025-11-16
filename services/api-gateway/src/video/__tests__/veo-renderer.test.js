import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mockClient = {
  isConfigured: vi.fn(),
  generateVideo: vi.fn(),
  fetchPredictOperation: vi.fn()
};

vi.mock("../veo-client.js", () => ({
  VeoClient: class {
    constructor() {
      return mockClient;
    }
  }
}));

const OUTPUT_DIR = join(tmpdir(), "vertex-veo-tests");
const originalOutputDirEnv = process.env.VIDEO_RENDER_OUTPUT_DIR;
process.env.VIDEO_RENDER_OUTPUT_DIR = OUTPUT_DIR;

const { createVeoRenderer } = await import("../veo-renderer.js");

function buildManifest(overrides = {}) {
  return {
    manifestId: "manifest-123",
    version: 1,
    channelName: "Wizard Channel",
    channelId: "tiktok",
    placementName: "feed",
    manifest: {},
    generator: {
      targetDurationSeconds: 15,
      plannedExtends: 0,
      ...overrides.generator
    },
    spec: {
      aspectRatio: "9:16",
      resolution: "1080x1920",
      displayTextStrategy: "supers",
      ...overrides.spec
    },
    storyboard: [
      {
        phase: "HOOK",
        visual: "People collaborating",
        onScreenText: "Join us",
        voiceOver: "Grow your career",
        durationSeconds: 4
      }
    ],
    caption: {
      text: "Apply today",
      hashtags: ["jobs"]
    },
    job: {
      title: "Designer",
      geo: "Austin",
      payRange: "$80k",
      benefits: []
    },
    compliance: {
      qaChecklist: [],
      flags: []
    },
    ...overrides
  };
}

describe("createVeoRenderer", () => {
  let originalFetch;
  let logger;
  let dateSpy;

  beforeEach(async () => {
    await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    originalFetch = global.fetch;
    global.fetch = vi.fn();
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    mockClient.isConfigured.mockReset();
    mockClient.isConfigured.mockReturnValue(true);
    mockClient.generateVideo.mockReset();
    mockClient.fetchPredictOperation.mockReset();
    dateSpy = vi.spyOn(Date, "now").mockReturnValue(1700000000000);
  });

  afterEach(async () => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
    dateSpy.mockRestore();
  });

  afterAll(async () => {
    process.env.VIDEO_RENDER_OUTPUT_DIR = originalOutputDirEnv;
    await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  });

  it("saves rendered assets from a downloadable URI", async () => {
    const videoBuffer = Buffer.from("vertex-uri-video");
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => videoBuffer
    });
    mockClient.generateVideo.mockResolvedValue({
      clip: {
        clipId: "clip-1",
        videoUrl: "https://vertex.example/video.mp4",
        posterUrl: null,
        durationSeconds: 8,
        metadata: {}
      }
    });

    const renderer = createVeoRenderer({ logger });
    const manifest = buildManifest();
    const result = await renderer.render({ manifest, tier: "standard", item: { veo: null, renderTask: null } });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const savedVideo = await fs.readFile(join(OUTPUT_DIR, "manifest-123-1700000000000.mp4"));
    expect(savedVideo.equals(videoBuffer)).toBe(true);
    expect(result.renderTask.result.videoUrl).toBe("http://localhost:4000/video-assets/manifest-123-1700000000000.mp4");
    expect(result.renderTask.result.qa.notes[0]).toContain("vertex-preview");
    expect(result.veo.status).toBe("ready");
  });

  it("materializes inline bytes when no video URL is provided", async () => {
    const inlineBuffer = Buffer.from("vertex-inline-video");
    global.fetch.mockImplementation(() => {
      throw new Error("fetch should not be called for inline bytes");
    });
    mockClient.generateVideo.mockResolvedValue({
      clip: {
        clipId: null,
        videoUrl: null,
        posterUrl: null,
        durationSeconds: 8,
        metadata: {
          predictions: [
            {
              bytesBase64Encoded: inlineBuffer.toString("base64")
            }
          ]
        }
      }
    });

    const renderer = createVeoRenderer({ logger });
    const manifest = buildManifest();
    const result = await renderer.render({ manifest, tier: "standard", item: { veo: null, renderTask: null } });

    expect(global.fetch).not.toHaveBeenCalled();
    const savedVideo = await fs.readFile(join(OUTPUT_DIR, "manifest-123-1700000000000.mp4"));
    expect(savedVideo.equals(inlineBuffer)).toBe(true);
    expect(result.renderTask.result.qa.notes[0]).toContain("vertex-preview");
  });

  it("returns pending state when Vertex hands back an operation handle", async () => {
    mockClient.generateVideo.mockResolvedValue({
      operationName: "operations/123"
    });
    const renderer = createVeoRenderer({ logger });
    const manifest = buildManifest();
    const result = await renderer.render({ manifest, tier: "standard", item: { veo: null, renderTask: null } });
    expect(result.httpStatus).toBe(202);
    expect(result.veo.operationName).toBe("operations/123");
    expect(result.veo.status).toBe("predicting");
    expect(result.renderTask.status).toBe("rendering");
  });

  it("resumes a pending operation and saves the clip", async () => {
    const videoBuffer = Buffer.from("vertex-op-video");
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => videoBuffer
    });
    mockClient.generateVideo.mockResolvedValue({
      clip: {
        clipId: "unused",
        videoUrl: "https://vertex.example/unused.mp4",
        metadata: {}
      }
    });
    mockClient.fetchPredictOperation.mockResolvedValue({
      done: true,
      clip: {
        clipId: "clip-op",
        videoUrl: "https://vertex.example/video.mp4",
        metadata: {}
      }
    });
    const renderer = createVeoRenderer({ logger });
    const manifest = buildManifest();
    const result = await renderer.render({
      manifest,
      tier: "standard",
      item: {
        veo: {
          operationName: "operations/abc",
          status: "predicting",
          attempts: 0,
          lastFetchAt: null,
          hash: null
        },
        renderTask: null
      }
    });
    expect(mockClient.fetchPredictOperation).toHaveBeenCalledWith("operations/abc");
    expect(mockClient.generateVideo).not.toHaveBeenCalled();
    expect(result.veo.status).toBe("ready");
    const savedVideo = await fs.readFile(join(OUTPUT_DIR, "manifest-123-1700000000000.mp4"));
    expect(savedVideo.equals(videoBuffer)).toBe(true);
  });
});
