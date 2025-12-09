# LLM Task Integration Guide

## Executive Summary (TL;DR)

### The Golden Rule
> **Every LLM call in the system goes through `POST /api/llm`** - this is the single HTTP entry point for all AI model invocations.

### 30-Second Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React)                                                           │
│                                                                             │
│  api-client.js                                                              │
│       │                                                                     │
│       │  fetch("/api/llm", { taskType: "suggest", context: {...} })        │
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
│  │    • Validates taskType                                               │  │
│  │    • Enriches context (loads job, company data)                      │  │
│  │    • Calls llmClient method                                          │  │
│  │    • Records usage for billing                                       │  │
│  └────────────────────────────┬─────────────────────────────────────────┘  │
│                               │                                             │
│                               ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  llm-client.js                          ← Task wrapper methods       │  │
│  │    • askSuggestions()                                                │  │
│  │    • askRefineJob()                                                  │  │
│  │    • askGoldenInterviewerTurn()                                      │  │
│  │    • ... (one method per task type)                                  │  │
│  └────────────────────────────┬─────────────────────────────────────────┘  │
│                               │                                             │
│                               ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  llm/orchestrator.js                    ← Execution engine           │  │
│  │    • Selects provider/model                                          │  │
│  │    • Builds prompts (system + user)                                  │  │
│  │    • Handles retries                                                 │  │
│  │    • Parses responses                                                │  │
│  └────────────────────────────┬─────────────────────────────────────────┘  │
│                               │                                             │
│                               ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  llm/providers/*-adapter.js             ← Provider adapters          │  │
│  │    • gemini-adapter.js                                               │  │
│  │    • openai-adapter.js                                               │  │
│  │    • anthropic-adapter.js                                            │  │
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

### Key Files Quick Reference

| Layer | File | Purpose |
|-------|------|---------|
| Entry Point | `routes/llm.js` | HTTP handler, context enrichment, usage logging |
| Task Methods | `llm-client.js` | One method per task (askSuggestions, etc.) |
| Execution | `llm/orchestrator.js` | Provider selection, retries, prompt building |
| Task Definitions | `llm/tasks.js` | TASK_REGISTRY - prompts, parsers, settings |
| Task Types | `config/task-types.js` | Task name constants (LLM_CORE_TASK) |
| Model Config | `config/llm-config.js` | Which provider/model for each task |
| Prompts | `llm/prompts/*.js` | Prompt builder functions |
| Parsers | `llm/parsers/*.js` | Response parser functions |
| Providers | `llm/providers/*.js` | AI provider adapters |
| Usage | `services/llm-usage-ledger.js` | Billing and analytics |

### Special Case: Golden Interviewer

Golden Interviewer has its own endpoints (`/golden-interview/*`) but internally makes HTTP calls to `/api/llm`:

```
POST /golden-interview/chat
       │
       ▼
golden-interviewer/service.js
       │
       │  fetch("http://127.0.0.1:PORT/api/llm", {
       │    taskType: "golden_interviewer",
       │    context: { currentSchema, conversationHistory, ... }
       │  })
       │
       ▼
routes/llm.js (standard flow from here)
```

This ensures Golden Interviewer goes through the same single entry point, with consistent usage logging and error handling.

---

# Detailed Guide: Adding New LLM Tasks

> **This section details exactly how the LLM task infrastructure works and how to add a new task.**

---

## Table of Contents

1. [Critical Rule: All LLM Calls Go Through POST /api/llm](#1-critical-rule-all-llm-calls-go-through-post-apillm)
2. [Architecture Overview](#2-architecture-overview)
3. [Complete Request Flow](#3-complete-request-flow)
4. [File Map](#4-file-map)
5. [Layers in Detail](#5-layers-in-detail)
6. [Checklist: Adding a New Task](#6-checklist-adding-a-new-task)
7. [Complete Code Examples](#7-complete-code-examples)
8. [Conventions and Best Practices](#8-conventions-and-best-practices)

---

## 1. Critical Rule: All LLM Calls Go Through POST /api/llm

> **IMPORTANT:** Every single LLM call in the system MUST go through `POST /api/llm`. This is the ONLY entry point for AI model invocations.

### Why This Matters

- **Usage Tracking**: All LLM usage is logged to Firestore and BigQuery for billing/analytics
- **Authentication**: The endpoint requires auth (`requireAuth` middleware)
- **Consistency**: Unified error handling, retries, and response format
- **Cost Control**: Centralized pricing calculation and credit deduction

### How It Works

```
Frontend                          Backend
---------                         -------
api-client.js --POST /api/llm--> routes/llm.js
                                      |
                                      v
                                 llmClient.ask*()
                                      |
                                      v
                                 orchestrator.run()
                                      |
                                      v
                                 Gemini/OpenAI API
```

### Frontend Example (api-client.js)

All frontend methods call the same endpoint:

```javascript
// Suggestions
const response = await fetch(`${API_BASE_URL}/api/llm`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ taskType: "suggest", context: { jobId, visibleFieldIds } })
});

// Refinement
const response = await fetch(`${API_BASE_URL}/api/llm`, {
  method: "POST",
  body: JSON.stringify({ taskType: "refine", context: { jobId } })
});

// Video rendering
const response = await fetch(`${API_BASE_URL}/api/llm`, {
  method: "POST",
  body: JSON.stringify({ taskType: "video_render", context: { itemId } })
});
```

### Backend Mount Point (server.js)

```javascript
app.use(
  "/api/llm",
  authMiddleware,
  llmRouter({ llmClient, firestore, bigQuery, logger })
);
```

---

## 2. Architecture Overview

### Flow Diagram

```
+---------------------------------------------------------------------+
|                         POST /api/llm                               |
|                    { taskType, context }                            |
+---------------------------------------------------------------------+
                                  |
                                  v
+---------------------------------------------------------------------+
|                    routes/llm.js (llmRouter)                        |
|  - Validates taskType                                               |
|  - enrichContextForTask() - loads job, company context              |
|  - Checks for cached results                                        |
+---------------------------------------------------------------------+
                                  |
                                  v
+---------------------------------------------------------------------+
|                    llm-client.js (llmClient)                        |
|  - Dedicated method per task (askSuggestions, askRefineJob...)      |
|  - Try-catch wrapper and error handling                             |
|  - Response normalization                                           |
+---------------------------------------------------------------------+
                                  |
                                  v
+---------------------------------------------------------------------+
|                    llm/orchestrator.js                              |
|  - Selects provider+model per task                                  |
|  - Retry loop with strictMode                                       |
|  - Executes: builder -> adapter -> parser                           |
+---------------------------------------------------------------------+
                                  |
                                  v
+---------------------------------------------------------------------+
|                    llm/providers/*-adapter.js                       |
|  - Calls provider API (Gemini/OpenAI)                               |
|  - Converts to unified response format                              |
+---------------------------------------------------------------------+
                                  |
                                  v
+---------------------------------------------------------------------+
|              External LLM API (Gemini, OpenAI, etc.)                |
+---------------------------------------------------------------------+
```

### Key Principles

1. **Single Source of Truth** - Every task type is defined once in `task-types.js`
2. **Separation of Concerns** - Each layer does one thing only
3. **Retry Logic** - Orchestrator retries with `strictMode=true` on failure
4. **Usage Tracking** - Every call is logged to Firestore and BigQuery

---

## 3. Complete Request Flow

### Example: Suggestions Request

```
1. Frontend sends:
   POST /api/llm
   { "taskType": "suggest", "context": { "jobId": "job-123", "visibleFieldIds": ["coreDuties"] } }

2. llmRouter (routes/llm.js):
   a. Validation: taskType exists in CORE_LLM_TASKS or ORCHESTRATOR_TASKS
   b. Calls enrichContextForTask():
      - Loads job from Firestore
      - Loads company context
      - Loads previous suggestions (for cache check)
   c. If valid cache exists and no forceRefresh -> returns directly

3. llmClient.askSuggestions(enrichedContext):
   a. Calls orchestrator.run("suggest", context)
   b. On success: returns { provider, model, candidates, metadata }
   c. On failure: returns { error: { reason, message } }

4. orchestrator.run("suggest", context):
   a. Looks up TASK_REGISTRY["suggest"]
   b. Calls policy.select("suggest") -> { provider: "gemini", model: "gemini-3-pro-preview" }
   c. Retry loop (up to 2 times):
      - task.builder(context) -> generates prompt
      - adapter.invoke(options) -> calls Gemini
      - task.parser(response) -> parses response
      - On success -> returns
      - On failure -> retry with strictMode=true

5. Back to llmRouter:
   a. Saves to Firestore (overwriteSuggestionDocument)
   b. Records usage (recordLlmUsageFromResult)
   c. Returns response to client
```

---

## 4. File Map

```
services/api-gateway/src/
|-- server.js                     # Mounts /api/llm endpoint
|-- routes/
|   +-- llm.js                    # Main HTTP endpoint handler
|
|-- llm-client.js                 # Methods for each task
|
|-- config/
|   |-- task-types.js             # Task name constants
|   |-- llm-config.js             # Task -> provider+model mapping
|   +-- pricing-rates.js          # Pricing per provider+model
|
|-- llm/
|   |-- orchestrator.js           # Task execution with retry
|   |-- tasks.js                  # TASK_REGISTRY - all task definitions
|   |-- logger.js                 # LLM-specific logger
|   |-- request-context.js        # Route tracking per request
|   |
|   |-- prompts/                  # Prompt builders
|   |   |-- suggest.js
|   |   |-- refine.js
|   |   |-- channels.js
|   |   +-- ...
|   |
|   |-- parsers/                  # Response parsers
|   |   |-- suggest.js
|   |   |-- refine.js
|   |   |-- channels.js
|   |   +-- ...
|   |
|   |-- providers/                # Provider adapters
|   |   |-- selection-policy.js   # Provider selection per task
|   |   |-- gemini-adapter.js
|   |   |-- openai-adapter.js
|   |   +-- ...
|   |
|   +-- utils/
|       +-- parsing.js            # Parsing helper functions
|
+-- services/
    +-- llm-usage-ledger.js       # Usage recording and pricing
```

---

## 5. Layers in Detail

### 5.1 task-types.js - Task Name Definitions

**Location:** `services/api-gateway/src/config/task-types.js`

**Purpose:** Single Source of Truth for all task names. Prevents typos and enables easy refactoring.

```javascript
// Atomic tasks - call LLM directly
export const LLM_CORE_TASK = {
  SUGGEST: "suggest",
  REFINE: "refine",
  CHANNELS: "channels",
  COPILOT_AGENT: "copilot_agent",
  COMPANY_INTEL: "company_intel",
  ASSET_MASTER: "asset_master",
  ASSET_CHANNEL_BATCH: "asset_channel_batch",
  ASSET_ADAPT: "asset_adapt",
  VIDEO_CONFIG: "video_config",
  VIDEO_STORYBOARD: "video_storyboard",
  VIDEO_CAPTION: "video_caption",
  VIDEO_COMPLIANCE: "video_compliance",
  IMAGE_PROMPT_GENERATION: "image_prompt_generation",
  IMAGE_GENERATION: "image_generation",
  IMAGE_CAPTION: "image_caption",
  // MY_NEW_TASK: "my_new_task",  // <-- Add here
};

// Orchestrator tasks - coordinate multiple calls
export const LLM_ORCHESTRATOR_TASK = {
  GENERATE_CAMPAIGN_ASSETS: "generate_campaign_assets",
  HERO_IMAGE: "hero_image",
  VIDEO_CREATE_MANIFEST: "video_create_manifest",
  VIDEO_REGENERATE: "video_regenerate",
  VIDEO_CAPTION_UPDATE: "video_caption_update",
  VIDEO_RENDER: "video_render",
};

// Logging-only names
export const LLM_LOGGING_TASK = {
  SUGGESTIONS: "suggestions",    // "suggest" logged as "suggestions"
  REFINEMENT: "refinement",      // "refine" logged as "refinement"
};

// Derived arrays - used for validation
export const CORE_LLM_TASKS = Object.values(LLM_CORE_TASK);
export const ORCHESTRATOR_TASKS = Object.values(LLM_ORCHESTRATOR_TASK);
```

---

### 5.2 llm-config.js - Task to Provider+Model Mapping

**Location:** `services/api-gateway/src/config/llm-config.js`

**Purpose:** Defines which provider and model to use for each task.

```javascript
import { LLM_CORE_TASK, LLM_SPECIAL_TASK } from "./task-types.js";

const GEMINI_DEFAULT_MODEL = "gemini-3-pro-preview";
const GEMINI_IMAGE_MODEL = "gemini-3-pro-image-preview";

// Most tasks use Gemini
const GEMINI_TASKS = [
  LLM_CORE_TASK.SUGGEST,
  LLM_CORE_TASK.REFINE,
  LLM_CORE_TASK.CHANNELS,
  // ... all others
];

const config = GEMINI_TASKS.reduce((acc, task) => {
  acc[task] = { provider: "gemini", model: GEMINI_DEFAULT_MODEL };
  return acc;
}, {});

// Override for specific tasks
config[LLM_CORE_TASK.IMAGE_GENERATION] = {
  provider: "gemini",
  model: GEMINI_IMAGE_MODEL  // Different model for images
};

export const LLM_TASK_CONFIG = Object.freeze(config);
```

**Important:** If a task exists in `TASK_REGISTRY` but not in `LLM_TASK_CONFIG`, the app will throw an error on startup!

---

### 5.3 tasks.js - TASK_REGISTRY

**Location:** `services/api-gateway/src/llm/tasks.js`

**Purpose:** Defines the logic for each task - prompt, parser, and settings.

```javascript
import { buildSuggestionInstructions } from "./prompts/suggest.js";
import { parseSuggestionResult } from "./parsers/suggest.js";
import { logSuggestionPreview } from "./logger.js";

export const TASK_REGISTRY = {
  suggest: {
    // System prompt - fixed or dynamic
    system: "You are an expert recruitment assistant...",

    // Optional: dynamic system prompt (receives context)
    // systemBuilder: (context) => `Dynamic system prompt based on ${context.something}`,

    // Function that builds the user prompt
    builder: buildSuggestionInstructions,

    // Function that parses the LLM response
    parser: parseSuggestionResult,

    // Expected response format
    mode: "json",  // or "text"

    // Creativity (0 = deterministic, 1 = creative)
    temperature: 0.1,

    // Max tokens in response (per provider)
    maxTokens: { default: 600, gemini: 8192 },

    // Number of retry attempts
    retries: 2,

    // Whether to enable strict mode on retry
    strictOnRetry: true,

    // Optional: preview logging
    previewLogger: logSuggestionPreview,
  },

  // ... other tasks
};

// Startup validation - ensures every task is configured in LLM_TASK_CONFIG
const missingTaskConfig = Object.keys(TASK_REGISTRY).filter(
  (task) => !LLM_TASK_CONFIG[task]
);
if (missingTaskConfig.length > 0) {
  throw new Error(`LLM task configuration missing for: ${missingTaskConfig.join(", ")}`);
}
```

#### Field Reference:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `system` | string | Yes* | Fixed system prompt |
| `systemBuilder` | function | No | Dynamic system prompt (receives context) |
| `builder` | function | Yes | Builds the user prompt |
| `parser` | function | Yes | Parses the LLM response |
| `mode` | string | No | `"json"` or `"text"` (default: `"text"`) |
| `temperature` | number | No | 0-1, default: 0.2 |
| `maxTokens` | number/object | No | Number or `{ default, gemini, openai }` |
| `retries` | number | No | Retry attempts, default: 1 |
| `strictOnRetry` | boolean | No | Enable strict mode on retry |
| `previewLogger` | function | No | Preview logging function |

*If `systemBuilder` exists, it takes precedence over `system`

---

### 5.4 orchestrator.js - Execution Engine

**Location:** `services/api-gateway/src/llm/orchestrator.js`

**Purpose:** Executes tasks with provider selection, retries, and error handling.

```javascript
export class LlmOrchestrator {
  constructor({ adapters, policy, tasks }) {
    this.adapters = adapters;      // { gemini: GeminiAdapter, openai: OpenAIAdapter, ... }
    this.policy = policy;          // ProviderSelectionPolicy
    this.tasks = tasks;            // TASK_REGISTRY
  }

  async run(taskName, context = {}) {
    // 1. Find task definition
    const task = this.tasks[taskName];
    if (!task) throw new Error(`Unknown LLM task: ${taskName}`);

    // 2. Select provider + model
    const selection = this.policy.select(taskName);
    const adapter = this.adapters[selection.provider];
    if (!adapter) throw new Error(`No adapter for ${selection.provider}`);

    // 3. Retry loop
    let attempt = 0;
    let lastError = null;
    const retries = task.retries ?? 1;

    while (attempt < retries) {
      // strictMode = true starting from second retry
      const strictMode = Boolean(task.strictOnRetry && attempt > 0);
      const builderContext = { ...context, attempt, strictMode };

      // 4. Build prompts
      const userPrompt = task.builder(builderContext);
      const systemPrompt = typeof task.systemBuilder === "function"
        ? task.systemBuilder(builderContext)
        : task.system;

      // 5. Call adapter
      let response;
      try {
        response = await adapter.invoke({
          model: selection.model,
          system: systemPrompt,
          user: userPrompt,
          mode: task.mode ?? "text",
          temperature: task.temperature ?? 0.2,
          maxTokens: this.resolveValue(task.maxTokens, selection.provider),
          taskType: taskName,
        });
      } catch (error) {
        lastError = { reason: "invoke_failed", message: error.message };
        attempt++;
        continue;
      }

      // 6. Parse response
      let parsed;
      try {
        parsed = task.parser(response, builderContext);
      } catch (parseError) {
        parsed = { error: { reason: "parser_exception", message: parseError.message } };
      }

      // 7. Success or retry
      if (parsed && !parsed.error) {
        return { task: taskName, provider: selection.provider, model: selection.model, ...parsed };
      }
      lastError = parsed?.error ?? { reason: "parse_failed" };
      attempt++;
    }

    // 8. All attempts failed
    return { task: taskName, provider: selection.provider, model: selection.model, error: lastError };
  }
}
```

---

### 5.5 llm-client.js - Task Methods

**Location:** `services/api-gateway/src/llm-client.js`

**Purpose:** Provides simple API for each task with error handling and normalization.

```javascript
import { LlmOrchestrator } from "./llm/orchestrator.js";
import { TASK_REGISTRY } from "./llm/tasks.js";
import { LLM_CORE_TASK } from "./config/task-types.js";

const orchestrator = new LlmOrchestrator({
  adapters: { gemini: new GeminiAdapter(...), ... },
  policy: new ProviderSelectionPolicy(LLM_TASK_CONFIG),
  tasks: TASK_REGISTRY,
});

async function askSuggestions(context) {
  try {
    const result = await orchestrator.run(LLM_CORE_TASK.SUGGEST, context);

    if (result.error) {
      return {
        error: {
          ...result.error,
          provider: result.provider,
          model: result.model,
        },
      };
    }

    return {
      provider: result.provider,
      model: result.model,
      candidates: result.candidates ?? [],
      metadata: result.metadata ?? null,
    };
  } catch (error) {
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error),
      },
    };
  }
}

// Export all methods
export const llmClient = {
  askSuggestions,
  askRefineJob,
  askChannelRecommendations,
  // ...
};
```

---

### 5.6 routes/llm.js - The Endpoint

**Location:** `services/api-gateway/src/routes/llm.js`

**Purpose:** HTTP endpoint that receives requests, enriches context, invokes llmClient, and records usage.

```javascript
const requestSchema = z.object({
  taskType: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional()
});

// Maps taskType -> llmClient method name
const TASK_METHOD_MAP = {
  suggest: "askSuggestions",
  refine: "askRefineJob",
  channels: "askChannelRecommendations",
  // ...
};

export function llmRouter({ llmClient, firestore, bigQuery, logger }) {
  const router = Router();

  router.post("/", wrapAsync(async (req, res) => {
    const { taskType, context = {} } = requestSchema.parse(req.body);

    // Validation
    const allowedTaskTypes = [...CORE_LLM_TASKS, ...ORCHESTRATOR_TASKS];
    if (!allowedTaskTypes.includes(taskType)) {
      return res.status(400).json({ error: "Invalid taskType" });
    }

    // Handle orchestrator tasks (special)
    if (taskType === LLM_ORCHESTRATOR_TASK.VIDEO_RENDER) {
      // Special logic...
      return res.json({ taskType, result });
    }

    // Regular tasks - via TASK_METHOD_MAP
    const methodName = TASK_METHOD_MAP[taskType] ?? taskType;
    const dispatcher = llmClient[methodName];

    if (!dispatcher) {
      return res.status(400).json({ error: `Unsupported taskType "${taskType}"` });
    }

    // Enrich context (load job, company, previous suggestions)
    const enrichedContext = await enrichContextForTask({
      taskType, context, firestore, logger, userId: req.user.id
    });

    // Check cache
    if (enrichedContext._skipLlm) {
      return res.json({ taskType, result: enrichedContext._skipLlm.payload });
    }

    // Execute task
    const result = await dispatcher(enrichedContext);

    // Record usage
    await recordLlmUsageFromResult({
      firestore, bigQuery, logger,
      usageContext: { userId, jobId, taskType },
      usageType: resolveUsageType(taskType),
      result
    });

    return res.json({ taskType, result });
  }));

  return router;
}
```

---

### 5.7 llm-usage-ledger.js - Usage Recording

**Location:** `services/api-gateway/src/services/llm-usage-ledger.js`

**Purpose:** Records every LLM call for billing and analytics.

```javascript
export async function recordLlmUsageFromResult({
  firestore,
  bigQuery,
  logger,
  usageContext = {},  // { userId, jobId, taskType }
  result,
  usageType,          // "text" | "image" | "video"
  usageMetrics        // { units, seconds } for images/video
}) {
  // Extract metadata from result
  const metadata = result.metadata ?? null;
  const provider = result.provider ?? "unknown";
  const model = result.model ?? "unknown";
  const status = result.error ? "error" : "success";

  // Calculate tokens and costs
  const inputTokens = normalizeTokens(metadata?.promptTokens);
  const outputTokens = normalizeTokens(metadata?.candidateTokens);
  const totalTokens = inputTokens + outputTokens;

  // Calculate cost per pricing-rates.js
  const pricing = resolveTextPricing(provider, model);
  const estimatedCostUsd = calculateCost(inputTokens, outputTokens, pricing);

  // Save to Firestore
  await firestore.recordLlmUsage({
    userId: usageContext.userId,
    jobId: usageContext.jobId,
    taskType: usageContext.taskType,
    provider,
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd,
    status,
    timestamp: new Date(),
  });

  // Save to BigQuery (optional)
  if (bigQuery?.addDocument) {
    await bigQuery.addDocument(entryPayload);
  }
}
```

---

## 6. Checklist: Adding a New Task

### Step 1: Define Task Type

**File:** `config/task-types.js`

```javascript
export const LLM_CORE_TASK = {
  // ...existing tasks...
  MY_NEW_TASK: "my_new_task",  // Add here
};
```

---

### Step 2: Configure Provider + Model

**File:** `config/llm-config.js`

```javascript
// If the task uses Gemini like most tasks, add to array:
const GEMINI_TASKS = [
  // ...existing tasks...
  LLM_CORE_TASK.MY_NEW_TASK,  // Add here
];

// Or if you need a different provider/model:
config[LLM_CORE_TASK.MY_NEW_TASK] = {
  provider: "openai",
  model: "gpt-4o"
};
```

---

### Step 3: Create Prompt Builder

**New file:** `llm/prompts/my-new-task.js`

```javascript
export function buildMyNewTaskPrompt(context = {}) {
  const {
    jobSnapshot = {},
    companyContext = "",
    attempt = 0,
    strictMode = false,
  } = context;

  // Strict mode instructions for retry
  const strictNotes = strictMode
    ? "CRITICAL: Previous output was invalid. Return ONLY valid JSON matching the exact contract below."
    : null;

  // Define expected response structure
  const responseContract = {
    myField: "string",
    myArray: ["string"],
    confidence: "number (0.0-1.0)"
  };

  // Example response
  const exampleResponse = {
    myField: "Example value",
    myArray: ["item1", "item2"],
    confidence: 0.85
  };

  const prompt = [
    "MISSION: [Describe the task briefly]",
    "",
    companyContext ? `COMPANY CONTEXT:\n${companyContext}` : "",
    "",
    "JOB DATA:",
    JSON.stringify(jobSnapshot, null, 2),
    "",
    strictNotes ? `STRICT MODE: ${strictNotes}` : "",
    "",
    "RESPONSE CONTRACT (must match exactly):",
    JSON.stringify(responseContract, null, 2),
    "",
    "EXAMPLE RESPONSE:",
    JSON.stringify(exampleResponse, null, 2),
  ].filter(Boolean).join("\n");

  return prompt;
}
```

---

### Step 4: Create Parser

**New file:** `llm/parsers/my-new-task.js`

```javascript
import { parseJsonContent, safePreview } from "../utils/parsing.js";

export function parseMyNewTaskResult(response, _context) {
  // Try response.json first (if adapter returned object)
  // Otherwise try to parse response.text
  const parsed = response?.json ?? parseJsonContent(response?.text);

  // Basic validation
  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        reason: "structured_missing",
        rawPreview: safePreview(response?.text),
        message: "LLM did not return valid JSON",
      },
    };
  }

  // Required field validation
  if (!parsed.myField) {
    return {
      error: {
        reason: "missing_field",
        rawPreview: safePreview(response?.text),
        message: "Response missing required field: myField",
      },
    };
  }

  // Normalize and return
  return {
    myField: parsed.myField,
    myArray: Array.isArray(parsed.myArray) ? parsed.myArray : [],
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
    metadata: response?.metadata ?? null,
  };
}
```

---

### Step 5: Register in TASK_REGISTRY

**File:** `llm/tasks.js`

```javascript
import { buildMyNewTaskPrompt } from "./prompts/my-new-task.js";
import { parseMyNewTaskResult } from "./parsers/my-new-task.js";

export const TASK_REGISTRY = {
  // ...existing tasks...

  my_new_task: {
    system: "You are an expert assistant for [specific domain]. Respond with valid JSON only.",
    builder: buildMyNewTaskPrompt,
    parser: parseMyNewTaskResult,
    mode: "json",
    temperature: 0.2,        // 0=deterministic, 0.7+=creative
    maxTokens: { default: 800, gemini: 4096 },
    retries: 2,
    strictOnRetry: true,
  },
};
```

---

### Step 6: Add Method to llmClient

**File:** `llm-client.js`

```javascript
import { LLM_CORE_TASK } from "./config/task-types.js";

async function askMyNewTask(context) {
  try {
    const result = await orchestrator.run(LLM_CORE_TASK.MY_NEW_TASK, context);

    if (result.error) {
      return {
        error: {
          ...result.error,
          provider: result.provider,
          model: result.model,
        },
      };
    }

    return {
      provider: result.provider,
      model: result.model,
      myField: result.myField ?? null,
      myArray: result.myArray ?? [],
      confidence: result.confidence ?? null,
      metadata: result.metadata ?? null,
    };
  } catch (error) {
    llmLogger.warn({ err: error }, "askMyNewTask orchestrator failure");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error),
      },
    };
  }
}

// Add to export
export const llmClient = {
  // ...existing methods...
  askMyNewTask,
};
```

---

### Step 7: Update the Router

**File:** `routes/llm.js`

#### Option A: Simple task (mapping only)

```javascript
const TASK_METHOD_MAP = {
  // ...existing mappings...
  my_new_task: "askMyNewTask",  // Add here
};
```

#### Option B: Task with special logic

```javascript
// Inside router.post("/", ...)

if (taskType === LLM_CORE_TASK.MY_NEW_TASK) {
  const userId = req.user?.id;
  if (!userId) throw httpError(401, "Unauthorized");

  // Special logic before the call
  const customContext = await loadSpecialData(context);

  const result = await llmClient.askMyNewTask(customContext);

  // Special logic after the call
  if (result.myField) {
    await saveToFirestore(result);
  }

  await recordLlmUsageFromResult({
    firestore, bigQuery, logger,
    usageContext: { userId, jobId: context.jobId, taskType },
    usageType: "text",
    result
  });

  return res.json({
    taskType,
    result: {
      myField: result.myField,
      myArray: result.myArray,
      // ...
    }
  });
}
```

---

### Step 8: Test

```bash
# API call
curl -X POST http://localhost:4000/api/llm \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "taskType": "my_new_task",
    "context": {
      "jobId": "test-job-123",
      "customField": "some value"
    }
  }'
```

---

## 7. Complete Code Examples

### Example: Prompt Builder from existing code (suggest.js)

```javascript
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
  const strictNotes = strictMode
    ? "Previous output was not valid JSON. Return ONLY a single JSON object."
    : null;

  // Quality guardrails
  const guardrails = [
    "PRESERVE user intent. Only overwrite empty or placeholder values.",
    "ALIGN WITH REALITY: Respect workModel and role type.",
    "LOCATION AWARE: Use provided location/currency.",
    "NO HALLUCINATIONS: Don't invent facts not implied.",
    "OUTPUT: Return exactly one JSON object. No prose.",
  ];

  // Response structure
  const responseContract = {
    autofill_candidates: [
      {
        fieldId: "string (must match jobSchema)",
        value: "string | string[] | number",
        rationale: "string",
        confidence: "number (0.0-1.0)",
        source: "expert-assistant",
      },
    ],
  };

  return [
    "ROLE: Senior Talent Acquisition Specialist",
    "MISSION: Fill missing fields to maximize clarity.",
    companyContext ? `COMPANY CONTEXT:\n${companyContext}` : "",
    `VISIBLE FIELDS: ${visibleFieldIds?.join(", ") ?? "All"}`,
    "GUARDRAILS:",
    guardrails.map((g) => `- ${g}`).join("\n"),
    "JOB SCHEMA:",
    JSON.stringify(JOB_FIELD_GUIDE, null, 2),
    "CURRENT JOB:",
    JSON.stringify(jobSnapshot, null, 2),
    "RESPONSE CONTRACT:",
    JSON.stringify(responseContract, null, 2),
    strictNotes ? `STRICT: ${strictNotes}` : "",
  ].filter(Boolean).join("\n\n");
}
```

### Example: Parser from existing code (suggest.js)

```javascript
import { normaliseCandidates } from "../domain/job-fields.js";
import { parseJsonContent, safePreview } from "../utils/parsing.js";

export function parseSuggestionResult(response, _context) {
  // Try direct json, otherwise parse from text
  const parsed = response?.json ?? parseJsonContent(response?.text);

  // Basic validation
  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        reason: "structured_missing",
        rawPreview: safePreview(response?.text),
        message: "LLM did not return valid JSON",
      },
    };
  }

  // Extract candidates (support different key names)
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

## 8. Conventions and Best Practices

### Task Names

```javascript
// Correct - use constants
if (taskType === LLM_CORE_TASK.SUGGEST) { ... }
config[LLM_CORE_TASK.MY_TASK] = { ... }

// Wrong - string literals
if (taskType === "suggest") { ... }
config["my_task"] = { ... }
```

### Temperature Guidelines

| Range | Use Case | Examples |
|-------|----------|----------|
| 0.0-0.15 | Deterministic, accurate | suggest, refine, compliance |
| 0.2-0.35 | Slightly creative | assets, captions |
| 0.5-0.7 | Creative | copilot, creative writing |
| 0.7+ | Very creative | brainstorming |

### Error Handling in Parsers

```javascript
// Always include rawPreview for debugging
return {
  error: {
    reason: "structured_missing",
    rawPreview: safePreview(response?.text),  // truncated to ~500 chars
    message: "Human readable error message",
  },
};
```

### Error Reasons

| reason | Meaning |
|--------|---------|
| `invoke_failed` | Provider API call failed |
| `parser_exception` | Parser threw exception |
| `parse_failed` | Parser returned error |
| `structured_missing` | No valid JSON received |
| `missing_field` | Required field missing |
| `unknown_failure` | All retry attempts failed |

### maxTokens per provider

```javascript
// Single value
maxTokens: 800,

// Different values per provider
maxTokens: {
  default: 600,     // Default
  gemini: 8192,     // Gemini allows more
  openai: 4096      // OpenAI
},
```

### Usage Types

```javascript
function resolveUsageType(taskType) {
  if (taskType === LLM_CORE_TASK.IMAGE_GENERATION) return "image";
  if (taskType.startsWith("video_")) return "video";
  return "text";
}
```

---

## Summary: 8 Steps to Add a Task

| # | File | Action |
|---|------|--------|
| 1 | `config/task-types.js` | Add constant to `LLM_CORE_TASK` |
| 2 | `config/llm-config.js` | Add to `GEMINI_TASKS` or create specific config |
| 3 | `llm/prompts/my-task.js` | Create prompt builder function |
| 4 | `llm/parsers/my-task.js` | Create parser function |
| 5 | `llm/tasks.js` | Add to `TASK_REGISTRY` |
| 6 | `llm-client.js` | Add method and export |
| 7 | `routes/llm.js` | Add to `TASK_METHOD_MAP` (and possibly special logic) |
| 8 | Test | Call `POST /api/llm` and verify response |

---

## Anti-patterns (What NOT to do)

### Do NOT create adapter directly
```javascript
// Wrong
const llmAdapter = new GeminiAdapter({ ... });
const response = await llmAdapter.invoke({ ... });

// Correct
const result = await llmClient.askMyNewTask(context);
```

### Do NOT forget usage logging
```javascript
// Wrong - no logging
const result = await llmClient.askMyNewTask(context);
return result;

// Correct
const result = await llmClient.askMyNewTask(context);
await recordLlmUsageFromResult({ ... });
return result;
```

### Do NOT use hardcoded model/temperature
```javascript
// Wrong - hardcoded
const response = await adapter.invoke({
  model: "gemini-2.0-flash",
  temperature: 0.7,
});

// Correct - uses settings from TASK_REGISTRY and llm-config.js
```

### Do NOT bypass POST /api/llm
```javascript
// Wrong - direct call bypassing the endpoint
const result = await orchestrator.run("my_task", context);

// Correct - always go through the endpoint (frontend) or llmClient (backend internal)
fetch(`${API_BASE_URL}/api/llm`, {
  method: "POST",
  body: JSON.stringify({ taskType: "my_task", context })
});
```

---

## Further Reading

- [api-llm-endpoint.md](./api-llm-endpoint.md) - Endpoint documentation
- [pricing-rates.js](../services/api-gateway/src/config/pricing-rates.js) - Pricing
- [llm-usage-ledger.js](../services/api-gateway/src/services/llm-usage-ledger.js) - Usage recording
