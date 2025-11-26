# LLM Usage Tracking

This repository now records every LLM invocation (text, image, video helper) in a central ledger so we can audit consumption, compute $ cost snapshots, and reconcile credits.

## Ledger Collection

- Collection: `LLMsUsage`
- Schema (`packages/core/src/schemas/llm-usage.js`):
  - `userId`, `jobId`, `taskType`
  - `provider`, `model`, `status`, optional `errorReason`
  - `inputTokens`, `outputTokens`, `cachedTokens`, `totalTokens`
  - Pricing snapshot (`pricingPlan`, USD-per-million rates, USD-per-credit, `tokenCreditRatio`)
  - `estimatedCostUsd` + `creditsUsed`
  - `timestamp` + optional metadata (currently `finishReason`)

Entries are appended via `firestore.recordLlmUsage`, which normalises timestamps and returns the stored document. The helper now enriches each ledger row with the pricing data pulled from `services/api-gateway/src/config/pricing-rates.js` (rate card v1). Even if we change pricing later, existing rows keep their original USD + credit math.

## User Counters

`UserSchema.usage` now tracks:

- `totalTokensUsed`
- `remainingCredits`

`remainingCredits` can go negative—we are not enforcing pre-flight checks yet. Every time we log a ledger entry, `services/api-gateway/src/services/llm-usage-ledger.js` also increments the user counters (and refreshes `lastActiveAt`).

## Pricing Rate Card

- Configuration lives in `services/api-gateway/src/config/pricing-rates.js`.
- Hierarchy: Provider → Model → modality (text/image/video).
- Text pricing supports individual rates for input, output, and cached tokens (USD per 1M tokens).
- Image pricing is per generated unit; video supports per-second/per-unit billing.
- Each provider can override USD-per-credit so expensive models burn more credits.
- `recordLlmUsage` resolves the provider/model block, calculates USD + credits, and stores the rates + computed totals on the ledger row.

## Instrumentation

- Wrap LLM calls with `recordLlmUsageFromResult` (see `services/api-gateway/src/services/llm-usage-ledger.js`). For non-text workloads pass `usageType` (`image`, `video`, …) plus `usageMetrics` (e.g. `{ units: 1 }` for image).
- Provide a `usageContext` that includes `userId`, `jobId`, and a descriptive `taskType` (e.g. `wizard_suggestions`, `image_generation`, `copilot_chat`, etc.).
- The helper automatically persists ledger entries and updates user counters using the adapter injected into each router/service.

Current coverage:

- Wizard suggestions/refinement/channel recs/assets/image generation
- Copilot chat + agent loops
- Company intel enrichment
- Video manifest generation (storyboard, caption, compliance)
- Hero image prompt + render

When adding a new LLM task, reuse the helper so the ledger and counters stay accurate. If the provider response exposes usage metadata, pass it through `metadata` so token counts stay precise. Otherwise the helper will store zeros, which still preserves an audit trail.
