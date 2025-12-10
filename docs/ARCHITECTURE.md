# Architecture Overview

This document describes the high-level architecture of Wizard Recruiting OS.

---

## Monorepo Structure

```
job-launcher/
├── apps/
│   └── web/                    # Next.js frontend (App Router)
├── services/
│   ├── api-gateway/            # Main backend (Express.js) - ACTIVE
│   ├── asset-generation/       # [STUB] Future: async asset pipeline
│   ├── campaign-orchestrator/  # [STUB] Future: multi-channel campaigns
│   ├── credits/                # [STUB] Future: billing microservice
│   ├── publishing/             # [STUB] Future: job board publishing
│   ├── screening/              # [STUB] Future: candidate screening
│   └── wizard-chat/            # [STUB] Future: copilot microservice
├── packages/
│   ├── core/                   # Shared schemas and domain types
│   ├── utils/                  # Common utilities (logger, env, etc.)
│   ├── llm/                    # LLM orchestration package
│   ├── events/                 # Event bus contracts
│   └── data/                   # Data access utilities
└── docs/                       # Documentation
```

---

## Active Services

### `api-gateway` (Main Backend)
**Port**: 4000
**Technology**: Express.js, Node.js
**Purpose**: Handles all HTTP API requests

Key Responsibilities:
- Authentication (JWT)
- LLM task dispatch (`POST /api/llm`)
- Firestore/BigQuery data access
- Video generation (Veo)
- Company enrichment (Gemini + Google Search)

See [LLM_TASK_INTEGRATION_GUIDE.md](./LLM_TASK_INTEGRATION_GUIDE.md) for LLM architecture.

### `web` (Frontend)
**Port**: 3000
**Technology**: Next.js 14 (App Router)
**Purpose**: User interface

Key Features:
- Wizard job creation flow
- Golden Interviewer chat interface
- Video/image asset management
- Company dashboard

---

## Stub Services (Future Microservices)

These services exist as architectural placeholders. Currently all functionality lives in `api-gateway`.

| Service | Future Purpose | Current Location |
|---------|---------------|------------------|
| `asset-generation` | Async asset pipeline, queue-based | `api-gateway/src/services/wizard/wizard-asset-generation-service.js` |
| `campaign-orchestrator` | Multi-channel campaign coordination | `api-gateway/src/services/wizard/` |
| `credits` | Billing, credit deduction, metering | `api-gateway/src/services/llm-usage-ledger.js`, `subscription-repository.js` |
| `publishing` | Job board API integrations | Not yet implemented |
| `screening` | Candidate screening/matching | Not yet implemented |
| `wizard-chat` | Copilot/Golden Interviewer | `api-gateway/src/copilot/`, `golden-interviewer/` |

### When to Extract

Consider extracting when:
- The functionality needs independent scaling
- There are clear domain boundaries
- The service needs different SLAs
- Team structure requires ownership boundaries

---

## Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│  Next.js    │────▶│ API Gateway │
│             │     │  (SSR/CSR)  │     │  (Express)  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
                    ▼                          ▼                          ▼
             ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
             │  Firestore  │           │   Gemini    │           │     Veo     │
             │  (Database) │           │   (LLM)     │           │   (Video)   │
             └─────────────┘           └─────────────┘           └─────────────┘
```

---

## Key Patterns

### 1. Repository Pattern
Routes → Services → Repositories → Firestore

```
routes/llm.js           # HTTP handling
  └─▶ services/llm-tasks/   # Business logic
        └─▶ repositories/   # Data access
```

### 2. Single LLM Entry Point
All LLM calls go through `POST /api/llm`:
```
Frontend/Backend → POST /api/llm → llmClient → orchestrator → provider
```

### 3. Usage Tracking
Every LLM call is logged for billing:
```
LLM Response → recordLlmUsageFromResult() → Firestore + BigQuery
```

---

## Technical Debt

### Wizard Controller (2446 lines)
Location: `apps/web/components/wizard/use-wizard-controller.js`

This hook manages the entire wizard flow and should be refactored into:
- `useWizardNavigation` - Step transitions
- `useWizardForm` - Form state management
- `useWizardAutoSave` - Debounced persistence
- `useWizardSuggestions` - LLM suggestion handling
- `useWizardAssets` - Asset generation state

Priority: Medium (functional but complex)

### Console Logging in Video Code
Video rendering uses `console.log` for real-time debugging. These are intentionally kept for development visibility but should be migrated to structured logging with debug levels.

---

## Related Documentation

- [CODING_STANDARDS.md](./CODING_STANDARDS.md) - Error handling, logging, Zod policy
- [DATA_MODEL.md](./DATA_MODEL.md) - Firestore collections, BigQuery tables
- [LLM_TASK_CONTRACTS.md](./LLM_TASK_CONTRACTS.md) - LLM task reference
- [LLM_TASK_INTEGRATION_GUIDE.md](./LLM_TASK_INTEGRATION_GUIDE.md) - Adding new LLM tasks

---

**Last updated**: December 2024
