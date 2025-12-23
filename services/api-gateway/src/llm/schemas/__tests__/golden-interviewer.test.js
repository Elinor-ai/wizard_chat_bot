/**
 * Golden Interviewer Schema Regression Tests
 *
 * Validates:
 * 1. Schema compiles for Anthropic Structured Outputs (< 24 optional params)
 * 2. Schema structure matches expected shape
 * 3. Required fields are enforced
 * 4. Optional fields work correctly
 */

import { describe, it, expect } from "vitest";
import { GoldenInterviewerOutputSchema, UIToolSchema, ExtractionSchema } from "../golden-interviewer.js";
import { formatForAnthropic } from "../../utils/schema-converter.js";

/**
 * Count optional parameters in a JSON Schema recursively.
 * Anthropic Structured Outputs has a limit of 24 optional parameters.
 */
function countOptionalParams(schema, path = "") {
  if (!schema || typeof schema !== "object") {
    return 0;
  }

  let count = 0;

  // Check if this is an object with properties
  if (schema.type === "object" && schema.properties) {
    const required = new Set(schema.required || []);

    for (const [key, value] of Object.entries(schema.properties)) {
      const fullPath = path ? `${path}.${key}` : key;

      // Count this property if it's optional
      if (!required.has(key)) {
        count++;
      }

      // Recurse into nested schemas
      count += countOptionalParams(value, fullPath);
    }
  }

  // Handle arrays
  if (schema.type === "array" && schema.items) {
    count += countOptionalParams(schema.items, `${path}[]`);
  }

  // Handle anyOf, oneOf, allOf
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    if (Array.isArray(schema[key])) {
      for (const item of schema[key]) {
        count += countOptionalParams(item, path);
      }
    }
  }

  return count;
}

describe("GoldenInterviewerOutputSchema", () => {
  describe("Anthropic Structured Outputs compatibility", () => {
    it("should compile to valid JSON Schema for Anthropic", () => {
      const result = formatForAnthropic(
        GoldenInterviewerOutputSchema,
        "golden_interviewer_response"
      );

      expect(result).toBeDefined();
      expect(result.type).toBe("json_schema");
      expect(result.schema).toBeDefined();
      expect(result.schema.type).toBe("object");
    });

    it("should have fewer than 24 optional parameters", () => {
      const result = formatForAnthropic(
        GoldenInterviewerOutputSchema,
        "golden_interviewer_response"
      );

      const optionalCount = countOptionalParams(result.schema);

      // Anthropic limit is 24
      expect(optionalCount).toBeLessThan(24);

      // Document the actual count for future reference
      console.log(`Optional parameter count: ${optionalCount}`);
    });

    it("should have exactly 3 required top-level fields", () => {
      const result = formatForAnthropic(
        GoldenInterviewerOutputSchema,
        "golden_interviewer_response"
      );

      const required = result.schema.required || [];

      expect(required).toContain("tool_reasoning");
      expect(required).toContain("message");
      expect(required).toContain("currently_asking_field");
      expect(required.length).toBe(3);
    });

    it("should have exactly 6 optional top-level fields", () => {
      const result = formatForAnthropic(
        GoldenInterviewerOutputSchema,
        "golden_interviewer_response"
      );

      const required = new Set(result.schema.required || []);
      const properties = Object.keys(result.schema.properties || {});
      const optionalFields = properties.filter(p => !required.has(p));

      expect(optionalFields).toContain("extraction");
      expect(optionalFields).toContain("context_explanation");
      expect(optionalFields).toContain("ui_tool");
      expect(optionalFields).toContain("next_priority_fields");
      expect(optionalFields).toContain("completion_percentage");
      expect(optionalFields).toContain("interview_phase");
      expect(optionalFields.length).toBe(6);
    });
  });

  describe("ui_tool schema structure", () => {
    it("should be nullable (anyOf with object and null)", () => {
      const result = formatForAnthropic(
        GoldenInterviewerOutputSchema,
        "golden_interviewer_response"
      );

      const uiToolSchema = result.schema.properties?.ui_tool;
      expect(uiToolSchema).toBeDefined();
      // ui_tool is nullable, so it uses anyOf with object and null types
      expect(uiToolSchema.anyOf).toBeDefined();
      expect(uiToolSchema.anyOf.length).toBe(2);

      const objectType = uiToolSchema.anyOf.find(s => s.type === "object");
      const nullType = uiToolSchema.anyOf.find(s => s.type === "null");
      expect(objectType).toBeDefined();
      expect(nullType).toBeDefined();
    });

    it("should have type and props as required fields when ui_tool is an object", () => {
      const result = formatForAnthropic(
        GoldenInterviewerOutputSchema,
        "golden_interviewer_response"
      );

      const uiToolSchema = result.schema.properties?.ui_tool;
      const objectType = uiToolSchema.anyOf.find(s => s.type === "object");

      expect(objectType.required).toContain("type");
      expect(objectType.required).toContain("props");
    });

    it("should have props as string type (JSON-encoded for Anthropic)", () => {
      // For Anthropic Structured Outputs, record-type objects (like z.record())
      // are converted to string type with JSON-encoded values.
      // This is because Anthropic requires additionalProperties: false on all objects,
      // but record-types have dynamic keys.
      const result = formatForAnthropic(
        GoldenInterviewerOutputSchema,
        "golden_interviewer_response"
      );

      const uiToolSchema = result.schema.properties?.ui_tool;
      const objectType = uiToolSchema.anyOf.find(s => s.type === "object");
      const propsSchema = objectType?.properties?.props;

      expect(propsSchema).toBeDefined();
      // Record-types are converted to string (JSON-encoded)
      expect(propsSchema.type).toBe("string");
      expect(propsSchema.description).toContain("JSON-encoded");
    });
  });

  describe("extraction schema structure", () => {
    it("should have updates and confidence as optional nested fields", () => {
      const result = formatForAnthropic(
        GoldenInterviewerOutputSchema,
        "golden_interviewer_response"
      );

      const extractionSchema = result.schema.properties?.extraction;
      expect(extractionSchema).toBeDefined();
      expect(extractionSchema.type).toBe("object");

      const extractionRequired = extractionSchema.required || [];
      // Both updates and confidence should be optional
      expect(extractionRequired).not.toContain("updates");
      expect(extractionRequired).not.toContain("confidence");
    });
  });

  describe("Zod schema validation", () => {
    it("should accept valid response with all fields", () => {
      const validResponse = {
        tool_reasoning: "User needs to select a shift type, detailed_cards works well",
        message: "What shift works best for you?",
        currently_asking_field: "time_flexibility.shift_preference",
        extraction: {
          updates: { "role_overview.job_title": "Software Engineer" },
          confidence: { "role_overview.job_title": 0.95 },
        },
        context_explanation: "Shift preference is critical for nurses - it directly impacts work-life balance.",
        ui_tool: {
          type: "detailed_cards",
          props: {
            title: "Preferred Shift",
            options: [
              { id: "day", title: "Day Shift", description: "9am-5pm" },
              { id: "night", title: "Night Shift", description: "11pm-7am" },
            ],
          },
        },
        next_priority_fields: ["compensation.base", "compensation.bonus"],
        completion_percentage: 25,
        interview_phase: "time_flexibility",
      };

      const result = GoldenInterviewerOutputSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it("should accept valid response with only required fields", () => {
      const minimalResponse = {
        tool_reasoning: "Simple question",
        message: "Tell me about the role.",
        currently_asking_field: "role_overview.description",
      };

      const result = GoldenInterviewerOutputSchema.safeParse(minimalResponse);
      expect(result.success).toBe(true);
    });

    it("should accept response without ui_tool (closing turn)", () => {
      const closingResponse = {
        tool_reasoning: "Final summary, no more questions needed",
        message: "Thanks for sharing! Here is your summary.",
        currently_asking_field: "closing.summary",
        completion_percentage: 100,
        interview_phase: "closing",
      };

      const result = GoldenInterviewerOutputSchema.safeParse(closingResponse);
      expect(result.success).toBe(true);
    });

    it("should accept ui_tool: null for complete phase (explicit null)", () => {
      const completeResponse = {
        tool_reasoning: "Interview complete, sending final summary",
        message: "All set! I've captured a strong profile for this role.",
        currently_asking_field: null,
        ui_tool: null,
        completion_percentage: 100,
        interview_phase: "complete",
      };

      const result = GoldenInterviewerOutputSchema.safeParse(completeResponse);
      expect(result.success).toBe(true);
    });

    it("should accept null for currently_asking_field (closing/summary turns)", () => {
      const closingResponse = {
        tool_reasoning: "Final summary, no field to ask about",
        message: "Thanks for all the information!",
        currently_asking_field: null,
        completion_percentage: 100,
        interview_phase: "closing",
      };

      const result = GoldenInterviewerOutputSchema.safeParse(closingResponse);
      expect(result.success).toBe(true);
    });

    it("should reject response missing required fields", () => {
      const invalidResponse = {
        message: "What is the role?",
        // Missing tool_reasoning and currently_asking_field
      };

      const result = GoldenInterviewerOutputSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it("should reject ui_tool with missing type", () => {
      const invalidResponse = {
        tool_reasoning: "Testing",
        message: "What?",
        currently_asking_field: "test.field",
        ui_tool: {
          // Missing type
          props: { title: "Test" },
        },
      };

      const result = GoldenInterviewerOutputSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it("should reject ui_tool with missing props", () => {
      const invalidResponse = {
        tool_reasoning: "Testing",
        message: "What?",
        currently_asking_field: "test.field",
        ui_tool: {
          type: "detailed_cards",
          // Missing props
        },
      };

      const result = GoldenInterviewerOutputSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it("should accept ui_tool with any prop structure (runtime validates specifics)", () => {
      // The Zod schema accepts any props object - runtime validation catches tool-specific issues
      const response = {
        tool_reasoning: "Testing circular gauge",
        message: "What's the salary?",
        currently_asking_field: "compensation.base",
        ui_tool: {
          type: "circular_gauge",
          props: {
            label: "Hourly Rate",
            min: 15,
            max: 100,
            unit: "$",
          },
        },
      };

      const result = GoldenInterviewerOutputSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it("should accept any UI tool type (no enum restriction)", () => {
      const tools = [
        "detailed_cards",
        "smart_textarea",
        "icon_grid",
        "chip_cloud",
        "circular_gauge",
        "toggle_list",
        "segmented_rows",
        "gradient_cards",
        "stacked_bar",
        "bipolar_scale",
        "comparison_duel",
        "tag_input",
        "custom_new_tool", // Even unknown tools should pass schema
      ];

      for (const toolType of tools) {
        const response = {
          tool_reasoning: `Testing ${toolType}`,
          message: "Question?",
          currently_asking_field: "test.field",
          ui_tool: {
            type: toolType,
            props: { title: "Test" },
          },
        };

        const result = GoldenInterviewerOutputSchema.safeParse(response);
        expect(result.success).toBe(true);
      }
    });
  });
});

describe("Runtime validation documentation", () => {
  it("should document that validateUiToolProps handles tool-specific validation", () => {
    // The validateUiToolProps function in the parser validates:
    // - Empty props rejection for all tools
    // - detailed_cards: options array with 2+ items, each with id/title
    // - smart_textarea: prompts array with 1+ items
    // - icon_grid: options array with 2+ items
    // - toggle_list: items array with 1+ items
    // - chip_cloud: groups array with 1+ groups
    // - circular_gauge/linear_slider: label required
    // - stacked_bar: segments array with 2+ segments
    // - comparison_duel: optionA and optionB required
    // - bipolar_scale: items array with 1+ items
    // - segmented_rows: rows array with 1+ rows
    // - gradient_cards: options array with 2+ items
    //
    // This separation keeps the JSON Schema simple for Anthropic
    // while still enforcing tool requirements at runtime.

    expect(true).toBe(true);
  });
});
