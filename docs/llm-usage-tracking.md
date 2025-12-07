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

### Configured Providers

| Provider | Modalities | Notes |
|----------|------------|-------|
| `gemini` | text, image, video | Google Gemini / Vertex AI. Primary provider for all LLM tasks. |
| `veo` | video | Google Veo video generation (Vertex AI). Default video provider. |
| `sora` | video | OpenAI Sora video generation. Uses `OPENAI_API_KEY` (same key as GPT/GPT-image-1). |
| `openai` | text, image | OpenAI GPT models + DALL-E. Requires `OPENAI_LLM_ENABLED=true` and valid `OPENAI_API_KEY`. |

### OpenAI Configuration

OpenAI LLM is disabled by default. To enable:

```bash
OPENAI_LLM_ENABLED=true
OPENAI_API_KEY=sk-...  # Required when enabled
OPENAI_API_URL=https://api.openai.com/v1/chat/completions  # Optional override
```

The system validates the API key at startup and fails fast if `OPENAI_LLM_ENABLED=true` but the key is missing or invalid.

> **Note:** `OPENAI_ENABLED` is deprecated but still supported for backwards compatibility. Please migrate to `OPENAI_LLM_ENABLED`.

### Sora Configuration

Sora video generation uses `OPENAI_API_KEY` — the same key used for all OpenAI features (GPT, GPT-image-1, Sora). There is no separate Sora token.

```bash
OPENAI_API_KEY=sk-...  # Single key for all OpenAI features
```

### Provider & Model Selection (Code-Only)

**Provider and model selection for all LLM tasks (text, image, video) is configured in code, not via environment variables.**

Configuration lives in `services/api-gateway/src/config/llm-config.js`:

- **Text/Image tasks**: `LLM_TASK_CONFIG` maps each task to `{ provider, model }`
- **Video rendering**: `VIDEO_RENDER_CONFIG` defines `defaultProvider` and per-provider models

Example for video:
```javascript
export const VIDEO_RENDER_CONFIG = Object.freeze({
  defaultProvider: "veo",
  providers: {
    veo: { model: "veo-3.1-generate-preview" },
    sora: { model: "sora-2-pro" },
  },
});
```

To change which provider/model a task uses, edit `llm-config.js` directly. Environment variables should only be used for:
- API keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`)
- Endpoints/URLs (`OPENAI_API_URL`, `GEMINI_API_URL`)
- Feature flags (`OPENAI_LLM_ENABLED`, `VIDEO_LLM_ENABLED`)
- Infra settings (timeouts, output directories)

> **Deprecated:** `VIDEO_DEFAULT_PROVIDER` and `VIDEO_MODEL` env vars are no longer used.

## Instrumentation

- Wrap LLM calls with `recordLlmUsageFromResult` (see `services/api-gateway/src/services/llm-usage-ledger.js`). For non-text workloads pass `usageType` (`image`, `video`, …) plus `usageMetrics` (e.g. `{ units: 1 }` for image).
- Provide a `usageContext` that includes `userId`, `jobId`, and a descriptive `taskType` (e.g. `suggestions`, `image_generation`, `copilot_agent`, etc.).
- The helper automatically persists ledger entries and updates user counters using the adapter injected into each router/service.

Current coverage:

- Wizard suggestions/refinement/channel recs/assets/image generation
- Copilot chat + agent loops
- Company intel enrichment
- Video manifest generation (storyboard, caption, compliance)
- Video rendering (Veo and Sora providers)
- Hero image prompt + render

When adding a new LLM task, reuse the helper so the ledger and counters stay accurate. If the provider response exposes usage metadata, pass it through `metadata` so token counts stay precise. Otherwise the helper will store zeros, which still preserves an audit trail.
