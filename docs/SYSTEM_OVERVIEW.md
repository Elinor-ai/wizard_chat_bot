# Wizard Recruiting OS - Comprehensive System Guide

## 🎯 Overview

Wizard Recruiting OS is an AI-powered recruiting platform that automates job creation, management, and publishing while generating marketing assets (text, images, video) with large language models.

### Core Technologies
- **Frontend**: Next.js 14 (React, App Router)
- **Backend**: Node.js + Express
- **Database**: Google Firestore
- **Analytics**: Google BigQuery
- **AI/LLM**: Google Gemini (Vertex AI)
- **Video Generation**: Google Veo API
- **Architecture**: Monorepo with npm workspaces

---

## 📁 Project Structure

```
job-launcher/
├── apps/
│   └── web/                    # Next.js frontend
├── services/
│   ├── api-gateway/            # Express API (central entry point)
│   ├── wizard-chat/            # Agent coordination
│   ├── asset-generation/       # Asset generation
│   ├── campaign-orchestrator/  # Campaign state machine
│   ├── publishing/             # Publishing integrations
│   ├── screening/              # Candidate screening
│   └── credits/                # Credits management
├── packages/
│   ├── core/                   # Schemas, state machines
│   ├── events/                 # Event definitions
│   ├── llm/                    # Prompt registry
│   ├── utils/                  # Logging, HTTP helpers
│   └── data/                   # Firestore + Redis adapters
├── config/                     # Service account credentials
├── scripts/                    # Automation scripts
└── docs/                       # Documentation
```

---

## 🏗️ Architecture - Key Components

### 1️⃣ Frontend - Next.js App (`apps/web/`)

#### Role
User interface: dashboard for managing jobs, wizard for creating new jobs, and landing pages.

#### Key Files

**`apps/web/app/(dashboard)/wizard/[jobId]/publish/page.js`** (3,700+ lines)  
- **Role**: Main page of the Job Launcher Wizard  
- **Handles**:
  - State for the entire job-creation flow
  - Three stages: Refine → Channels → Assets
  - Copilot integration (AI chat)
  - Hero image creation (AI images)
  - Video creation (AI short-form) — feature added today
  - Asset display (text, images, video)
- **Primary components**:
  - `RefineStep` — edit job details
  - `ChannelSelectionStep` — choose publishing channels
  - `AssetReviewStep` — review and edit assets
  - `VideoOptIn` — checkbox to enable video creation
  - `HeroImageOptIn` — checkbox to enable hero images
  - `AssetPreviewCard` — single-asset preview

**`apps/web/lib/api-client.js`** (2,000+ lines)  
- **Role**: API client library for all server calls  
- **Main APIs**:
  - `JobsApi` — job CRUD
  - `WizardApi` — wizard flow
  - `LLMApi` — LLM calls
  - `VideoLibraryApi` — video management
  - `AssetsApi` — asset management
  - `CompanyApi` — company management

#### Frontend Flow

```
1. User visits /wizard → creates a new job
2. Moves through the wizard:
   - Provides basic details (role, location, etc.)
   - Receives AI suggestions
   - LLM performs refinement
3. Selects publishing channels (LinkedIn, Indeed, etc.)
4. Generates assets:
   - Text (job postings, social posts)
   - Image (Hero Image)
   - Video (short-form)
5. Proceeds to review and publish
```

---

### 2️⃣ Backend - API Gateway (`services/api-gateway/`)

#### Role
Express server acting as the central entry point for requests. Handles authentication, routing, and integrations with LLM and storage.

#### Key Files

**`src/index.js`** (200+ lines)  
- Server entry point  
- Configures middleware (auth, logging, CORS)  
- Routing for all endpoints  
- Initializes Firestore, BigQuery, LLM clients  

**`src/routes/wizard.js`** (2,000+ lines)  
- **Role**: Wizard endpoints  
- **Main routes**:
  - `POST /wizard/draft` — create/update draft
  - `GET /wizard/:jobId` — load job
  - `POST /wizard/refine/finalize` — finalize refinement
  - `GET /wizard/channels` — channel recommendations
  - `GET /wizard/assets` — load assets
  - `GET /wizard/hero-image` — load hero image

**`src/routes/llm.js`** (1,500+ lines)  
- **Role**: Unified endpoint for all LLM calls  
- **Primary endpoint**: `POST /api/llm`  
- **Supported task types** (14):
  - `suggest` — field suggestions
  - `refine` — job description refinement
  - `channels` — channel recommendations
  - `copilot_agent` — AI chat
  - `asset_master` — master asset generation
  - `asset_channel_batch` — per-channel asset generation
  - `video_storyboard` — storyboard creation
  - `video_caption` — caption creation
  - `video_compliance` — compliance checks
  - `company_intel` — company insights
  - `image_prompt_generation` — prompt generation for images
  - `image_generation` — image creation
  - `image_caption` — image captions
  - `hero_image` — full hero image flow

**`src/routes/videos.js`** (800+ lines)  
- **Role**: Video library management  
- **Routes**:
  - `GET /videos` — list videos
  - `GET /videos/:id` — video details
  - `POST /videos/:id/render` — render video
  - `GET /videos/jobs` — jobs with video

**`src/routes/assets.js`** (320 lines)  
- **Role**: Unified assets endpoint  
- Combines assets from:
  - `jobAssets` (text)
  - `videoLibraryItems` (video)
  - `jobImages` (hero images)
  - Virtual JD assets (job descriptions)

---

### 3️⃣ LLM System (`src/llm/`)

#### Architecture

```
Request → Task Registry → Provider Adapter → LLM → Parser → Response
```

**`src/llm/tasks.js`** (220 lines)  
- **Task registry**: map of supported tasks  
- **Task configurations**: provider/model per task  
- **Task method map**: routing to the correct functions  

**`src/llm/llm-client.js`** (2,000+ lines)  
- **Role**: Unified interface for all LLM calls  
- **Responsible for**:
  - Provider management (Gemini, OpenAI, Anthropic)
  - Retry logic
  - Error handling
  - Usage tracking
- **Key methods**:
  - `suggestJobContent()` — suggestions
  - `refineJob()` — refinement
  - `recommendChannels()` — channel recommendations
  - `runCopilotAgent()` — copilot chat
  - `generateImagePrompt()` — image prompts
  - `generateImage()` — image generation
  - `generateImageCaption()` — image captions

**`src/llm/providers/gemini-adapter.js`** (500+ lines)  
- **Role**: Adapter for Google Gemini API  
- Supports:
  - Gemini 3.0 Pro (text)
  - Gemini 3.0 Pro Image (image generation)
  - Vertex AI integration
- Manages:
  - Token counting
  - Cost calculation
  - Error handling
  - Response parsing

**`src/llm/parsers/`** (directory)  
- Parsers for every task type  
- Validation with Zod schemas  
- Normalization to a consistent format  

---

### 4️⃣ Video System (`src/video/`)

#### Role
End-to-end short-form video system with storyboard generation, rendering, and compliance.

**`src/video/service.js`** (1,200+ lines)  
- **Role**: Manages the full video lifecycle  
- **Processes**:
  1. `createVideoItem()` — create manifest  
  2. Storyboard generation (LLM)  
  3. Compliance check (LLM)  
  4. Caption generation (LLM)  
  5. Video rendering (Veo API)  
  6. Status polling  

**`src/video/manifest-builder.js`** (210 lines)  
- Builds video manifest from job data  
- Computes duration planning  
- Produces storyboard structure  

**`src/video/renderer.js`** (400+ lines)  
- Handles rendering with the Veo API  
- Fallback logic  
- Progress tracking  

**`src/video/renderers/clients/veo-client.js`** (300+ lines)  
- Direct client for Google Veo API  
- Generates video from storyboard + images  

---

### 5️⃣ Data Layer (`src/services/`)

**`src/services/firestore-adapter.js`**  
- CRUD operations for Firestore  
- Collections:
  - `jobs` — jobs  
  - `jobRefinements` — refinements  
  - `jobSuggestions` — suggestions  
  - `jobChannelRecommendations` — channel recommendations  
  - `jobAssets` — text assets  
  - `jobImages` — hero images  
  - `videoLibraryItems` — videos  
  - `LLMsUsage` — usage logs  
  - `users` — users  
  - `companies` — companies  

**`src/services/bigquery-adapter.js`**  
- Sends usage logs to BigQuery  
- Analytics and cost tracking  

**`src/services/llm-usage-ledger.js`**  
- Tracks LLM usage  
- Calculates costs  
- Writes to Firestore + BigQuery  

---

### 6️⃣ Shared Packages (`packages/`)

**`packages/core/`**  
- Zod schemas for all entities  
- State machine definitions  
- Domain logic  

**`packages/utils/`**  
- Logger (Pino)  
- HTTP helpers  
- Error handling  

**`packages/llm/`**  
- Prompt registry  
- Model configurations  

---

## 🔄 Data Flow Example: Video Creation

```
1. Frontend: user checks "Generate videos"
   ↓
2. Frontend: calls VideoLibraryApi.createItem()
   ↓
3. API Gateway: POST /api/llm (taskType: video_create_manifest)
   ↓
4. Video Service: createVideoItem()
   ↓
5. LLM: generates storyboard (3-5 shots)
   ↓
6. LLM: runs compliance
   ↓
7. LLM: generates captions
   ↓
8. Veo API: renders the video
   ↓
9. Storage: saves videoUrl in Firestore
   ↓
10. Frontend: polls every 5 seconds
   ↓
11. Frontend: shows video when status = "ready"
```

---

## 🎨 Full Asset Creation Flow

### Step 1: Refinement
```
User input (basic job details)
  ↓
LLM Task: "suggest" → proposes auto-fill values
  ↓
LLM Task: "refine" → improves the job description
  ↓
Firestore: saves refined job
```

### Step 2: Channel Selection
```
Refined job data
  ↓
LLM Task: "channels" → recommends publishing channels
  ↓
User: selects channels
  ↓
Frontend: allows hero image + video selection
```

### Step 3: Asset Generation
```
Selected channels + options
  ↓
Parallel execution:
  ├─ Text assets (asset_master + asset_channel_batch)
  ├─ Hero image (if selected):
  │    ├─ image_prompt_generation
  │    ├─ image_generation (Gemini)
  │    └─ image_caption
  └─ Video (if selected):
       ├─ video_storyboard
       ├─ video_compliance
       ├─ video_caption
       └─ video_render (Veo)
  ↓
All assets saved to Firestore
  ↓
Frontend: displays them in the assets grid
```

---

## 🔐 Authentication & Security

- **Clerk Auth**: user management  
- **JWT tokens**: on every request  
- **Firestore Security Rules**: access control  
- **Service Account**: access to GCP services  

---

## 💰 Cost & Usage Tracking

Every LLM call is recorded:
1. **Firestore**: `LLMsUsage` collection  
2. **BigQuery**: `llm_analytics.usage_logs` table  

Stored fields:
- `taskType` — task type  
- `provider` — Gemini/OpenAI/etc.  
- `model` — specific model  
- `inputTokens` / `outputTokens`  
- `estimatedCostUsd` — estimated cost  
- `userId`, `jobId` — context  

---

## 🎯 Feature Added Today: Video Generation in Job Launcher

### What changed?
We added the option to generate a single video during job creation, similar to Hero Image.

### Changes implemented

#### Frontend (`page.js`)
```javascript
// State management
const [shouldGenerateVideos, setShouldGenerateVideos] = useState(false);
const [generatedVideoItem, setGeneratedVideoItem] = useState(null);
const [shouldPollVideo, setShouldPollVideo] = useState(false);

// UI Component
<VideoOptIn
  checked={shouldGenerateVideos}
  onToggle={setShouldGenerateVideos}
/>;

// Video generation
const triggerVideoGenerationIfNeeded = async () => {
  const created = await VideoLibraryApi.createItem({
    jobId,
    channelId: "TIKTOK_LEAD",
    recommendedMedium: "video",
  });
  setGeneratedVideoItem(created);
  setShouldPollVideo(true);
};

// Polling for status updates
const pollVideoItem = async () => {
  const updated = await VideoLibraryApi.fetchItem(item.id);
  setGeneratedVideoItem(updated);
  if (status === "ready") setShouldPollVideo(false);
};

// Display video in assets
const videoAsset = {
  id: `video-${item.id}`,
  formatId: "AI_VIDEO",
  status: item.status,
  content: {
    videoUrl: item.renderTask?.result?.videoUrl,
    caption: item.activeManifest?.caption?.text,
    durationSeconds: item.renderTask?.metrics?.secondsGenerated,
  },
};
```

#### Backend
No backend changes were required; the system already supported video creation through the API. We only added the UI in the frontend.

---

## 📊 Monitoring & Debugging

### Logs
- **Structured logging** with Pino  
- Log levels: info, warn, error  
- Every request is logged with context  

### Debugging Video Issues
```javascript
// Frontend Console
console.log("[Video] trigger:opt-in", { jobId, channels });
console.log("[Video] Created video:", created.id);
console.log("[Video] Polling video status", { videoId });

// Backend Logs
logger.info({ jobId, status }, "video.render.start");
logger.error({ error }, "video.render.failed");
```

---

## 🚀 Development Workflow

### Running the system
```bash
# Terminal 1: Frontend
npm run dev:web
# → http://localhost:3000

# Terminal 2: Backend
npm run dev:api
# → http://localhost:4000
```

### Adding a New Feature
1. **Schema** — define in `packages/core/src/schemas/`
2. **Backend API** — add a route in `services/api-gateway/src/routes/`
3. **Frontend API Client** — add a method in `apps/web/lib/api-client.js`
4. **UI** — build a component in `apps/web/app/`
5. **State Management** — useState/useCallback
6. **Testing** — verify in the browser

---

## 🐛 Common Issues & Fixes

### 1. "Invalid enum value: TIKTOK"
**Issue**: Invalid `channelId`  
**Fix**: Use `TIKTOK_LEAD` instead of `TIKTOK`

### 2. Assets do not appear
**Issue**: Polling disabled or assets not saved to state  
**Fix**:
- Check `shouldPollAssets` / `shouldPollVideo`
- Ensure state updates after the API call

### 3. Hot Reload is not working
**Issue**: Next.js missed file changes  
**Fix**: Hard refresh (Cmd+Shift+R) or restart the server

### 4. LLM Task failed
**Issue**: Schema validation or API error  
**Fix**: Check logs in the backend terminal

---

## 📚 Additional Resources

- **API Documentation**: `docs/API.md`
- **Task Types**: `src/config/task-types.js`
- **Schemas**: `packages/core/src/schemas/`
- **Environment Setup**: `.env.example`

---

## 🎓 Getting Started Checklist

If you are new to the system, start here:

1. **Read README.md** — high-level overview
2. **Understand the flow**: User → Frontend → API Gateway → LLM → DB
3. **Run the system** with `npm run dev`
4. **Walk through the Job Launcher flow** manually
5. **Drop console.log breakpoints** to understand the flow
6. **Read `page.js`** — the heart of the wizard

---

## 💡 Tips for Developers

- **Console logs**: use prefixes like `[Video]`, `[HeroImage]`
- **Error handling**: always wrap in try/catch
- **State updates**: keep them immutable (spread operator)
- **API calls**: ensure they are logged
- **Polling**: always clean up in the `useEffect` return

---

**Written on**: December 3, 2024  
**Version**: 1.0  
**Last updated**: Added Video Generation feature
