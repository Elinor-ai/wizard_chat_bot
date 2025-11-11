# Video Library & Short-Form Video System

## Overview

The video library feature turns a confirmed job plus a channel picker result into fully structured short-form video manifests, optional renders, and publishing stubs for Instagram Reels, TikTok, YouTube Shorts, Snapchat, and X. Every manifest ships with storyboard beats, caption, compliance flags, QA checklist, thumbnail guidance, and UTM tracking so operators can review and publish quickly—even if LLM or rendering providers are unavailable.

Authoritative data lives in the Firestore collection `videoLibraryItems`. Each document stores the latest manifest (`activeManifest`), the full manifest history (`manifests`), render/publish task records, audit log, and analytics placeholders.

## Core Concepts

| Concept | Description |
| --- | --- |
| **Job snapshot** | Lightweight view (title, geo, pay, benefits, policy) derived from `jobs` collection and stored on each manifest version. |
| **Channel spec** | Data-driven requirements per channel/placement (`packages/core/src/common/video-specs.js`) including aspect, duration window, caption policy, safe zones, and compliance reminders. |
| **Asset manifest** | Versioned plan containing storyboard (Hook → Proof → Offer → Action), caption, thumbnail note, QA checklist, compliance flags, and tracking. Always valid JSON whether produced by LLM or deterministic fallback. |
| **Render task** | Result from the pluggable renderer. Defaults to `dry_run` bundles (storyboard + caption) but can emit stubbed file URLs when `VIDEO_RENDERING_ENABLED=true`. |
| **Publish task** | Adapter output for TikTok/Instagram/YouTube/Snapchat/X stubs. Marks status `ready` if manual upload required, or `published` when a render file exists. |
| **Library item** | User-facing record referencing job, channel, manifest version, render/publish tasks, analytics counters, and audit log. |

## Configuration

Environment variables (see root `.env` template):

| Variable | Default | Notes |
| --- | --- | --- |
| `VIDEO_LLM_ENABLED` | `true` | Set `false` to force deterministic hook/proof/offer/action and caption generation. |
| `VIDEO_RENDERING_ENABLED` | `true` | Enables renderer factories (FFmpeg storyboard or Veo). |
| `VIDEO_RENDER_AUTOSTART` | `true` | Automatically trigger render after every manifest generation/regeneration. |
| `VIDEO_RENDERER` | `ffmpeg` | Set to `veo` to use Gemini/Veo 3. |
| `VIDEO_RENDER_OUTPUT_DIR` | `./tmp/video-renders` | Filesystem directory that stores finished assets. The API serves it via `/video-assets`. |
| `VIDEO_RENDER_PUBLIC_BASE_URL` | `http://localhost:4000/video-assets` | Base URL returned to the frontend for video/caption/poster links. |
| `FFMPEG_PATH` | `ffmpeg` | Override if ffmpeg isn’t on `$PATH`. |
| `VIDEO_RENDER_FONT_PATH` | _(unset)_ | Optional font file (e.g., `/System/Library/Fonts/Supplemental/Arial.ttf`) for `drawtext`. |
| `GEMINI_API_KEY` | _(required for Veo)_ | API key with Veo access. |
| `VIDEO_MODEL` | `veo-3` | Standard quality model. |
| `VIDEO_FAST_MODEL` | `veo-3-fast` | Draft tier model. |
| `VIDEO_EXTEND_MODEL` | `veo-3.1` | Used for `Extend` hops. |
| `VEO_POLL_TIMEOUT_MS` | `240000` | Max wait (ms) while polling Gemini operations before timing out. |
| `VEO_POLL_INTERVAL_MS` | `2000` | Initial poll delay for Veo operations. |
| `VEO_POLL_MAX_INTERVAL_MS` | `10000` | Upper bound for exponential backoff between polls. |
| `VIDEO_USE_FAST_FOR_DRAFTS` | `true` | Use Fast tier until an operator requests a final render. |
| `VEO_STANDARD_PRICE_PER_SECOND` | `0.40` | Used for cost estimates/logging. |
| `VEO_FAST_PRICE_PER_SECOND` | `0.15` | Draft tier cost estimate. |
| `VEO_DOWNLOAD_TIMEOUT_MS` | `45000` | Abort Veo asset downloads after this many ms. |
| `VEO_DOWNLOAD_RETRIES` | `3` | Attempts per asset (video/poster) before surfacing an error. |
| `LLM_VIDEO_PROVIDER` | inherits from asset provider | Controls model/provider for storyboard/caption/compliance tasks; reuses OpenAI/Gemini adapters. |

All endpoints sit behind `/videos/*` and require the same bearer token as the rest of the dashboard.

## Lifecycle

1. **Create** – Frontend calls `POST /videos` with `{ jobId, channelId, recommendedMedium }`. Service loads job, resolves channel spec, and generates manifest (LLM if enabled, deterministic fallback otherwise). Audit entry `created` recorded.
2. **Plan** – Manifest includes storyboard (4–6 shots), onscreen text, VO, caption (20–30 words), thumbnail guidance, QA checklist (duration, aspect, captions, CTA, pay/location), compliance flags, and UTM tracking.
3. **Render** – `createVideoLibraryService` invokes the renderer. With Veo enabled, we build a “director” prompt, generate an 8-second base clip on Veo 3 (or Veo 3 Fast), then issue Veo 3.1 “Extend” hops until the channel’s duration window is reached. Assets are downloaded into `VIDEO_RENDER_OUTPUT_DIR`, tagged with SynthID provenance, and saved alongside cost estimates (seconds × tier rate). When the Gemini API is unavailable we fall back to the storyboard bundle.

   _Gemini’s Veo APIs respond with long-running `operations/*` handles. `veo-client` polls those operations with exponential backoff, respects any `Retry-After` headers, and aborts after `VEO_POLL_TIMEOUT_MS`. Every failure path surfaces a reason code (`veo_rate_limited`, `veo_timeout`, `veo_missing_video_url`, etc.) so operators know whether to retry or review the storyboard fallback._
4. **Review** – `/videos` list & `/videos/:id` detail power the Video Library UI (`apps/web/components/video-library/*`). Detail view shows preview (video or simulated storyboard), caption editor, compliance flags, QA checklist, UTM string, and basic job metadata.
5. **Approve** – `POST /videos/:id/approve` toggles status and logs an audit entry.
6. **Publish** – `POST /videos/:id/publish` hands manifest + renderTask to the adapter registry (`services/api-gateway/src/video/publishers.js`). Stubs log payloads and mark status `published` when a file exists, otherwise `ready` for manual upload.
7. **Track** – Each manifest stores `tracking` (source/medium/campaign/content slug). Frontend surfaces a ready-to-copy `utm_source=…` string. Analytics placeholders (impressions/clicks/applies) live under `item.analytics` for future ingestion.

## API Quickstart

```bash
# Create manifest (LLM+render auto-run)
curl -X POST http://localhost:4000/videos \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jobId":"job_123","channelId":"TIKTOK_LEAD","recommendedMedium":"video"}'

# List library items with filters
curl -H "Authorization: Bearer <token>" \
  'http://localhost:4000/videos?channelId=TIKTOK_LEAD&status=rendered'

# Detail + preview metadata
curl -H "Authorization: Bearer <token>" http://localhost:4000/videos/<itemId>

# Regenerate storyboard/caption (jobId required for provenance)
curl -X POST http://localhost:4000/videos/<itemId>/regenerate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jobId":"job_123"}'

# Update caption after manual edits
curl -X POST http://localhost:4000/videos/<itemId>/caption \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"captionText":"Inclusive 22-word caption…","hashtags":["nowhiring","techjobs"]}'
```

### Storage & Versioning

- Firestore document ID = `videoLibraryItems/<uuid>`.
- Fields: `manifestVersion`, `manifests` array (append-only), `renderTask`, `publishTask`, `auditLog` (last 50 entries), `jobSnapshot`, `status`, `analytics`.
- Audit entries include `created`, `manifest_regenerated`, `render_completed`, `caption_updated`, `approved`, `publish`, `archived`.

### Adding a New Channel Spec

1. Update `packages/core/src/common/video-specs.js` with a new entry (`channelId`, placement, aspect, duration window, captions, compliance notes, default hashtags/CTA).
2. (Optional) Extend `CHANNEL_OPTIONS` in `apps/web/components/video-library/video-library.js` so the UI exposes it.
3. If automated publishing is desired, add a stub adapter to `services/api-gateway/src/video/publishers.js` and map the `channelId` to a key.

## Runbook & Ops Notes

| Scenario | What to check |
| --- | --- |
| **LLM failures** | Set `VIDEO_LLM_ENABLED=false` to force deterministic manifests. Logs include `video_storyboard` payload + preview; audit log lists fallback usage. |
| **Rendering down** | Leave `VIDEO_RENDERING_ENABLED=false` for dry-run bundles. Operators can download storyboard via API response and produce videos manually; publish task will stay `ready`. |
| **Publish blocked** | `publishTask.status=ready` means adapters need a rendered file. Upload manually or rerun render once a backend is available. |
| **Gemini 429 or timeouts** | Logs will show `veo_rate_limited`/`veo_timeout`. Respect `VEO_POLL_*` settings, backoff automatically, and retry once the `retry-after` window expires. If failures persist we fall back to storyboards with `renderTask.status=failed`. |
| **Compliance flags** | Flags appear in API + UI. Severity `blocking` (e.g., missing pay/location) should be resolved before approve/publish. |
| **Metrics** | Counters logged via `video_manifests_created`, `video_renders_completed`, `video_approvals`, `video_publishes`. Search logs with `metric` field for quick dashboards. |
| **Data location** | Assets stored in Firestore `videoLibraryItems`; dry-run bundles live inline in the document. External storage integration can reuse manifest IDs for bucket paths. |

## Test Strategy (manual + automated)

- **Spec coverage** – Unit tests in `packages/core` asserting `resolveVideoSpec` returns channel requirements (aspect/duration/captions) for each supported placement.
- **Manifest generation** – Service-level tests to ensure `buildVideoManifest` produces Hook→Proof→Offer→Action, CTA, QA checklist, and compliance flags even when job is missing pay/location (should emit blocking flag).
- **LLM off switch** – Integration test toggling `VIDEO_LLM_ENABLED=false` to confirm deterministic storyboard/caption created and audits record fallback.
- **Rendering paths** – Tests for both `VIDEO_RENDERING_ENABLED=false` (dry-run bundle stored, status `rendered`) and `true` (stub file URLs recorded, metrics incremented).
- **Veo client** – Unit tests that stub Gemini responses to ensure we poll operations, respect `retry-after`, time out at `VEO_POLL_TIMEOUT_MS`, and surface `veo_missing_video_url` errors when assets are absent.
- **Veo renderer fallbacks** – Ensure missing credentials or download failures return deterministic storyboard bundles with `renderTask.status=failed` and error reason codes.
- **API flows** – Endpoint tests covering create, regenerate, caption edit, render, approve, publish, and bulk approve/archive, including auth + job ownership checks.
- **UI smoke** – Playwright/RTL scenario: create manifest via form, filter grid, open detail, edit caption, approve, publish, ensure checklist & compliance flags render.
- **Publishing adapters** – Unit tests verifying adapters emit `ready` without video files and `published` when files exist, logging payloads without hitting external APIs.

Keep this document updated as new channels/specs are added or rendering/publishing integrations evolve.
