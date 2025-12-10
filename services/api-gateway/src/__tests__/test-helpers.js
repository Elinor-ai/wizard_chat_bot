/**
 * @file test-helpers.js
 * Shared test utilities and mock factories for api-gateway integration tests.
 */

import { vi } from "vitest";
import jwt from "jsonwebtoken";

// =============================================================================
// CONSTANTS
// =============================================================================

export const TEST_JWT_SECRET = "test-secret-for-vitest";
export const TEST_USER_ID = "user_test_123";
export const TEST_USER_EMAIL = "test@example.com";

// =============================================================================
// AUTH HELPERS
// =============================================================================

/**
 * Create a valid JWT token for testing
 * @param {object} options
 * @param {string} [options.userId] - User ID
 * @param {string} [options.email] - User email
 * @returns {string} JWT token
 */
export function createTestToken({
  userId = TEST_USER_ID,
  email = TEST_USER_EMAIL,
} = {}) {
  return jwt.sign(
    {
      sub: userId,
      email,
      roles: [],
      orgId: null,
    },
    TEST_JWT_SECRET,
    { expiresIn: "1h" }
  );
}

/**
 * Set up test environment variables.
 * Sets NEXTAUTH_SECRET as the canonical secret (with AUTH_JWT_SECRET as fallback).
 */
export function setupTestEnv() {
  // NEXTAUTH_SECRET is the canonical secret name
  process.env.NEXTAUTH_SECRET = TEST_JWT_SECRET;
  // AUTH_JWT_SECRET kept for backward compatibility
  process.env.AUTH_JWT_SECRET = TEST_JWT_SECRET;
  process.env.PORT = "4000";
  process.env.NODE_ENV = "test";
}

// =============================================================================
// MOCK FACTORIES
// =============================================================================

/**
 * Create a mock logger that captures all log calls
 * @returns {object} Mock logger with spies
 */
export function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => createMockLogger()),
  };
}

/**
 * Create a mock Firestore adapter with in-memory storage
 * @returns {object} Mock Firestore adapter
 */
export function createMockFirestore() {
  const store = new Map();

  return {
    _store: store, // Expose for test assertions

    getDocument: vi.fn(async (collection, id) => {
      const key = `${collection}/${id}`;
      return store.get(key) || null;
    }),

    saveDocument: vi.fn(async (collection, id, data) => {
      const key = `${collection}/${id}`;
      store.set(key, { ...data, id });
      return { id, ...data };
    }),

    addDocument: vi.fn(async (collection, data) => {
      const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const key = `${collection}/${id}`;
      store.set(key, { ...data, id });
      return { id, ...data };
    }),

    queryDocuments: vi.fn(async (collection, field, operator, value) => {
      const results = [];
      for (const [key, doc] of store.entries()) {
        if (key.startsWith(`${collection}/`)) {
          if (field && operator === "==" && doc[field] === value) {
            results.push(doc);
          } else if (!field) {
            results.push(doc);
          }
        }
      }
      return results;
    }),

    listCollection: vi.fn(async (collection, filters = []) => {
      const results = [];
      for (const [key, doc] of store.entries()) {
        if (key.startsWith(`${collection}/`)) {
          let matches = true;
          for (const filter of filters) {
            if (filter.operator === "==" && doc[filter.field] !== filter.value) {
              matches = false;
              break;
            }
          }
          if (matches) {
            results.push(doc);
          }
        }
      }
      return results;
    }),

    recordLlmUsage: vi.fn(async () => {}),

    // Helper to pre-seed data for tests
    _seedDocument(collection, id, data) {
      const key = `${collection}/${id}`;
      store.set(key, { ...data, id });
    },

    // Helper to clear all data
    _clear() {
      store.clear();
    },
  };
}

/**
 * Create a mock BigQuery adapter
 * @returns {object} Mock BigQuery adapter
 */
export function createMockBigQuery() {
  return {
    insertRows: vi.fn(async () => {}),
    query: vi.fn(async () => []),
  };
}

/**
 * Create a mock llmClient with configurable responses
 * @param {object} [responses] - Map of method names to responses
 * @returns {object} Mock llmClient
 */
export function createMockLlmClient(responses = {}) {
  const defaultSuggestResult = {
    // candidates must be an array with fieldId for mapCandidatesByField()
    candidates: [
      {
        fieldId: "jobTitle",
        value: "Senior Software Engineer",
        rationale: "Based on context",
        confidence: 0.9,
      },
    ],
    provider: "gemini",
    model: "gemini-1.5-flash",
    metadata: {
      promptTokens: 100,
      candidateTokens: 50,
      totalTokens: 150,
    },
  };

  const defaultRefineResult = {
    refinedJob: {
      title: "Senior Software Engineer",
      description: "A great role",
    },
    metadata: {
      promptTokens: 200,
      candidateTokens: 100,
      totalTokens: 300,
      provider: "gemini",
      model: "gemini-1.5-flash",
    },
  };

  const defaultGoldenInterviewerResult = {
    message: "Great! Tell me more about the compensation for this role.",
    uiTool: {
      type: "smart_textarea",
      props: {
        title: "Compensation",
        prompts: ["What is the salary range?"],
      },
    },
    extraction: {
      updates: {},
    },
    completionPercentage: 15,
    interviewPhase: "compensation",
    nextPriorityFields: ["financial_reality.base_compensation"],
    metadata: {
      promptTokens: 500,
      candidateTokens: 200,
      totalTokens: 700,
      provider: "gemini",
      model: "gemini-1.5-flash",
    },
  };

  const defaultChannelsResult = {
    recommendations: [
      { channelId: "linkedin", score: 0.9, rationale: "Best for professionals" },
    ],
    metadata: {
      promptTokens: 150,
      candidateTokens: 75,
      totalTokens: 225,
      provider: "gemini",
      model: "gemini-1.5-flash",
    },
  };

  return {
    askSuggestions: vi.fn(async () => responses.askSuggestions ?? defaultSuggestResult),
    askRefineJob: vi.fn(async () => responses.askRefineJob ?? defaultRefineResult),
    askChannelRecommendations: vi.fn(async () => responses.askChannelRecommendations ?? defaultChannelsResult),
    askGoldenInterviewerTurn: vi.fn(async () => responses.askGoldenInterviewerTurn ?? defaultGoldenInterviewerResult),
    runCopilotAgent: vi.fn(async () => responses.runCopilotAgent ?? { message: "Done" }),
    askCompanyIntel: vi.fn(async () => responses.askCompanyIntel ?? {}),
    askAssetMaster: vi.fn(async () => responses.askAssetMaster ?? {}),
    askAssetChannelBatch: vi.fn(async () => responses.askAssetChannelBatch ?? {}),
    askAssetAdapt: vi.fn(async () => responses.askAssetAdapt ?? {}),
    askVideoStoryboard: vi.fn(async () => responses.askVideoStoryboard ?? {}),
    askVideoCaption: vi.fn(async () => responses.askVideoCaption ?? {}),
    askVideoCompliance: vi.fn(async () => responses.askVideoCompliance ?? {}),
    askHeroImagePrompt: vi.fn(async () => responses.askHeroImagePrompt ?? {}),
    runImageGeneration: vi.fn(async () => responses.runImageGeneration ?? {}),
    askImageCaption: vi.fn(async () => responses.askImageCaption ?? {}),
  };
}

/**
 * Create a minimal test job document with complete intake
 * (required for suggest/refine tasks to invoke LLM)
 * Matches the full JobSchema from @wizard/core
 * @param {object} [overrides] - Override default values
 * @returns {object} Job document
 */
export function createTestJob(overrides = {}) {
  const now = new Date();
  return {
    id: "job_test_1",
    ownerUserId: TEST_USER_ID,
    orgId: null,
    companyId: null,
    status: "draft",
    // Required intake fields (REQUIRED_FIELD_PATHS from job-intake.js):
    roleTitle: "Senior Software Engineer",
    companyName: "Test Company",
    logoUrl: "",
    location: "San Francisco, CA",
    zipCode: "",
    jobDescription: "We are looking for a talented engineer to join our team.",
    coreDuties: [],
    mustHaves: [],
    benefits: [],
    // Optional enum fields
    seniorityLevel: "senior",
    employmentType: "full_time",
    // Full stateMachine object required by JobSchema
    stateMachine: {
      currentState: "REQUIRED_COMPLETE",
      previousState: null,
      history: [],
      requiredComplete: true,
      optionalComplete: false,
      lastTransitionAt: now,
      lockedByRequestId: null,
    },
    confirmed: {},
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    ...overrides,
  };
}

/**
 * Create a test job with incomplete intake (for testing skip behavior)
 * @param {object} [overrides] - Override default values
 * @returns {object} Job document
 */
export function createIncompleteTestJob(overrides = {}) {
  return {
    id: "job_incomplete_1",
    ownerUserId: TEST_USER_ID,
    status: "draft",
    // Missing required fields
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a minimal test session document for Golden Interviewer
 * @param {object} [overrides] - Override default values
 * @returns {object} Session document
 */
export function createTestSession(overrides = {}) {
  return {
    sessionId: "session_test_1",
    userId: TEST_USER_ID,
    status: "active",
    turnCount: 0,
    conversationHistory: [],
    goldenSchema: {},
    metadata: {
      completionPercentage: 0,
      currentPhase: "opening",
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
