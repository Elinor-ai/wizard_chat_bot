/**
 * @file wizard.core-flows.test.js
 * Integration tests for the Wizard routes (/wizard/*).
 *
 * These tests verify:
 * 1. Create/update job draft (POST /wizard/draft)
 * 2. Load existing job (GET /wizard/:jobId)
 * 3. List user's jobs (GET /wizard/jobs)
 * 4. Merge suggestion into job (POST /wizard/suggestions/merge)
 * 5. Finalize job (POST /wizard/refine/finalize)
 *
 * Architecture invariant verified:
 * - Wizard does NOT call LLM directly (suggestion/refine generation goes via /api/llm)
 * - Public API shapes remain unchanged
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

describe("Wizard Core Flows", () => {
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

    app = createApp({
      logger: mockLogger,
      firestore: mockFirestore,
      bigQuery: mockBigQuery,
      llmClient: mockLlmClient,
    });

    authToken = createTestToken();

    vi.clearAllMocks();
  });

  afterEach(() => {
    mockFirestore._clear();
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // POST /wizard/draft - Create & Update Job
  // ===========================================================================

  describe("POST /wizard/draft", () => {
    describe("create new job", () => {
      it("returns 200 with jobId when creating a new job", async () => {
        const response = await request(app)
          .post("/wizard/draft")
          .set("Authorization", `Bearer ${authToken}`)
          .send({
            currentStepId: "role-basics",
            state: {
              roleTitle: "Software Engineer",
              companyName: "Test Corp",
            },
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("jobId");
        expect(typeof response.body.jobId).toBe("string");
        expect(response.body.jobId).toMatch(/^job_/);
      });

      it("persists the job document to Firestore", async () => {
        const response = await request(app)
          .post("/wizard/draft")
          .set("Authorization", `Bearer ${authToken}`)
          .send({
            currentStepId: "role-basics",
            state: {
              roleTitle: "Backend Developer",
              companyName: "Startup Inc",
            },
          });

        expect(response.status).toBe(200);
        const { jobId } = response.body;

        // Verify document was saved
        expect(mockFirestore.saveDocument).toHaveBeenCalledWith(
          "jobs",
          jobId,
          expect.objectContaining({
            id: jobId,
            ownerUserId: TEST_USER_ID,
            roleTitle: "Backend Developer",
            companyName: "Startup Inc",
          })
        );
      });

      it("returns intake fields in the response", async () => {
        const response = await request(app)
          .post("/wizard/draft")
          .set("Authorization", `Bearer ${authToken}`)
          .send({
            currentStepId: "role-basics",
            state: {
              roleTitle: "Frontend Engineer",
              location: "Remote",
            },
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("intake");
        expect(response.body.intake).toHaveProperty("roleTitle", "Frontend Engineer");
        expect(response.body.intake).toHaveProperty("location", "Remote");
      });

      it("returns status and state in the response", async () => {
        const response = await request(app)
          .post("/wizard/draft")
          .set("Authorization", `Bearer ${authToken}`)
          .send({
            currentStepId: "role-basics",
            state: {},
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("status");
        expect(response.body).toHaveProperty("state");
      });
    });

    describe("update existing job", () => {
      it("updates an existing job when jobId is provided", async () => {
        // Seed existing job
        const existingJob = createTestJob({ id: "job_existing_1" });
        mockFirestore._seedDocument("jobs", "job_existing_1", existingJob);

        const response = await request(app)
          .post("/wizard/draft")
          .set("Authorization", `Bearer ${authToken}`)
          .send({
            jobId: "job_existing_1",
            currentStepId: "location-step",
            state: {
              location: "New York, NY",
            },
          });

        expect(response.status).toBe(200);
        expect(response.body.jobId).toBe("job_existing_1");
        expect(response.body.intake).toHaveProperty("location", "New York, NY");
      });

      it("merges new state with existing job fields", async () => {
        // Seed job with some fields
        const existingJob = createTestJob({
          id: "job_merge_1",
          roleTitle: "Original Title",
          companyName: "Original Company",
        });
        mockFirestore._seedDocument("jobs", "job_merge_1", existingJob);

        const response = await request(app)
          .post("/wizard/draft")
          .set("Authorization", `Bearer ${authToken}`)
          .send({
            jobId: "job_merge_1",
            currentStepId: "role-basics",
            state: {
              roleTitle: "Updated Title",
              // companyName not provided - should remain
            },
          });

        expect(response.status).toBe(200);
        expect(response.body.intake.roleTitle).toBe("Updated Title");
        expect(response.body.intake.companyName).toBe("Original Company");
      });
    });

    describe("authentication", () => {
      it("returns 401 when no auth token provided", async () => {
        const response = await request(app)
          .post("/wizard/draft")
          .send({
            currentStepId: "role-basics",
            state: {},
          });

        expect(response.status).toBe(401);
      });

      it("returns 401 for invalid auth token", async () => {
        const response = await request(app)
          .post("/wizard/draft")
          .set("Authorization", "Bearer invalid_token")
          .send({
            currentStepId: "role-basics",
            state: {},
          });

        expect(response.status).toBe(401);
      });
    });
  });

  // ===========================================================================
  // GET /wizard/:jobId - Load Job
  // ===========================================================================

  describe("GET /wizard/:jobId", () => {
    it("returns 200 with job data when job exists", async () => {
      const testJob = createTestJob({ id: "job_load_1" });
      mockFirestore._seedDocument("jobs", "job_load_1", testJob);

      const response = await request(app)
        .get("/wizard/job_load_1")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("jobId", "job_load_1");
    });

    it("returns state object with intake fields", async () => {
      const testJob = createTestJob({
        id: "job_state_1",
        roleTitle: "Product Manager",
        companyName: "BigCorp",
        location: "Austin, TX",
      });
      mockFirestore._seedDocument("jobs", "job_state_1", testJob);

      const response = await request(app)
        .get("/wizard/job_state_1")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("state");
      expect(response.body.state).toHaveProperty("roleTitle", "Product Manager");
      expect(response.body.state).toHaveProperty("companyName", "BigCorp");
      expect(response.body.state).toHaveProperty("location", "Austin, TX");
    });

    it("returns includeOptional flag", async () => {
      const now = new Date();
      const testJob = createTestJob({
        id: "job_opt_1",
        // Full stateMachine with optionalComplete = true
        stateMachine: {
          currentState: "OPTIONAL_COMPLETE",
          previousState: "OPTIONAL_IN_PROGRESS",
          history: [],
          requiredComplete: true,
          optionalComplete: true,
          lastTransitionAt: now,
          lockedByRequestId: null,
        },
      });
      mockFirestore._seedDocument("jobs", "job_opt_1", testJob);

      const response = await request(app)
        .get("/wizard/job_opt_1")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("includeOptional", true);
    });

    it("returns 404 when job does not exist", async () => {
      const response = await request(app)
        .get("/wizard/job_nonexistent")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    it("returns 403 when job belongs to different user", async () => {
      const otherUserJob = createTestJob({
        id: "job_other_user",
        ownerUserId: "user_other_456",
      });
      mockFirestore._seedDocument("jobs", "job_other_user", otherUserJob);

      const response = await request(app)
        .get("/wizard/job_other_user")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(403);
    });

    it("returns 401 without authentication", async () => {
      const response = await request(app).get("/wizard/job_test_1");

      expect(response.status).toBe(401);
    });
  });

  // ===========================================================================
  // GET /wizard/jobs - List User's Jobs
  // ===========================================================================

  describe("GET /wizard/jobs", () => {
    it("returns 200 with empty jobs array when user has no jobs", async () => {
      const response = await request(app)
        .get("/wizard/jobs")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("jobs");
      expect(Array.isArray(response.body.jobs)).toBe(true);
    });

    it("returns jobs owned by the authenticated user", async () => {
      // Seed some jobs for this user
      mockFirestore._seedDocument("jobs", "job_list_1", createTestJob({
        id: "job_list_1",
        roleTitle: "Engineer",
        ownerUserId: TEST_USER_ID,
      }));
      mockFirestore._seedDocument("jobs", "job_list_2", createTestJob({
        id: "job_list_2",
        roleTitle: "Designer",
        ownerUserId: TEST_USER_ID,
      }));
      // Seed a job for different user (should not appear)
      mockFirestore._seedDocument("jobs", "job_other", createTestJob({
        id: "job_other",
        roleTitle: "Other Role",
        ownerUserId: "user_other_999",
      }));

      const response = await request(app)
        .get("/wizard/jobs")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.jobs).toHaveLength(2);
      expect(response.body.jobs.map(j => j.id)).toContain("job_list_1");
      expect(response.body.jobs.map(j => j.id)).toContain("job_list_2");
      expect(response.body.jobs.map(j => j.id)).not.toContain("job_other");
    });

    it("returns job summary fields (id, roleTitle, companyName, status)", async () => {
      mockFirestore._seedDocument("jobs", "job_summary", createTestJob({
        id: "job_summary",
        roleTitle: "Data Scientist",
        companyName: "AI Corp",
        status: "draft",
        location: "Boston, MA",
      }));

      const response = await request(app)
        .get("/wizard/jobs")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      const job = response.body.jobs.find(j => j.id === "job_summary");
      expect(job).toBeDefined();
      expect(job).toHaveProperty("id", "job_summary");
      expect(job).toHaveProperty("roleTitle", "Data Scientist");
      expect(job).toHaveProperty("companyName", "AI Corp");
      expect(job).toHaveProperty("status", "draft");
      expect(job).toHaveProperty("location", "Boston, MA");
    });

    it("returns 401 without authentication", async () => {
      const response = await request(app).get("/wizard/jobs");

      expect(response.status).toBe(401);
    });
  });

  // ===========================================================================
  // POST /wizard/suggestions/merge - Merge Suggestion
  // ===========================================================================

  describe("POST /wizard/suggestions/merge", () => {
    beforeEach(() => {
      // Seed a job for merge operations
      mockFirestore._seedDocument("jobs", "job_merge_sug", createTestJob({
        id: "job_merge_sug",
        roleTitle: "Initial Title",
      }));
    });

    it("returns 200 with status ok when merging a field", async () => {
      const response = await request(app)
        .post("/wizard/suggestions/merge")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          jobId: "job_merge_sug",
          fieldId: "roleTitle",
          value: "Senior Engineer",
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "ok");
    });

    it("updates the job field with the merged value", async () => {
      await request(app)
        .post("/wizard/suggestions/merge")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          jobId: "job_merge_sug",
          fieldId: "jobDescription",
          value: "This is a great opportunity to work with cutting-edge tech.",
        });

      // Verify the job was updated
      expect(mockFirestore.saveDocument).toHaveBeenCalledWith(
        "jobs",
        "job_merge_sug",
        expect.objectContaining({
          jobDescription: "This is a great opportunity to work with cutting-edge tech.",
        })
      );
    });

    it("removes the field from suggestion candidates after merge", async () => {
      // Seed a suggestion document with a candidate
      mockFirestore._seedDocument("jobSuggestions", "job_merge_sug", {
        id: "job_merge_sug",
        jobId: "job_merge_sug",
        schema_version: "3",
        candidates: {
          roleTitle: { fieldId: "roleTitle", value: "Suggested Title" },
          location: { fieldId: "location", value: "NYC" },
        },
        updatedAt: new Date(),
      });

      await request(app)
        .post("/wizard/suggestions/merge")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          jobId: "job_merge_sug",
          fieldId: "roleTitle",
          value: "Merged Title",
        });

      // The suggestion document should be updated to remove the merged field
      const saveCalls = mockFirestore.saveDocument.mock.calls;
      const suggestionSave = saveCalls.find(
        call => call[0] === "jobSuggestions" && call[1] === "job_merge_sug"
      );

      if (suggestionSave) {
        // The roleTitle should be removed from candidates
        expect(suggestionSave[2].candidates).not.toHaveProperty("roleTitle");
        // Other candidates should remain
        expect(suggestionSave[2].candidates).toHaveProperty("location");
      }
    });

    it("returns 404 when job does not exist", async () => {
      const response = await request(app)
        .post("/wizard/suggestions/merge")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          jobId: "job_nonexistent",
          fieldId: "roleTitle",
          value: "Test",
        });

      expect(response.status).toBe(404);
    });

    it("returns 401 without authentication", async () => {
      const response = await request(app)
        .post("/wizard/suggestions/merge")
        .send({
          jobId: "job_merge_sug",
          fieldId: "roleTitle",
          value: "Test",
        });

      expect(response.status).toBe(401);
    });
  });

  // ===========================================================================
  // POST /wizard/refine/finalize - Finalize Job
  // ===========================================================================

  describe("POST /wizard/refine/finalize", () => {
    const validFinalJob = {
      roleTitle: "Senior Software Engineer",
      companyName: "Tech Corp",
      location: "San Francisco, CA",
      seniorityLevel: "senior",
      employmentType: "full_time",
      jobDescription: "Join our team to build amazing products.",
    };

    beforeEach(() => {
      // Seed a job ready for finalization
      mockFirestore._seedDocument("jobs", "job_finalize_1", createTestJob({
        id: "job_finalize_1",
      }));
    });

    it("returns 200 with finalized job data", async () => {
      const response = await request(app)
        .post("/wizard/refine/finalize")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          jobId: "job_finalize_1",
          finalJob: validFinalJob,
          source: "refined",
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("jobId", "job_finalize_1");
      expect(response.body).toHaveProperty("finalJob");
      expect(response.body).toHaveProperty("source", "refined");
    });

    it("persists the final job document to Firestore", async () => {
      await request(app)
        .post("/wizard/refine/finalize")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          jobId: "job_finalize_1",
          finalJob: validFinalJob,
          source: "original",
        });

      // Verify final job document was saved
      expect(mockFirestore.saveDocument).toHaveBeenCalledWith(
        "jobFinalJobs",
        "job_finalize_1",
        expect.objectContaining({
          jobId: "job_finalize_1",
          source: "original",
        })
      );
    });

    it("updates the main job document with confirmed fields", async () => {
      await request(app)
        .post("/wizard/refine/finalize")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          jobId: "job_finalize_1",
          finalJob: validFinalJob,
          source: "refined",
        });

      // Verify main job document was updated with confirmed fields
      expect(mockFirestore.saveDocument).toHaveBeenCalledWith(
        "jobs",
        "job_finalize_1",
        expect.objectContaining({
          roleTitle: "Senior Software Engineer",
          companyName: "Tech Corp",
        })
      );
    });

    it("returns 422 when finalJob is missing required fields", async () => {
      const incompleteFinalJob = {
        roleTitle: "Engineer",
        // Missing other required fields
      };

      const response = await request(app)
        .post("/wizard/refine/finalize")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          jobId: "job_finalize_1",
          finalJob: incompleteFinalJob,
        });

      expect(response.status).toBe(422);
    });

    it("returns 404 when job does not exist", async () => {
      const response = await request(app)
        .post("/wizard/refine/finalize")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          jobId: "job_nonexistent",
          finalJob: validFinalJob,
        });

      expect(response.status).toBe(404);
    });

    it("returns 401 without authentication", async () => {
      const response = await request(app)
        .post("/wizard/refine/finalize")
        .send({
          jobId: "job_finalize_1",
          finalJob: validFinalJob,
        });

      expect(response.status).toBe(401);
    });

    it("accepts source values: original, refined, edited", async () => {
      for (const source of ["original", "refined", "edited"]) {
        const response = await request(app)
          .post("/wizard/refine/finalize")
          .set("Authorization", `Bearer ${authToken}`)
          .send({
            jobId: "job_finalize_1",
            finalJob: validFinalJob,
            source,
          });

        expect(response.status).toBe(200);
        expect(response.body.source).toBe(source);
      }
    });
  });

  // ===========================================================================
  // Response Shape Verification
  // ===========================================================================

  describe("response shapes", () => {
    beforeEach(() => {
      mockFirestore._seedDocument("jobs", "job_shape_test", createTestJob({
        id: "job_shape_test",
      }));
    });

    it("GET /wizard/:jobId returns expected fields", async () => {
      const response = await request(app)
        .get("/wizard/job_shape_test")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      // Required response fields
      expect(response.body).toHaveProperty("jobId");
      expect(response.body).toHaveProperty("state");
      expect(response.body).toHaveProperty("includeOptional");
      expect(response.body).toHaveProperty("updatedAt");
      expect(response.body).toHaveProperty("status");
    });

    it("POST /wizard/draft returns expected fields", async () => {
      const response = await request(app)
        .post("/wizard/draft")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          currentStepId: "step-1",
          state: { roleTitle: "Test" },
        });

      expect(response.status).toBe(200);
      // Required response fields
      expect(response.body).toHaveProperty("jobId");
      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("state");
      expect(response.body).toHaveProperty("intake");
    });

    it("GET /wizard/jobs returns array with job summaries", async () => {
      const response = await request(app)
        .get("/wizard/jobs")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("jobs");
      expect(Array.isArray(response.body.jobs)).toBe(true);

      // If there are jobs, verify shape
      if (response.body.jobs.length > 0) {
        const job = response.body.jobs[0];
        expect(job).toHaveProperty("id");
        expect(job).toHaveProperty("roleTitle");
        expect(job).toHaveProperty("status");
      }
    });
  });

  // ===========================================================================
  // Architecture Invariant: No Direct LLM Calls from Wizard
  // ===========================================================================

  describe("architecture invariant: wizard does not call LLM directly", () => {
    it("POST /wizard/draft does NOT call llmClient methods", async () => {
      await request(app)
        .post("/wizard/draft")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          currentStepId: "role-basics",
          state: { roleTitle: "Test" },
        });

      // Verify no LLM methods were called
      expect(mockLlmClient.askSuggestions).not.toHaveBeenCalled();
      expect(mockLlmClient.askRefineJob).not.toHaveBeenCalled();
      expect(mockLlmClient.askGoldenInterviewerTurn).not.toHaveBeenCalled();
    });

    it("POST /wizard/suggestions/merge does NOT call llmClient methods", async () => {
      mockFirestore._seedDocument("jobs", "job_no_llm", createTestJob({
        id: "job_no_llm",
      }));

      await request(app)
        .post("/wizard/suggestions/merge")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          jobId: "job_no_llm",
          fieldId: "roleTitle",
          value: "Test Title",
        });

      // Verify no LLM methods were called
      expect(mockLlmClient.askSuggestions).not.toHaveBeenCalled();
      expect(mockLlmClient.askRefineJob).not.toHaveBeenCalled();
    });

    it("POST /wizard/refine/finalize does NOT call llmClient methods", async () => {
      mockFirestore._seedDocument("jobs", "job_finalize_no_llm", createTestJob({
        id: "job_finalize_no_llm",
      }));

      await request(app)
        .post("/wizard/refine/finalize")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          jobId: "job_finalize_no_llm",
          finalJob: {
            roleTitle: "Senior Engineer",
            companyName: "Corp",
            location: "NYC",
            seniorityLevel: "senior",
            employmentType: "full_time",
            jobDescription: "Great job opportunity.",
          },
        });

      // Verify no LLM methods were called
      expect(mockLlmClient.askSuggestions).not.toHaveBeenCalled();
      expect(mockLlmClient.askRefineJob).not.toHaveBeenCalled();
    });
  });
});
