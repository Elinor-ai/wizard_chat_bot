/**
 * @file golden-interview.flow.test.js
 * Integration tests for Golden Interviewer endpoints.
 *
 * These tests verify:
 * 1. POST /golden-interview/start - Creates session and returns first turn
 * 2. POST /golden-interview/chat - Processes conversation turns
 * 3. Internal HTTP call to /api/llm is made (architecture invariant)
 *
 * Architecture invariant verified:
 * - Golden Interviewer service calls POST /api/llm via HTTP (not direct llmClient)
 * - Usage logging happens in /api/llm, NOT in Golden Interviewer
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
  createTestSession,
  TEST_USER_ID,
} from "./test-helpers.js";

// Store original fetch
const originalFetch = global.fetch;

// Mock response for golden_db_update (Saver Agent)
const mockSaverAgentResponse = {
  taskType: "golden_db_update",
  result: {
    updates: {},
    reasoning: "No factual data found to extract",
  },
};

// Mock response for golden_interviewer (Chat Agent)
const mockLlmApiResponse = {
  taskType: "golden_interviewer",
  result: {
    message: "Great! Let's talk about this role. What's the job title?",
    uiTool: {
      type: "smart_textarea",
      props: {
        title: "Job Title",
        prompts: ["What position are you hiring for?"],
      },
    },
    extraction: { updates: {} },
    completionPercentage: 5,
    interviewPhase: "opening",
    nextPriorityFields: ["role_identity.job_title"],
  },
};

describe("Golden Interviewer Flow", () => {
  let app;
  let mockFirestore;
  let mockBigQuery;
  let mockLlmClient;
  let mockLogger;
  let authToken;
  let fetchSpy;
  let internalLlmCalls;

  beforeEach(() => {
    setupTestEnv();

    mockLogger = createMockLogger();
    mockFirestore = createMockFirestore();
    mockBigQuery = createMockBigQuery();
    mockLlmClient = createMockLlmClient();

    app = createApp({
      logger: mockLogger,
      firestore: mockFirestore,
      bigQuery: mockBigQuery,
      llmClient: mockLlmClient,
    });

    authToken = createTestToken();

    // Track internal /api/llm calls
    internalLlmCalls = [];

    // Mock global fetch to intercept internal HTTP calls to /api/llm
    fetchSpy = vi.fn(async (url, options) => {
      const urlStr = typeof url === "string" ? url : url.toString();

      // Intercept calls to /api/llm
      if (urlStr.includes("/api/llm")) {
        const body = options?.body ? JSON.parse(options.body) : null;

        internalLlmCalls.push({
          url: urlStr,
          method: options?.method,
          body,
          headers: options?.headers,
        });

        // Return appropriate mock response based on taskType
        const taskType = body?.taskType;
        const mockResponse = taskType === "golden_db_update"
          ? mockSaverAgentResponse
          : mockLlmApiResponse;

        return {
          ok: true,
          status: 200,
          json: async () => mockResponse,
          text: async () => JSON.stringify(mockResponse),
        };
      }

      // For other URLs, use original fetch (or fail)
      return originalFetch(url, options);
    });

    global.fetch = fetchSpy;

    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mockFirestore._clear();
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // POST /golden-interview/start
  // ===========================================================================

  describe("POST /golden-interview/start", () => {
    it("returns 200 with sessionId and response", async () => {
      const response = await request(app)
        .post("/golden-interview/start")
        .set("Authorization", `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("success", true);
      expect(response.body).toHaveProperty("sessionId");
      expect(typeof response.body.sessionId).toBe("string");
      expect(response.body.sessionId.length).toBeGreaterThan(0);
      expect(response.body).toHaveProperty("response");
      expect(response.body.response).toHaveProperty("message");
    });

    it("makes internal HTTP call to /api/llm with taskType golden_interviewer", async () => {
      await request(app)
        .post("/golden-interview/start")
        .set("Authorization", `Bearer ${authToken}`)
        .send({});

      // Verify internal fetch was called
      expect(internalLlmCalls.length).toBeGreaterThan(0);

      // Find the call to /api/llm
      const llmCall = internalLlmCalls.find((c) => c.url.includes("/api/llm"));
      expect(llmCall).toBeDefined();
      expect(llmCall.method).toBe("POST");
      expect(llmCall.body).toHaveProperty("taskType", "golden_interviewer");
      expect(llmCall.body).toHaveProperty("context");
      expect(llmCall.body.context).toHaveProperty("isFirstTurn", true);
    });

    it("creates a session document via Firestore", async () => {
      const response = await request(app)
        .post("/golden-interview/start")
        .set("Authorization", `Bearer ${authToken}`)
        .send({});

      expect(response.body).toHaveProperty("sessionId");

      // Verify saveDocument was called for sessions
      expect(mockFirestore.saveDocument).toHaveBeenCalled();
      const saveCall = mockFirestore.saveDocument.mock.calls.find(
        (call) => call[0] === "golden_interview_sessions"
      );
      expect(saveCall).toBeDefined();
    });

    it("response includes expected shape", async () => {
      const response = await request(app)
        .post("/golden-interview/start")
        .set("Authorization", `Bearer ${authToken}`)
        .send({});

      expect(response.body.response).toHaveProperty("message");
      expect(response.body.response).toHaveProperty("ui_tool");
      expect(response.body.response).toHaveProperty("completion_percentage");
      expect(response.body.response).toHaveProperty("interview_phase");
    });

    it("returns 401 without auth token", async () => {
      const response = await request(app)
        .post("/golden-interview/start")
        .send({});

      expect(response.status).toBe(401);
    });
  });

  // ===========================================================================
  // POST /golden-interview/chat
  // ===========================================================================

  describe("POST /golden-interview/chat", () => {
    const sessionId = "session_test_chat";

    beforeEach(() => {
      // Pre-seed a session for chat tests
      mockFirestore._seedDocument(
        "golden_interview_sessions",
        sessionId,
        createTestSession({
          sessionId,
          userId: TEST_USER_ID,
          status: "active",
          turnCount: 1,
          conversationHistory: [
            {
              role: "assistant",
              content: "Hello! Let's start.",
              timestamp: new Date(),
            },
          ],
          goldenSchema: {},
          metadata: {
            completionPercentage: 5,
            currentPhase: "opening",
          },
        })
      );
    });

    it("returns 200 with chat response", async () => {
      const response = await request(app)
        .post("/golden-interview/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          sessionId,
          userMessage: "The job title is Senior Engineer",
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("success", true);
      expect(response.body).toHaveProperty("message");
    });

    it("makes internal HTTP calls to /api/llm for chat turn (Chat Agent only - Saver Agent disabled)", async () => {
      await request(app)
        .post("/golden-interview/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          sessionId,
          userMessage: "The job title is Senior Engineer",
        });

      // NOTE: Saver Agent is currently disabled (ENABLE_SAVER_AGENT = false in service.js)
      // When re-enabled, this test should expect 2 LLM calls instead of 1

      // Verify only Chat Agent call was made
      expect(internalLlmCalls.length).toBe(1);

      // The call should be Chat Agent
      const chatCall = internalLlmCalls[0];
      expect(chatCall.body).toHaveProperty("taskType", "golden_interviewer");
      expect(chatCall.body.context).toHaveProperty("isFirstTurn", false);
      expect(chatCall.body.context).toHaveProperty("userMessage", "The job title is Senior Engineer");
    });

    it("updates session turnCount after chat", async () => {
      await request(app)
        .post("/golden-interview/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          sessionId,
          userMessage: "Test message",
        });

      // Verify saveDocument was called to update session
      const saveCalls = mockFirestore.saveDocument.mock.calls.filter(
        (call) => call[0] === "golden_interview_sessions"
      );
      expect(saveCalls.length).toBeGreaterThan(0);
    });

    it("returns 400 for missing sessionId", async () => {
      const response = await request(app)
        .post("/golden-interview/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          userMessage: "Test",
        });

      expect(response.status).toBe(400);
    });

    it("returns 404 for non-existent session", async () => {
      const response = await request(app)
        .post("/golden-interview/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          sessionId: "non_existent_session_xyz",
          userMessage: "Test",
        });

      expect(response.status).toBe(404);
    });

    it("returns 403 for session owned by different user", async () => {
      // Seed a session owned by a different user
      mockFirestore._seedDocument(
        "golden_interview_sessions",
        "other_user_session",
        createTestSession({
          sessionId: "other_user_session",
          userId: "different_user_id",
          status: "active",
        })
      );

      const response = await request(app)
        .post("/golden-interview/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          sessionId: "other_user_session",
          userMessage: "Test",
        });

      expect(response.status).toBe(403);
    });

    it("handles UI response input", async () => {
      const response = await request(app)
        .post("/golden-interview/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          sessionId,
          uiResponse: {
            selectedOption: "Option A",
            value: 50000,
          },
        });

      expect(response.status).toBe(200);

      // Verify uiResponse was passed to LLM
      const llmCall = internalLlmCalls.find((c) => c.url.includes("/api/llm"));
      expect(llmCall.body.context).toHaveProperty("uiResponse");
    });

    it("triggers refinement for custom input when allowCustomInput was true", async () => {
      // Seed session with allowCustomInput: true in metadata
      mockFirestore._seedDocument(
        "golden_interview_sessions",
        "custom_input_session",
        createTestSession({
          sessionId: "custom_input_session",
          userId: TEST_USER_ID,
          metadata: {
            completionPercentage: 10,
            currentPhase: "discovery",
            lastToolUsed: "icon_grid",
            lastToolAllowCustomInput: true, // Key flag
            lastAskedField: "growth_trajectory.skill_building.technologies_used", // Required for context
          },
        })
      );

      await request(app)
        .post("/golden-interview/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          sessionId: "custom_input_session",
          userMessage: "My Custom Tool",
        });

      // Verify "golden_refine" task was called
      const refineCall = internalLlmCalls.find(c => c.body?.taskType === "golden_refine");
      expect(refineCall).toBeDefined();
      expect(refineCall.body.context).toHaveProperty("userMessage", "My Custom Tool");
    });
  });

  // ===========================================================================
  // ARCHITECTURE INVARIANT VERIFICATION
  // ===========================================================================

  describe("Architecture invariant: LLM calls via HTTP", () => {
    it("Golden Interviewer does NOT call llmClient directly", async () => {
      await request(app)
        .post("/golden-interview/start")
        .set("Authorization", `Bearer ${authToken}`)
        .send({});

      // Verify llmClient methods were NOT called directly
      // (they should only be called when /api/llm processes the request)
      // In our test setup, the internal HTTP call is mocked, so llmClient
      // should not be touched by the Golden Interviewer service
      expect(mockLlmClient.askGoldenInterviewerTurn).not.toHaveBeenCalled();

      // But internal HTTP fetch WAS called
      expect(internalLlmCalls.length).toBeGreaterThan(0);
    });

    it("internal /api/llm call includes proper authorization", async () => {
      await request(app)
        .post("/golden-interview/start")
        .set("Authorization", `Bearer ${authToken}`)
        .send({});

      const llmCall = internalLlmCalls.find((c) => c.url.includes("/api/llm"));
      expect(llmCall.headers).toHaveProperty("Authorization");
      expect(llmCall.headers.Authorization).toMatch(/^Bearer /);
    });
  });

  // ===========================================================================
  // RESPONSE SHAPE VERIFICATION
  // ===========================================================================

  describe("Response shapes", () => {
    it("/start response has required fields", async () => {
      const response = await request(app)
        .post("/golden-interview/start")
        .set("Authorization", `Bearer ${authToken}`)
        .send({});

      expect(response.body).toMatchObject({
        success: true,
        sessionId: expect.any(String),
        response: {
          message: expect.any(String),
          completion_percentage: expect.any(Number),
          interview_phase: expect.any(String),
        },
      });
    });

    it("/chat response has required fields", async () => {
      // Seed session
      mockFirestore._seedDocument(
        "golden_interview_sessions",
        "shape_test_session",
        createTestSession({
          sessionId: "shape_test_session",
          userId: TEST_USER_ID,
        })
      );

      const response = await request(app)
        .post("/golden-interview/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          sessionId: "shape_test_session",
          userMessage: "Test",
        });

      expect(response.body).toMatchObject({
        success: true,
        message: expect.any(String),
        completion_percentage: expect.any(Number),
        interview_phase: expect.any(String),
      });
    });
  });
});
