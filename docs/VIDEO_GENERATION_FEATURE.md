# Video Generation Feature - Full Guide

## 📹 Overview

**Date added**: December 3, 2024

This feature lets users automatically create **one short-form video** during the job creation wizard, similar to the Hero Image flow.

---

## 🎯 Feature Goal

Enable creation of a **short-form video** (15–30 seconds) with:
- Storyboard tailored to the job content
- Visual scenes from AI image generation
- Captions and hashtags
- Automated compliance check
- Rendering via Google Veo API

---

## 🏗️ Architecture

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

## 💻 Code Changes

The feature did not require backend changes because the system already supported video creation through the API. Only the frontend needed updates to trigger the flow and surface the result.

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
}, [generatedVideoItem, user?.authToken]);
```

##### Rendering Video in Assets Grid (lines ~2411-2450)
```javascript
// Convert the generated video item to an asset card
const videoAsset = generatedVideoItem
  ? {
      id: `video-${generatedVideoItem.id}`,
      formatId: "AI_VIDEO",
      status: generatedVideoItem.status,
      content: {
        videoUrl: generatedVideoItem.renderTask?.result?.videoUrl,
        caption: generatedVideoItem.activeManifest?.caption?.text,
        durationSeconds: generatedVideoItem.renderTask?.metrics?.secondsGenerated,
      },
    }
  : null;

const assetsWithVideo = videoAsset
  ? [...assets, videoAsset]
  : assets;
```

---

## ✅ Checklist

- [x] Frontend opt-in checkbox + state
- [x] Video creation trigger (VideoLibraryApi.createItem)
- [x] Polling for status updates
- [x] Display video asset when ready
- [x] No backend changes required (API already supported video)
