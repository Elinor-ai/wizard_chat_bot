# Developer Onboarding Guide

Welcome to the Wizard Recruiting OS codebase. This guide will help you get up and running quickly.

## Prerequisites

- **Node.js**: v18+ (uses native fetch)
- **npm**: v10+ (for workspaces support)
- **Google Cloud**: Service account with Firestore, BigQuery, and Vertex AI access

## Repository Structure

```
job-launcher/
├── apps/
│   └── web/                    # Next.js 14 frontend (App Router)
├── services/
│   └── api-gateway/            # Express backend (main API)
├── packages/
│   ├── core/                   # Zod schemas, types, state machines
│   ├── events/                 # Event definitions
│   ├── llm/                    # Prompt registry, model configs
│   └── utils/                  # Logger (Pino), HTTP helpers
├── config/                     # Service account credentials
└── docs/                       # Documentation
```

## Quick Start

### 1. Install Dependencies

```bash
# From the root directory
npm install
```

This will install all dependencies across workspaces.

### 2. Set Up Environment Variables

Create `.env` files based on required variables:

**Backend** (`services/api-gateway/.env`):
```env
# Required
AUTH_JWT_SECRET=your-strong-random-secret-here
GOOGLE_APPLICATION_CREDENTIALS=../../config/service-account.json

# Optional
PORT=4000
NODE_ENV=development
AUTH_JWT_EXPIRES_IN=7d
```

**Frontend** (`apps/web/.env.local`):
```env
# API connection
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000

# NextAuth
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### 3. Run the Application

**Option A: Run both frontend and backend together**
```bash
npm run dev
```

**Option B: Run separately (recommended for debugging)**
```bash
# Terminal 1: Backend
npm run dev:api
# → http://localhost:4000

# Terminal 2: Frontend
npm run dev:web
# → http://localhost:3000
```

### 4. Verify Setup

1. Open http://localhost:3000
2. Create an account or log in
3. Navigate to the Wizard to create a job

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Run both frontend and backend concurrently |
| `npm run dev:web` | Run frontend only (Next.js) |
| `npm run dev:api` | Run backend only (Express) |
| `npm run build` | Build all workspaces |
| `npm run test` | Run tests across all workspaces |
| `npm run lint` | Lint all workspaces |

### Package-Specific Commands

**Backend** (`cd services/api-gateway`):
```bash
npm run dev      # Development with hot reload
npm run start    # Production mode
npm test         # Run Vitest tests (73 passing, 2 video tests skipped)
npm run lint     # ESLint
```

**Frontend** (`cd apps/web`):
```bash
npm run dev      # Development with hot reload
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Next.js linting
npm run format   # Prettier check
```

## Architecture Mental Model

### Core Invariant

**All LLM calls go through `POST /api/llm`**

This is the central entry point for all AI operations. The route handles:
- Task routing via `taskType` parameter
- Authentication enforcement
- Usage tracking to Firestore and BigQuery
- Consistent error handling

### Main Flows

**1. Wizard Flow (Job Creation)**
```
Frontend → /wizard/* endpoints → Job saved to Firestore
         → POST /api/llm (suggestions, refinement, channels)
         → POST /api/llm (asset generation)
         → Assets saved to Firestore
```

**2. Golden Interviewer Flow**
```
Frontend → POST /golden-interview/start → Session created
         → POST /golden-interview/chat → Internal HTTP to /api/llm
         → LLM generates questions → Session updated
```

**3. Video Generation Flow**
```
Frontend → POST /api/llm (taskType: video_create_manifest)
         → Storyboard generated → Compliance check → Captions
         → Veo API renders video → URL saved to Firestore
```

### Repository Pattern

Non-LLM domain data access is centralized in repositories:

```
routes/users.js       → user-repository.js
routes/auth.js        → user-repository.js
routes/subscriptions.js → subscription-repository.js
routes/dashboard.js   → dashboard-repository.js
routes/companies.js   → company-repository.js
```

Routes never access Firestore directly.

## Testing

### Run Backend Tests
```bash
cd services/api-gateway
npm test
```

**Expected output**:
- 73 tests passing
- 2 tests skipped (video rendering - requires Veo API)

### Test Structure
```
services/api-gateway/src/__tests__/
├── gemini-adapter.schema-grounding.test.js   # Schema validation
├── llm-route.core-tasks.test.js              # LLM task routing
├── golden-interview.flow.test.js             # Interview flow
└── wizard.core-flows.test.js                 # Wizard operations
```

## Key Documentation

| Document | Description |
|----------|-------------|
| [SYSTEM_OVERVIEW.md](./SYSTEM_OVERVIEW.md) | Full architecture and feature documentation |
| [AUTH_ARCHITECTURE.md](./AUTH_ARCHITECTURE.md) | Authentication flow and JWT handling |
| [LLM_TASK_INTEGRATION_GUIDE.md](./LLM_TASK_INTEGRATION_GUIDE.md) | How to add new LLM tasks |
| [video-architecture.md](./video-architecture.md) | Video generation system |

## Common Tasks

### Adding a New API Endpoint

1. **Create/modify route** in `services/api-gateway/src/routes/`
2. **Add to server.js** if new router
3. **Add API method** in `apps/web/lib/api-client.js`
4. **Add response schema** in `apps/web/lib/schemas/`

### Adding a New LLM Task

See [LLM_TASK_INTEGRATION_GUIDE.md](./LLM_TASK_INTEGRATION_GUIDE.md)

1. Add task type to `services/api-gateway/src/llm/tasks.js`
2. Create task handler in `services/api-gateway/src/services/llm-tasks/`
3. Add to switch in `services/api-gateway/src/routes/llm.js`
4. Add frontend API method if needed

### Debugging

**Backend logs**: Check terminal running `npm run dev:api`
- All requests logged with Morgan
- LLM operations logged with task context
- Errors include stack traces

**Frontend**: Browser DevTools console
- API calls use prefixes like `[API]`, `[Video]`
- React Query shows request state

## Troubleshooting

### "AUTH_JWT_SECRET is not configured"
Set `AUTH_JWT_SECRET` in `services/api-gateway/.env`

### "GOOGLE_APPLICATION_CREDENTIALS not found"
Ensure `config/service-account.json` exists and path is correct in `.env`

### Frontend shows "Failed to fetch"
- Check backend is running on port 4000
- Check CORS is configured for localhost:3000
- Check `NEXT_PUBLIC_API_BASE_URL` in frontend `.env.local`

### Tests fail with timeout
Some tests require Google Cloud access. Ensure service account is configured.

## Getting Help

1. Check existing docs in `/docs`
2. Search codebase for similar patterns
3. Check console/terminal logs for error details

---

**Last updated**: December 2024
