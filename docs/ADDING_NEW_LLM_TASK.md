# Complete Guide to Adding a New LLM Task

> This document provides a detailed description of all the steps and nuances required to add a new LLM task to the system.

---

## Table of Contents

1. [The Golden Rule](#the-golden-rule)
2. [Architecture Overview](#architecture-overview)
3. [File Map](#file-map)
4. [Complete Request Flow](#complete-request-flow)
5. [8 Steps to Add a Task](#8-steps-to-add-a-task)
6. [Complete Code Examples](#complete-code-examples)
7. [What NOT to Do (Anti-patterns)](#what-not-to-do-anti-patterns)
8. [Temperature & Best Practices](#temperature--best-practices)
9. [Error Handling](#error-handling)
10. [Structured Output with Zod](#structured-output-with-zod)

---

## The Golden Rule

> **Every LLM call in the system MUST go through `POST /api/llm`**

This is the ONLY entry point for all AI invocations. No exceptions.

### Why This Matters

| Reason | Explanation |
|--------|-------------|
| **Usage Tracking** | Every call is logged to Firestore and BigQuery for billing |
| **Authentication** | The endpoint is protected by `requireAuth` middleware |
| **Consistency** | Unified error handling, retries, and response format |
| **Cost Control** | Centralized pricing calculation and credit deduction |

---

## Architecture Overview

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React)                                                           │
│                                                                             │
│  api-client.js                                                              │
│       │                                                                     │
│       │  fetch("/api/llm", { taskType: "my_task", context: {...} })        │
│       ▼                                                                     │
└───────┬─────────────────────────────────────────────────────────────────────┘
        │
        │ HTTP POST
        ▼
┌───────┴─────────────────────────────────────────────────────────────────────┐
│  BACKEND (Node.js/Express)                                                  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  routes/llm.js                          ← Single entry point         │  │
│  │    • Validates taskType                                              │  │
│  │    • Enriches context (loads job, company data)                      │  │
│  │    • Calls llmClient method                                          │  │
│  │    • Records usage for billing                                       │  │
│  └────────────────────────────┬─────────────────────────────────────────┘  │
│                               │                                             │
│                               ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  llm-client.js                          ← Wrapper methods per task   │  │
│  │    • askSuggestions()                                                │  │
│  │    • askRefineJob()                                                  │  │
│  │    • askMyNewTask() ← Add here                                       │  │
│  └────────────────────────────┬─────────────────────────────────────────┘  │
│                               │                                             │
│                               ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  llm/orchestrator.js                    ← Execution engine           │  │
│  │    • Selects provider+model per task                                 │  │
│  │    • Builds prompts (system + user)                                  │  │
│  │    • Retry loop with strictMode                                      │  │
│  │    • Parses responses                                                │  │
│  └────────────────────────────┬─────────────────────────────────────────┘  │
│                               │                                             │
│                               ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  llm/providers/*-adapter.js             ← Provider adapters          │  │
│  │    • gemini-adapter.js                                               │  │
│  │    • openai-adapter.js                                               │  │
│  └────────────────────────────┬─────────────────────────────────────────┘  │
│                               │                                             │
└───────────────────────────────┼─────────────────────────────────────────────┘
                                │
                                │ HTTPS
                                ▼
┌───────────────────────────────┴─────────────────────────────────────────────┐
│  EXTERNAL AI PROVIDERS                                                       │
│                                                                              │
│    Google Gemini    │    OpenAI GPT-4    │    Anthropic Claude              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Key Principles

| Principle | Explanation |
|-----------|-------------|
| **Single Source of Truth** | Every task type is defined once in `task-types.js` |
| **Separation of Concerns** | Each layer does one thing only |
| **Retry Logic** | The orchestrator retries with `strictMode=true` on failure |
| **Usage Tracking** | Every call is logged to Firestore and BigQuery |

---

## File Map

```
services/api-gateway/src/
│
├── server.js                     # Mounts /api/llm endpoint
│
├── routes/
│   └── llm.js                    # ← HTTP endpoint handler - entry point
│
├── llm-client.js                 # ← Methods for each task (askSuggestions, etc.)
│
├── config/
│   ├── task-types.js             # ← Task name constants (MUST add here)
│   ├── llm-config.js             # ← Task → provider+model mapping (MUST add here)
│   └── pricing-rates.js          # Pricing per provider+model
│
├── llm/
│   ├── orchestrator.js           # Execution engine with retry
│   ├── tasks.js                  # ← TASK_REGISTRY - all task definitions (MUST add here)
│   ├── logger.js                 # LLM-specific logger
│   │
│   ├── prompts/                  # ← Prompt builders (MUST create new file)
│   │   ├── suggest.js
│   │   ├── refine.js
│   │   ├── channels.js
│   │   └── my-new-task.js        # ← Create here
│   │
│   ├── parsers/                  # ← Response parsers (MUST create new file)
│   │   ├── suggest.js
│   │   ├── refine.js
│   │   ├── channels.js
│   │   └── my-new-task.js        # ← Create here
│   │
│   ├── schemas/
│   │   └── index.js              # ← Zod schemas for structured output (optional)
│   │
│   ├── providers/
│   │   ├── selection-policy.js   # Provider selection logic
│   │   ├── gemini-adapter.js
│   │   └── openai-adapter.js
│   │
│   └── utils/
│       └── parsing.js            # Parsing helper functions
│
└── services/
    └── llm-usage-ledger.js       # Usage recording and pricing
```

---

## Complete Request Flow

### Example: Suggestions Request

```
1. Frontend sends:
   POST /api/llm
   { "taskType": "suggest", "context": { "jobId": "job-123", "visibleFieldIds": ["coreDuties"] } }

2. llmRouter (routes/llm.js):
   a. Validation: taskType exists in CORE_LLM_TASKS or ORCHESTRATOR_TASKS
   b. Loads enriched context:
      - Job from Firestore
      - Company context
      - Previous suggestions (for cache check)
   c. If valid cache exists and no forceRefresh → returns directly

3. llmClient.askSuggestions(enrichedContext):
   a. Calls orchestrator.run("suggest", context)
   b. On success: returns { provider, model, candidates, metadata }
   c. On failure: returns { error: { reason, message } }

4. orchestrator.run("suggest", context):
   a. Looks up TASK_REGISTRY["suggest"]
   b. Calls policy.select("suggest") → { provider: "gemini", model: "gemini-3-pro-preview" }
   c. Retry loop (up to 2 times):
      - task.builder(context) → builds prompt
      - adapter.invoke(options) → calls Gemini
      - task.parser(response) → parses response
      - On success → returns
      - On failure → retry with strictMode=true

5. Back to llmRouter:
   a. Saves to Firestore (overwriteSuggestionDocument)
   b. Records usage (recordLlmUsageFromResult)
   c. Returns response to client
```

---

## 8 Steps to Add a Task

### Quick Summary

| # | File | Action |
|---|------|--------|
| 1 | `config/task-types.js` | Add constant to `LLM_CORE_TASK` |
| 2 | `config/llm-config.js` | Add to `GEMINI_TASKS` or create specific config |
| 3 | `llm/prompts/my-task.js` | Create builder function |
| 4 | `llm/parsers/my-task.js` | Create parser function |
| 5 | `llm/schemas/index.js` | Add Zod schema (optional but highly recommended) |
| 6 | `llm/tasks.js` | Add to `TASK_REGISTRY` |
| 7 | `llm-client.js` | Add method and export |
| 8 | `routes/llm.js` | Add to `TASK_METHOD_MAP` (and possibly special logic) |

---

### Step 1: Define Task Type

**File:** `services/api-gateway/src/config/task-types.js`

```javascript
/**
 * Constant identifiers for atomic LLM tasks that make direct calls to AI providers.
 * Each task has a corresponding entry in TASK_REGISTRY and TASK_METHOD_MAP.
 */
export const LLM_CORE_TASK = {
  SUGGEST: "suggest",
  REFINE: "refine",
  CHANNELS: "channels",
  // ... existing tasks ...

  // ========== ADD HERE ==========
  MY_NEW_TASK: "my_new_task",
};
```

**Important:**
- The name must be `snake_case` (e.g., `my_new_task`)
- The constant must be `SCREAMING_SNAKE_CASE` (e.g., `MY_NEW_TASK`)
- Do NOT modify existing constants!

---

### Step 2: Configure Provider + Model

**File:** `services/api-gateway/src/config/llm-config.js`

**Option A - Task uses Gemini like most tasks:**

```javascript
// All CORE_LLM_TASKS that use Gemini
const GEMINI_TASKS = [
  LLM_CORE_TASK.SUGGEST,
  LLM_CORE_TASK.REFINE,
  LLM_CORE_TASK.CHANNELS,
  // ... existing tasks ...

  // ========== ADD HERE ==========
  LLM_CORE_TASK.MY_NEW_TASK,
];
```

**Option B - Task needs a different provider/model:**

```javascript
// After the GEMINI_TASKS reduce block
config[LLM_CORE_TASK.MY_NEW_TASK] = {
  provider: "openai",     // or "gemini", "anthropic"
  model: "gpt-4o"         // the specific model
};
```

**Very Important:**
> If a task exists in `TASK_REGISTRY` but not in `LLM_TASK_CONFIG`, the app will crash on startup!

---

### Step 3: Create Prompt Builder

**New File:** `services/api-gateway/src/llm/prompts/my-new-task.js`

```javascript
import { llmLogger } from "../logger.js";

/**
 * Builds the prompt for MY_NEW_TASK.
 *
 * @param {object} context - The context object passed from the router
 * @param {string} [context.companyContext] - Company information
 * @param {object} [context.jobSnapshot] - Current job data
 * @param {number} [context.attempt] - Current retry attempt (0-based)
 * @param {boolean} [context.strictMode] - True on retry attempts
 * @returns {string} The complete user prompt
 */
export function buildMyNewTaskPrompt(context = {}) {
  const {
    companyContext = "",
    jobSnapshot = {},
    customField = null,        // task-specific fields
    attempt = 0,
    strictMode = false,
  } = context;

  // ===== 1. Strict Mode Instructions (for retries) =====
  const strictNotes = strictMode
    ? "CRITICAL: Previous output was invalid JSON. Return ONLY a valid JSON object matching the exact contract below. No text before or after."
    : null;

  // ===== 2. Define Expected Response Structure =====
  const responseContract = {
    resultField: "string (description of what this should contain)",
    items: [
      {
        id: "string",
        value: "string | number",
        confidence: "number (0.0 to 1.0)",
      }
    ],
    summary: "string (optional summary)",
  };

  // ===== 3. Example of Correct Response =====
  const exampleResponse = {
    resultField: "Example result",
    items: [
      { id: "item-1", value: "Sample value", confidence: 0.9 },
      { id: "item-2", value: 42, confidence: 0.85 },
    ],
    summary: "This is a summary of the result.",
  };

  // ===== 4. Guardrails - Quality Rules =====
  const guardrails = [
    "DO NOT invent data not supported by the input.",
    "Respect the context and constraints provided.",
    "Return ONLY valid JSON matching the contract.",
    "Be concise but accurate.",
  ];

  // ===== 5. Build the Complete Prompt =====
  const prompt = [
    // Role and mission
    "ROLE: You are an expert [domain] assistant.",
    "MISSION: [Brief description of what this task accomplishes]",
    "",

    // Company context (if available)
    companyContext
      ? `COMPANY CONTEXT:\n${companyContext}`
      : "COMPANY CONTEXT: None provided.",
    "",

    // Input data
    "INPUT DATA:",
    JSON.stringify(jobSnapshot, null, 2),
    "",

    // Task-specific fields
    customField ? `CUSTOM FIELD: ${customField}` : "",
    "",

    // Quality rules
    "GUARDRAILS:",
    guardrails.map((g) => `- ${g}`).join("\n"),
    "",

    // Required response structure
    "RESPONSE CONTRACT (must match exactly):",
    JSON.stringify(responseContract, null, 2),
    "",

    // Example
    "EXAMPLE RESPONSE:",
    JSON.stringify(exampleResponse, null, 2),
    "",

    // Strict mode instructions (if relevant)
    strictNotes ? `STRICT MODE: ${strictNotes}` : "",
    "",

    // Attempt number (for debugging)
    `ATTEMPT: ${attempt}`,
  ]
    .filter(Boolean)
    .join("\n");

  // ===== 6. Logging =====
  llmLogger.info(
    {
      task: "my_new_task",
      promptLength: prompt.length,
      attempt,
      strictMode,
    },
    "LLM my_new_task prompt built"
  );

  return prompt;
}
```

**Key Points:**

1. **`strictMode`** - The orchestrator passes `strictMode=true` on retries. You MUST add stricter instructions!

2. **`responseContract`** - Explicitly define the expected structure. This helps the LLM understand what you want.

3. **`exampleResponse`** - A real example greatly improves accuracy.

4. **Prompt Order** - Recommended structure:
   - ROLE + MISSION
   - CONTEXT (company, job data)
   - GUARDRAILS
   - RESPONSE CONTRACT
   - EXAMPLE
   - STRICT MODE (if applicable)

---

### Step 4: Create Parser

**New File:** `services/api-gateway/src/llm/parsers/my-new-task.js`

```javascript
import { parseJsonContent, safePreview } from "../utils/parsing.js";

/**
 * Parses the LLM response for MY_NEW_TASK.
 *
 * IMPORTANT: This function should NEVER throw.
 * On error, return { error: { reason, message, rawPreview } }
 *
 * @param {object} response - The raw response from the adapter
 * @param {string} [response.text] - Raw text response
 * @param {object} [response.json] - Pre-parsed JSON (if structured output)
 * @param {object} [response.metadata] - Token counts and metadata
 * @param {object} _context - The original context (usually unused)
 * @returns {object} Parsed result or error object
 */
export function parseMyNewTaskResult(response, _context) {
  // ===== 1. Try response.json first (from structured output) =====
  // Then fallback to parsing from text
  const parsed =
    response?.json && typeof response.json === "object"
      ? response.json
      : parseJsonContent(response?.text);

  // ===== 2. Basic Validation =====
  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        reason: "structured_missing",
        rawPreview: safePreview(response?.text),
        message: "LLM did not return valid JSON for my_new_task",
      },
    };
  }

  // ===== 3. Required Field Validation =====
  if (!parsed.resultField) {
    return {
      error: {
        reason: "missing_field",
        rawPreview: safePreview(response?.text),
        message: "Response missing required field: resultField",
      },
    };
  }

  // ===== 4. Data Normalization =====
  // Handle cases where LLM returns different field names
  const items = Array.isArray(parsed.items)
    ? parsed.items
    : Array.isArray(parsed.results)  // fallback to alternative name
      ? parsed.results
      : [];

  // ===== 5. Return Normalized Result =====
  return {
    resultField: parsed.resultField,
    items: items.map((item) => ({
      id: item.id ?? item.itemId ?? null,
      value: item.value ?? null,
      confidence: typeof item.confidence === "number" ? item.confidence : null,
    })),
    summary: parsed.summary ?? null,
    metadata: response?.metadata ?? null,
  };
}
```

**Key Points:**

1. **Never throw exceptions!** - Return `{ error: {...} }` instead

2. **Always include `rawPreview`** - Helps with debugging when response is invalid

3. **Check `response.json` first** - Gemini with structured output returns JSON directly

4. **Normalize field names** - The LLM might return `items` or `results` - support both

5. **Pass through `metadata`** - Contains token counts for billing

---

### Step 5: Add Zod Schema (Highly Recommended!)

**File:** `services/api-gateway/src/llm/schemas/index.js`

```javascript
import { z } from "zod";

// ... existing schemas ...

// =============================================================================
// MY_NEW_TASK
// =============================================================================

const MyNewTaskItemSchema = z.object({
  id: z.string().describe("Unique identifier for the item"),
  value: z.union([z.string(), z.number()]).describe("The item value"),
  confidence: z.number().min(0).max(1).optional().describe("Confidence score 0-1"),
});

export const MyNewTaskOutputSchema = z.object({
  resultField: z.string().describe("Main result field"),
  items: z.array(MyNewTaskItemSchema).describe("List of result items"),
  summary: z.string().optional().describe("Optional summary"),
});
```

**Why Is This Important?**

- Gemini supports **native structured output** - when you pass a schema, it forces the LLM to return valid JSON
- Significantly reduces parsing failures
- Documents the response structure in code

---

### Step 6: Register in TASK_REGISTRY

**File:** `services/api-gateway/src/llm/tasks.js`

```javascript
// ===== Add imports at the top of the file =====
import { buildMyNewTaskPrompt } from "./prompts/my-new-task.js";
import { parseMyNewTaskResult } from "./parsers/my-new-task.js";
import { MyNewTaskOutputSchema } from "./schemas/index.js";

export const TASK_REGISTRY = {
  // ... existing tasks ...

  // ===== Add the new task =====
  my_new_task: {
    // ===== System Prompt =====
    // Option A: Fixed prompt
    system: "You are an expert assistant for [domain]. Always respond with valid JSON matching the requested structure.",

    // Option B: Dynamic prompt (receives context)
    // systemBuilder: (context) => `You are assisting with ${context.domain}. Return JSON only.`,

    // ===== Prompt Builder =====
    builder: buildMyNewTaskPrompt,

    // ===== Response Parser =====
    parser: parseMyNewTaskResult,

    // ===== Response Format =====
    mode: "json",  // "json" or "text"

    // ===== Temperature =====
    // 0 = deterministic, 1 = creative
    // 0-0.15 for accurate tasks (suggest, refine)
    // 0.2-0.35 for slightly creative tasks (assets, captions)
    // 0.5+ for creative tasks (copilot)
    temperature: 0.2,

    // ===== Max Tokens =====
    // Single value or object with override per provider
    maxTokens: { default: 800, gemini: 4096 },

    // ===== Retry Configuration =====
    retries: 2,           // How many times to retry
    strictOnRetry: true,  // Enable strictMode on retry

    // ===== Preview Logger (optional) =====
    // previewLogger: logMyNewTaskPreview,

    // ===== Structured Output Schema (recommended!) =====
    outputSchema: MyNewTaskOutputSchema,
    outputSchemaName: "my_new_task_response",
  },
};
```

**Field Reference:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `system` | string | Yes* | Fixed system prompt |
| `systemBuilder` | function | No | Dynamic system prompt (receives context) |
| `builder` | function | Yes | Function that builds the user prompt |
| `parser` | function | Yes | Function that parses the response |
| `mode` | string | No | `"json"` or `"text"` (default: `"text"`) |
| `temperature` | number | No | 0-1, default: 0.2 |
| `maxTokens` | number/object | No | Token limit |
| `retries` | number | No | Number of attempts, default: 1 |
| `strictOnRetry` | boolean | No | Enable strict mode on retry |
| `outputSchema` | ZodSchema | No | Schema for structured output |
| `outputSchemaName` | string | No | Schema name (for debugging) |

*If `systemBuilder` exists, it takes precedence over `system`

---

### Step 7: Add Method to llmClient

**File:** `services/api-gateway/src/llm-client.js`

```javascript
// ===== Add import at the top (if not already present) =====
import { LLM_CORE_TASK } from "./config/task-types.js";

// ===== Add the function =====

/**
 * Execute MY_NEW_TASK via the LLM orchestrator.
 *
 * @param {object} context - Task context
 * @param {string} [context.jobId] - The job ID
 * @param {object} [context.jobSnapshot] - Current job data
 * @param {string} [context.companyContext] - Company information
 * @param {string} [context.customField] - Task-specific field
 * @returns {Promise<object>} Result with resultField, items, summary, or error
 */
async function askMyNewTask(context) {
  try {
    const result = await orchestrator.run(LLM_CORE_TASK.MY_NEW_TASK, context);

    // ===== Handle error from orchestrator =====
    if (result.error) {
      return {
        error: {
          ...result.error,
          provider: result.provider,
          model: result.model,
        },
      };
    }

    // ===== Return normalized result =====
    return {
      provider: result.provider,
      model: result.model,
      resultField: result.resultField ?? null,
      items: result.items ?? [],
      summary: result.summary ?? null,
      metadata: result.metadata ?? null,
    };
  } catch (error) {
    // ===== Handle unexpected exception =====
    llmLogger.warn({ err: error }, "askMyNewTask orchestrator failure");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error),
      },
    };
  }
}

// ===== Add to export at the end of the file =====
export const llmClient = {
  // ... existing methods ...
  askMyNewTask,
};
```

**Key Points:**

1. **Always wrap in try/catch** - Return `{ error: {...} }` instead of throwing

2. **Include provider and model in error** - Helps with debugging

3. **Normalize the result** - Provide defaults for optional fields

---

### Step 8: Update the Router

**File:** `services/api-gateway/src/routes/llm.js`

**Option A - Simple task (mapping only):**

```javascript
/**
 * Map of task types to llmClient method names.
 */
export const TASK_METHOD_MAP = {
  suggest: "askSuggestions",
  refine: "askRefineJob",
  channels: "askChannelRecommendations",
  // ... existing mappings ...

  // ========== ADD HERE ==========
  my_new_task: "askMyNewTask",
};
```

**That's it!** The task will work through the generic handler at the end of the router.

**Option B - Task with special logic:**

```javascript
// Inside router.post("/", ...)
// Before the generic handler

if (taskType === LLM_CORE_TASK.MY_NEW_TASK) {
  // ===== Authorization check =====
  if (!userId) {
    throw httpError(401, "Unauthorized");
  }

  // ===== Load additional data =====
  const jobId = context.jobId ?? context.job?.id ?? null;
  if (!jobId) {
    throw httpError(400, "jobId is required for my_new_task");
  }

  const job = await getJobRaw(firestore, jobId);
  if (!job || job.ownerUserId !== userId) {
    throw httpError(404, "Job not found");
  }

  // ===== Enrich context =====
  const enrichedContext = {
    ...context,
    jobSnapshot: job,
    companyContext: await loadCompanyContext(firestore, job.companyId),
  };

  // ===== Logging before call =====
  logger?.info?.(
    { jobId, userId, taskType },
    "llm.my_new_task.request"
  );

  // ===== Execute task =====
  const result = await llmClient.askMyNewTask(enrichedContext);

  // ===== Record usage =====
  await recordLlmUsageFromResult({
    firestore,
    bigQuery,
    logger,
    usageContext: { userId, jobId, taskType },
    usageType: resolveUsageType(taskType),
    result,
  });

  // ===== Save results (if relevant) =====
  if (!result.error) {
    await saveMyTaskResults(firestore, jobId, result);
  }

  // ===== Logging after call =====
  logger?.info?.(
    {
      jobId,
      hasError: Boolean(result.error),
      itemCount: result.items?.length ?? 0,
    },
    "llm.my_new_task.response"
  );

  return res.json({ taskType, result });
}
```

---

## Complete Code Examples

### Example: Prompt Builder from Existing Code (suggest.js)

```javascript
import { llmLogger } from "../logger.js";
import { JOB_FIELD_GUIDE, JOB_REQUIRED_FIELDS } from "../domain/job-fields.js";

export function buildSuggestionInstructions(context = {}) {
  const {
    companyContext = "",
    visibleFieldIds = null,
    jobSnapshot = {},
    previousSuggestions = {},
    updatedFieldId,
    updatedFieldValue,
    attempt = 0,
    strictMode = false,
  } = context;

  // Strict mode instructions
  const strictNotes = context?.strictMode
    ? "Previous output was not valid JSON. You MUST return a single JSON object that exactly matches the responseContract."
    : null;

  // Guardrails
  const guardrails = [
    "PRESERVE user intent. Only overwrite if the current value is empty.",
    "ALIGN WITH REALITY: Respect workModel and role type.",
    "NO HALLUCINATIONS: Do not invent data.",
    "OUTPUT: Return exactly one JSON object.",
  ];

  // Response contract
  const responseContract = {
    autofill_candidates: [
      {
        fieldId: "string (must match jobSchema ids)",
        value: "string | string[] | number",
        rationale: "string",
        confidence: "number (0.0 to 1.0)",
        source: "expert-assistant",
      },
    ],
  };

  // Build the prompt
  const payload = [
    "ROLE: You are a Senior Talent Acquisition Specialist.",
    "MISSION: Fill missing fields to maximize candidate clarity.",
    companyContext ? `COMPANY CONTEXT:\n${companyContext}` : "",
    "GUARDRAILS:",
    guardrails.map((g) => `- ${g}`).join("\n"),
    "JOB SCHEMA:",
    JSON.stringify(JOB_FIELD_GUIDE, null, 2),
    "CURRENT JOB SNAPSHOT:",
    JSON.stringify(jobSnapshot ?? {}, null, 2),
    "RESPONSE CONTRACT:",
    JSON.stringify(responseContract, null, 2),
    strictNotes ? `STRICT: ${strictNotes}` : "",
    `ATTEMPT: ${attempt}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  llmLogger.info(
    { task: "suggest", contextSize: payload.length, attempt },
    "LLM suggestion prompt built"
  );

  return payload;
}
```

### Example: Parser from Existing Code (suggest.js)

```javascript
import { normaliseCandidates } from "../domain/job-fields.js";
import { parseJsonContent, safePreview } from "../utils/parsing.js";

export function parseSuggestionResult(response, _context) {
  // First response.json, then fallback to text
  const parsed =
    response?.json && typeof response.json === "object"
      ? response.json
      : parseJsonContent(response?.text);

  // Basic validation
  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        reason: "structured_missing",
        rawPreview: safePreview(response?.text),
        message: "LLM did not return valid autofill_candidates JSON",
      },
    };
  }

  // Normalization - support different field names
  const candidates = normaliseCandidates(
    parsed.autofill_candidates ??
      parsed.autofillCandidates ??
      parsed.candidates ??
      []
  );

  return {
    candidates,
    metadata: response?.metadata ?? null,
  };
}
```

---

## What NOT to Do (Anti-patterns)

### 1. Do NOT Call Adapter Directly

```javascript
// ❌ WRONG - bypasses all orchestration
const adapter = new GeminiAdapter({ apiKey: "..." });
const response = await adapter.invoke({
  model: "gemini-3-pro-preview",
  system: "You are...",
  user: "..."
});

// ✅ CORRECT - go through llmClient
const result = await llmClient.askMyNewTask(context);
```

### 2. Do NOT Forget to Record Usage

```javascript
// ❌ WRONG - no usage recording
const result = await llmClient.askMyNewTask(context);
return res.json({ taskType, result });

// ✅ CORRECT - record usage
const result = await llmClient.askMyNewTask(context);
await recordLlmUsageFromResult({
  firestore,
  bigQuery,
  logger,
  usageContext: { userId, jobId, taskType },
  usageType: "text",
  result,
});
return res.json({ taskType, result });
```

### 3. Do NOT Bypass POST /api/llm

```javascript
// ❌ WRONG - direct call to orchestrator (on server)
const result = await orchestrator.run("my_task", context);

// ✅ CORRECT - Frontend always goes through the endpoint
fetch(`${API_BASE_URL}/api/llm`, {
  method: "POST",
  body: JSON.stringify({ taskType: "my_task", context })
});
```

### 4. Do NOT Use Hardcoded Values

```javascript
// ❌ WRONG - hardcoded model
const response = await adapter.invoke({
  model: "gemini-2.0-flash",
  temperature: 0.7,
});

// ✅ CORRECT - configured in TASK_REGISTRY and llm-config.js
```

### 5. Do NOT Throw Exceptions from Parser

```javascript
// ❌ WRONG - throws exception
export function parseMyTaskResult(response) {
  const data = JSON.parse(response.text); // Can throw!
  if (!data.required) {
    throw new Error("Missing required field"); // WRONG!
  }
  return data;
}

// ✅ CORRECT - returns error object
export function parseMyTaskResult(response) {
  const parsed = parseJsonContent(response?.text);
  if (!parsed) {
    return {
      error: {
        reason: "structured_missing",
        rawPreview: safePreview(response?.text),
        message: "Invalid JSON",
      },
    };
  }
  return { ...parsed, metadata: response?.metadata };
}
```

---

## Temperature & Best Practices

### Temperature Guide

| Range | Use Case | Examples |
|-------|----------|----------|
| 0.0-0.15 | Deterministic, accurate | suggest, refine, compliance |
| 0.2-0.35 | Slightly creative | assets, captions, recommendations |
| 0.5-0.7 | Creative | copilot, brainstorming |
| 0.7+ | Very creative | creative writing |

### Recommended Prompt Structure

```
1. ROLE/MISSION - What the LLM should do
2. CONTEXT - Company/job data (if relevant)
3. GUARDRAILS - Quality rules
4. INPUT DATA - Incoming data
5. RESPONSE CONTRACT - Expected response structure
6. EXAMPLE RESPONSE - Example
7. STRICT MODE NOTE - Stricter instructions (on retry)
```

### TASK_REGISTRY Template

```javascript
task_name: {
  // System prompt - fixed or dynamic
  system: "...",
  // or
  systemBuilder: (context) => `...${context.something}...`,

  // Prompt builder
  builder: buildTaskPrompt,

  // Response parser
  parser: parseTaskResult,

  // Response format
  mode: "json",

  // Creativity
  temperature: 0.2,

  // Token limits
  maxTokens: { default: 800, gemini: 4096 },

  // Retries
  retries: 2,
  strictOnRetry: true,

  // Structured output (recommended!)
  outputSchema: TaskOutputSchema,
  outputSchemaName: "task_response",
}
```

---

## Error Handling

### Standard Error Reasons

| reason | Meaning | Handling |
|--------|---------|----------|
| `invoke_failed` | API call failed | Retry |
| `parser_exception` | Parser threw exception | Retry with strictMode |
| `parse_failed` | Parser returned error | Retry with strictMode |
| `structured_missing` | Valid JSON not received | Retry with strictMode |
| `missing_field` | Required field missing | Return error |
| `unknown_failure` | All attempts failed | Return error to client |

### Error Response Structure

```javascript
{
  error: {
    reason: "structured_missing",      // Error type
    message: "LLM did not return...",  // Human-readable message
    rawPreview: "...",                 // Raw response (~500 chars)
    provider: "gemini",                // Provider that failed
    model: "gemini-3-pro-preview"      // Model that failed
  }
}
```

---

## Structured Output with Zod

### Why Use It?

- **Gemini** and **OpenAI** support native structured output
- When you pass a schema, the API forces the LLM to return valid JSON
- **Significantly reduces parsing failures**
- Documents the response structure in code

### How It Works

1. Define Zod schema in `schemas/index.js`
2. Add `outputSchema` and `outputSchemaName` to TASK_REGISTRY
3. The adapter converts the Zod schema to the provider's format
4. The response comes back in `response.json`

### Complete Example

```javascript
// schemas/index.js
export const MyTaskOutputSchema = z.object({
  result: z.string().describe("The main result"),
  items: z.array(
    z.object({
      id: z.string(),
      value: z.any(),
      score: z.number().min(0).max(1),
    })
  ).describe("List of items"),
});

// tasks.js
my_task: {
  // ... other fields ...
  outputSchema: MyTaskOutputSchema,
  outputSchemaName: "my_task_response",
}

// parsers/my-task.js
export function parseMyTaskResult(response, _context) {
  // With structured output, response.json already contains the data!
  const parsed =
    response?.json && typeof response.json === "object"
      ? response.json
      : parseJsonContent(response?.text);  // fallback

  // ...
}
```

---

## Testing

### API Call for Testing

```bash
curl -X POST http://localhost:4000/api/llm \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "taskType": "my_new_task",
    "context": {
      "jobId": "test-job-123",
      "customField": "test value"
    }
  }'
```

### Expected Response

```json
{
  "taskType": "my_new_task",
  "result": {
    "provider": "gemini",
    "model": "gemini-3-pro-preview",
    "resultField": "...",
    "items": [...],
    "summary": "...",
    "metadata": {
      "promptTokens": 450,
      "responseTokens": 120,
      "totalTokens": 570
    }
  }
}
```

---

## Summary: Quick Checklist

- [ ] Add constant to `task-types.js`
- [ ] Add to `llm-config.js` (GEMINI_TASKS or specific config)
- [ ] Create prompt builder in `prompts/`
- [ ] Create parser in `parsers/`
- [ ] Add Zod schema in `schemas/index.js` (recommended)
- [ ] Add to TASK_REGISTRY in `tasks.js`
- [ ] Add method to `llm-client.js`
- [ ] Add to TASK_METHOD_MAP in `routes/llm.js`
- [ ] Test with curl

---

## Further Reading

- [LLM_TASK_INTEGRATION_GUIDE.md](./LLM_TASK_INTEGRATION_GUIDE.md) - Previous guide
- [pricing-rates.js](../services/api-gateway/src/config/pricing-rates.js) - Pricing
- [llm-usage-ledger.js](../services/api-gateway/src/services/llm-usage-ledger.js) - Usage recording
