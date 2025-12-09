/**
 * @file gemini-adapter.schema-grounding.test.js
 * Unit tests for Gemini adapter schema + grounding behavior.
 *
 * Verifies:
 * - Most JSON tasks get responseJsonSchema even with grounding enabled
 * - Company intel tasks skip responseJsonSchema when grounding is enabled
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

  describe("non-company-intel tasks with grounding", () => {
    it("should use responseJsonSchema for suggest task (has grounding)", async () => {
      const adapter = new GeminiAdapter({ location: "global" });

      await adapter.invoke({
        model: "gemini-3-pro-preview",
        system: "You are a helpful assistant.",
        user: "Test prompt",
        mode: "json",
        taskType: LLM_CORE_TASK.SUGGEST,
        outputSchema: testSchema,
        outputSchemaName: "suggest_response",
      });

      // Verify formatForGemini was called (schema conversion attempted)
      expect(formatForGemini).toHaveBeenCalledWith(testSchema);

      // Verify the log shows schema was used with grounding
      expect(llmLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: LLM_CORE_TASK.SUGGEST,
          hasGroundingTools: true,
          hasResponseSchema: true,
        }),
        "GeminiAdapter using native responseJsonSchema"
      );
    });

    it("should use responseJsonSchema for refine task (has grounding)", async () => {
      const adapter = new GeminiAdapter({ location: "global" });

      await adapter.invoke({
        model: "gemini-3-pro-preview",
        system: "You are a helpful assistant.",
        user: "Test prompt",
        mode: "json",
        taskType: LLM_CORE_TASK.REFINE,
        outputSchema: testSchema,
        outputSchemaName: "refine_response",
      });

      expect(formatForGemini).toHaveBeenCalledWith(testSchema);

      expect(llmLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: LLM_CORE_TASK.REFINE,
          hasGroundingTools: true,
          hasResponseSchema: true,
        }),
        "GeminiAdapter using native responseJsonSchema"
      );
    });

    it("should use responseJsonSchema for copilot_agent task (has grounding)", async () => {
      const adapter = new GeminiAdapter({ location: "global" });

      await adapter.invoke({
        model: "gemini-3-pro-preview",
        system: "You are a helpful assistant.",
        user: "Test prompt",
        mode: "json",
        taskType: LLM_CORE_TASK.COPILOT_AGENT,
        outputSchema: testSchema,
        outputSchemaName: "copilot_agent_response",
      });

      expect(formatForGemini).toHaveBeenCalledWith(testSchema);

      expect(llmLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: LLM_CORE_TASK.COPILOT_AGENT,
          hasGroundingTools: true,
          hasResponseSchema: true,
        }),
        "GeminiAdapter using native responseJsonSchema"
      );
    });

    it("should use responseJsonSchema for video_storyboard task (has grounding)", async () => {
      const adapter = new GeminiAdapter({ location: "global" });

      await adapter.invoke({
        model: "gemini-3-pro-preview",
        system: "You are a helpful assistant.",
        user: "Test prompt",
        mode: "json",
        taskType: LLM_CORE_TASK.VIDEO_STORYBOARD,
        outputSchema: testSchema,
        outputSchemaName: "video_storyboard_response",
      });

      expect(formatForGemini).toHaveBeenCalledWith(testSchema);

      expect(llmLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: LLM_CORE_TASK.VIDEO_STORYBOARD,
          hasGroundingTools: true,
          hasResponseSchema: true,
        }),
        "GeminiAdapter using native responseJsonSchema"
      );
    });
  });

  describe("company intel tasks with grounding", () => {
    it("should NOT use responseJsonSchema for company_intel task (preserves old behavior)", async () => {
      const adapter = new GeminiAdapter({ location: "global" });

      await adapter.invoke({
        model: "gemini-3-pro-preview",
        system: "You are a helpful assistant.",
        user: "Test prompt",
        mode: "json",
        taskType: LLM_CORE_TASK.COMPANY_INTEL,
        outputSchema: testSchema,
        outputSchemaName: "company_intel_response",
      });

      // Verify the log shows schema was skipped due to company intel + grounding
      expect(llmLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: LLM_CORE_TASK.COMPANY_INTEL,
          hasGroundingTools: true,
          hasResponseSchema: false,
          reason: "company_intel_grounding_priority",
        }),
        "GeminiAdapter skipping responseJsonSchema for company intel task with grounding"
      );

      // Should NOT have logged "using native responseJsonSchema"
      const schemaLogCalls = llmLogger.info.mock.calls.filter(
        (call) => call[1] === "GeminiAdapter using native responseJsonSchema"
      );
      expect(schemaLogCalls).toHaveLength(0);
    });
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
  });
});
