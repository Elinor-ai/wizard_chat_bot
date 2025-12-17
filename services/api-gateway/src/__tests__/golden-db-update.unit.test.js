/**
 * @file golden-db-update.unit.test.js
 * Unit tests for the golden_db_update (Saver Agent) parser and prompt builder.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseGoldenDbUpdateResult } from "../llm/parsers/golden-db-update.js";
import {
  buildGoldenDbUpdatePrompt,
  buildGoldenDbUpdateSystemPrompt,
} from "../llm/prompts/golden-db-update.js";

// Mock the logger to avoid console noise during tests
vi.mock("../llm/logger.js", () => ({
  llmLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Golden DB Update Parser", () => {
  describe("parseGoldenDbUpdateResult", () => {
    it("parses valid JSON response with updates", () => {
      const response = {
        json: {
          updates: {
            "financial_reality.base_compensation.amount_or_range": 120000,
            "financial_reality.base_compensation.currency": "USD",
          },
          reasoning: "Extracted salary information from user input",
        },
      };

      const result = parseGoldenDbUpdateResult(response, {});

      expect(result).toHaveProperty("updates");
      expect(result.updates).toEqual({
        "financial_reality.base_compensation.amount_or_range": 120000,
        "financial_reality.base_compensation.currency": "USD",
      });
      expect(result).toHaveProperty("reasoning", "Extracted salary information from user input");
    });

    it("parses text response when json is not available", () => {
      const response = {
        text: JSON.stringify({
          updates: {
            "role_overview.job_title": "Software Engineer",
          },
          reasoning: "Job title extracted",
        }),
      };

      const result = parseGoldenDbUpdateResult(response, {});

      expect(result.updates).toEqual({
        "role_overview.job_title": "Software Engineer",
      });
    });

    it("returns empty updates when no data to extract", () => {
      const response = {
        json: {
          updates: {},
          reasoning: "No factual data found to extract",
        },
      };

      const result = parseGoldenDbUpdateResult(response, {});

      expect(result.updates).toEqual({});
      expect(result.reasoning).toBe("No factual data found to extract");
    });

    it("filters out null and undefined values from updates", () => {
      const response = {
        json: {
          updates: {
            "field.valid": "value",
            "field.null": null,
            "field.undefined": undefined,
            "field.number": 42,
          },
          reasoning: "Test filtering",
        },
      };

      const result = parseGoldenDbUpdateResult(response, {});

      expect(result.updates).toEqual({
        "field.valid": "value",
        "field.number": 42,
      });
      expect(result.updates).not.toHaveProperty("field.null");
      expect(result.updates).not.toHaveProperty("field.undefined");
    });

    it("returns error when response is invalid JSON", () => {
      const response = {
        text: "This is not JSON",
      };

      const result = parseGoldenDbUpdateResult(response, {});

      expect(result).toHaveProperty("error");
      expect(result.error).toHaveProperty("reason", "structured_missing");
    });

    it("returns empty updates when updates field is missing (uses fallback)", () => {
      // The parser uses fallbacks (extraction.updates, fields, or {}) when updates is missing
      const response = {
        json: {
          someOtherField: "value",
        },
      };

      const result = parseGoldenDbUpdateResult(response, {});

      // Parser falls back to empty object, doesn't error
      expect(result).toHaveProperty("updates");
      expect(result.updates).toEqual({});
    });

    it("handles alternative field names (extraction.updates)", () => {
      const response = {
        json: {
          extraction: {
            updates: {
              "field.path": "value",
            },
          },
          reasoning: "From alternative format",
        },
      };

      const result = parseGoldenDbUpdateResult(response, {});

      expect(result.updates).toEqual({
        "field.path": "value",
      });
    });

    it("handles alternative field names (fields)", () => {
      const response = {
        json: {
          fields: {
            "another.path": 123,
          },
          reasoning: "From fields format",
        },
      };

      const result = parseGoldenDbUpdateResult(response, {});

      expect(result.updates).toEqual({
        "another.path": 123,
      });
    });

    it("includes metadata from response", () => {
      const response = {
        json: {
          updates: { "test.field": "value" },
          reasoning: "Test",
        },
        metadata: {
          promptTokens: 100,
          candidateTokens: 50,
          totalTokens: 150,
        },
      };

      const result = parseGoldenDbUpdateResult(response, {});

      expect(result.metadata).toEqual({
        promptTokens: 100,
        candidateTokens: 50,
        totalTokens: 150,
      });
    });

    it("skips invalid keys (empty strings)", () => {
      const response = {
        json: {
          updates: {
            "valid.key": "value",
            "": "should be skipped",
          },
          reasoning: "Test invalid keys",
        },
      };

      const result = parseGoldenDbUpdateResult(response, {});

      expect(result.updates).toEqual({
        "valid.key": "value",
      });
    });
  });
});

describe("Golden DB Update Prompt Builder", () => {
  describe("buildGoldenDbUpdateSystemPrompt", () => {
    it("returns a non-empty system prompt", () => {
      const prompt = buildGoldenDbUpdateSystemPrompt();

      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("includes key instructions about data extraction", () => {
      const prompt = buildGoldenDbUpdateSystemPrompt();

      expect(prompt).toContain("Data Extraction");
      expect(prompt).toContain("JSON");
      expect(prompt).toContain("updates");
    });

    it("includes data normalization rules", () => {
      const prompt = buildGoldenDbUpdateSystemPrompt();

      expect(prompt).toContain("Numbers");
      expect(prompt).toContain("Booleans");
      expect(prompt).toContain("Arrays");
    });
  });

  describe("buildGoldenDbUpdatePrompt", () => {
    it("builds prompt with user input", () => {
      const context = {
        userMessage: "The salary is $120,000",
        lastAskedField: "financial_reality.base_compensation.amount_or_range",
        currentSchema: {},
        conversationHistory: [],
      };

      const prompt = buildGoldenDbUpdatePrompt(context);

      expect(prompt).toContain("$120,000");
      expect(prompt).toContain("financial_reality.base_compensation.amount_or_range");
    });

    it("includes conversation history context", () => {
      const context = {
        userMessage: "50k",
        lastAskedField: null,
        currentSchema: {},
        conversationHistory: [
          { role: "assistant", content: "What is the salary?" },
          { role: "user", content: "Around 50k" },
        ],
      };

      const prompt = buildGoldenDbUpdatePrompt(context);

      expect(prompt).toContain("What is the salary?");
    });

    it("includes current schema state", () => {
      const context = {
        userMessage: "Test",
        currentSchema: {
          role_overview: {
            job_title: "Engineer",
          },
        },
        conversationHistory: [],
      };

      const prompt = buildGoldenDbUpdatePrompt(context);

      expect(prompt).toContain("Engineer");
    });

    it("handles UI response input", () => {
      const context = {
        uiResponse: { value: 85000, type: "slider" },
        lastAskedField: "financial_reality.base_compensation.amount_or_range",
        currentSchema: {},
        conversationHistory: [],
      };

      const prompt = buildGoldenDbUpdatePrompt(context);

      expect(prompt).toContain("85000");
    });

    it("adds strict mode instructions on retry", () => {
      const context = {
        userMessage: "Test",
        currentSchema: {},
        conversationHistory: [],
        attempt: 1,
        strictMode: true,
      };

      const prompt = buildGoldenDbUpdatePrompt(context);

      expect(prompt).toContain("RETRY MODE");
    });

    it("handles missing lastAskedField gracefully", () => {
      const context = {
        userMessage: "Test message",
        currentSchema: {},
        conversationHistory: [],
      };

      const prompt = buildGoldenDbUpdatePrompt(context);

      expect(prompt).toContain("Not specified");
    });
  });
});
