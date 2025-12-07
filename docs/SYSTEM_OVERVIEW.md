# Wizard Recruiting OS - מדריך מערכת מקיף

## 🎯 סקירה כללית

**Wizard Recruiting OS** היא פלטפורמת גיוס מבוססת AI שמאפשרת ליצור, לנהל ולפרסם משרות באופן אוטומטי עם יצירת תוכן שיווקי (טקסט, תמונות, וידאו) בעזרת מודלים של בינה מלאכותית.

### טכנולוגיות ליבה
- **Frontend**: Next.js 14 (React, App Router)
- **Backend**: Node.js + Express
- **Database**: Google Firestore
- **Analytics**: Google BigQuery
- **AI/LLM**: Google Gemini (Vertex AI)
- **Video Generation**: Google Veo API
- **Architecture**: Monorepo עם npm workspaces

---

## 📁 מבנה הפרויקט

```
job-launcher/
├── apps/
│   └── web/                    # Next.js Frontend
├── services/
│   ├── api-gateway/           # Express API (נקודת כניסה מרכזית)
│   ├── wizard-chat/           # Agent coordination
│   ├── asset-generation/      # יצירת assets
│   ├── campaign-orchestrator/ # State machine לקמפיינים
│   ├── publishing/            # אינטגרציות לפרסום
│   ├── screening/             # סינון מועמדים
│   └── credits/               # ניהול credits
├── packages/
│   ├── core/                  # Schemas, State machines
│   ├── events/                # Event definitions
│   ├── llm/                   # Prompt registry
│   ├── utils/                 # Logging, HTTP helpers
│   └── data/                  # Firestore + Redis adapters
├── config/                    # Service account credentials
├── scripts/                   # Automation scripts
└── docs/                      # Documentation
```

---

## 🏗️ ארכיטקטורה - הרכיבים המרכזיים

### 1️⃣ **Frontend - Next.js App** (`apps/web/`)

#### תפקיד
ממשק המשתמש - dashboard לניהול משרות, wizard ליצירת משרות חדשות, ועמודי נחיתה.

#### קבצים מרכזיים

**`apps/web/app/(dashboard)/wizard/[jobId]/publish/page.js`** (3,700+ שורות)
- **תפקיד**: הדף המרכזי של ה-Job Launcher Wizard
- **אחראי על**:
  - ניהול state של כל תהליך יצירת המשרה
  - 3 שלבים: Refine → Channels → Assets
  - אינטגרציה עם Copilot (צ'אט AI)
  - יצירת Hero Images (תמונות AI)
  - יצירת Videos (סרטונים AI) - **התכונה שהוספנו היום**
  - תצוגת assets (טקסט, תמונות, וידאו)
- **Components עיקריים**:
  - `RefineStep` - עריכת פרטי המשרה
  - `ChannelSelectionStep` - בחירת ערוצי פרסום
  - `AssetReviewStep` - סקירה ועריכת assets
  - `VideoOptIn` - checkbox ליצירת וידאו
  - `HeroImageOptIn` - checkbox ליצירת תמונה
  - `AssetPreviewCard` - תצוגת asset בודד

**`apps/web/lib/api-client.js`** (2,000+ שורות)
- **תפקיד**: ספריית API client לכל הקריאות לשרת
- **APIs עיקריים**:
  - `JobsApi` - CRUD למשרות
  - `WizardApi` - תהליך הוויזארד
  - `LLMApi` - קריאות LLM
  - `VideoLibraryApi` - ניהול וידאו
  - `AssetsApi` - ניהול assets
  - `CompanyApi` - ניהול חברות

#### זרימת עבודה ב-Frontend

```
1. User נכנס ל-/wizard → יוצר job חדש
2. עובר דרך הוויזארד:
   - מזין פרטים בסיסיים (role, location, etc.)
   - מקבל suggestions מה-AI
   - LLM מבצע "refinement" (שיפור התוכן)
3. בוחר ערוצי פרסום (LinkedIn, Indeed, etc.)
4. יוצר assets:
   - טקסט (job postings, social posts)
   - תמונה (Hero Image)
   - וידאו (Short-form video)
5. עובר לסקירה ופרסום
```

---

### 2️⃣ **Backend - API Gateway** (`services/api-gateway/`)

#### תפקיד
שרת Express שמשמש כנקודת כניסה מרכזית לכל הבקשות. מנהל authentication, routing, ואינטגרציות עם LLM וסטורג'.

#### קבצים מרכזיים

**`src/index.js`** (200+ שורות)
- Entry point של השרת
- מגדיר middleware (auth, logging, CORS)
- Routing לכל ה-endpoints
- אתחול Firestore, BigQuery, LLM clients

**`src/routes/wizard.js`** (2,000+ שורות)
- **תפקיד**: כל ה-endpoints של הוויזארד
- **Routes עיקריים**:
  - `POST /wizard/draft` - יצירת/עדכון draft
  - `GET /wizard/:jobId` - טעינת job
  - `POST /wizard/refine/finalize` - סיום refinement
  - `GET /wizard/channels` - המלצות ערוצים
  - `GET /wizard/assets` - טעינת assets
  - `GET /wizard/hero-image` - טעינת hero image

**`src/routes/llm.js`** (1,500+ שורות)
- **תפקיד**: Unified endpoint לכל קריאות ה-LLM
- **Endpoint מרכזי**: `POST /api/llm`
- **Task Types נתמכים** (14 types):
  - `suggest` - suggestions למילוי שדות
  - `refine` - שיפור job description
  - `channels` - המלצת ערוצי פרסום
  - `copilot_agent` - צ'אט AI
  - `asset_master` - יצירת assets ראשי
  - `asset_channel_batch` - יצירת assets per channel
  - `video_storyboard` - יצירת storyboard לוידאו
  - `video_caption` - יצירת כיתובים לוידאו
  - `video_compliance` - בדיקת compliance
  - `company_intel` - מידע על חברה
  - `image_prompt_generation` - יצירת prompt לתמונה
  - `image_generation` - יצירת תמונה
  - `image_caption` - כיתוב תמונה
  - `hero_image` - תהליך מלא של hero image

**`src/routes/videos.js`** (800+ שורות)
- **תפקיד**: ניהול video library
- **Routes**:
  - `GET /videos` - רשימת וידאו
  - `GET /videos/:id` - פרטי וידאו
  - `POST /videos/:id/render` - render video
  - `GET /videos/jobs` - jobs עם וידאו

**`src/routes/assets.js`** (320 שורות)
- **תפקיד**: Unified assets endpoint
- מאחד assets מ:
  - `jobAssets` (טקסט)
  - `videoLibraryItems` (וידאו)
  - `jobImages` (hero images)
  - Virtual JD assets (job descriptions)

---

### 3️⃣ **LLM System** (`src/llm/`)

#### ארכיטקטורה

```
Request → Task Registry → Provider Adapter → LLM → Parser → Response
```

**`src/llm/tasks.js`** (220 שורות)
- **Task Registry**: מפת כל ה-tasks הנתמכים
- **Task Configurations**: הגדרת provider/model לכל task
- **Task Method Map**: routing לפונקציות המתאימות

**`src/llm/llm-client.js`** (2,000+ שורות)
- **תפקיד**: ממשק אחיד לכל קריאות ה-LLM
- **אחראי על**:
  - ניהול providers (Gemini, OpenAI, Anthropic)
  - Retry logic
  - Error handling
  - Usage tracking
- **Methods מרכזיים**:
  - `suggestJobContent()` - suggestions
  - `refineJob()` - refinement
  - `recommendChannels()` - channel recommendations
  - `runCopilotAgent()` - copilot chat
  - `generateImagePrompt()` - image prompts
  - `generateImage()` - image generation
  - `generateImageCaption()` - image captions

**`src/llm/providers/gemini-adapter.js`** (500+ שורות)
- **תפקיד**: Adapter ל-Google Gemini API
- תומך ב:
  - Gemini 3.0 Pro (text)
  - Gemini 3.0 Pro Image (image generation)
  - Vertex AI integration
- מנהל:
  - Token counting
  - Cost calculation
  - Error handling
  - Response parsing

**`src/llm/parsers/`** (תיקייה)
- Parsers לכל task type
- ולידציה עם Zod schemas
- המרה ל-format אחיד

---

### 4️⃣ **Video System** (`src/video/`)

#### תפקיד
מערכת מלאה ליצירת וידאו short-form עם storyboard, rendering, ו-compliance.

**`src/video/service.js`** (1,200+ שורות)
- **תפקיד**: ניהול מלא של video lifecycle
- **תהליכים**:
  1. `createVideoItem()` - יצירת manifest
  2. Storyboard generation (LLM)
  3. Compliance check (LLM)
  4. Caption generation (LLM)
  5. Video rendering (Veo API)
  6. Status polling

**`src/video/manifest-builder.js`** (210 שורות)
- בונה video manifest מ-job data
- מחשב duration planning
- מפיק storyboard structure

**`src/video/renderer.js`** (400+ שורות)
- מנהל rendering עם Veo API
- Fallback logic
- Progress tracking

**`src/video/renderers/clients/veo-client.js`** (300+ שורות)
- Client ישיר ל-Google Veo API
- יוצר וידאו מ-storyboard + images

---

### 5️⃣ **Data Layer** (`src/services/`)

**`src/services/firestore-adapter.js`**
- CRUD operations ל-Firestore
- Collections:
  - `jobs` - משרות
  - `jobRefinements` - refinements
  - `jobSuggestions` - suggestions
  - `jobChannelRecommendations` - channel recommendations
  - `jobAssets` - text assets
  - `jobImages` - hero images
  - `videoLibraryItems` - וידאו
  - `LLMsUsage` - usage logs
  - `users` - משתמשים
  - `companies` - חברות

**`src/services/bigquery-adapter.js`**
- שליחת usage logs ל-BigQuery
- Analytics ו-cost tracking

**`src/services/llm-usage-ledger.js`**
- מעקב אחרי שימוש ב-LLM
- חישוב עלויות
- רישום ל-Firestore + BigQuery

---

### 6️⃣ **Shared Packages** (`packages/`)

**`packages/core/`**
- Zod schemas לכל הישויות
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

## 🔄 זרימת נתונים - דוגמה: יצירת וידאו

```
1. Frontend: User לוחץ checkbox "Generate videos"
   ↓
2. Frontend: קורא ל-VideoLibraryApi.createItem()
   ↓
3. API Gateway: POST /api/llm (taskType: video_create_manifest)
   ↓
4. Video Service: createVideoItem()
   ↓
5. LLM: יוצר storyboard (3-5 shots)
   ↓
6. LLM: בודק compliance
   ↓
7. LLM: יוצר captions
   ↓
8. Veo API: מרנדר את הוידאו
   ↓
9. Storage: שומר videoUrl ב-Firestore
   ↓
10. Frontend: polling כל 5 שניות
   ↓
11. Frontend: מציג וידאו כש-status = "ready"
```

---

## 🎨 תהליך יצירת Assets מלא

### שלב 1: Refinement
```
User input (basic job details)
  ↓
LLM Task: "suggest" → מציע מילוי אוטומטי
  ↓
LLM Task: "refine" → משפר job description
  ↓
Firestore: שומר refined job
```

### שלב 2: Channel Selection
```
Refined job data
  ↓
LLM Task: "channels" → ממליץ על ערוצי פרסום
  ↓
User: בוחר channels
  ↓
Frontend: מאפשר בחירת hero image + video
```

### שלב 3: Asset Generation
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
Frontend: מציג ב-Assets grid
```

---

## 🔐 Authentication & Security

- **Clerk Auth**: ניהול משתמשים
- **JWT tokens**: בכל request
- **Firestore Security Rules**: הגבלת גישה
- **Service Account**: לגישה ל-GCP services

---

## 💰 Cost & Usage Tracking

כל קריאת LLM מתועדת:
1. **Firestore**: `LLMsUsage` collection
2. **BigQuery**: `llm_analytics.usage_logs` table

נתונים שנשמרים:
- `taskType` - סוג המשימה
- `provider` - Gemini/OpenAI/etc
- `model` - המודל הספציפי
- `inputTokens` / `outputTokens`
- `estimatedCostUsd` - עלות משוערת
- `userId`, `jobId` - context

---

## 🎯 הפיצ'ר שהוספנו היום: Video Generation in Job Launcher

### מה עשינו?
הוספנו אפשרות ליצור **וידאו אחד** בתהליך יצירת המשרה, בדומה ל-Hero Image.

### שינויים שביצענו:

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
/>

// Video generation
const triggerVideoGenerationIfNeeded = async () => {
  const created = await VideoLibraryApi.createItem({
    jobId,
    channelId: "TIKTOK_LEAD",
    recommendedMedium: "video"
  });
  setGeneratedVideoItem(created);
  setShouldPollVideo(true);
}

// Polling for status updates
const pollVideoItem = async () => {
  const updated = await VideoLibraryApi.fetchItem(item.id);
  setGeneratedVideoItem(updated);
  if (status === "ready") setShouldPollVideo(false);
}

// Display video in assets
const videoAsset = {
  id: `video-${item.id}`,
  formatId: "AI_VIDEO",
  status: item.status,
  content: {
    videoUrl: item.renderTask?.result?.videoUrl,
    caption: item.activeManifest?.caption?.text,
    durationSeconds: item.renderTask?.metrics?.secondsGenerated
  }
}
```

#### Backend - לא שינינו!
המערכת הייתה כבר מוכנה - רק הוספנו UI ב-frontend.

---

## 📊 Monitoring & Debugging

### Logs
- **Structured logging** עם Pino
- Log levels: info, warn, error
- כל request מתועד עם context

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

### הרצת המערכת
```bash
# Terminal 1: Frontend
npm run dev:web
# → http://localhost:3000

# Terminal 2: Backend
npm run dev:api
# → http://localhost:4000
```

### הוספת Feature חדש
1. **Schema** - הגדר ב-`packages/core/src/schemas/`
2. **Backend API** - הוסף route ב-`services/api-gateway/src/routes/`
3. **Frontend API Client** - הוסף method ב-`apps/web/lib/api-client.js`
4. **UI** - בנה component ב-`apps/web/app/`
5. **State Management** - useState/useCallback
6. **Testing** - בדוק בדפדפן

---

## 🐛 בעיות נפוצות ופתרונות

### 1. "Invalid enum value: TIKTOK"
**בעיה**: ה-channelId לא תקין
**פתרון**: השתמש ב-`TIKTOK_LEAD` במקום `TIKTOK`

### 2. Assets לא מופיעים
**בעיה**: Polling לא מופעל או assets לא נשמרים ב-state
**פתרון**:
- בדוק `shouldPollAssets` / `shouldPollVideo`
- ודא ש-state מתעדכן אחרי API call

### 3. Hot Reload לא עובד
**בעיה**: Next.js לא תופס שינויים
**פתרון**: Hard refresh (Cmd+Shift+R) או restart server

### 4. LLM Task נכשל
**בעיה**: Schema validation או API error
**פתרון**: בדוק logs ב-terminal (Backend)

---

## 📚 משאבים נוספים

- **API Documentation**: `docs/API.md`
- **Task Types**: `src/config/task-types.js`
- **Schemas**: `packages/core/src/schemas/`
- **Environment Setup**: `.env.example`

---

## 🎓 סיכום למתחיל

אם אתה חדש במערכת, התחל כאן:

1. **קרא את README.md** - סקירה כללית
2. **הבן את הזרימה**: User → Frontend → API Gateway → LLM → DB
3. **הריצו את המערכת** עם `npm run dev`
4. **עבור על Job Launcher flow** ביד
5. **סמן breakpoints** ב-console.log להבנת הזרימה
6. **קרא את `page.js`** - הלב של ה-wizard

---

## 💡 Tips למפתחים

- **Console logs**: משתמשים ב-prefixes כמו `[Video]`, `[HeroImage]`
- **Error handling**: תמיד תופסים errors ב-try/catch
- **State updates**: תמיד immutable (שימוש ב-spread operator)
- **API calls**: תמיד מתועדים בלוגים
- **Polling**: תמיד עם cleanup ב-useEffect return

---

**נכתב בתאריך**: 3 בדצמבר 2024
**גרסה**: 1.0
**עודכן לאחרונה**: הוספת Video Generation feature
