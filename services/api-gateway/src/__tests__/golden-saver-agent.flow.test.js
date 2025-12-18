/**
 * @file golden-saver-agent.flow.test.js
 * Tests for the Saver Agent (golden_db_update) flow in Golden Interviewer.
 *
 * These tests verify:
 * 1. Saver Agent is called BEFORE the Chat Agent (golden_interviewer)
 * 2. Updates from Saver Agent are applied to the schema
 * 3. Chat Agent sees the updated schema
 * 4. Both extractions (Saver + Chat) are saved to DB
 *
 * NOTE: These tests are SKIPPED because the Saver Agent is currently disabled
 * (ENABLE_SAVER_AGENT = false in service.js). Re-enable when Saver Agent is active.
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

// SKIPPED: Saver Agent is currently disabled in service.js
describe.skip("Golden Saver Agent Flow", () => {
  let app;
  let mockFirestore;
  let mockBigQuery;
  let mockLlmClient;
  let mockLogger;
  let authToken;
  let fetchSpy;
  let internalLlmCalls;

  // Mock response for golden_db_update (Saver Agent)
  const mockSaverAgentResponse = {
    taskType: "golden_db_update",
    result: {
      updates: {
        "financial_reality.base_compensation.amount_or_range": 120000,
        "financial_reality.base_compensation.currency": "USD",
      },
      reasoning: "Extracted salary of $120k from user input",
    },
  };

  // Mock response for golden_interviewer (Chat Agent)
  const mockChatAgentResponse = {
    taskType: "golden_interviewer",
    result: {
      message: "Great! $120k sounds competitive. What about benefits?",
      uiTool: {
        type: "multi_select",
        props: {
          title: "Benefits",
          options: ["Health Insurance", "401k", "PTO", "Remote Work"],
        },
      },
      extraction: {
        updates: {
          "role_overview.department": "Engineering",
        },
      },
      completionPercentage: 25,
      interviewPhase: "compensation",
      nextPriorityFields: ["financial_reality.benefits"],
    },
  };

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

    // Track internal /api/llm calls in order
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
          timestamp: Date.now(),
        });

        // Return appropriate mock response based on taskType
        const taskType = body?.taskType;

        if (taskType === "golden_db_update") {
          return {
            ok: true,
            status: 200,
            json: async () => mockSaverAgentResponse,
            text: async () => JSON.stringify(mockSaverAgentResponse),
          };
        }

        if (taskType === "golden_interviewer") {
          return {
            ok: true,
            status: 200,
            json: async () => mockChatAgentResponse,
            text: async () => JSON.stringify(mockChatAgentResponse),
          };
        }

        // Default response for unknown task types
        return {
          ok: true,
          status: 200,
          json: async () => ({ result: {} }),
          text: async () => "{}",
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
  // SAVER AGENT CALL ORDER
  // ===========================================================================

  describe("Saver Agent call order", () => {
    const sessionId = "session_saver_order";

    beforeEach(() => {
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
              content: "What's the salary for this role?",
              timestamp: new Date(),
            },
          ],
          goldenSchema: {},
          metadata: {
            completionPercentage: 10,
            currentPhase: "compensation",
            lastAskedField: "financial_reality.base_compensation.amount_or_range",
          },
        })
      );
    });

    it("calls Saver Agent (golden_db_update) BEFORE Chat Agent (golden_interviewer)", async () => {
      await request(app)
        .post("/golden-interview/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          sessionId,
          userMessage: "The salary is $120,000 per year",
        });

      // Should have exactly 2 LLM calls
      expect(internalLlmCalls.length).toBe(2);

      // First call should be Saver Agent
      expect(internalLlmCalls[0].body.taskType).toBe("golden_db_update");

      // Second call should be Chat Agent
      expect(internalLlmCalls[1].body.taskType).toBe("golden_interviewer");

      // Verify order by timestamp
      expect(internalLlmCalls[0].timestamp).toBeLessThanOrEqual(
        internalLlmCalls[1].timestamp
      );
    });

    it("Saver Agent receives correct context", async () => {
      await request(app)
        .post("/golden-interview/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          sessionId,
          userMessage: "The salary is $120,000 per year",
        });

      const saverCall = internalLlmCalls.find(
        (c) => c.body.taskType === "golden_db_update"
      );

      expect(saverCall).toBeDefined();
      expect(saverCall.body.context).toHaveProperty("userMessage", "The salary is $120,000 per year");
      expect(saverCall.body.context).toHaveProperty("lastAskedField", "financial_reality.base_compensation.amount_or_range");
      expect(saverCall.body.context).toHaveProperty("currentSchema");
      expect(saverCall.body.context).toHaveProperty("conversationHistory");
    });

    it("Chat Agent receives updated schema from Saver Agent", async () => {
      await request(app)
        .post("/golden-interview/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          sessionId,
          userMessage: "The salary is $120,000 per year",
        });

      const chatCall = internalLlmCalls.find(
        (c) => c.body.taskType === "golden_interviewer"
      );

      expect(chatCall).toBeDefined();

      // Chat Agent should see the schema AFTER Saver Agent applied updates
      // Note: In the test, the mock Saver returns updates which are applied
      // before the Chat Agent is called
      expect(chatCall.body.context).toHaveProperty("currentSchema");
      expect(chatCall.body.context).toHaveProperty("saverResult");
      expect(chatCall.body.context.saverResult).toHaveProperty("fieldsUpdated");
    });
  });

  // ===========================================================================
  // SCHEMA UPDATES
  // ===========================================================================

  describe("Schema updates from Saver Agent", () => {
    const sessionId = "session_schema_updates";

    beforeEach(() => {
      mockFirestore._seedDocument(
        "golden_interview_sessions",
        sessionId,
        createTestSession({
          sessionId,
          userId: TEST_USER_ID,
          status: "active",
          turnCount: 2,
          conversationHistory: [
            { role: "assistant", content: "Hello!", timestamp: new Date() },
            { role: "user", content: "Hi there", timestamp: new Date() },
          ],
          goldenSchema: {
            role_overview: {
              job_title: "Software Engineer",
            },
          },
          metadata: {
            completionPercentage: 15,
            currentPhase: "compensation",
            lastAskedField: "financial_reality.base_compensation.amount_or_range",
          },
        })
      );
    });

    it("saves Saver Agent updates to DB", async () => {
      await request(app)
        .post("/golden-interview/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          sessionId,
          userMessage: "Salary is 120k",
        });

      // Verify saveDocument was called
      expect(mockFirestore.saveDocument).toHaveBeenCalled();

      // Get the saved session
      const saveCalls = mockFirestore.saveDocument.mock.calls.filter(
        (call) => call[0] === "golden_interview_sessions" && call[1] === sessionId
      );

      expect(saveCalls.length).toBeGreaterThan(0);

      // The last save call should contain the updated schema
      const lastSave = saveCalls[saveCalls.length - 1];
      const savedSession = lastSave[2];

      // Verify the schema has the Saver Agent updates
      expect(savedSession.goldenSchema).toHaveProperty("financial_reality");
      expect(savedSession.goldenSchema.financial_reality).toHaveProperty("base_compensation");
      expect(savedSession.goldenSchema.financial_reality.base_compensation.amount_or_range).toBe(120000);
    });

    it("preserves existing schema fields when adding new ones", async () => {
      await request(app)
        .post("/golden-interview/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          sessionId,
          userMessage: "Salary is 120k",
        });

      const saveCalls = mockFirestore.saveDocument.mock.calls.filter(
        (call) => call[0] === "golden_interview_sessions" && call[1] === sessionId
      );

      const lastSave = saveCalls[saveCalls.length - 1];
      const savedSession = lastSave[2];

      // Original field should still exist
      expect(savedSession.goldenSchema.role_overview?.job_title).toBe("Software Engineer");

      // New field should be added
      expect(savedSession.goldenSchema.financial_reality?.base_compensation?.amount_or_range).toBe(120000);
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================

  describe("Saver Agent error handling", () => {
    const sessionId = "session_error_handling";

    beforeEach(() => {
      mockFirestore._seedDocument(
        "golden_interview_sessions",
        sessionId,
        createTestSession({
          sessionId,
          userId: TEST_USER_ID,
          status: "active",
        })
      );
    });

    it("continues with Chat Agent even if Saver Agent fails", async () => {
      // Override fetch to make Saver Agent fail
      global.fetch = vi.fn(async (url, options) => {
        const urlStr = typeof url === "string" ? url : url.toString();

        if (urlStr.includes("/api/llm")) {
          const body = options?.body ? JSON.parse(options.body) : null;

          internalLlmCalls.push({
            url: urlStr,
            body,
            timestamp: Date.now(),
          });

          if (body?.taskType === "golden_db_update") {
            // Simulate Saver Agent failure
            return {
              ok: false,
              status: 500,
              text: async () => "Internal Server Error",
            };
          }

          if (body?.taskType === "golden_interviewer") {
            return {
              ok: true,
              status: 200,
              json: async () => mockChatAgentResponse,
            };
          }
        }

        return originalFetch(url, options);
      });

      const response = await request(app)
        .post("/golden-interview/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          sessionId,
          userMessage: "Test message",
        });

      // Response should still be successful (Chat Agent worked)
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("success", true);
      expect(response.body).toHaveProperty("message");

      // Both agents should have been called
      expect(internalLlmCalls.length).toBe(2);
      expect(internalLlmCalls[0].body.taskType).toBe("golden_db_update");
      expect(internalLlmCalls[1].body.taskType).toBe("golden_interviewer");
    });

    it("returns empty updates when Saver Agent returns no data", async () => {
      // Override mock to return empty updates
      global.fetch = vi.fn(async (url, options) => {
        const urlStr = typeof url === "string" ? url : url.toString();

        if (urlStr.includes("/api/llm")) {
          const body = options?.body ? JSON.parse(options.body) : null;

          internalLlmCalls.push({ url: urlStr, body });

          if (body?.taskType === "golden_db_update") {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                result: {
                  updates: {},
                  reasoning: "No factual data found to extract",
                },
              }),
            };
          }

          if (body?.taskType === "golden_interviewer") {
            return {
              ok: true,
              status: 200,
              json: async () => mockChatAgentResponse,
            };
          }
        }

        return originalFetch(url, options);
      });

      const response = await request(app)
        .post("/golden-interview/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          sessionId,
          userMessage: "I don't know the salary yet",
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("success", true);
    });
  });

  // ===========================================================================
  // UI RESPONSE HANDLING
  // ===========================================================================

  describe("UI response handling", () => {
    const sessionId = "session_ui_response";

    beforeEach(() => {
      mockFirestore._seedDocument(
        "golden_interview_sessions",
        sessionId,
        createTestSession({
          sessionId,
          userId: TEST_USER_ID,
          status: "active",
          metadata: {
            lastAskedField: "financial_reality.base_compensation.amount_or_range",
          },
        })
      );
    });

    it("passes UI response to Saver Agent", async () => {
      await request(app)
        .post("/golden-interview/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          sessionId,
          uiResponse: {
            value: 85000,
            componentType: "salary_slider",
          },
        });

      const saverCall = internalLlmCalls.find(
        (c) => c.body.taskType === "golden_db_update"
      );

      expect(saverCall).toBeDefined();
      expect(saverCall.body.context).toHaveProperty("uiResponse");
      expect(saverCall.body.context.uiResponse).toEqual({
        value: 85000,
        componentType: "salary_slider",
      });
    });
  });

  // ===========================================================================
  // RESPONSE SHAPE
  // ===========================================================================

  describe("Response shape after Saver Agent flow", () => {
    const sessionId = "session_response_shape";

    beforeEach(() => {
      mockFirestore._seedDocument(
        "golden_interview_sessions",
        sessionId,
        createTestSession({
          sessionId,
          userId: TEST_USER_ID,
          status: "active",
        })
      );
    });

    it("returns proper response after both agents run", async () => {
      const response = await request(app)
        .post("/golden-interview/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          sessionId,
          userMessage: "The salary is $120,000",
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: expect.any(String),
        ui_tool: expect.objectContaining({
          type: expect.any(String),
        }),
        completion_percentage: expect.any(Number),
        interview_phase: expect.any(String),
      });
    });
  });
});
