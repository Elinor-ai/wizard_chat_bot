# POST /api/llm – how it works

Reference: `services/api-gateway/src/routes/llm.js`

## High-level flow
1. `server.js` mounts `/api/llm` with `requireAuth`, so every call is authenticated and `req.user` is populated.
2. Body is validated with Zod: `{ taskType: string, context?: record }`.
3. The router resolves the task:
   - Special pipelines handled inline:
     - `generate_campaign_assets` → runs the full wizard pipeline (`generateCampaignAssets`).
     - `video_render` / `video_caption_update` / `video_create_manifest` / `video_regenerate` → video service actions.
   - All other task types are mapped via `TASK_METHOD_MAP` to a method on `llmClient` (e.g. `taskType: "suggest"` calls `llmClient.askSuggestions(context)`). If no mapping exists, it tries a method with the same name as `taskType`.
4. The task handler runs with the provided `context` object (whatever the caller sends).
5. After a successful LLM call, `recordLlmUsageFromResult` is invoked to log usage/costs to Firestore (and BigQuery if configured).
6. Response shape is always `{ taskType, result }` (or an error with HTTP status codes from `httpError`).

## Task routing details
- `TASK_METHOD_MAP` lives in `llm.js` and maps task names to llmClient methods:
  `suggest`, `refine`, `channels`, `chat`, `copilot_agent`, `company_intel`, `asset_master`, `asset_channel_batch`, `asset_adapt`, `video_storyboard`, `video_caption`, `video_compliance`, `image_prompt_generation`, `image_generation`, `image_caption`.
- Usage type for billing/logging is derived from the task:
  - `image_generation` → `image`
  - Tasks starting with `video_` → `video`
  - Everything else → `text`

## Context and IDs
- `userId` comes from `req.user.id` (set by `requireAuth` middleware).
- `jobId` is pulled from `context.jobId`, or `context.job.id`, or `context.refinedJob.jobId` (in that order).
- Any other data needed by the LLM method is passed straight through from `context` to the corresponding `llmClient` method; the router does not reshape it.

## Usage logging (behind the scenes)
- `recordLlmUsageFromResult` in `services/api-gateway/src/services/llm-usage-ledger.js` takes:
  - `usageContext` (userId, jobId, taskType)
  - `usageType` (text/image/video)
  - The LLM result, including `metadata` with token counts
- It normalizes token counts and prices, then writes to Firestore via `firestore.recordLlmUsage` and optionally BigQuery.
- Token handling highlights:
  - `outputTokens` = text output only (candidate tokens); thinking tokens are stored separately as `thoughtsTokens`.
  - Billing for output uses `(outputTokens + thoughtsTokens)` to match provider charges.

## Error handling
- Unsupported `taskType` → `400` with a clear message.
- Auth failures → `401`.
- Missing resources (e.g., video item not found) → `404`.
- Downstream errors (rendering, etc.) are surfaced with appropriate HTTP status via `httpError`.

## Minimal request example
```json
POST /api/llm
{
  "taskType": "suggest",
  "context": {
    "jobId": "job_123",
    "prompt": "Help me improve this JD..."
  }
}
```
This will call `llmClient.askSuggestions(context)`, log usage with `userId` from auth and `jobId` from the context, then return `{ "taskType": "suggest", "result": ... }`.
