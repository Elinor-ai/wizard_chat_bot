/**
 * @file gemini-adapter.schema-grounding.test.js
 * Unit tests for Gemini adapter schema + grounding behavior.
 *
 * Verifies:
 * - Tasks with grounding enabled skip controlled generation (responseMimeType + responseJsonSchema)
 * - Tasks without grounding use controlled generation normally
 *
 * Note: Gemini API does not support "controlled generation" (responseMimeType, responseJsonSchema)
 * when Google Search or Maps grounding tools are enabled. See:
 * https://ai.google.dev/gemini-api/docs/grounding
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { LLM_CORE_TASK } from "../config/task-types.js";

// Mock the external dependencies before importing the adapter
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({
        text: JSON.stringify({ test: "response" }),
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
      }),
    },
  })),
}));

vi.mock("../llm/logger.js", () => ({
  llmLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../llm/raw-traffic-logger.js", () => ({
  logRawTraffic: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../llm/utils/schema-converter.js", () => ({
  formatForGemini: vi.fn((schema) => {
    if (!schema) return null;
    return { type: "object", properties: {} };
  }),
}));

// Mock the service account file
vi.mock(
  "node:module",
  async (importOriginal) => {
    const original = await importOriginal();
    return {
      ...original,
      createRequire: () => () => ({ project_id: "test-project" }),
    };
  }
);

describe("GeminiAdapter schema + grounding behavior", () => {
  let GeminiAdapter;
  let llmLogger;
  let formatForGemini;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Dynamic import to ensure mocks are in place
    const adapterModule = await import(
      "../llm/providers/gemini-adapter.js"
    );
    GeminiAdapter = adapterModule.GeminiAdapter;

    const loggerModule = await import("../llm/logger.js");
    llmLogger = loggerModule.llmLogger;

    const schemaModule = await import("../llm/utils/schema-converter.js");
    formatForGemini = schemaModule.formatForGemini;
  });

  const testSchema = z.object({ test: z.string() });

  describe("tasks with grounding enabled", () => {
    // These tasks have grounding tools enabled and should skip controlled generation
    const groundedTasks = [
      { taskType: LLM_CORE_TASK.SUGGEST, schemaName: "suggest_response" },
      { taskType: LLM_CORE_TASK.REFINE, schemaName: "refine_response" },
      { taskType: LLM_CORE_TASK.COPILOT_AGENT, schemaName: "copilot_agent_response" },
      { taskType: LLM_CORE_TASK.VIDEO_STORYBOARD, schemaName: "video_storyboard_response" },
      { taskType: LLM_CORE_TASK.COMPANY_INTEL, schemaName: "company_intel_response" },
    ];

    for (const { taskType, schemaName } of groundedTasks) {
      it(`should skip controlled generation for ${taskType} task (has grounding)`, async () => {
        const adapter = new GeminiAdapter({ location: "global" });

        await adapter.invoke({
          model: "gemini-3-pro-preview",
          system: "You are a helpful assistant.",
          user: "Test prompt",
          mode: "json",
          taskType,
          outputSchema: testSchema,
          outputSchemaName: schemaName,
        });

        // formatForGemini should NOT be called when grounding is enabled
        expect(formatForGemini).not.toHaveBeenCalled();

        // Verify the log shows controlled generation was skipped due to grounding
        expect(llmLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            taskType,
            schemaName,
            hasGroundingTools: true,
            hasResponseMimeType: false,
            hasResponseSchema: false,
            reason: "grounding_blocks_controlled_generation",
          }),
          "GeminiAdapter skipping JSON mode (incompatible with Search/Maps tools)"
        );

        // Should NOT have logged "using native responseJsonSchema"
        const schemaLogCalls = llmLogger.info.mock.calls.filter(
          (call) => call[1] === "GeminiAdapter using native responseJsonSchema"
        );
        expect(schemaLogCalls).toHaveLength(0);
      });
    }
  });

  describe("tasks without grounding", () => {
    it("should use responseJsonSchema for channels task (no grounding)", async () => {
      const adapter = new GeminiAdapter({ location: "global" });

      await adapter.invoke({
        model: "gemini-3-pro-preview",
        system: "You are a helpful assistant.",
        user: "Test prompt",
        mode: "json",
        taskType: LLM_CORE_TASK.CHANNELS,
        outputSchema: testSchema,
        outputSchemaName: "channels_response",
      });

      expect(formatForGemini).toHaveBeenCalledWith(testSchema);

      expect(llmLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: LLM_CORE_TASK.CHANNELS,
          hasGroundingTools: false,
          hasResponseSchema: true,
        }),
        "GeminiAdapter using native responseJsonSchema"
      );
    });

    it("should use responseJsonSchema for asset_master task (no grounding)", async () => {
      const adapter = new GeminiAdapter({ location: "global" });

      await adapter.invoke({
        model: "gemini-3-pro-preview",
        system: "You are a helpful assistant.",
        user: "Test prompt",
        mode: "json",
        taskType: LLM_CORE_TASK.ASSET_MASTER,
        outputSchema: testSchema,
        outputSchemaName: "asset_master_response",
      });

      expect(formatForGemini).toHaveBeenCalledWith(testSchema);

      expect(llmLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: LLM_CORE_TASK.ASSET_MASTER,
          hasGroundingTools: false,
          hasResponseSchema: true,
        }),
        "GeminiAdapter using native responseJsonSchema"
      );
    });

    it("should use responseJsonSchema for video_caption task (no grounding)", async () => {
      const adapter = new GeminiAdapter({ location: "global" });

      await adapter.invoke({
        model: "gemini-3-pro-preview",
        system: "You are a helpful assistant.",
        user: "Test prompt",
        mode: "json",
        taskType: LLM_CORE_TASK.VIDEO_CAPTION,
        outputSchema: testSchema,
        outputSchemaName: "video_caption_response",
      });

      expect(formatForGemini).toHaveBeenCalledWith(testSchema);

      expect(llmLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: LLM_CORE_TASK.VIDEO_CAPTION,
          hasGroundingTools: false,
          hasResponseSchema: true,
        }),
        "GeminiAdapter using native responseJsonSchema"
      );
    });
  });
});
