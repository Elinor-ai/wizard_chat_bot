# Video Generation Feature - מדריך מלא

## 📹 סקירה כללית

**תאריך הוספה**: 3 בדצמבר 2024

פיצ'ר שמאפשר למשתמשים ליצור **וידאו אחד** אוטומטית בתהליך יצירת המשרה בווי זארד, בדומה לתכונת Hero Image.

---

## 🎯 מטרת הפיצ'ר

לאפשר ליצור **short-form video** (15-30 שניות) עם:
- Storyboard מותאם אישית מתוכן המשרה
- Visual scenes מ-AI image generation
- Captions ו-hashtags
- Compliance check אוטומטי
- Rendering עם Google Veo API

---

## 🏗️ ארכיטקטורה

### Flow Diagram

```
User clicks ☑️ "Generate videos"
         │
         ▼
Frontend: triggerVideoGenerationIfNeeded()
         │
         ├─ POST /api/llm
         │  taskType: "video_create_manifest"
         │  context: { jobId, channelId: "TIKTOK_LEAD" }
         │
         ▼
Backend: Video Service
         │
         ├─ Step 1: Build Manifest
         │  └─ manifest-builder.js
         │     • Analyze job content
         │     • Plan duration (15-30s)
         │     • Create structure
         │
         ├─ Step 2: Generate Storyboard
         │  └─ LLM Task: "video_storyboard"
         │     • 3-5 shots
         │     • Visual descriptions
         │     • Timing per shot
         │
         ├─ Step 3: Compliance Check
         │  └─ LLM Task: "video_compliance"
         │     • Check for prohibited content
         │     • Validate against policies
         │
         ├─ Step 4: Generate Captions
         │  └─ LLM Task: "video_caption"
         │     • Create engaging caption
         │     • Generate hashtags
         │
         ├─ Step 5: Render Video
         │  └─ Veo Renderer
         │     • Generate images for each shot
         │     • Send to Veo API
         │     • Get videoUrl
         │
         └─ Step 6: Save to Firestore
            status: "ready"
            videoUrl: "https://..."
         │
         ▼
Frontend: Polling (every 5 seconds)
         │
         ├─ fetchItem(videoId)
         ├─ Update state
         └─ Stop when status = "ready"
         │
         ▼
Display: <VideoCard>
         <video controls src={videoUrl} />
```

---

## 💻 שינויים בקוד

### 1️⃣ Frontend Changes

#### **File**: `apps/web/app/(dashboard)/wizard/[jobId]/publish/page.js`

##### State Management (Added lines ~1943-1948)
```javascript
// Video generation state
const [shouldGenerateVideos, setShouldGenerateVideos] = useState(false);
const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
const [videoGenerationError, setVideoGenerationError] = useState(null);
const [generatedVideoItem, setGeneratedVideoItem] = useState(null);
const [shouldPollVideo, setShouldPollVideo] = useState(false);
```

##### UI Component: VideoOptIn (lines ~1187-1213)
```javascript
function VideoOptIn({ checked, onToggle }) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-sm">
      <label className="flex items-start gap-3 text-sm text-neutral-700">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
          checked={checked}
          onChange={(event) => onToggle?.(event.target.checked)}
        />
        <span>
          <span className="block text-sm font-semibold text-neutral-900">
            Generate videos?
          </span>
          <span className="text-sm text-neutral-500">
            We'll create short-form videos for all selected channels with captions and compliance.
          </span>
        </span>
      </label>
    </div>
  );
}
```

##### Video Generation Logic (lines ~2326-2374)
```javascript
const triggerVideoGenerationIfNeeded = useCallback(async () => {
  if (!shouldGenerateVideos) {
    console.log("[Video] trigger:opt-out", { jobId });
    return;
  }

  if (!user?.authToken || !jobId) {
    console.log("[Video] trigger:skip", {
      jobId,
      hasAuth: Boolean(user?.authToken),
    });
    return;
  }

  console.log("[Video] trigger:opt-in", { jobId });

  setIsGeneratingVideos(true);
  setVideoGenerationError(null);

  try {
    console.log("[Video] Creating single video for job");
    const created = await VideoLibraryApi.createItem(
      {
        jobId,
        channelId: "TIKTOK_LEAD", // Universal video
        recommendedMedium: "video",
      },
      { authToken: user.authToken }
    );
    console.log("[Video] Video created:", created.id);

    setGeneratedVideoItem(created);
    setShouldPollVideo(true); // Start polling
  } catch (error) {
    console.warn("[Video] Failed to create video:", error);
    setVideoGenerationError(error.message ?? "Failed to create video");
  }

  setIsGeneratingVideos(false);
}, [shouldGenerateVideos, user?.authToken, jobId]);
```

##### Video Polling Logic (lines ~2376-2401)
```javascript
const pollVideoItem = useCallback(async () => {
  if (!user?.authToken || !generatedVideoItem) {
    return;
  }

  console.log("[Video] Polling video status", {
    videoId: generatedVideoItem.id,
  });

  try {
    const updated = await VideoLibraryApi.fetchItem(generatedVideoItem.id, {
      authToken: user.authToken,
    });

    setGeneratedVideoItem(updated);

    // Check if video is still generating
    const isPending = ["generating", "pending"].includes(
      updated.status?.toLowerCase()
    );

    // Stop polling when ready or failed
    if (!isPending) {
      console.log("[Video] Video completed, stopping poll");
      setShouldPollVideo(false);
    }
  } catch (error) {
    console.error("[Video] Poll error:", error);
  }
}, [user?.authToken, generatedVideoItem]);
```

##### Polling Effect (lines ~2818-2824)
```javascript
useEffect(() => {
  if (!shouldPollVideo) return undefined;
  const interval = setInterval(() => {
    pollVideoItem();
  }, 5000); // Poll every 5 seconds
  return () => clearInterval(interval);
}, [shouldPollVideo, pollVideoItem]);
```

##### Video Asset Composition (lines ~2246-2294)
```javascript
const videoAsset = useMemo(() => {
  if (!shouldGenerateVideos) {
    return null;
  }

  // Show placeholder while generating
  if (isGeneratingVideos && !generatedVideoItem) {
    return {
      id: "video-placeholder",
      formatId: "AI_VIDEO",
      channelId: "VIDEO",
      status: "GENERATING",
      content: {
        videoUrl: null,
        caption: "Generating your video...",
        body: "Your video is being created. This may take a few minutes.",
        durationSeconds: 0,
        posterUrl: null,
      },
      provider: null,
      model: null,
    };
  }

  if (!generatedVideoItem) {
    return null;
  }

  const item = generatedVideoItem;
  const status = item.status === "ready" ? "READY" :
                 item.status === "generating" ? "GENERATING" :
                 item.status === "failed" ? "FAILED" : "PENDING";

  return {
    id: `video-${item.id}`,
    formatId: "AI_VIDEO",
    channelId: "VIDEO",
    status,
    content: {
      videoUrl: item.renderTask?.result?.videoUrl ?? null,
      caption: item.activeManifest?.caption?.text ?? null,
      body: item.activeManifest?.caption?.text ?? "Video ready",
      durationSeconds: item.renderTask?.metrics?.secondsGenerated ?? 0,
      posterUrl: item.renderTask?.result?.posterUrl ?? null,
    },
    provider: item.renderTask?.renderer ?? null,
    model: item.renderTask?.metrics?.model ?? null,
  };
}, [shouldGenerateVideos, generatedVideoItem, isGeneratingVideos]);
```

##### Assets Composition (lines ~2296-2310)
```javascript
const assetsWithHero = useMemo(() => {
  const allAssets = [...(jobAssets ?? [])];

  // Add video asset if it exists
  if (videoAsset) {
    allAssets.unshift(videoAsset);
  }

  // Add hero image at the top if it exists
  if (heroImageAsset) {
    allAssets.unshift(heroImageAsset);
  }

  return allAssets;
}, [heroImageAsset, videoAsset, jobAssets]);
```

##### Display Component: VideoCard (lines ~1493-1553)
```javascript
function VideoCard({ content, status }) {
  const videoUrl = content?.videoUrl ?? null;
  const posterUrl = content?.posterUrl ?? content?.thumbnailUrl ?? null;
  const caption = content?.caption ?? content?.body ?? "Video being generated...";
  const durationSeconds = content?.durationSeconds ?? 0;

  const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-4">
      {videoUrl ? (
        <div className="mb-3 overflow-hidden rounded-xl">
          <video
            controls
            poster={posterUrl}
            className="h-auto w-full"
            style={{ maxHeight: "300px" }}
          >
            <source src={videoUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      ) : posterUrl ? (
        <div className="mb-3 overflow-hidden rounded-xl bg-neutral-200">
          <img
            src={posterUrl}
            alt="Video thumbnail"
            className="h-auto w-full"
            style={{ maxHeight: "300px" }}
          />
        </div>
      ) : (
        <div className="mb-3 flex h-48 items-center justify-center rounded-xl bg-neutral-200">
          <div className="text-center text-sm text-neutral-500">
            <p className="font-semibold">Video generating...</p>
            <p className="text-xs">This may take a few minutes</p>
          </div>
        </div>
      )}
      {caption && (
        <p className="mb-2 whitespace-pre-wrap text-sm text-neutral-700">
          {caption}
        </p>
      )}
      {durationSeconds > 0 && (
        <p className="text-xs text-neutral-500">
          Duration: {formatDuration(durationSeconds)}
        </p>
      )}
    </div>
  );
}
```

##### Asset Variant Map Update (lines ~1236-1253)
```javascript
const ASSET_VARIANT_MAP = {
  // ... existing mappings
  VIDEO_TIKTOK: "video",
  VIDEO_INSTAGRAM: "video",
  VIDEO_YOUTUBE: "video",
  VIDEO_LINKEDIN: "video",
  AI_VIDEO: "video",  // ← NEW!
};
```

##### Asset Labels Update (lines ~1278-1285)
```javascript
const formatLabel =
  variant === "hero_image" ? "AI image" :
  variant === "video" ? "AI video" :  // ← NEW!
  asset.formatId.replace(/_/g, " ");

const channelLabel =
  variant === "hero_image" ? "Campaign visual" :
  variant === "video" ? "Short-form video" :  // ← NEW!
  asset.channelId.replace(/_/g, " ");
```

##### Render Video Card (lines ~1313-1314)
```javascript
{variant === "video" ? (
  <VideoCard content={content} status={asset.status} />
) : /* ... other variants */}
```

---

### 2️⃣ Backend - No Changes Required!

הפיצ'ר לא דרש שינויים ב-backend כי המערכת כבר תמכה ביצירת וידאו דרך ה-API.

**Existing Backend Infrastructure Used:**
- `POST /api/llm` (taskType: "video_create_manifest")
- `src/video/service.js` - Video creation logic
- `src/video/manifest-builder.js` - Manifest builder
- `src/video/renderer.js` - Veo integration
- `src/llm/llm-client.js` - LLM calls (storyboard, compliance, caption)

---

## 🎨 UX Flow

### Step 1: Channel Selection
```
┌────────────────────────────────────────┐
│ Select Distribution Channels           │
├────────────────────────────────────────┤
│ ☑️ LinkedIn Jobs                       │
│ ☑️ Indeed Sponsored                    │
│ ☐ Wellfound                            │
│                                        │
│ ┌────────────────────────────────────┐│
│ │ ☑️ Generate hero image?            ││
│ │    AI-powered campaign visuals     ││
│ └────────────────────────────────────┘│
│                                        │
│ ┌────────────────────────────────────┐│
│ │ ☑️ Generate videos?  ← NEW!        ││
│ │    We'll create short-form videos  ││
│ │    for all selected channels       ││
│ └────────────────────────────────────┘│
│                                        │
│ [Continue to Assets] →                 │
└────────────────────────────────────────┘
```

### Step 2: Generation
```
User clicks "Continue to Assets"
  ↓
Triggers:
  ✅ triggerHeroImageIfNeeded()
  ✅ triggerVideoGenerationIfNeeded()  ← NEW!
  ✅ handleGenerateAssets()

Frontend shows:
  "Generating 1 video..."
```

### Step 3: Placeholder State
```
┌────────────────────────────────────────┐
│ AI video                               │
│ Short-form video                       │
│ GENERATING ⚡                          │
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐│
│ │                                    ││
│ │     [Loading animation]            ││
│ │     Video generating...            ││
│ │     This may take a few minutes    ││
│ │                                    ││
│ └────────────────────────────────────┘│
└────────────────────────────────────────┘
```

### Step 4: Ready State
```
┌────────────────────────────────────────┐
│ AI video                               │
│ Short-form video                       │
│ READY ✅                               │
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐│
│ │ [▶️ Video Player Controls]         ││
│ │                                    ││
│ │    [Poster Image]                  ││
│ │                                    ││
│ └────────────────────────────────────┘│
│                                        │
│ Join our team as a QA Tester at       │
│ Botson! #hiring #QA #TechJobs         │
│                                        │
│ Duration: 0:18                         │
└────────────────────────────────────────┘
```

---

## 🐛 Debugging Guide

### Console Logs

#### Frontend
```javascript
// When checkbox clicked
[Video] Checkbox toggled { checked: true }

// When assets generation triggered
[Assets] generate click {
  jobId, selectedChannels,
  shouldGenerateVideos: true
}

// Video generation start
[Video] trigger:opt-in { jobId }
[Video] Creating single video for job

// API call
[video] createItem -> payload {
  jobId: "job_xxx",
  channelId: "TIKTOK_LEAD",
  recommendedMedium: "video"
}

// Success
[Video] Video created: vid_xxx

// Polling
[Video] Polling video status { videoId: "vid_xxx" }

// Completion
[Video] Video completed, stopping poll
```

#### Backend
```javascript
// Logs in terminal
[video-service] Loaded company branding
INFO: video.create.start { jobId, channelId }
INFO: video.storyboard.generated { shots: 4 }
INFO: video.compliance.passed
INFO: video.caption.generated
INFO: video.render.start { renderer: "veo" }
INFO: video.render.complete { videoUrl }
```

### Common Issues

#### 1. "Invalid enum value: TIKTOK"
```
Error: received 'TIKTOK', expected 'TIKTOK_LEAD'

Fix: Changed channelId from "TIKTOK" to "TIKTOK_LEAD"
Location: page.js line 2359
```

#### 2. Video not appearing in assets
```
Problem: generatedVideoItem is null

Check:
1. Was API call successful?
2. Is videoAsset computed correctly?
3. Is videoAsset in assetsWithHero array?

Debug:
console.log("videoAsset:", videoAsset);
console.log("assetsWithHero:", assetsWithHero);
```

#### 3. Polling not working
```
Problem: Video status never updates

Check:
1. Is shouldPollVideo = true?
2. Is generatedVideoItem not null?
3. Is VideoLibraryApi.fetchItem() being called?

Debug:
console.log("shouldPollVideo:", shouldPollVideo);
console.log("generatedVideoItem:", generatedVideoItem);
```

#### 4. Hot Reload not picking up changes
```
Problem: Code changed but frontend shows old version

Fix:
1. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. Or restart: Ctrl+C then npm run dev
```

---

## 📊 Performance Metrics

### Timing
- **Manifest Creation**: ~2 seconds
- **Storyboard Generation (LLM)**: ~15 seconds
- **Compliance Check (LLM)**: ~5 seconds
- **Caption Generation (LLM)**: ~8 seconds
- **Video Rendering (Veo)**: ~90-120 seconds
- **Total**: ~2-3 minutes

### Costs (Estimated)
- **Storyboard**: ~$0.05 (Gemini Pro text)
- **Compliance**: ~$0.02 (Gemini Pro text)
- **Caption**: ~$0.02 (Gemini Pro text)
- **Images**: ~$0.50 (4 images @ ~$0.13 each)
- **Video Rendering**: ~$0.80 (Veo API, 15 seconds)
- **Total per video**: ~$1.40

### Database Impact
- **videoLibraryItems**: +1 document per video
- **LLMsUsage**: +3-4 documents (storyboard, compliance, caption)
- **BigQuery**: +3-4 rows in usage_logs

---

## ✅ Testing Checklist

### Manual Testing

- [ ] Checkbox appears on Channels step
- [ ] Checkbox state persists during navigation
- [ ] Clicking "Create campaign assets" triggers video generation
- [ ] Placeholder appears immediately with "GENERATING" status
- [ ] Polling starts automatically
- [ ] Video appears in assets grid when ready
- [ ] Video player works (controls, poster)
- [ ] Caption and duration display correctly
- [ ] Polling stops when video is ready
- [ ] Error handling works (shows error message)

### Edge Cases

- [ ] What if user unchecks checkbox before assets step?
- [ ] What if video generation fails?
- [ ] What if user navigates away during generation?
- [ ] What if user refreshes page while generating?
- [ ] What if multiple videos somehow created?

---

## 🚀 Future Enhancements

### Potential Improvements

1. **Multiple Videos per Channel**
   - Currently: 1 video total
   - Future: 1 video per selected channel

2. **Video Preview Before Generation**
   - Show storyboard preview
   - Allow user to edit storyboard

3. **Progress Bar**
   - Show generation progress (0-100%)
   - Breakdown: Storyboard → Images → Rendering

4. **Video Variations**
   - Generate multiple versions
   - A/B testing support

5. **Custom Video Options**
   - Duration selection (15s, 30s, 60s)
   - Style selection (professional, casual, energetic)
   - Voice-over toggle

6. **Editing Capabilities**
   - Edit captions in UI
   - Replace specific shots
   - Regenerate with feedback

---

## 📚 Related Documentation

- [SYSTEM_OVERVIEW.md](./SYSTEM_OVERVIEW.md) - Full system documentation
- [ARCHITECTURE_DIAGRAM.md](./ARCHITECTURE_DIAGRAM.md) - Architecture diagrams
- [src/video/README.md](../services/api-gateway/src/video/README.md) - Video system docs

---

## 👥 Contributors

- **Feature Added By**: Noy (with Claude assistance)
- **Date**: December 3, 2024
- **Version**: 1.0

---

**Happy Video Creating! 🎬**
