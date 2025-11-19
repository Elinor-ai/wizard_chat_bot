# Video Library & Short-Form Video System (Refactored Architecture)

## Overview

The video pipeline now runs on a clean Strategy Pattern that abstracts rendering providers behind a unified interface. The API gateway orchestrates storyboard/caption/compliance generation (via Gemini) and then synchronously calls a `UnifiedVideoRenderer` that can target either **Google Vertex AI (Veo)** or **OpenAI Sora**. Each provider implements the same `IVideoClient` contract, so switching between them (or adding new providers) requires no changes in the service logic. All long-running operations, polling, and error handling happen inside the renderer layer, keeping `video/service.js` lean.

## Core Concepts

| Concept | Updated Description |
| --- | --- |
| **Job Snapshot** | Immutable subset of job data stored on every manifest version (title, geo, policy, pay, benefits). |
| **Channel Spec** | Constraint bundle per placement (`@wizard/core/video-specs`) that drives storyboard duration, aspect ratio, caption policy, compliance reminders. |
| **Asset Manifest** | Versioned JSON describing storyboard → caption → thumbnail → QA checklist → compliance flags → tracking metadata. |
| **Render Task** | Pino-friendly record validated by `VideoRenderTaskSchema`. Contains renderer type, status (`pending`, `completed`, `failed`), metrics, and asset URLs returned by the provider. |
| **Unified Renderer** | Strategy context (`services/api-gateway/src/video/renderers/unified-renderer.js`) that selects a client (`veo` or `sora`), starts a generation job, polls provider status on an interval/timeout, and normalizes success/failure payloads. |
| **IVideoClient** | Lightweight interface exported from `renderers/contracts.js`. Defines `startGeneration(request)` and `checkStatus(id)` plus a shared `VideoRendererError`. VeoClient and SoraClient implement this contract. |

## Configuration

Set these environment variables for the video service:

| Variable | Purpose |
| --- | --- |
| `VIDEO_LLM_ENABLED` | Toggle LLM-backed manifest generation (Gemini) vs fallback builders. |
| `VIDEO_RENDER_AUTOSTART` | Automatically trigger rendering after each manifest creation/regeneration. |
| `VIDEO_DEFAULT_PROVIDER` | Default renderer (`veo` or `sora`) for new library items. |
| `GEMINI_API_KEY` | Legacy fallback for providers requiring Gemini auth; still read by the renderer options. |
| `SORA_API_TOKEN` | OpenAI Sora bearer token used by `SoraClient`. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to the Vertex AI service-account JSON (`config/service-account.json`). |
| `GOOGLE_CLOUD_PROJECT_ID` | Project hosting the Vertex AI model. |
| `GOOGLE_CLOUD_LOCATION` | Vertex region (default `us-central1`). |
| `VIDEO_MODEL` | Vertex AI publisher model ID (e.g., `veo-2.0-generate-001`). |
| `RENDER_POLL_INTERVAL_MS` | Millisecond delay between polling attempts inside the unified renderer (default `2000`). |
| `RENDER_POLL_TIMEOUT_MS` | Maximum time in ms before a render attempt is considered failed (default `240000`). |
| `VIDEO_RENDER_OUTPUT_DIR` | Filesystem path for storing final video/caption/poster assets served via `/video-assets`. |
| `VIDEO_RENDER_PUBLIC_BASE_URL` | Public base URL pointing to the assets directory (Next.js frontend expects this). |

## Architecture Deep Dive

### 1. Interfaces (contracts.js)
- Defines `VideoGenerationRequest`/`VideoGenerationResult`.
- Exports `IVideoClient` and `VideoRendererError`.
- Every provider must throw `VideoRendererError` with a `code` (e.g., `RATE_LIMITED`, `TIMEOUT`, `PROVIDER_ERROR`) and `context`.

### 2. Concrete Clients

**VeoClient (Vertex AI)**
- Auth: `GoogleAuth` with `cloud-platform` scope; reads credentials from `GOOGLE_APPLICATION_CREDENTIALS`.
- Predict URL: `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:predict`.
- Payload: `instances[{prompt}]` + optional `parameters.aspectRatio`.
- Polling: uses operation name returned by Vertex and fetches until `done` is true.

**SoraClient (OpenAI)**
- Auth: Bearer token via `SORA_API_TOKEN`.
- Payload: `{ model, prompt, size }` (size derived from aspect ratio and coerced to OpenAI-supported resolutions).
- Polling: hits `/videos/{id}` until status is `succeeded` or `failed`.

Both clients log raw provider errors and propagate structured context back to the renderer.

### 3. Strategy Manager (unified-renderer.js)
- Accepts provider selection and request payload.
- Calls `client.startGeneration`, then loops with `await sleep(pollInterval)` + `client.checkStatus`.
- Handles retries until success, failure, or timeout; returns normalized `{provider, model, videoUrl}` to the caller.
- Synchronous from the service’s perspective (no more async pollers or Firestore state).

## Lifecycle (API Perspective)

1. **Create** – `POST /videos` generates a manifest via LLM/fallbacks, persists it, and (if `VIDEO_RENDER_AUTOSTART`) immediately calls `triggerRender`.
2. **Plan** – Manifest includes storyboard (Hook→Proof→Offer→Action), caption, compliance flags, thumbnail, QA checklist, and tracking metadata.
3. **Render** – `createVideoLibraryService.triggerRender` calls the unified renderer with the item’s provider. The renderer handles the LRO + polling internally and returns a validated `VideoRenderTask`.
4. **Review/Approve/Publish** – Unchanged: listing, detail views, manual caption edits, approval and publishing flows still operate on `VideoLibraryItem` documents.

## Video Generation Flow (Detailed)

1. **Request Intake** – `/videos` router authenticates the user, validates payload via Zod, loads the job document, and delegates to the service.
2. **Manifest Assembly** – `buildVideoManifest` resolves channel specs, derives job snapshot, runs LLM tasks (`video_storyboard`, `video_caption`, `video_compliance`), and falls back to deterministic builders if needed.
3. **Persistence** – Firestore stores the manifest history, provider choice, render/publish tasks, analytics, and audit log.
4. **Render Kickoff** – Service computes the provider (`video.provider` field or `VIDEO_DEFAULT_PROVIDER`) and calls `renderer.render({ manifest, provider })`.
5. **Unified Rendering** – Inside `UnifiedVideoRenderer`, the system selects the appropriate client, starts generation, polls using `RENDER_POLL_INTERVAL_MS`, enforces `RENDER_POLL_TIMEOUT_MS`, and returns a `VideoRenderTaskSchema` payload (including hosted URLs) or throws `VideoRendererError`.
6. **Audit & Metrics** – Service records the render outcome, updates status (`planned → generating → ready`), logs audit entries, and bumps metrics (`video_renders_completed`, `video_renders_failed`).
7. **Publish Flow** – unchanged; adapters still read `renderTask` and push to downstream platforms once a file exists.

## Key Architectural Changes

- **Strategy Pattern** – Rendering is abstracted behind `IVideoClient`. `UnifiedVideoRenderer` simply orchestrates requests and polling, making the providers swappable.
- **Authentication Upgrade** – Veo now uses Google service-account credentials (Vertex AI) instead of static user API keys. Sora uses Bearer tokens. No secrets are hard-coded.
- **Decoupled Polling** – `video/service.js` no longer stores Veo state, timers, or backoff logic. All long-running operation handling happens inside the renderer layer.
- **Correct Vertex Endpoint** – Requests go to `aiplatform.googleapis.com` with the correct publisher model path, aligning with Google’s recommended API.

## Next Steps for New Contributors

1. Configure env vars (especially `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT_ID`, `VIDEO_MODEL`, `SORA_API_TOKEN`).
2. Run `npm run dev:api` after setting provider defaults to verify renders complete.
3. Add new providers by implementing `IVideoClient` and registering them in `UnifiedVideoRenderer`.
4. Keep `docs/video-architecture.md` up to date as new capabilities (e.g., more providers or rendering tiers) are added.

## Adding a New Renderer Client

1. **Implement `IVideoClient`** – create `services/api-gateway/src/video/renderers/clients/<provider>-client.js`, extend `IVideoClient`, and implement `startGeneration(request)` and `checkStatus(id)` so they return `{ id, status }` objects consistent with existing clients. Throw `VideoRendererError` with a descriptive `code` and `context.provider = "<provider>"`.
2. **Handle Auth & Payloads** – perform all provider-specific authentication inside the client (service account, OAuth, API key, etc.) and normalize the payload (prompt, duration/aspect hints) so higher layers remain agnostic.
3. **Polling Contract** – ensure `startGeneration` returns `status: "pending"` and `checkStatus` returns `pending`, `completed` (with `videoUrl`), or `failed` (with `error`). The unified renderer relies on these signals to drive its interval/timeout loop.
4. **Register in `UnifiedVideoRenderer`** – instantiate the new client, add it to `this.clients`, and wire up any env-var-driven configuration (tokens, model IDs, regions).
5. **Document Configuration** – add the provider’s env variables to this doc (and `.env` templates), then expose the new provider option wherever users/admins select renderers (`VIDEO_DEFAULT_PROVIDER`, UI dropdowns, etc.).
