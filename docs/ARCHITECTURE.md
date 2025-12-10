# Wizard Recruiting OS - Architecture Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Frontend Application (apps/web)](#4-frontend-application-appsweb)
5. [Backend Services](#5-backend-services)
6. [Shared Packages](#6-shared-packages)
7. [Database Architecture](#7-database-architecture)
8. [Authentication & Authorization](#8-authentication--authorization)
9. [LLM/AI Integration](#9-llmai-integration)
10. [Video Generation System](#10-video-generation-system)
11. [Company Intelligence System](#11-company-intelligence-system)
12. [Features Overview](#12-features-overview)
13. [API Reference](#13-api-reference)
14. [Key Files Reference](#14-key-files-reference)
15. [Environment Configuration](#15-environment-configuration)

---

## 1. Project Overview

**Wizard Recruiting OS** (Job Launcher) is an AI-powered recruiting and job marketing automation platform. The system enables companies to create job postings, generate marketing assets, and distribute them across 40+ channels using LLM-powered automation.

### Core Capabilities

- **Job Creation Wizard**: Multi-step guided job posting creation with AI suggestions
- **Golden Interview**: Conversational AI interview system with 30+ interactive UI components
- **Company Intelligence**: Automated company data enrichment and job discovery
- **Asset Generation**: LLM-powered marketing content generation (text, images, videos)
- **Video Generation**: Automated video creation with Veo/Sora integration
- **Multi-Channel Distribution**: Support for 40+ job boards and social platforms
- **Credit System**: Usage-based billing with detailed LLM cost tracking

### Architecture Philosophy

- **Event-Driven**: Services communicate via typed events
- **LLM-First**: AI orchestration at the core of all content generation
- **Multi-Tenant**: Support for multiple companies per user
- **Cloud-Native**: Built for GCP (Firestore, BigQuery, Cloud Storage, Cloud Run)

---

## 2. Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14.2.9 | React framework with App Router |
| React | 18.3.1 | UI library |
| TanStack Query | 5.50.2 | Server state management |
| NextAuth.js | 4.24.13 | Authentication |
| Tailwind CSS | 3.4.13 | Styling |
| Framer Motion | 11.13.0 | Animations |
| Zod | 3.23.8 | Schema validation |
| Lucide React | 0.452.0 | Icons |

### Backend
| Technology | Purpose |
|------------|---------|
| Node.js | Runtime (ES Modules) |
| Express.js | HTTP framework |
| Plain JavaScript | No TypeScript compilation |
| Zod | Runtime validation |
| JWT | Authentication tokens |
| bcryptjs | Password hashing |

### Database & Storage
| Service | Purpose |
|---------|---------|
| Firestore | Primary document database |
| BigQuery | Analytics data warehouse |
| Redis (Upstash) | Caching and sessions |
| Cloud Storage | Video and image assets |

### LLM Providers
| Provider | Models | Use Cases |
|----------|--------|-----------|
| Google Gemini | gemini-3-pro-preview | Text generation, suggestions, refinement |
| Google Veo | veo-3.1-fast-generate-preview | Video generation |
| OpenAI Sora | sora-2-pro | Alternative video generation |
| Imagen | - | Image generation |
| DALL-E | dall-e-3 | Alternative image generation |
| Stable Diffusion | - | Fallback image generation |

### External Services
| Service | Purpose |
|---------|---------|
| Brandfetch API | Company branding data |
| Google Custom Search | Web search for company intelligence |
| SerpAPI | Alternative web search |
| Nodemailer | Email sending |

---

## 3. Monorepo Structure

```
job-launcher/
├── apps/
│   └── web/                    # Next.js frontend application
├── services/
│   ├── api-gateway/            # Main Express.js API (primary backend)
│   ├── wizard-chat/            # Chat/messaging service
│   ├── asset-generation/       # LLM asset generation worker
│   ├── campaign-orchestrator/  # Campaign state machine
│   ├── publishing/             # Channel publishing adapters
│   ├── screening/              # Lead capture & interview
│   └── credits/                # Credit ledger & billing
├── packages/
│   ├── core/                   # Domain schemas & types
│   ├── data/                   # Database adapters
│   ├── events/                 # Event definitions
│   ├── llm/                    # LLM orchestration
│   └── utils/                  # Shared utilities
├── config/                     # Credentials & configs
├── scripts/                    # Automation scripts
├── docs/                       # Documentation
├── package.json                # Root monorepo config
└── .env                        # Environment variables
```

### Workspace Configuration

```json
{
  "workspaces": [
    "apps/*",
    "services/*",
    "packages/*"
  ]
}
```

### Key Scripts

```bash
npm run dev          # Run web + API gateway concurrently
npm run dev:web      # Run Next.js frontend only
npm run dev:api      # Run Express API only
npm run build        # Build all workspaces
npm run test         # Test all workspaces
npm run lint         # Lint all workspaces
```

---

## 4. Frontend Application (apps/web)

### Directory Structure

```
apps/web/
├── app/                        # Next.js App Router
│   ├── layout.js              # Root layout with providers
│   ├── page.js                # Landing page
│   ├── (marketing)/           # Public routes group
│   │   ├── login/
│   │   ├── signup/
│   │   ├── pricing/
│   │   ├── contact/
│   │   └── demo/
│   ├── (dashboard)/           # Protected routes group
│   │   ├── layout.js          # Dashboard sidebar
│   │   ├── dashboard/         # Control Tower
│   │   ├── wizard/            # Job creation wizard
│   │   ├── assets/            # Asset library
│   │   ├── images/            # Image management
│   │   ├── videos/            # Video library
│   │   ├── campaigns/         # Campaign management
│   │   ├── credits/           # Credit balance
│   │   └── settings/          # User settings
│   ├── golden-interview/      # AI Interview page
│   └── api/auth/              # NextAuth routes
├── components/
│   ├── wizard/                # Job wizard (30+ files)
│   ├── golden-interview/      # Interview UI (35+ inputs)
│   ├── company-intel/         # Company enrichment
│   ├── settings/              # Settings sections
│   ├── dashboard/             # Dashboard components
│   ├── campaigns/             # Campaign components
│   ├── credits/               # Credit components
│   ├── assets/                # Asset components
│   ├── video-library/         # Video components
│   ├── providers.js           # Context providers
│   └── user-context.js        # User state
├── lib/
│   ├── api-client.js          # API wrapper (1600+ lines)
│   ├── schemas/               # Zod validation schemas
│   ├── llm-tasks.js           # LLM task constants
│   └── cn.js                  # Class name utility
├── styles/
│   └── globals.css            # Tailwind base styles
└── package.json
```

### Routing Structure

#### Public Routes (Marketing)
| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/login` | Google OAuth login |
| `/signup` | User registration |
| `/pricing` | Pricing plans |
| `/contact` | Contact form |
| `/demo` | Demo request |
| `/golden-interview` | Public AI interview |

#### Protected Routes (Dashboard)
| Route | Purpose |
|-------|---------|
| `/dashboard` | Control Tower - metrics overview |
| `/wizard` | Job listing & creation |
| `/wizard/[jobId]` | Edit job draft |
| `/wizard/[jobId]/publish` | Job publishing flow |
| `/assets` | Asset library |
| `/images` | Image management |
| `/videos` | Video library |
| `/campaigns` | Campaign management |
| `/credits` | Credit balance & ledger |
| `/settings/[section]` | Settings (Profile, Security, Billing, etc.) |

### State Management Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Providers                         │
├─────────────────────────────────────────────────────┤
│  SessionProvider (NextAuth)                         │
│  └── QueryClientProvider (TanStack Query)           │
│      └── UserProvider (Custom Context)              │
│          └── CompanyIntelWatcher                    │
└─────────────────────────────────────────────────────┘
```

#### State Layers

1. **Global Context** (React Context)
   - `UserContext`: User profile, auth token, hydration state
   - Persisted to localStorage

2. **OAuth Session** (NextAuth)
   - Google OAuth integration
   - Backend token sync

3. **Server State** (TanStack Query)
   - API data caching (30s stale time)
   - Optimistic updates

4. **Wizard State** (useReducer)
   - Complex form state machine
   - Draft persistence to localStorage
   - Copilot conversation threading

### Key Components

#### Wizard System (`components/wizard/`)

The wizard is a multi-step job creation flow with AI assistance:

```
wizard/
├── wizard-shell.js              # Main container (900+ lines)
├── wizard-schema.js             # Step/field definitions
├── wizard-state.js              # State reducer
├── use-wizard-controller.js     # Main controller hook
├── wizard-services.js           # API integration
├── wizard-suggestion-panel.js   # Copilot sidebar
├── draft-storage.js             # LocalStorage persistence
├── existing-jobs-modal.js       # Job import dialog
├── hooks/
│   ├── use-wizard-copilot.js
│   ├── use-wizard-draft.js
│   ├── use-wizard-navigation-guards.js
│   ├── use-wizard-progress.js
│   ├── use-wizard-refs.js
│   └── use-wizard-suggestions.js
└── lib/
    ├── wizard-conversation-cache.js
    └── wizard-state-merge.js
```

**Wizard Steps:**
1. Role Basics (title, company, location)
2. Role Details (employment type, experience level)
3. Description (job description, duties)
4. Culture (benefits, perks)
5. Channels (distribution channels)
6. Review (final review)

**Optional Steps:**
- Perks, Benefits, Interview Process, Expansion, Community

#### Golden Interview System (`components/golden-interview/`)

A conversational AI interview with 30+ interactive UI components:

```
golden-interview/
├── ChatInterface.js             # Main chat UI
├── interview-launch-trigger.js  # Modal launcher
├── registry.js                  # Component catalog (500+ lines)
└── inputs/                      # 31 interactive components
    ├── CircularGauge.js
    ├── StackedBarInput.js
    ├── SwipeDeck.js
    ├── TokenAllocator.js
    ├── RadarChartInput.js
    ├── WeekScheduler.js
    ├── HeatMapGrid.js
    ├── ComparisonDuel.js
    └── ... (23+ more)
```

**Component Categories:**
- **Visual Quantifiers**: CircularGauge, StackedBarInput, GradientSlider, DialGroup
- **Grids/Cards**: IconGridSelect, DetailedCardSelect, GradientCardGrid
- **Lists/Toggles**: ToggleList, ChipCloud, SegmentedRowList
- **Gamified**: TokenAllocator, SwipeDeck, ReactionScale, ComparisonDuel
- **Rich Input**: SmartTextArea, TagInputTextArea, TimelineBuilder

#### Company Intelligence (`components/company-intel/`)

Multi-stage company enrichment flow:

```
company-intel/
├── company-selection-modal.js
├── company-intel-modal.js       # 3-stage modal
├── company-intel-watcher.js     # Background stream listener
├── company-onboarding-guard.js
├── company-enrichment-status-pill.js
├── company-intel-indicator.js
└── company-name-confirm-modal.js
```

**Stages:**
1. Name Confirmation
2. Searching/Enriching (with polling)
3. Profile Review
4. Approval/Revision

---

## 5. Backend Services

### API Gateway (`services/api-gateway/`)

The primary backend service handling all HTTP requests.

```
services/api-gateway/src/
├── index.js                     # Entry point
├── server.js                    # Express app setup
├── llm-client.js               # LLM provider orchestration
├── routes/
│   ├── auth.js                 # Authentication
│   ├── llm.js                  # Core LLM dispatch
│   ├── wizard.js               # Job creation
│   ├── copilot.js              # AI assistant
│   ├── videos.js               # Video generation
│   ├── companies.js            # Company enrichment
│   ├── assets.js               # Asset management
│   ├── golden-interview.js     # Interview sessions
│   ├── dashboard.js            # Analytics
│   ├── users.js                # User management
│   ├── subscriptions.js        # Billing
│   └── contact.js              # Contact form
├── middleware/
│   └── require-auth.js         # JWT validation
├── services/
│   ├── llm-tasks/              # LLM service handlers
│   ├── repositories/           # Database abstraction (16 files)
│   ├── company-intel/          # Company research pipeline
│   └── wizard/                 # Job creation workflow
├── video/                      # Video generation system
│   ├── manifest-builder.js
│   ├── renderer.js
│   ├── storage.js
│   └── renderers/
│       ├── veo-client.js       # Google Veo (1200+ lines)
│       └── sora-client.js      # OpenAI Sora
├── llm/
│   ├── orchestrator.js         # Task execution
│   ├── providers/              # LLM adapters
│   ├── prompts/                # System prompts
│   └── parsers/                # Response parsers
├── golden-interviewer/         # Interview service
├── copilot/                    # AI assistant
└── config/
    ├── llm-config.js
    ├── pricing-rates.js
    ├── subscription-plans.js
    └── task-types.js
```

### Other Microservices

| Service | Package Name | Purpose |
|---------|--------------|---------|
| wizard-chat | @wizard/service-wizard-chat | Realtime chat/messaging |
| asset-generation | @wizard/service-asset-generation | LLM asset generation worker |
| campaign-orchestrator | @wizard/service-campaign-orchestrator | Campaign state machine |
| publishing | @wizard/service-publishing | Channel publishing adapters |
| screening | @wizard/service-screening | Lead capture & interview |
| credits | @wizard/service-credits | Credit ledger & billing |

---

## 6. Shared Packages

### @wizard/core (`packages/core/`)

Central domain models and schema definitions.

```
packages/core/src/
├── common/
│   ├── channels.js             # 40+ channel definitions
│   ├── asset-formats.js        # Asset blueprints
│   ├── video-specs.js          # Platform video specs
│   ├── chat.js                 # Chat types
│   ├── campaign.js             # Campaign model
│   ├── credit-ledger.js        # Credit tracking
│   └── ...
├── schemas/
│   ├── user.js                 # User schema
│   ├── company.js              # Company schema
│   ├── job.js                  # Job schema
│   ├── job-asset.js            # Asset schema
│   ├── video-library.js        # Video schema
│   ├── golden-schema.js        # Interview data (comprehensive)
│   ├── llm-usage.js            # Usage tracking
│   └── ...
└── index.js                    # Exports
```

**Key Exports:**
- `UserSchema`, `CompanySchema`, `JobSchema`
- `CHANNEL_CATALOG` (40+ channels)
- `buildAssetPlan()`, `resolveVideoSpec()`
- State machine helpers

### @wizard/data (`packages/data/`)

Database adapters for Firestore and BigQuery.

```javascript
// Firestore Adapter
createFirestoreAdapter({
  projectId: 'botson-playground',
  credentialsPath: './config/service-account.json'
})

// Methods
adapter.saveDocument(collection, id, data)
adapter.getDocument(collection, id)
adapter.queryDocuments(collection, field, operator, value)
adapter.subscribeDocument(collection, id, onChange)
adapter.recordLlmUsage(entry)

// BigQuery Adapter
createBigQueryAdapter({
  projectId,
  datasetId: 'llm_analytics',
  usageLogsTable: 'usage_logs'
})
```

### @wizard/events (`packages/events/`)

Event schema definitions for event-driven architecture.

**Event Types:**
- `WizardDraftUpdated`
- `WizardSuggestionCreated`
- `JobVersionConfirmed`
- `AssetGenerationRequested`
- `AssetGenerated`
- `CampaignLaunchRequested`
- `CreditLedgerUpdated`
- `ChatThreadUpdated`

### @wizard/llm (`packages/llm/`)

LLM orchestration framework.

```javascript
const orchestrator = new LLMOrchestrator({ registry, validator, logger })

// Task execution
const result = await orchestrator.run({
  taskType: 'suggest',
  payload: { jobId, fieldContext }
})

// Provider routing
orchestrator.resolveProvider('chat') // → openai:gpt-4o-mini
orchestrator.resolveProvider('asset.image.generate') // → openai:dall-e-3
```

### @wizard/utils (`packages/utils/`)

Shared utilities for logging, environment, and error handling.

```javascript
import { loadEnv, createLogger, wrapAsync, httpError } from '@wizard/utils'

// Environment loading with validation
const config = loadEnv()

// Structured logging
const logger = createLogger('api-gateway')

// Express async wrapper
router.get('/api/data', wrapAsync(async (req, res) => { ... }))

// HTTP errors
throw httpError(404, 'Not found', { id: '123' })
```

---

## 7. Database Architecture

### Firestore Collections

```
┌─────────────────────────────────────────────────────┐
│                    Firestore                         │
├─────────────────────────────────────────────────────┤
│  users                 # User accounts               │
│  companies             # Company profiles            │
│  companyJobs           # User-created jobs           │
│  discoveredJobs        # Web-scraped jobs            │
│  jobSuggestions        # AI field suggestions        │
│  jobRefinements        # Refinement results          │
│  channelRecommendations                              │
│  jobAssets             # Generated assets            │
│  jobAssetRuns          # Asset generation batches    │
│  heroImages            # Job hero images             │
│  videoLibraryItems     # Video records               │
│  goldenInterviewSessions                             │
│  copilotChats          # Copilot conversations       │
│  LLMsUsage             # LLM call tracking           │
└─────────────────────────────────────────────────────┘
```

### BigQuery Tables

```
┌─────────────────────────────────────────────────────┐
│                    BigQuery                          │
│              Dataset: llm_analytics                  │
├─────────────────────────────────────────────────────┤
│  usage_logs            # LLM usage events            │
│    - Partitioned by date                            │
│    - user_id, job_id, task_type, provider, model    │
│    - input_tokens, output_tokens, cached_tokens     │
│    - estimated_cost_usd, credits_used               │
└─────────────────────────────────────────────────────┘
```

### Core Data Models

#### User Schema

```javascript
{
  id: string,
  auth: {
    provider: "password" | "google",
    email: string,
    emailVerified: boolean,
    roles: ["owner" | "admin" | "member"],
    passwordHash: string // (password provider only)
  },
  profile: {
    name: string,
    companyName: string,
    mainCompanyId: string,
    companyIds: string[],
    timezone: string,
    locale: string
  },
  plan: {
    planId: "free" | "starter" | "pro" | "enterprise",
    status: "trial" | "active" | "past_due" | "canceled",
    seatCount: number,
    entitlements: { maxJobs, maxCampaigns, videoEnabled }
  },
  credits: {
    balance: number,
    reserved: number,
    lifetimeUsed: number
  },
  usage: {
    jobsCreated: number,
    assetsGenerated: number,
    tokensMonth: number,
    totalTokensUsed: number
  }
}
```

#### Job Schema

```javascript
{
  id: string,
  ownerUserId: string,
  companyId: string,
  status: "draft" | "intake_in_progress" | "awaiting_confirmation" | "approved" | "archived",
  stateMachine: {
    currentState: "DRAFT" | "REQUIRED_IN_PROGRESS" | "REQUIRED_COMPLETE" | "OPTIONAL_IN_PROGRESS" | "OPTIONAL_COMPLETE" | "USER_REVIEW" | "APPROVED",
    history: [{ from, to, at, reason }]
  },
  roleTitle: string,
  companyName: string,
  location: string,
  jobDescription: string,
  coreDuties: string[],
  mustHaves: string[],
  benefits: string[],
  seniorityLevel: "entry" | "mid" | "senior" | "lead" | "executive",
  employmentType: "full_time" | "part_time" | "contract" | ...,
  workModel: "on_site" | "hybrid" | "remote"
}
```

#### Company Schema

```javascript
{
  id: string,
  primaryDomain: string,
  name: string,
  nameConfirmed: boolean,
  profileConfirmed: boolean,
  industry: string,
  employeeCountBucket: string,
  hqCountry: string,
  hqCity: string,
  website: string,
  logoUrl: string,
  primaryColor: string,
  toneOfVoice: string,
  socials: { linkedin, facebook, instagram, tiktok, twitter },
  enrichmentStatus: "PENDING" | "READY" | "FAILED",
  jobDiscoveryStatus: "UNKNOWN" | "FOUND_JOBS" | "NOT_FOUND"
}
```

#### VideoLibraryItem Schema

```javascript
{
  id: string,
  jobId: string,
  ownerUserId: string,
  channelId: string,
  status: "planned" | "generating" | "extending" | "ready" | "approved" | "published" | "archived",
  manifestVersion: number,
  activeManifest: {
    storyboard: [{
      id, phase, order, startSeconds, durationSeconds,
      visual, onScreenText, voiceOver, bRoll
    }],
    caption: { text, hashtags },
    thumbnail: { description, overlayText },
    compliance: { flags, qaChecklist },
    tracking: { utmSource, utmMedium, utmCampaign }
  },
  veo: { operationName, status, attempts },
  renderTask: { status, result: { videoUrl, posterUrl, captionFileUrl } },
  publishTask: { status, publishedUrls },
  analytics: { impressions, clicks, applies }
}
```

---

## 8. Authentication & Authorization

### Authentication Architecture

**NextAuth is the SINGLE SOURCE OF TRUTH for JWT token issuance.**

The backend NEVER issues JWTs - it only verifies tokens issued by NextAuth.

**JWT Secret Policy:**
- **Canonical secret:** `NEXTAUTH_SECRET` - used by both NextAuth (signing) and backend (verification)
- **Legacy fallback:** `AUTH_JWT_SECRET` - supported for backward compatibility only
- **New deployments:** Set only `NEXTAUTH_SECRET` in both frontend and backend environments

### Authentication Flow

```
┌─────────────────────────────────────────────────────┐
│                  Authentication                      │
├─────────────────────────────────────────────────────┤
│  OAuth Flow (Google):                                │
│  1. User clicks "Sign in with Google"               │
│  2. NextAuth redirects to Google OAuth              │
│  3. Google returns with OAuth tokens                │
│  4. NextAuth signIn callback:                       │
│     - Calls backend /auth/oauth/google              │
│     - Backend creates/updates user in Firestore     │
│     - Backend returns { user } (NO token)           │
│  5. NextAuth jwt callback builds token payload      │
│  6. NextAuth session callback encodes JWT           │
│  7. session.accessToken available to frontend       │
│  8. Frontend sends Authorization: Bearer <token>    │
│  9. Backend verifies token with same secret         │
├─────────────────────────────────────────────────────┤
│  Credentials Flow (Email/Password):                  │
│  1. User enters email/password                      │
│  2. NextAuth CredentialsProvider calls authorize()  │
│  3. authorize() calls backend /auth/login           │
│  4. Backend validates credentials, returns { user } │
│  5. Steps 5-9 same as OAuth flow                    │
└─────────────────────────────────────────────────────┘
```

### JWT Structure

```javascript
{
  sub: userId,        // User ID
  email: string,
  roles: string[],    // ["owner", "admin", "member"]
  orgId: string | null,
  iat: number,        // Issued at
  exp: number         // Expiration (7 days)
}
```

### Backend Middleware

```javascript
// services/api-gateway/src/middleware/require-auth.js
// Verifies tokens issued by NextAuth using NEXTAUTH_SECRET
export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const decoded = verifyAuthToken(token) // Uses NEXTAUTH_SECRET (or AUTH_JWT_SECRET fallback)
  req.user = decoded
  next()
}
```

### Environment Variables

```bash
# Canonical JWT secret (set this in BOTH frontend and backend)
NEXTAUTH_SECRET=your-secret-key

# Legacy fallback (for existing deployments only - not recommended for new setups)
# AUTH_JWT_SECRET=your-secret-key
```

### Protected Routes

All dashboard routes require authentication:
- `/wizard/*`
- `/assets/*`
- `/videos/*`
- `/companies/*`
- `/dashboard/*`
- `/users/*`

Public routes:
- `/auth/*`
- `/contact`
- `/subscriptions/plans`

---

## 9. LLM/AI Integration

### Task Types

```javascript
// Core Text Tasks
'suggest'              // Job field suggestions
'refine'               // Job description refinement
'channels'             // Channel recommendations
'copilot_agent'        // Agentic assistance with tools
'company_intel'        // Company data extraction

// Asset Generation
'asset_master'         // Master copy creation
'asset_channel_batch'  // Batch channel-specific assets
'asset_adapt'          // Adapt assets to new channels

// Image Tasks
'image_prompt_generation'
'image_generation'
'image_caption'

// Video Tasks
'video_config'         // Video configuration
'video_storyboard'     // Shot planning
'video_caption'        // Caption generation
'video_compliance'     // Content compliance checks

// Special
'golden_interviewer'   // Multi-turn conversation with UI tools
```

### LLM Orchestration Flow

```
┌─────────────────────────────────────────────────────┐
│                 /api/llm Endpoint                    │
├─────────────────────────────────────────────────────┤
│  1. Receive request with taskType                   │
│  2. Lookup task in registry                         │
│  3. Select provider via policy                      │
│  4. Build prompt from templates                     │
│  5. Call LLM adapter                                │
│  6. Parse and validate response                     │
│  7. Record usage to Firestore + BigQuery            │
│  8. Update user credits                             │
│  9. Return structured response                      │
└─────────────────────────────────────────────────────┘
```

### Provider Selection

```javascript
// config/llm-config.js
const LLM_TASK_CONFIG = {
  suggest: { provider: 'gemini', model: 'gemini-3-pro-preview' },
  refine: { provider: 'gemini', model: 'gemini-3-pro-preview' },
  image_generation: { provider: 'gemini', model: 'gemini-3-pro-image-preview' },
  video_render: { provider: 'veo', model: 'veo-3.1-fast-generate-preview' }
}
```

### Usage Tracking

```javascript
// LLM Usage Record
{
  id: string,
  userId: string,
  jobId: string,
  taskType: string,
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number,
  estimatedCostUsd: number,
  creditsUsed: number,
  status: "success" | "error",
  timestamp: Date
}
```

### Cost Calculation

```javascript
// Text generation
cost = (inputTokens * inputCostPerMillion + outputTokens * outputCostPerMillion) / 1_000_000

// Image generation
cost = imageCount * costPerUnitUsd

// Video generation
cost = secondsGenerated * costPerSecondUsd  // $0.40/second for Veo

// Credit conversion
creditsUsed = estimatedCostUsd / usdPerCredit  // 1 credit = $0.001
```

---

## 10. Video Generation System

### Architecture

```
┌─────────────────────────────────────────────────────┐
│              Video Generation Pipeline               │
├─────────────────────────────────────────────────────┤
│  1. Job Selection                                   │
│     └── User selects job for video creation         │
│                                                     │
│  2. Manifest Generation (LLM)                       │
│     ├── Video Config (targeting, length)            │
│     ├── Storyboard (shots, visuals, VO)             │
│     ├── Caption (text + hashtags)                   │
│     └── Compliance Check                            │
│                                                     │
│  3. Render (Veo/Sora)                               │
│     ├── Async operation polling                     │
│     └── File storage to Cloud Storage               │
│                                                     │
│  4. Review & Approval                               │
│     ├── User reviews video                          │
│     └── Approve/regenerate/edit captions            │
│                                                     │
│  5. Publishing                                      │
│     └── Publish to selected channels                │
└─────────────────────────────────────────────────────┘
```

### Video Manifest Structure

```javascript
{
  manifestId: string,
  version: number,
  channelId: "TIKTOK" | "INSTAGRAM_REELS" | "YOUTUBE_SHORTS" | ...,
  spec: {
    aspectRatio: "9:16" | "1:1" | "16:9",
    resolution: { width: 1080, height: 1920 },
    durationRange: { min: 15, max: 60 },
    safeZones: { top, bottom, left, right }
  },
  storyboard: [
    {
      id: string,
      phase: "HOOK" | "PROOF" | "OFFER" | "ACTION" | "BRIDGE",
      order: number,
      startSeconds: number,
      durationSeconds: number,
      visual: string,
      onScreenText: string,
      voiceOver: string,
      bRoll: string
    }
  ],
  caption: {
    text: string,        // max 400 chars
    hashtags: string[]   // max 8
  },
  thumbnail: {
    description: string,
    overlayText: string
  },
  compliance: {
    flags: [{ code, severity, message }],
    qaChecklist: [{ item, status, notes }]
  }
}
```

### Veo Integration

```javascript
// services/api-gateway/src/video/renderers/clients/veo-client.js
class VeoClient {
  async generateVideo(prompt, options) {
    // 1. Start generation via Vertex AI
    const operation = await vertexai.predict({
      model: 'veo-3.1-fast-generate-preview',
      prompt,
      ...options
    })

    // 2. Poll for completion
    while (operation.status !== 'DONE') {
      await sleep(5000)
      operation = await checkStatus(operation.name)
    }

    // 3. Download and store video
    const videoUrl = await storage.uploadVideo(operation.result)

    return { videoUrl, posterUrl, metrics }
  }
}
```

### Video Status Flow

```
planned → generating → extending → ready → approved → published
                                     ↓
                                  archived
```

---

## 11. Company Intelligence System

### Enrichment Pipeline

```
┌─────────────────────────────────────────────────────┐
│           Company Enrichment Pipeline                │
├─────────────────────────────────────────────────────┤
│  1. User enters company domain/name                 │
│                                                     │
│  2. Name Confirmation                               │
│     └── User confirms/corrects company name         │
│                                                     │
│  3. Enrichment (async)                              │
│     ├── Brandfetch API (profile, branding)          │
│     ├── Web Search (Google CSE/SerpAPI)             │
│     ├── Website Scraping (career pages)             │
│     └── Job Extraction (open positions)             │
│                                                     │
│  4. Profile Review                                  │
│     └── User reviews enriched data                  │
│                                                     │
│  5. Approval                                        │
│     └── User approves or requests revisions         │
└─────────────────────────────────────────────────────┘
```

### Data Sources

| Source | Data Retrieved |
|--------|----------------|
| Brandfetch API | Logo, colors, fonts, industry, description |
| Web Search | Social links, career page URL, recent news |
| Website Scraping | Career page content, job listings |
| LLM Extraction | Structured job data from HTML |

### Enrichment Status

```javascript
{
  enrichmentStatus: "PENDING" | "READY" | "FAILED",
  jobDiscoveryStatus: "UNKNOWN" | "FOUND_JOBS" | "NOT_FOUND",
  enrichmentAttempts: number,
  lastEnrichedAt: Date,
  enrichmentError: { reason, message, occurredAt }
}
```

### Real-time Updates

```javascript
// Frontend subscribes to company updates
CompanyApi.subscribeToCompanyStream(companyId, {
  onCompanyUpdate: (company) => { ... },
  onJobsUpdate: (jobs) => { ... },
  onError: (error) => { ... }
})

// Backend sends Server-Sent Events
app.get('/companies/stream/:companyId', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  // Send updates as company data changes
})
```

---

## 12. Features Overview

### 1. Job Creation Wizard

Multi-step guided job posting with AI assistance:

- **6 Required Steps**: Role Basics, Role Details, Description, Culture, Channels, Review
- **5 Optional Steps**: Perks, Benefits, Interview Process, Expansion, Community
- **AI Suggestions**: Real-time field suggestions from copilot
- **Auto-Save**: Drafts saved to localStorage and persisted to backend
- **Job Import**: Import from existing company job templates

### 2. Golden Interview

Conversational AI interview with rich UI components:

- **Session Management**: Server-side sessions with message threading
- **Dynamic UI**: 31+ interactive input components
- **Company Context**: Pre-populate with company data
- **Schema Extraction**: Extract structured data from conversation

### 3. Dashboard (Control Tower)

Real-time metrics and activity overview:

- **Metric Cards**: Jobs live, assets, campaigns, credits
- **Activity Feed**: Recent events (job published, asset approved, etc.)
- **Quick Actions**: Launch interview, create job

### 4. Video Library

Video generation and management:

- **Generate**: Create videos from job posts
- **Manifest**: Define shots, transitions, captions
- **Render**: Async rendering via Veo/Sora
- **Review**: Preview and edit captions
- **Publish**: Distribute to channels

### 5. Asset Management

Generated marketing assets:

- **Preview**: Type-specific previews (LinkedIn, Instagram, etc.)
- **Grouping**: Group by job, filter by company
- **Actions**: Copy, download, launch

### 6. Campaign Management

Campaign tracking and distribution:

- **Campaign Table**: List with filtering
- **Channel Selection**: Where to publish
- **Metrics**: Impressions, clicks, conversions

### 7. Credit System

Usage-based billing:

- **Balance**: Real-time credit balance
- **Ledger**: Transaction history
- **Reserved**: Credits allocated to active jobs
- **Plans**: Starter (12.5k), Growth (37.5k), Scale (100k)

### 8. Settings

User account management:

- **Profile**: Name, email, timezone, locale
- **Security**: Password, MFA, login history
- **Billing**: Payment methods, invoices
- **Companies**: Manage linked companies
- **Subscriptions**: Plan management

---

## 13. API Reference

### Authentication Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/auth/login` | Email/password login |
| POST | `/auth/signup` | User registration |
| POST | `/auth/oauth/google` | Google OAuth callback |

### LLM Endpoint

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/llm` | Central LLM dispatcher (18+ task types) |

### Wizard Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/wizard/import-company-job` | Import job from company |
| POST | `/wizard/draft` | Create/update job draft |
| POST | `/wizard/suggestions/merge` | Apply suggestion |
| POST | `/wizard/refine/finalize` | Complete refinement |
| GET | `/wizard/jobs` | List user's jobs |
| GET | `/wizard/:jobId` | Get job details |
| GET | `/wizard/assets` | Get job assets |
| GET | `/wizard/hero-image` | Get hero image |
| GET | `/wizard/channels` | Get channel recommendations |
| GET | `/wizard/copilot/chat` | Get copilot conversation |

### Video Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/videos` | List videos |
| POST | `/videos` | Create video manifest |
| GET | `/videos/:id` | Get video details |
| POST | `/videos/:id/regenerate` | Regenerate manifest |
| POST | `/videos/:id/render` | Trigger rendering |
| POST | `/videos/:id/caption` | Update caption |
| POST | `/videos/:id/approve` | Approve video |
| POST | `/videos/:id/publish` | Publish video |

### Company Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/companies/me` | Get current company |
| GET | `/companies/me/jobs` | Get discovered jobs |
| GET | `/companies/stream/:companyId` | SSE stream |
| POST | `/companies/me/confirm-name` | Confirm name |
| POST | `/companies/me/confirm-profile` | Confirm profile |
| POST | `/companies/my-companies` | Create company |
| GET | `/companies/my-companies` | List companies |
| PATCH | `/companies/my-companies/:companyId` | Update company |

### User Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/users/me` | Get profile |
| PATCH | `/users/me` | Update profile |
| POST | `/users/me/password` | Change password |

### Dashboard Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/dashboard/summary` | Dashboard stats |
| GET | `/dashboard/campaigns` | Campaigns data |
| GET | `/dashboard/ledger` | Credit ledger |
| GET | `/dashboard/activity` | Activity feed |

### Golden Interview Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/golden-interview/start` | Start session |
| POST | `/golden-interview/:sessionId/chat` | Continue conversation |
| GET | `/golden-interview/:sessionId` | Get session |

---

## 14. Key Files Reference

### Frontend

| File | Lines | Purpose |
|------|-------|---------|
| `apps/web/lib/api-client.js` | 1600+ | Central API wrapper |
| `apps/web/components/wizard/wizard-shell.js` | 900+ | Main wizard container |
| `apps/web/components/wizard/use-wizard-controller.js` | 400+ | Wizard state management |
| `apps/web/components/golden-interview/registry.js` | 500+ | UI component catalog |
| `apps/web/components/golden-interview/ChatInterface.js` | 200+ | Interview chat UI |

### Backend

| File | Lines | Purpose |
|------|-------|---------|
| `services/api-gateway/src/video/renderers/clients/veo-client.js` | 1200+ | Veo integration |
| `services/api-gateway/src/video/manifest-builder.js` | 446 | Video manifest generation |
| `services/api-gateway/src/video/service.js` | 761 | Video library service |
| `services/api-gateway/src/llm/orchestrator.js` | 300+ | LLM task execution |
| `services/api-gateway/src/routes/llm.js` | 400+ | Core LLM dispatch route |

### Packages

| File | Purpose |
|------|---------|
| `packages/core/src/schemas/golden-schema.js` | Universal Golden Record (8 dimensions) |
| `packages/core/src/common/channels.js` | 40+ channel definitions |
| `packages/core/src/common/asset-formats.js` | Asset blueprints |
| `packages/core/src/schemas/video-library.js` | Video schema definitions |
| `packages/data/src/dbs/firestore-client/index.js` | Firestore adapter |
| `packages/data/src/dbs/bigquery-client/index.js` | BigQuery adapter |

---

## 15. Environment Configuration

### Required Variables

```bash
# Node Environment
NODE_ENV=development
PORT=4000

# Authentication (NEXTAUTH_SECRET is the canonical secret - set it in BOTH frontend and backend)
NEXTAUTH_SECRET=your-secret-key
# AUTH_JWT_SECRET=your-secret-key  # Legacy fallback only - not needed for new deployments

# Google Cloud
FIRESTORE_PROJECT_ID=botson-playground
GOOGLE_APPLICATION_CREDENTIALS=./config/service-account.json
NEXT_PUBLIC_FIREBASE_PROJECT_ID=botson-playground

# Redis
REDIS_URL=redis://...

# Elasticsearch (Logging)
ELASTICSEARCH_URL=https://...
ELASTICSEARCH_INDEX=job-launch
ELASTICSEARCH_API_KEY=...

# LLM Providers
GEMINI_API_KEY=...
OPENAI_API_KEY=...
OPENAI_LLM_ENABLED=true  # Optional

# Image Generation
STABILITY_API_KEY=...

# Video Storage
VIDEO_STORAGE_BUCKET=botson-job-launcher-videos

# Company Intelligence
GOOGLE_CSE_ID=...
GOOGLE_CSE_KEY=...
SERP_API_KEY=...

# Email
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASSWORD=...
CONTACT_RECIPIENT_EMAIL=...

# Credits
CREDIT_PER_1000_TOKENS=10
```

### Frontend Variables

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_FIREBASE_PROJECT_ID=botson-playground
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

---

## Summary

**Wizard Recruiting OS** is a sophisticated, production-grade recruiting platform featuring:

- **Modern Stack**: Next.js 14, React 18, Express.js, Firestore, BigQuery
- **AI-First**: LLM orchestration at the core with multi-provider support
- **Rich UI**: 30+ interactive interview components, multi-step wizard
- **Video Generation**: Automated video creation with Veo/Sora
- **Multi-Channel**: 40+ distribution channels supported
- **Usage Tracking**: Detailed credit-based billing with cost analytics

The architecture prioritizes:
- **Maintainability**: Clean separation (services + repositories)
- **Traceability**: Structured logging + request context
- **Extensibility**: Plugin-style providers and repositories
- **Performance**: React Query caching, debounced saves, optimistic updates
