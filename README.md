# Wizard Recruiting OS (JavaScript Monorepo)

Wizard orchestrates the recruiting pipeline end-to-end with event-driven services, LLM agents, and a thin Next.js frontend. The entire repository is authored in JavaScript per platform requirements—no TypeScript, TSX, or JSX files.

## Workspace Layout

```
apps/
  web/                 # Next.js frontend shell (marketing pages + dashboard)
services/
  api-gateway/         # Express API entrypoint (wizard + chat endpoints)
  wizard-chat/         # Agent coordination for chat + wizard workflows
  asset-generation/    # Generates campaign/job assets via LLM orchestrator
  campaign-orchestrator/ # State machine for multi-channel launches
  publishing/          # Channel adapters (stubs) for social/job boards
  screening/           # Lead capture, assessments, and interview prep stubs
  credits/             # Credit ledger / billing engine stub
packages/
  core/                # Domain schemas, state machines, entity helpers
  events/              # Event envelope definitions for the message bus
  llm/                 # Prompt registry + model orchestration facade
  utils/               # Logging, env loading, HTTP helpers
  data/                # Firestore + Redis adapters (stub implementations)
config/                # Placeholder for credentials/infra configs
scripts/               # Future automation hooks (migration, seeding)
```

## Getting Started

```bash
# Install workspace deps
npm run bootstrap

# Run the Next.js frontend
npm run dev:web

# Run the API gateway (Express)
npm run dev:api
```

All other services ship with `dev` scripts and structured logging stubs, ready to integrate with queues or Cloud Run jobs.

## Auth & Firestore persistence

1. Create a Google Cloud service account with Firestore access and download the JSON key to `config/service-account.json` (or update the `GOOGLE_APPLICATION_CREDENTIALS` path).
2. Populate `.env` from `.env.example` ensuring `FIRESTORE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, and `NEXT_PUBLIC_API_BASE_URL` are set.
3. Start both the API gateway (`npm run dev:api`) and the web app (`npm run dev:web`).
4. Log in through `/login` using any email—your profile and workspace will be created in Firestore with an initial 100 credit balance.
5. Submitting the wizard now writes a job document, reserves credits, snapshots the version, and surfaces the generated job-description asset under **Dashboard → Assets**.

## Design Highlights

- **Server-side intelligence only:** React app renders status/UX; all orchestration, validation, and persistence happen in services.
- **Event-driven backbone:** `packages/events` defines the event taxonomy so services can publish/subscribe consistently.
- **LLM orchestration layer:** `packages/llm` centralizes prompt registration, schema validation, and provider routing. Currently stubbed for easy provider swap.
- **Deterministic job state machine:** The job wizard progresses through `DRAFT → REQUIRED_IN_PROGRESS → REQUIRED_COMPLETE → ENRICHING_REQUIRED → OPTIONAL_IN_PROGRESS → LLM_ENRICHING → OPTIONAL_COMPLETE → ENRICHING_OPTIONAL → USER_REVIEW → APPROVED → DISTRIBUTION_RECOMMENDATION_LLM → ASSET_SELECTION_READY`.
- **Data abstractions:** `packages/data` exposes Firestore and Redis adapter contracts with logging and config validation baked in.
- **Credit metering:** Dedicated credits service stub ensures reserve/charge/refund flows remain isolated and auditable.
- **Observability ready:** `@wizard/utils` bundles Pino logging, env loading, and Express error helpers so every service ships with consistent traces.

## Environment Variables

Copy `.env.example` to `.env` and populate credentials per environment. Secrets are never committed.

For LLM-backed suggestions and chat, set the following (OpenAI example):

```
OPENAI_API_KEY=sk-...
# Optional overrides
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_SUGGEST_MODEL=gpt-4o-mini
```

If these are not provided, the orchestrator falls back to heuristic suggestions and canned chat replies.

## Next Steps

1. Wire services to a message broker (Pub/Sub, Cloud Tasks, etc.) and persist events in Firestore.
2. Flesh out asset generation/publishing adapters with actual provider integrations.
3. Implement deterministic state machines for jobs/campaigns backed by the `DeterministicStateMachine` helper.
4. Add Vitest suites & lint configs per workspace before production hardening.
5. Integrate Google OAuth credentials and secure session handling in the web app.
