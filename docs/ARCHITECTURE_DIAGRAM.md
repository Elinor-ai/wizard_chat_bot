# Wizard Recruiting OS - Architecture Diagram

## 🏛️ High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          USER / BROWSER                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTP/HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FRONTEND (Next.js App)                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  apps/web/app/(dashboard)/wizard/[jobId]/publish/       │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐       │   │
│  │  │   Refine   │  │  Channels  │  │   Assets   │       │   │
│  │  │    Step    │→ │    Step    │→ │    Step    │       │   │
│  │  └────────────┘  └────────────┘  └────────────┘       │   │
│  │                                                          │   │
│  │  Components:                                            │   │
│  │  • VideoOptIn                                           │   │
│  │  • HeroImageOptIn                                       │   │
│  │  • AssetPreviewCard                                     │   │
│  │  • CopilotChat                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  API Client (apps/web/lib/api-client.js)                        │
│  ├─ JobsApi                                                      │
│  ├─ WizardApi                                                    │
│  ├─ LLMApi                                                       │
│  ├─ VideoLibraryApi                                              │
│  └─ AssetsApi                                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ REST API
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              BACKEND (Express API Gateway)                       │
│  services/api-gateway/src/                                       │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Routes Layer                           │   │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐  │   │
│  │  │ wizard  │  │   llm   │  │  videos  │  │  assets  │  │   │
│  │  │  .js    │  │   .js   │  │   .js    │  │   .js    │  │   │
│  │  └─────────┘  └─────────┘  └──────────┘  └──────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                             │                                     │
│  ┌──────────────────────────┼────────────────────────────────┐  │
│  │              Business Logic Layer                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │  Video       │  │  LLM         │  │  Company     │  │  │
│  │  │  Service     │  │  Client      │  │  Intel       │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  │                                                           │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │  Copilot     │  │  Asset       │  │  Usage       │  │  │
│  │  │  Agent       │  │  Generator   │  │  Ledger      │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
                ▼            ▼            ▼
    ┌───────────────┐  ┌──────────┐  ┌──────────┐
    │   Firestore   │  │ BigQuery │  │ GCP APIs │
    │   Database    │  │Analytics │  │  (AI)    │
    └───────────────┘  └──────────┘  └──────────┘
         │                   │              │
         │                   │              ├─ Vertex AI (Gemini)
         │                   │              ├─ Veo API (Video)
         │                   │              └─ Storage (GCS)
         │                   │
         └───────────────────┴──────────────────────
                             │
                    Data Persistence & Analytics
```

---

## 🔄 Data Flow - Video Generation

```
┌─────────────────────────────────────────────────────────────────┐
│                    VIDEO GENERATION FLOW                         │
└─────────────────────────────────────────────────────────────────┘

User Action: ☑️ Generate videos
       │
       ▼
┌──────────────────────────────────────┐
│  Frontend: triggerVideoGeneration    │
│  State: isGeneratingVideos = true    │
└──────────┬───────────────────────────┘
           │
           │ POST /api/llm
           │ { taskType: "video_create_manifest",
           │   context: { jobId, channelId } }
           ▼
┌──────────────────────────────────────┐
│  API Gateway: routes/llm.js          │
│  • Validates request                 │
│  • Routes to video service           │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│  Video Service: createVideoItem()    │
│  1. Load job + company context       │
│  2. Build video manifest             │
└──────────┬───────────────────────────┘
           │
           ├─────────────────────────────┐
           │                             │
           ▼                             ▼
   ┌──────────────┐            ┌──────────────┐
   │ LLM Client   │            │  Firestore   │
   │ storyboard   │            │  Save item   │
   │ (3-5 shots)  │            │  status:     │
   └──────┬───────┘            │  "pending"   │
          │                    └──────────────┘
          ▼
   ┌──────────────┐
   │ LLM Client   │
   │ compliance   │
   │ check        │
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │ LLM Client   │
   │ caption      │
   │ generation   │
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │ Veo Renderer │
   │ • Generate   │
   │   images     │
   │ • Render     │
   │   video      │
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │  Firestore   │
   │  Update:     │
   │  • videoUrl  │
   │  • status:   │
   │    "ready"   │
   └──────┬───────┘
          │
          │ Response
          ▼
┌──────────────────────────────────────┐
│  Frontend: Polling                   │
│  • Every 5 seconds                   │
│  • fetchItem(videoId)                │
│  • Update state                      │
│  • Stop when status = "ready"        │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│  Display Video in Assets Grid        │
│  <VideoCard>                         │
│    <video controls>                  │
└──────────────────────────────────────┘
```

---

## 🧩 Component Hierarchy - Frontend

```
PublishPage (page.js)
│
├── StepProgress
│   └── Shows: Refine → Channels → Assets
│
├── RefineStep (currentStep === "refine")
│   ├── DiffViewer (original vs refined)
│   ├── OptimizationInsights
│   └── CopilotSidebar
│
├── ChannelSelectionStep (currentStep === "channels")
│   ├── ChannelRecommendationList
│   │   └── ChannelCard (LINKEDIN, INDEED, etc.)
│   ├── HeroImageOptIn ☑️
│   └── VideoOptIn ☑️  ← NEW!
│
└── AssetReviewStep (currentStep === "assets")
    ├── AssetPreviewGrid
    │   ├── AssetPreviewCard (Hero Image)
    │   ├── AssetPreviewCard (Video) ← NEW!
    │   ├── AssetPreviewCard (LinkedIn Job)
    │   └── AssetPreviewCard (LinkedIn Feed)
    │
    └── Components:
        ├── VideoCard
        │   ├── <video> player (if ready)
        │   ├── Thumbnail (if generating)
        │   └── Loading state
        │
        ├── HeroImageCard
        ├── LinkedInJobCard
        ├── LinkedInFeedCard
        └── GenericAssetCard
```

---

## 📦 Database Schema (Firestore)

```
jobs/
  {jobId}/
    - ownerUserId
    - companyId
    - roleTitle
    - location
    - jobDescription
    - coreDuties []
    - mustHaves []
    - benefits []
    - status
    - createdAt
    - updatedAt

jobRefinements/
  {jobId}/
    - original
    - refined
    - analysis
      - improvementScore
      - originalScore
      - keyImprovements []
    - provider: "gemini"
    - model: "gemini-3-pro-preview"

jobChannelRecommendations/
  {jobId}/
    - recommendations []
      - channel: "LINKEDIN_JOBS"
      - reason
      - expectedCPA
    - updatedAt

jobAssets/
  {jobId}:{channelId}:{formatId}/
    - jobId
    - channelId
    - formatId
    - status: "READY" | "GENERATING" | "FAILED"
    - content
      - title
      - body
      - bullets []
      - hashtags []
    - provider
    - model
    - createdAt

jobImages/
  {jobId}/
    - jobId
    - ownerUserId
    - status: "PENDING" | "READY" | "FAILED"
    - imageUrl
    - imageBase64
    - caption
    - captionHashtags []
    - imageProvider: "gemini"
    - imageModel: "gemini-3-pro-image-preview"
    - createdAt

videoLibraryItems/
  {videoId}/
    - id
    - jobId
    - ownerUserId
    - channelId: "TIKTOK_LEAD"
    - status: "pending" | "generating" | "ready" | "failed"
    - activeManifest
      - storyboard []
        - shotNumber
        - durationSeconds
        - visualDescription
        - imageUrl
      - caption
        - text
        - hashtags []
    - renderTask
      - renderer: "veo"
      - status
      - result
        - videoUrl
        - posterUrl
      - metrics
        - secondsGenerated
        - model
    - createdAt
    - updatedAt

LLMsUsage/
  {usageId}/
    - taskType: "image_generation" | "video_storyboard" | ...
    - provider: "gemini"
    - model: "gemini-3-pro-preview"
    - inputTokens
    - outputTokens
    - estimatedCostUsd
    - userId
    - jobId
    - timestamp
```

---

## 🔌 API Endpoints Reference

### Wizard Endpoints
```
GET  /wizard/:jobId                    # Get job details
POST /wizard/draft                     # Create/update draft
POST /wizard/refine/finalize           # Finalize refinement
GET  /wizard/channels?jobId=           # Get channel recommendations
GET  /wizard/assets?jobId=             # Get all assets
GET  /wizard/hero-image?jobId=         # Get hero image
```

### LLM Unified Endpoint
```
POST /api/llm
  Body: {
    taskType: "suggest" | "refine" | "channels" | "copilot_agent" |
              "asset_master" | "video_create_manifest" | "hero_image" | ...
    context: { jobId, channelId, ... }
  }
```

### Video Endpoints
```
GET  /videos                           # List all videos
GET  /videos/:id                       # Get video details
POST /videos/:id/render                # Trigger render
GET  /videos/jobs                      # List jobs with videos
```

### Assets Unified Endpoint
```
GET  /wizard/assets?jobId=
  Returns: {
    assets: [
      { formatId: "AI_VIDEO", status: "READY", content: {...} },
      { formatId: "AI_HERO_IMAGE", status: "READY", content: {...} },
      { formatId: "LINKEDIN_JOB_POSTING", status: "READY", content: {...} },
      ...
    ]
  }
```

---

## 🎨 Asset Types & Variants

```
ASSET_VARIANT_MAP = {
  // Text Assets
  LINKEDIN_JOB_POSTING: "linkedin_job",
  LINKEDIN_FEED_POST: "linkedin_feed",
  GENERIC_JOB_POSTING: "linkedin_job",
  SOCIAL_IMAGE_POST: "social_image",
  SOCIAL_IMAGE_CAPTION: "image_caption",
  SOCIAL_STORY_SCRIPT: "story",

  // Video Assets (Short-form)
  SHORT_VIDEO_MASTER: "story",
  SHORT_VIDEO_TIKTOK: "story",
  SHORT_VIDEO_INSTAGRAM: "story",
  SHORT_VIDEO_YOUTUBE: "story",

  // Video Assets (Long-form) ← NEW!
  VIDEO_TIKTOK: "video",
  VIDEO_INSTAGRAM: "video",
  VIDEO_YOUTUBE: "video",
  VIDEO_LINKEDIN: "video",

  // Generated Assets
  AI_HERO_IMAGE: "hero_image",
  AI_VIDEO: "video"  ← NEW!
}
```

Each variant has its own card component:
- `linkedin_job` → `LinkedInJobCard`
- `linkedin_feed` → `LinkedInFeedCard`
- `video` → `VideoCard` ← NEW!
- `hero_image` → `HeroImageCard`
- `story` → `StoryCard`
- `generic` → `GenericAssetCard`

---

## 🧪 Testing & Debugging Tools

### Frontend Console
```javascript
// Video logs
[Video] trigger:opt-in { jobId, channels }
[Video] Creating single video for job
[Video] Created video: vid_xxx
[Video] Polling video status { videoId }
[Video] Video completed, stopping poll

// Hero Image logs
[HeroImage] trigger:opt-in { jobId }
[HeroImage] loadHeroImageState:received { status }

// Assets logs
[Assets] generate click { selectedChannels, shouldGenerateVideos }
```

### Backend Logs (Pino)
```javascript
logger.info({ jobId, status }, 'video.render.start');
logger.warn({ error }, 'video.compliance.failed');
logger.error({ error }, 'llm.request.failed');

// LLM usage
logger.info({
  taskType, provider, model,
  inputTokens, outputTokens, estimatedCostUsd
}, 'llm.usage.tracked');
```

---

**Created**: December 3, 2024
**Last Updated**: Video Generation Feature Added
