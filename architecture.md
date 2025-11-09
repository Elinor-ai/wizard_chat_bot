# Architecture Overview

Wizard is organized as a JavaScript/TypeScript monorepo. Every deployable runs in its own service directory, while shared logic ships inside `packages/*`. The platform is event-driven: core workflows emit typed events (Firestore-backed persistence + Pub/Sub style fan-out) and the LLM orchestration layer enriches user requests and downstream automation.

## Monorepo Layout

- `apps/web` — Next.js dashboard + wizard UI (multi-tenant, NextAuth, React Server Components).
- `services/api-gateway` — Express edge API, request validation, auth, LLM orchestration, Firestore access.
- `services/wizard-chat` — Realtime messaging assistants (WebSocket/SSE).
- `services/asset-generation` — Listens for confirmed job versions and renders long-form/job assets.
- `services/campaign-orchestrator` — Deterministic campaign state machine, pacing, budget controls.
- `services/publishing` — Connectors to paid/organic channels; pushes payloads created by asset service.
- `services/screening` — Lead capture flows, knockout questions, interview kit logistics.
- `services/credits` — Ledger + pricing engine; reserves and charges per workflow.
- `packages/core` — Schemas, domain helpers, enums shared everywhere (`JobSchema`, `CampaignSchema`, etc.).
- `packages/data` — Firestore/SQL repositories, query helpers.
- `packages/events` — Event envelope schemas, topic helpers, serializer/deserializer utilities.
- `packages/llm` — Shared prompt snippets and task utilities for non-gateway consumers.
- `packages/utils` — Logging (`createLogger`), async helpers, HTTP utilities.
- `config/` — Environment templates, shared tsconfig/eslint configs.

## End-to-End Flow

1. **Need discovery (Wizard)**
   - `apps/web` collects intake data, calls `services/api-gateway`.
   - API Gateway runs validation, persists drafts, and fans out to Wizard services + the LLM orchestrator for autofill/refinement.
   - Once users confirm required fields we emit `job.version.confirmed`.

2. **Asset generation**
   - `services/asset-generation` subscribes to job events.
   - Uses `@wizard/llm` or provider-specific adapters to craft long-form copy, landing pages, and social assets.
   - Artifacts stored with provenance via `AssetArtifactSchema`.

3. **Campaign orchestration & publishing**
   - `services/campaign-orchestrator` tracks campaign lifecycles via `DeterministicStateMachine`.
   - Emits `campaign.launch.requested`; `services/publishing` pushes creatives and budgets to LinkedIn, Meta, Reddit, etc.

4. **Lead capture & screening**
   - `services/screening` handles landing page forms, assessments, interview kits.
   - `services/credits` reserves/charges credits, emits ledger updates for billing transparency.

5. **Observability / Automation**
   - All services depend on `@wizard/utils` for structured Pino logging, error helpers, retry wrappers.
   - OTEL exporters configured through `.env` allow traces/metrics to flow to Cloud Logging/Monitoring.

## Frontend (apps/web)

- Next.js app handles authentication (NextAuth provider stack), multi-tenancy, and wizard UX.
- Shared component libraries (e.g., `apps/web/components/wizard/*`) orchestrate form steps, chat panels, and suggestion acceptance.
- API routes proxy to the gateway but share validation via `@wizard/core` schemas.

## Backend Services

- **API Gateway:** Entry point for SPA requests, Firestore CRUD, triggers to LLM orchestration, and SSE endpoints.
- **Wizard Chat:** Lightweight service optimized for conversational flows (routing chat intents, storing transcripts).
- **Asset Generation:** Performs deterministic + AI-driven asset creation; stores results for campaign ingestion.
- **Campaign Orchestrator:** Handles state transitions, pacing, approvals, and escalation events.
- **Publishing:** Owns external API clients, retries, and success/failure events for media channels.
- **Screening:** Manages candidate funnel post-click, including notifications and booking.
- **Credits:** Keeps financial ledger, supports reserve/charge/refund lifecycles, and exposes credit balances.

Each service exposes HTTP or worker entrypoints, subscribes to `@wizard/events` topics, and persists authoritative data in Firestore/Redis as required.

## Shared Packages & Data Model Layers

- **`@wizard/core`:** Source of truth schemas, validation helpers, enums (jobs, campaigns, channels, credits). Used on both client/server.
- **`@wizard/data`:** Firestore repositories, migrations, caching helpers.
- **`@wizard/events`:** Typed envelope factory (`EventEnvelopeSchema`), partition helpers, publish/consume utilities.
- **`@wizard/llm`:** Common prompt fragments for services outside API gateway.
- **`@wizard/utils`:** Logging, env loading, HTTP wrappers, async helpers.
- **Data layers:**
  - Confirmed job data stored versioned via `JobRecord`.
  - AI suggestions persisted separately until user approval.
  - Assets/campaigns use provenance-aware schemas from `@wizard/core`.
  - Credits ledger supports reserve/charge/refund with correlation IDs.

## Messaging, Storage & Infra

- **Event bus:** Pub/Sub (or Kafka) topics keyed by `EventEnvelopeSchema.partitionKey`. Consumers idempotent via event IDs.
- **Persistence:** Firestore for canonical records; Memorystore/Redis for caching/session; Cloud Storage for asset binaries.
- **Deployment:** Cloud Run per service, Cloud Scheduler/Workflows for cron-style jobs. Secrets managed through Secret Manager.
- **Observability:** Structured logs (Pino) via `@wizard/utils`, OTEL tracing hooks, status metrics exported per service.

## LLM Orchestration Layer

- **Provider policy:** `services/api-gateway/src/llm/providers/selection-policy.js` resolves `{provider, model}` per task (suggest, refine, channels, chat) using env overrides like `LLM_SUGGESTION_PROVIDER`. The mapping is cached and logged for observability.
- **Adapters:** `openai-adapter` and `gemini-adapter` encapsulate payload shapes, transport URLs, and metadata extraction. The orchestrator only calls `adapter.invoke({system, user, mode, temperature, maxTokens})`.
- **Task registry:** `services/api-gateway/src/llm/tasks.js` binds each task to its system prompt, prompt builder, parser/normalizer, retry discipline, and preview logger. Adding a task means appending to this registry without touching orchestration code.
- **Prompts & parsers:** Prompt builders live under `src/llm/prompts/` with fixed instructions and contracts; parsers under `src/llm/parsers/` normalize outputs (e.g., suggestion candidates, refined jobs, channel recommendations) and surface structured errors.
- **Orchestrator:** `src/llm/orchestrator.js` assembles tasks at runtime—selecting the provider via the policy, building prompts, invoking adapters, retrying failed parses with strict mode, and returning normalized payloads or errors. Observability logs each attempt/provider/model combination.
- **Public API:** `src/llm-client.js` now only wires env defaults → adapters → orchestrator and exposes `askSuggestions`, `askRefineJob`, `askChannelRecommendations`, and `askChat`, keeping the rest of the system provider/payload agnostic.

## Extensibility Playbook

- Adding a service: create `services/<name>`, consume schemas/events from `packages/*`, register new Pub/Sub topics, and wire deployments via Cloud Run.
- Adding a domain schema: define in `packages/core`, update dependent services, and ensure validation flows through API gateway.
- Adding an LLM task or provider: update `services/api-gateway/src/llm/tasks.js` or add a new adapter; no other module changes required.
- Replacing infra (e.g., different event bus) only requires swapping implementations inside `packages/events` so services remain unchanged.
