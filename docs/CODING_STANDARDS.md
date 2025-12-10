# Coding Standards

This document defines the coding standards and conventions for the Wizard Recruiting OS codebase.

---

## 1. Error Handling

### Standard Model

All routes and services follow a single error-handling model:

1. **Routes use `wrapAsync`** to wrap async handlers
2. **Throw `httpError(status, message, details)`** for expected errors
3. **Global `errorHandler` middleware** converts errors to JSON responses

### Error Response Contract

All errors return the following shape:

```json
{
  "error": {
    "message": "Human-readable error message",
    "details": null | object
  }
}
```

### When to Throw vs Catch

| Situation | Approach |
|-----------|----------|
| Invalid request (400) | `throw httpError(400, "Invalid input", { field: "..." })` |
| Not found (404) | `throw httpError(404, "Resource not found")` |
| Unauthorized (401) | `throw httpError(401, "Missing auth token")` |
| Forbidden (403) | `throw httpError(403, "Access denied")` |
| Internal error (500) | Let error propagate (or throw without status) |
| Fire-and-forget operations | Use `.catch(err => logger.warn(...))` |

### Example

```javascript
import { wrapAsync, httpError } from "@wizard/utils";

router.get(
  "/:id",
  wrapAsync(async (req, res) => {
    const item = await repository.findById(req.params.id);
    if (!item) {
      throw httpError(404, "Item not found");
    }
    res.json({ item });
  })
);
```

### Special Cases

- **SSE/Streaming endpoints**: May need inline try/catch for partial error handling
- **Background operations**: Use `.catch()` with logging instead of throwing
- **File uploads**: May require cleanup in catch blocks

---

## 2. Zod Validation Policy

### At API Boundaries (Request Payloads)

Use **`schema.parse()`** for request validation. Zod errors are caught by the global error handler.

```javascript
// Request body validation - use parse()
const payload = mySchema.parse(req.body ?? {});
```

### At External Boundaries (Firestore, LLM, External APIs)

Use **`schema.safeParse()`** with explicit handling. External data can be malformed.

```javascript
// External data validation - use safeParse()
const result = MySchema.safeParse(externalData);
if (!result.success) {
  logger.warn({ errors: result.error.issues }, "Schema validation failed");
  return null;
}
return result.data;
```

### At Internal Boundaries (Trusted Code)

Use **`schema.parse()`** when schema mismatch indicates a bug.

```javascript
// Internal conversion - bugs should surface
const normalized = InternalSchema.parse(processedData);
```

### Summary Table

| Context | Method | Rationale |
|---------|--------|-----------|
| HTTP request body/query | `parse()` | Return 400 to client |
| LLM output | `safeParse()` | Model can misbehave |
| Firestore document | `safeParse()` | Data may be stale/corrupt |
| External API response | `safeParse()` | Third party can change |
| Internal domain logic | `parse()` | Bug if schema fails |

---

## 3. Logging Conventions

### Standard Logger

Use the Pino logger from `@wizard/utils` in all production code:

```javascript
import { createLogger } from "@wizard/utils";
const logger = createLogger("my-module");

logger.info({ context }, "Event description");
logger.warn({ context, err }, "Warning message");
logger.error({ context, err }, "Error description");
```

### Rules

1. **No `console.log` in production code** - use structured logging
2. **Logger is required, not optional** - pass via constructor/factory
3. **Use semantic log messages** - `module.action.result` format
4. **Include context objects** - not just string interpolation

### Log Levels

| Level | Usage |
|-------|-------|
| `debug` | Detailed diagnostic info (dev only) |
| `info` | Normal operations, key events |
| `warn` | Recoverable issues, degraded operation |
| `error` | Failures requiring attention |

### Optional Logger Pattern

When logger is truly optional (e.g., utility functions), use a helper:

```javascript
function logInfo(logger, meta, message) {
  logger?.info?.(meta, message);
}
```

### Exceptions

- `console.error` is allowed in entry point crash handlers
- `console.log` is allowed in test files and CLI scripts
- Video debug logging uses console for real-time feedback (marked with `// DEBUG`)

---

## 4. Repository Pattern

### Structure

```
routes/       → HTTP handling only
services/     → Business logic
repositories/ → Data access (Firestore, BigQuery)
```

### Rules

1. **Routes never access Firestore directly**
2. **Services call repositories for data operations**
3. **Repositories are pure data access** - no HTTP concerns

### Naming Convention

- `get*` - Read single document
- `list*` - Read multiple documents
- `save*` - Create or update
- `load*` - Read with parsing/normalization
- `create*` - Create new only
- `update*` - Update existing only

---

## 5. LLM Integration

### Single Gateway

**All LLM calls go through `POST /api/llm`**

- Routes do NOT import `llmClient` directly
- Services that need LLM use HTTP to `/api/llm`
- This ensures consistent usage tracking and auth

### Task Types

Each LLM operation has a `taskType` defined in `config/task-types.js`.

See [LLM_TASK_CONTRACTS.md](./LLM_TASK_CONTRACTS.md) for details.

---

## 6. File Organization

### Backend (`services/api-gateway/src/`)

```
routes/           # Express routers (HTTP only)
services/         # Business logic
  repositories/   # Data access layer
  llm-tasks/      # LLM task handlers
  wizard/         # Wizard-specific services
llm/              # LLM infrastructure
  providers/      # Adapter classes
  parsers/        # Response parsers
  prompts/        # Prompt templates
middleware/       # Express middleware
config/           # Configuration
utils/            # Utilities
```

### Frontend (`apps/web/`)

```
app/              # Next.js App Router pages
components/       # React components
  wizard/         # Wizard-specific components
lib/              # Shared utilities
  schemas/        # Zod response schemas
```

---

**Last updated**: December 2024
