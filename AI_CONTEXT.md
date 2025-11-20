# Wizard Chat Bot – AI Context

Use this briefing whenever you start a new chat or hand context to another AI. It captures the repo’s purpose, layout, and the most touched files so future agents can reason quickly without re-scanning the entire tree.

## What This Repo Does
- End-to-end recruiting OS built on plain JavaScript (no TypeScript/JSX). Next.js UI collects job data while Express services orchestrate LLM workflows, persistence, and media generation (`README.md`).
- Event-driven mindset: API gateway persists records to Firestore and would normally emit events defined under `packages/events/src/index.js`.
- LLM orchestration lives in the API gateway (`services/api-gateway/src/llm-client.js`) with a provider policy and task registry so OpenAI/Gemini/image/video providers can be swapped via env vars.

## Workspace Layout
```
apps/web              – Next.js dashboard + wizard shell
services/api-gateway  – Express edge API (wizard, chat, copilot, videos, auth)
services/*            – Future workers (wizard-chat, asset-generation, campaign-orchestrator, etc.)
packages/core         – Shared schemas, enums, helpers (e.g., VIDEO_CHANNEL_SPEC_MAP)
packages/data         – Firestore/Redis adapters
packages/events       – Event envelope definitions
packages/llm          – Stubbed orchestrator for worker services
packages/utils        – Env loader, logging, Express helpers
docs/                 – Deep dives (video-library.md, video-architecture.md)
```

## Frontend Snapshot (`apps/web`)
- Next 14 / React 18, NextAuth, React Query, Tailwind. Config in `apps/web/package.json`.
- Wizard shell (`apps/web/components/wizard/wizard-shell.js`) drives intake flow via `useWizardController`, surfaces inline suggestions, and requires authentication tokens from the API.
- `apps/web/components/video-library/video-library.js` manages short-form video items: filters jobs, loads manifests, edits captions, and triggers server actions.
- REST client wrappers live in `apps/web/lib/api-client.js`, validating every response with Zod (suggestions, assets, company data, video library responses).

## API Gateway (`services/api-gateway`)
- `src/index.js` loads env, spins up Firestore (`packages/data/src/index.js`), and instantiates `createApp`.
- `src/server.js` wires middleware, serves `/video-assets`, enforces auth, and mounts routers: wizard, copilot, chat, assets, videos, dashboard, users, companies.
- Key routers:
  - `routes/wizard.js`: validates job drafts (`@wizard/core` schemas), merges state, runs suggestion/refinement/channel/asset tasks through the LLM client, writes Firestore documents, and tracks asset/hero image requests.
  - `routes/copilot.js` and `routes/chat.js`: fetch job snapshots, call `llmClient.askChat` / `runCopilotAgent`, sanitize replies, persist histories, and log LLM usage.
  - `routes/videos.js`: exposes CRUD/regenerate endpoints for video manifests. Relies on `video/service.js`, `video/renderer.js`, and publisher stubs.
- Video pipeline:
  - `video/service.js` builds manifests (Hook → Proof → Offer → Action) via `manifest-builder.js`, tracks render state, appends audit logs, and kicks off renders if `VIDEO_RENDER_AUTOSTART` is enabled.
  - `video/renderer.js` uses `UnifiedVideoRenderer` to talk to Veo (`video/renderers/clients/veo-client.js`) or Sora clients, normalizes returned paths beneath `/video-assets`, and validates via `VideoRenderTaskSchema`.
  - `docs/video-library.md` and `docs/video-architecture.md` give the full spec of storyboard/caption/compliance data and environment toggles.

## Shared Packages
- `packages/core/src/index.js`: exports all domain schemas; notable for `VideoLibraryItemSchema`, `VideoSpecSchema`, and `VIDEO_CHANNEL_SPEC_MAP` used across services.
- `packages/events/src/index.js`: enumerates event envelopes (wizard.draft.updated, job.version.confirmed, asset.generation.requested, etc.).
- `packages/llm/src/index.js`: stub orchestrator for background services—renders prompts, estimates token/credit costs, and returns deterministic placeholder data if real providers are absent.
- `packages/utils/src/index.js`: `loadEnv`, Pino logger builder (console + optional Elasticsearch), async wrapper, `httpError`, and Express error middleware.
- `packages/data/src/index.js`: Firestore bootstrap (service account vs emulator), normalized CRUD helpers, company lookups, LLM usage ledger, Redis no-op adapter.

## LLM Stack Highlights
- `services/api-gateway/src/llm-client.js` configures provider defaults per task (`suggest`, `refine`, `channels`, `chat`, `company_intel`, asset + video tasks, hero image prompt/generation). Tasks mapped in `services/api-gateway/src/llm/tasks.js`.
- Provider selection uses env-driven specs (e.g., `LLM_SUGGESTION_PROVIDER=openai:gpt-4o-mini` or `gemini:gemini-flash-latest`). Unknown providers throw early.
- Adapters: OpenAI, Gemini, DALL·E, Imagen, Stable Diffusion. Video/image tasks reuse the same orchestrator pattern.
- `services/api-gateway/src/services/llm-usage-ledger.js` (opened elsewhere) records per-user/job usage to Firestore via `packages/data`.

## Data & Infra Expectations
- Firestore is the primary store (`jobs`, `jobSuggestions`, `jobChannelRecommendations`, `jobAssets`, `videoLibraryItems`, `companies`, etc.).
- `.env` must define `FIRESTORE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, `NEXT_PUBLIC_API_BASE_URL`, and provider keys (OpenAI/Gemini/DALL·E/Sora/Veo). See `README.md` and `docs/video-library.md`.
- Static assets (rendered MP4s) are written to `VIDEO_RENDER_OUTPUT_DIR` (default `./tmp/video-renders`) and served through `/video-assets` with a configurable base URL.

## Satellite Services (stubs today)
- `services/wizard-chat` and `services/asset-generation`: load env/loggers, instantiate `@wizard/llm` orchestrators, and log “ready”. Designed for future queue/worker logic.
- `services/campaign-orchestrator`, `publishing`, `screening`, `credits`: directories exist with package scaffolding but are not yet wired; they’ll consume events defined in `packages/events`.

## How To Use This Doc
1. Read this file plus `README.md` / `architecture.md` for quick orientation.
2. When answering AI prompts, cite concrete files (e.g., `services/api-gateway/src/routes/videos.js`) to ground responses.
3. For video/LLM topics, skim `docs/video-library.md` then inspect the files referenced above to avoid hallucinations.
4. Keep this doc updated whenever new systems land or major flows move—future chats should never have to rediscover the architecture from scratch.

