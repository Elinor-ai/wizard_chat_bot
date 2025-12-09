/**
 * Schema Converter Utility
 *
 * Converts Zod schemas to JSON Schema format for use with LLM providers.
 * Supports both OpenAI (Structured Outputs) and Gemini (responseSchema) formats.
 */

import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Convert a Zod schema to a clean JSON Schema for LLM providers.
 *
 * @param {import('zod').ZodTypeAny} zodSchema - The Zod schema to convert
 * @param {string} [name] - Optional name for the schema (used by OpenAI)
 * @returns {object} - Clean JSON Schema object
 */
export function zodToCleanJsonSchema(zodSchema, name = "response") {
  if (!zodSchema) {
    return null;
  }

  const jsonSchema = zodToJsonSchema(zodSchema, {
    name,
    $refStrategy: "none", // Inline all refs for maximum compatibility
    errorMessages: false, // Don't include error messages
  });

  // Remove Zod-specific artifacts and $schema
  return cleanSchema(jsonSchema?.definitions?.[name] ?? jsonSchema);
}

/**
 * Clean a JSON Schema by removing provider-incompatible properties.
 *
 * @param {object} schema - The JSON Schema to clean
 * @returns {object} - Cleaned schema
 */
function cleanSchema(schema) {
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const cleaned = {};

  for (const [key, value] of Object.entries(schema)) {
    // Skip Zod-specific and meta properties
    if (
      key === "$schema" ||
      key === "definitions" ||
      key === "$ref" ||
      key === "default" || // Defaults can cause issues
      key === "examples" ||
      key === "errorMessage" ||
      key.startsWith("$")
    ) {
      continue;
    }

    if (key === "additionalProperties") {
      // OpenAI strict mode requires additionalProperties: false for objects
      cleaned[key] = value === true ? undefined : value;
      continue;
    }

    if (Array.isArray(value)) {
      cleaned[key] = value.map((item) =>
        typeof item === "object" ? cleanSchema(item) : item
      );
    } else if (typeof value === "object" && value !== null) {
      cleaned[key] = cleanSchema(value);
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

/**
 * Format a JSON Schema for OpenAI's Structured Outputs API.
 *
 * OpenAI expects:
 * {
 *   response_format: {
 *     type: "json_schema",
 *     json_schema: {
 *       name: "schema_name",
 *       strict: true,
 *       schema: { ... }
 *     }
 *   }
 * }
 *
 * @param {import('zod').ZodTypeAny} zodSchema - The Zod schema
 * @param {string} [name] - Schema name (default: "response")
 * @returns {object} - OpenAI response_format object
 */
export function formatForOpenAI(zodSchema, name = "response") {
  const jsonSchema = zodToCleanJsonSchema(zodSchema, name);

  if (!jsonSchema) {
    return null;
  }

  // OpenAI strict mode requires additionalProperties: false on all objects
  enforceStrictMode(jsonSchema);

  return {
    type: "json_schema",
    json_schema: {
      name,
      strict: true,
      schema: jsonSchema,
    },
  };
}

/**
 * Recursively enforce strict mode requirements for OpenAI.
 * Sets additionalProperties: false on all object types.
 *
 * @param {object} schema - The schema to modify in place
 */
function enforceStrictMode(schema) {
  if (!schema || typeof schema !== "object") {
    return;
  }

  if (schema.type === "object") {
    schema.additionalProperties = false;

    // Process properties
    if (schema.properties) {
      for (const prop of Object.values(schema.properties)) {
        enforceStrictMode(prop);
      }
    }
  }

  if (schema.type === "array" && schema.items) {
    enforceStrictMode(schema.items);
  }

  // Handle anyOf, oneOf, allOf
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    if (Array.isArray(schema[key])) {
      for (const item of schema[key]) {
        enforceStrictMode(item);
      }
    }
  }
}

/**
 * Format a JSON Schema for Gemini's responseSchema parameter.
 *
 * Gemini expects the schema directly in generationConfig.responseSchema
 *
 * @param {import('zod').ZodTypeAny} zodSchema - The Zod schema
 * @returns {object} - Clean JSON Schema for Gemini
 */
export function formatForGemini(zodSchema) {
  const jsonSchema = zodToCleanJsonSchema(zodSchema);

  if (!jsonSchema) {
    return null;
  }

  // Gemini doesn't support some JSON Schema features
  return removeUnsupportedGeminiFeatures(jsonSchema);
}

/**
 * Remove JSON Schema features not supported by Gemini.
 *
 * @param {object} schema - The schema to clean
 * @returns {object} - Cleaned schema
 */
function removeUnsupportedGeminiFeatures(schema) {
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const cleaned = { ...schema };

  // Gemini doesn't support these
  delete cleaned.$id;
  delete cleaned.$comment;
  delete cleaned.title;
  delete cleaned.examples;
  delete cleaned.default;

  // Process nested schemas
  if (cleaned.properties) {
    cleaned.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      cleaned.properties[key] = removeUnsupportedGeminiFeatures(value);
    }
  }

  if (cleaned.items) {
    cleaned.items = removeUnsupportedGeminiFeatures(schema.items);
  }

  for (const key of ["anyOf", "oneOf", "allOf"]) {
    if (Array.isArray(cleaned[key])) {
      cleaned[key] = cleaned[key].map(removeUnsupportedGeminiFeatures);
    }
  }

  return cleaned;
}
