# Architecture Overview

The system is split into composable JavaScript services coordinated through an event-driven backbone and LLM orchestrator.

## Sequence Summary

1. **Need discovery (Wizard):**
   - Frontend wizard collects mandatory fields.
   - API Gateway forwards draft updates to Wizard service + LLM orchestrator for enrichment suggestions.
   - Confirmed drafts emit `job.version.confirmed` for downstream consumers.

2. **Asset generation:**
   - Asset service consumes job version events.
   - Uses `@wizard/llm` to render job descriptions, landing pages, social assets, etc.
   - Generated artifacts recorded via `AssetArtifactSchema` with provenance metadata.

3. **Campaign orchestration:**
   - Campaign service models deterministic state transitions (`DeterministicStateMachine`).
   - Emits `campaign.launch.requested` events; publishing service pushes creative payloads to external APIs.

4. **Lead capture & screening:**
   - Screening service manages assessment flows, knockout questions, and interview kits.
   - Credits service reserves and charges credits per workflow, emitting ledger updates.

5. **Observability:**
   - Every service uses `@wizard/utils` for Pino logging and structured error responses.
   - Hook into OTEL exporters via `.env` settings to ship traces/metrics.

## Data Model Layers

- **Confirmed Data:** versioned job records persisted in Firestore via `JobRecord` helper.
- **AI Suggestions:** stored separately and only merged on user approval.
- **Assets/Campaigns:** tracked via schemas in `@wizard/core` with provenance and metrics fields.
- **Events:** `@wizard/events` provides typed envelopes for Pub/Sub or Kafka.
- **Credits:** ledger schema supports reserve/charge/refund patterns with correlation IDs.

## Infra Readiness

- GCP-first deployment (Cloud Run for services, Firestore for data, Memorystore for Redis).
- Event bus can be backed by Pub/Sub topics keyed by `EventEnvelopeSchema.partitionKey`.
- Observability hooks ready for Cloud Logging / OpenTelemetry exporters.

Extend or replace providers by adhering to the interfaces defined in `packages/core`, `packages/data`, and `packages/llm`.
