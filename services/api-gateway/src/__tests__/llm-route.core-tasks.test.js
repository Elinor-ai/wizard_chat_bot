/**
 * @file llm-route.core-tasks.test.js
 * Integration tests for POST /api/llm core LLM tasks.
 *
 * These tests verify:
 * 1. Happy paths for key task types (suggest, golden_interviewer)
 * 2. Request validation (invalid taskType)
 * 3. Usage logging is invoked correctly
 *
 * Architecture invariant verified:
 * - All LLM calls go through POST /api/llm
 * - recordLlmUsageFromResult is called from the LLM router
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../server.js";
import {
  setupTestEnv,
  createTestToken,
  createMockLogger,
  createMockFirestore,
  createMockBigQuery,
  createMockLlmClient,
  createTestJob,
  TEST_USER_ID,
} from "./test-helpers.js";

// Mock the llm-usage-ledger module to spy on recordLlmUsageFromResult
vi.mock("../services/llm-usage-ledger.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    recordLlmUsageFromResult: vi.fn(async () => {}),
    recordLlmUsage: vi.fn(async () => {}),
  };
});

// Import after mocking
import { recordLlmUsageFromResult } from "../services/llm-usage-ledger.js";

describe("POST /api/llm - Core Tasks", () => {
  let app;
  let mockFirestore;
  let mockBigQuery;
  let mockLlmClient;
  let mockLogger;
  let authToken;

  beforeEach(() => {
    setupTestEnv();

    mockLogger = createMockLogger();
    mockFirestore = createMockFirestore();
    mockBigQuery = createMockBigQuery();
    mockLlmClient = createMockLlmClient();

    // Seed a test job
    mockFirestore._seedDocument("jobs", "job_test_1", createTestJob());

    app = createApp({
      logger: mockLogger,
      firestore: mockFirestore,
      bigQuery: mockBigQuery,
      llmClient: mockLlmClient,
    });

    authToken = createTestToken();

    // Clear mock call history
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockFirestore._clear();
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // HAPPY PATH: taskType = "suggest"
  // ===========================================================================

  describe('taskType = "suggest"', () => {
    it("returns 200 with suggestions result", async () => {
      const response = await request(app)
        .post("/api/llm")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          taskType: "suggest",
          context: {
            jobId: "job_test_1",
            intent: { forceRefresh: true }, // Bypass cache
          },
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("taskType", "suggest");
      expect(response.body).toHaveProperty("result");
    });

    it("calls llmClient.askSuggestions with enriched context", async () => {
      await request(app)
        .post("/api/llm")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          taskType: "suggest",
          context: {
            jobId: "job_test_1",
            intent: { forceRefresh: true }, // Bypass cache
          },
        });

      expect(mockLlmClient.askSuggestions).toHaveBeenCalledTimes(1);
      const callArgs = mockLlmClient.askSuggestions.mock.calls[0][0];
      expect(callArgs).toHaveProperty("jobId", "job_test_1");
    });

    it("records LLM usage after successful invocation", async () => {
      await request(app)
        .post("/api/llm")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          taskType: "suggest",
          context: {
            jobId: "job_test_1",
            intent: { forceRefresh: true }, // Bypass cache
          },
        });

      expect(recordLlmUsageFromResult).toHaveBeenCalled();
      const usageCall = recordLlmUsageFromResult.mock.calls[0][0];
      expect(usageCall).toHaveProperty("usageContext");
      expect(usageCall.usageContext).toHaveProperty("userId", TEST_USER_ID);
      expect(usageCall.usageContext).toHaveProperty("jobId", "job_test_1");
    });
  });

  // ===========================================================================
  // HAPPY PATH: taskType = "golden_interviewer"
  // ===========================================================================

  describe('taskType = "golden_interviewer"', () => {
    it("returns 200 with interview turn result", async () => {
      const response = await request(app)
        .post("/api/llm")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          taskType: "golden_interviewer",
          context: {
            sessionId: "session_test_1",
            currentSchema: {},
            conversationHistory: [],
            isFirstTurn: true,
            turnNumber: 1,
          },
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("taskType", "golden_interviewer");
      expect(response.body).toHaveProperty("result");
      expect(response.body.result).toHaveProperty("message");
    });

    it("calls llmClient.askGoldenInterviewerTurn", async () => {
      await request(app)
        .post("/api/llm")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          taskType: "golden_interviewer",
          context: {
            sessionId: "session_test_1",
            currentSchema: {},
            conversationHistory: [],
            isFirstTurn: true,
            turnNumber: 1,
          },
        });

      expect(mockLlmClient.askGoldenInterviewerTurn).toHaveBeenCalledTimes(1);
    });

    it("records LLM usage after golden_interviewer invocation", async () => {
      await request(app)
        .post("/api/llm")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          taskType: "golden_interviewer",
          context: {
            sessionId: "session_test_1",
            currentSchema: {},
            conversationHistory: [],
            isFirstTurn: true,
            turnNumber: 1,
          },
        });

      expect(recordLlmUsageFromResult).toHaveBeenCalled();
      const usageCall = recordLlmUsageFromResult.mock.calls[0][0];
      expect(usageCall.usageContext).toHaveProperty("taskType", "golden_interviewer");
    });
  });

  // ===========================================================================
  // HAPPY PATH: taskType = "refine"
  // ===========================================================================

  describe('taskType = "refine"', () => {
    it("returns 200 with refinement result", async () => {
      const response = await request(app)
        .post("/api/llm")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          taskType: "refine",
          context: {
            jobId: "job_test_1",
            forceRefresh: true, // Bypass cache
          },
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("taskType", "refine");
      expect(response.body).toHaveProperty("result");
    });
  });

  // ===========================================================================
  // VALIDATION ERRORS
  // ===========================================================================

  describe("validation errors", () => {
    it("returns 400 for invalid taskType (not in allowed list)", async () => {
      const response = await request(app)
        .post("/api/llm")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          taskType: "invalid_task_type_xyz",
          context: {},
        });

      // This goes through Zod but fails the allowedTaskTypes check
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toMatch(/invalid/i);
    });

    it("rejects request with missing taskType", async () => {
      const response = await request(app)
        .post("/api/llm")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          context: { jobId: "job_test_1" },
        });

      // Zod validation failure - status depends on error handler
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(600);
    });

    it("rejects request with empty taskType", async () => {
      const response = await request(app)
        .post("/api/llm")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          taskType: "",
          context: {},
        });

      // Zod min(1) validation failure - status depends on error handler
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(600);
    });
  });

  // ===========================================================================
  // AUTHENTICATION ERRORS
  // ===========================================================================

  describe("authentication errors", () => {
    it("returns 401 when no auth token provided", async () => {
      const response = await request(app)
        .post("/api/llm")
        .send({
          taskType: "suggest",
          context: { jobId: "job_test_1" },
        });

      expect(response.status).toBe(401);
    });

    it("returns 401 for invalid auth token", async () => {
      const response = await request(app)
        .post("/api/llm")
        .set("Authorization", "Bearer invalid_token")
        .send({
          taskType: "suggest",
          context: { jobId: "job_test_1" },
        });

      expect(response.status).toBe(401);
    });
  });

  // ===========================================================================
  // RESPONSE SHAPE VERIFICATION
  // ===========================================================================

  describe("response shape", () => {
    it("always includes taskType in response", async () => {
      const response = await request(app)
        .post("/api/llm")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          taskType: "suggest",
          context: {
            jobId: "job_test_1",
            intent: { forceRefresh: true },
          },
        });

      expect(response.body).toHaveProperty("taskType");
      expect(typeof response.body.taskType).toBe("string");
    });

    it("always includes result in successful response", async () => {
      const response = await request(app)
        .post("/api/llm")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          taskType: "suggest",
          context: {
            jobId: "job_test_1",
            intent: { forceRefresh: true },
          },
        });

      expect(response.body).toHaveProperty("result");
      expect(typeof response.body.result).toBe("object");
    });
  });
});
