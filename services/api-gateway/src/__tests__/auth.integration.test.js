/**
 * @file auth.integration.test.js
 * Integration tests for requireAuth middleware and JWT verification.
 *
 * These tests verify:
 * 1. No Authorization header → 401 Unauthorized
 * 2. Valid JWT → 200 OK (user passes through to route handler)
 * 3. Tampered/invalid JWT → 401 Unauthorized
 *
 * Architecture invariant verified:
 * - NextAuth issues JWTs (frontend)
 * - Backend verifies JWTs using NEXTAUTH_SECRET (or AUTH_JWT_SECRET fallback)
 * - requireAuth middleware sets req.user for downstream handlers
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../server.js";
import {
  setupTestEnv,
  createTestToken,
  createMockLogger,
  createMockFirestore,
  createMockBigQuery,
  createMockLlmClient,
  createTestJob,
  TEST_JWT_SECRET,
  TEST_USER_ID,
} from "./test-helpers.js";

describe("Auth Integration - requireAuth middleware", () => {
  let app;
  let mockFirestore;
  let mockBigQuery;
  let mockLlmClient;
  let mockLogger;

  beforeEach(() => {
    setupTestEnv();

    mockLogger = createMockLogger();
    mockFirestore = createMockFirestore();
    mockBigQuery = createMockBigQuery();
    mockLlmClient = createMockLlmClient();

    // Seed test data
    mockFirestore._seedDocument("jobs", "job_test_1", createTestJob());
    mockFirestore._seedDocument("users", TEST_USER_ID, {
      id: TEST_USER_ID,
      email: "test@example.com",
      name: "Test User",
      credits: { available: 100, used: 0 },
      usage: { jobs: 0, assets: 0, videos: 0, llmCalls: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    app = createApp({
      logger: mockLogger,
      firestore: mockFirestore,
      bigQuery: mockBigQuery,
      llmClient: mockLlmClient,
    });
  });

  afterEach(() => {
    mockFirestore._clear();
  });

  // ===========================================================================
  // SCENARIO 1: No Authorization header → 401
  // ===========================================================================

  describe("No Authorization header", () => {
    it("returns 401 for protected route /api/llm", async () => {
      const response = await request(app)
        .post("/api/llm")
        .send({ taskType: "suggest", context: { jobId: "job_test_1" } });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("error");
    });

    it("returns 401 for protected route /wizard", async () => {
      const response = await request(app)
        .get("/wizard/jobs");

      expect(response.status).toBe(401);
    });

    it("returns 401 for protected route /users/me", async () => {
      const response = await request(app)
        .get("/users/me");

      expect(response.status).toBe(401);
    });

    it("returns 401 for protected route /dashboard/summary", async () => {
      const response = await request(app)
        .get("/dashboard/summary");

      expect(response.status).toBe(401);
    });

    it("returns 401 for protected route /companies", async () => {
      const response = await request(app)
        .get("/companies");

      expect(response.status).toBe(401);
    });

    it("returns 401 for protected route /videos", async () => {
      const response = await request(app)
        .get("/videos");

      expect(response.status).toBe(401);
    });

    it("allows public route /auth/login without auth", async () => {
      const response = await request(app)
        .post("/auth/login")
        .send({ email: "test@example.com", password: "password123" });

      // Should NOT be 401 - auth routes are public
      // (may fail for other reasons, but not auth)
      expect(response.status).not.toBe(401);
    });

    it("allows public route /subscriptions/plans without auth", async () => {
      const response = await request(app)
        .get("/subscriptions/plans");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("plans");
    });
  });

  // ===========================================================================
  // SCENARIO 2: Valid JWT → passes through to handler
  // ===========================================================================

  describe("Valid JWT", () => {
    it("passes through for /wizard/jobs with valid token", async () => {
      const validToken = createTestToken();

      const response = await request(app)
        .get("/wizard/jobs")
        .set("Authorization", `Bearer ${validToken}`);

      // Should get 200 (empty list or actual data), not 401
      expect(response.status).toBe(200);
    });

    it("passes through for /users/me with valid token", async () => {
      const validToken = createTestToken();

      const response = await request(app)
        .get("/users/me")
        .set("Authorization", `Bearer ${validToken}`);

      // Should return user data directly (not wrapped in { user: ... }), not 401
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("id", TEST_USER_ID);
    });

    it("passes through for /dashboard/summary with valid token", async () => {
      const validToken = createTestToken();

      const response = await request(app)
        .get("/dashboard/summary")
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
    });

    it("passes through for /subscriptions/purchase with valid token (validates auth, not data)", async () => {
      const validToken = createTestToken();

      // POST to a protected endpoint - auth passes, validation may fail
      const response = await request(app)
        .post("/subscriptions/purchase")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ planId: "invalid" });

      // Should NOT be 401 - auth passed, validation may fail with 400
      expect(response.status).not.toBe(401);
    });

    it("passes through for /videos with valid token", async () => {
      const validToken = createTestToken();

      const response = await request(app)
        .get("/videos")
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
    });

    it("sets req.user.id correctly from token", async () => {
      const customUserId = "custom_user_xyz";
      const customToken = createTestToken({ userId: customUserId });

      // Seed user for this custom ID
      mockFirestore._seedDocument("users", customUserId, {
        id: customUserId,
        email: "custom@example.com",
        name: "Custom User",
        credits: { available: 50, used: 0 },
        usage: { jobs: 0, assets: 0, videos: 0, llmCalls: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app)
        .get("/users/me")
        .set("Authorization", `Bearer ${customToken}`);

      expect(response.status).toBe(200);
      // Response is user directly, not wrapped in { user: ... }
      expect(response.body.id).toBe(customUserId);
    });
  });

  // ===========================================================================
  // SCENARIO 3: Invalid/Tampered JWT → 401
  // ===========================================================================

  describe("Invalid or tampered JWT", () => {
    it("returns 401 for malformed token", async () => {
      const response = await request(app)
        .get("/wizard/jobs")
        .set("Authorization", "Bearer not-a-valid-jwt");

      expect(response.status).toBe(401);
    });

    it("returns 401 for expired token", async () => {
      // Create a token that expired 1 hour ago
      const expiredToken = jwt.sign(
        { sub: TEST_USER_ID, email: "test@example.com" },
        TEST_JWT_SECRET,
        { expiresIn: "-1h" }
      );

      const response = await request(app)
        .get("/wizard/jobs")
        .set("Authorization", `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
    });

    it("returns 401 for token signed with wrong secret", async () => {
      const wrongSecretToken = jwt.sign(
        { sub: TEST_USER_ID, email: "test@example.com" },
        "completely-wrong-secret",
        { expiresIn: "1h" }
      );

      const response = await request(app)
        .get("/wizard/jobs")
        .set("Authorization", `Bearer ${wrongSecretToken}`);

      expect(response.status).toBe(401);
    });

    it("returns 401 for tampered token payload", async () => {
      // Create valid token, then modify the payload part
      const validToken = createTestToken();
      const parts = validToken.split(".");

      // Tamper with the payload (middle part)
      const tamperedPayload = Buffer.from(
        JSON.stringify({ sub: "hacker_user", email: "hacker@evil.com" })
      ).toString("base64url");

      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const response = await request(app)
        .get("/wizard/jobs")
        .set("Authorization", `Bearer ${tamperedToken}`);

      expect(response.status).toBe(401);
    });

    it("returns 401 for token without Bearer prefix", async () => {
      const validToken = createTestToken();

      const response = await request(app)
        .get("/wizard/jobs")
        .set("Authorization", validToken); // Missing "Bearer "

      expect(response.status).toBe(401);
    });

    it("returns 401 for empty Authorization header", async () => {
      const response = await request(app)
        .get("/wizard/jobs")
        .set("Authorization", "");

      expect(response.status).toBe(401);
    });

    it("returns 401 for 'Bearer ' without token", async () => {
      const response = await request(app)
        .get("/wizard/jobs")
        .set("Authorization", "Bearer ");

      expect(response.status).toBe(401);
    });
  });

  // ===========================================================================
  // SCENARIO 4: Secret fallback behavior
  // ===========================================================================

  describe("Secret fallback (AUTH_JWT_SECRET)", () => {
    it("works when only AUTH_JWT_SECRET is set (backward compat)", async () => {
      // Clear NEXTAUTH_SECRET, keep only AUTH_JWT_SECRET
      delete process.env.NEXTAUTH_SECRET;
      process.env.AUTH_JWT_SECRET = TEST_JWT_SECRET;

      // Recreate app with new env
      app = createApp({
        logger: mockLogger,
        firestore: mockFirestore,
        bigQuery: mockBigQuery,
        llmClient: mockLlmClient,
      });

      const validToken = createTestToken();

      const response = await request(app)
        .get("/wizard/jobs")
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);

      // Restore for other tests
      process.env.NEXTAUTH_SECRET = TEST_JWT_SECRET;
    });
  });
});
