# LLM Task Contracts Reference

Quick reference for all LLM task types. For implementation details, see [LLM_TASK_INTEGRATION_GUIDE.md](./LLM_TASK_INTEGRATION_GUIDE.md).

---

## Core Tasks (Atomic LLM Calls)

### `suggest`
**Purpose**: Generate autofill suggestions for empty job form fields
**Input Context**:
- `jobId` - Job document ID
- `visibleFieldIds` - Array of field IDs visible in the UI
- `companyContext` - Company description for tone alignment
**Output Schema**: `SuggestOutputSchema`
- `autofill_candidates[]` - Array of { fieldId, value, rationale, confidence, source }
**Provider**: Gemini (gemini-3-pro-preview)
**Temperature**: 0.1 (deterministic)

---

### `refine`
**Purpose**: Polish and enhance job description content
**Input Context**:
- `jobId` - Job document ID
- `jobSnapshot` - Current job data
- `companyContext` - Company tone/style context
**Output Schema**: `RefineOutputSchema`
- `refinedJob` - Enhanced job object with polished fields
**Provider**: Gemini
**Temperature**: 0.15

---

### `channels`
**Purpose**: Recommend publishing channels for job distribution
**Input Context**:
- `jobId` - Job document ID
- `jobSnapshot` - Job data for targeting
- `companyContext` - Industry context
**Output Schema**: `ChannelsOutputSchema`
- `recommendations[]` - Array of { channelId, matchScore, rationale }
**Provider**: Gemini
**Temperature**: 0.2

---

### `copilot_agent`
**Purpose**: Wizard's AI assistant for job creation guidance
**Input Context**:
- `jobId` - Current job context
- `conversationHistory` - Chat history
- `availableTools` - Tool definitions for function calling
**Output Schema**: `CopilotAgentOutputSchema`
- `response` | `tool_call` - Either direct response or tool invocation
**Provider**: Gemini
**Temperature**: 0.3 (conversational)

---

### `company_intel`
**Purpose**: Enrich company profile with public data
**Input Context**:
- `companyId` - Company to enrich
- `domain` - Primary website domain
- `existingData` - Current company data
- `gaps` - Fields needing enrichment
**Output Schema**: `CompanyIntelOutputSchema`
- `enrichment` - Industry, size, culture, benefits, etc.
**Provider**: Gemini (with Google Search grounding)
**Temperature**: 0.2
**Note**: Uses grounding tools - no controlled generation (JSON mode via prompt only)

---

### `golden_interviewer`
**Purpose**: Conversational job intake interview
**Input Context**:
- `sessionId` - Interview session ID
- `conversationHistory` - Previous turns
- `currentSchema` - Golden Schema with extracted data
- `extractedData` - Data collected so far
**Output Schema**: `GoldenInterviewerOutputSchema`
- `assistantMessage` - Next question/response
- `extractedFields` - Newly extracted data
- `status` - active/completed
- `uiComponent` - Suggested UI for response
**Provider**: Gemini
**Temperature**: 0.7 (creative/conversational)
**Note**: Uses dynamic system prompt via `systemBuilder`

---

### `asset_master`
**Purpose**: Generate master creative brief for job marketing
**Input Context**:
- `jobSnapshot` - Finalized job data
- `companyContext` - Branding context
- `targetChannels` - Selected distribution channels
**Output Schema**: `AssetMasterOutputSchema`
- `masterScript` - Core messaging
- `keyHooks` - Attention grabbers
- `cta` - Call to action
**Provider**: Gemini
**Temperature**: 0.35 (creative)

---

### `asset_channel_batch`
**Purpose**: Adapt master brief to specific channels
**Input Context**:
- `masterBrief` - From asset_master
- `channels[]` - Target channels with specs
**Output Schema**: `AssetChannelBatchOutputSchema`
- `assets[]` - Per-channel content blocks
**Provider**: Gemini
**Temperature**: 0.25

---

### `asset_adapt`
**Purpose**: Fine-tune asset for specific platform
**Input Context**:
- `masterScript` - Source content
- `channelId` - Target platform
- `specs` - Platform requirements
**Output Schema**: `AssetAdaptOutputSchema`
- `adaptedContent` - Platform-native version
**Provider**: Gemini
**Temperature**: 0.3

---

### `video_config`
**Purpose**: Define video creative direction (tone, pacing, style)
**Input Context**:
- `jobSnapshot` - Job data
- `companyBranding` - Visual identity
**Output Schema**: `VideoConfigOutputSchema`
- `tone`, `pacing`, `style` - Creative parameters
**Provider**: Gemini
**Temperature**: 0.3

---

### `video_storyboard`
**Purpose**: Generate video shot sequence
**Input Context**:
- `jobSnapshot` - Job content
- `videoConfig` - Creative direction
- `companyBranding` - Visual context
**Output Schema**: `VideoStoryboardOutputSchema`
- `shots[]` - Array of { shotType, duration, prompt, caption }
**Provider**: Gemini
**Temperature**: 0.25

---

### `video_caption`
**Purpose**: Generate accessible captions for video
**Input Context**:
- `storyboard` - Video structure
- `jobSnapshot` - Content context
**Output Schema**: `VideoCaptionOutputSchema`
- `caption` - Main caption text
- `hashtags[]` - Recommended tags
**Provider**: Gemini
**Temperature**: 0.2

---

### `video_compliance`
**Purpose**: Check video content for employment law compliance
**Input Context**:
- `storyboard` - Video content to check
- `jobSnapshot` - Job context
**Output Schema**: `VideoComplianceOutputSchema`
- `flags[]` - Compliance issues found
- `passed` - Boolean overall status
**Provider**: Gemini
**Temperature**: 0 (deterministic)

---

### `image_prompt_generation`
**Purpose**: Convert job brief to image generation prompt
**Input Context**:
- `jobSnapshot` - Job data
- `companyBranding` - Visual style
- `imageStyle` - Requested aesthetic
**Output Schema**: `ImagePromptOutputSchema`
- `prompt` - Imagen-ready prompt text
- `negativePrompt` - What to avoid
**Provider**: Gemini
**Temperature**: 0.2

---

### `image_generation`
**Purpose**: Generate hero image using Imagen
**Input Context**:
- `prompt` - From image_prompt_generation
- `aspectRatio` - Output dimensions
**Output**: Binary image data (no JSON schema)
**Provider**: Gemini (gemini-3-pro-image-preview)
**Temperature**: 0

---

### `image_caption`
**Purpose**: Generate alt-text and social caption for image
**Input Context**:
- `imageUrl` - Generated image
- `jobSnapshot` - Context
**Output Schema**: `ImageCaptionOutputSchema`
- `altText` - Accessibility text
- `socialCaption` - Marketing copy
**Provider**: Gemini
**Temperature**: 0.35

---

## Orchestrator Tasks (Multi-Step Pipelines)

These tasks coordinate multiple atomic LLM calls.

### `generate_campaign_assets`
**Purpose**: Full asset generation pipeline
**Flow**: asset_master → asset_channel_batch → (per-channel asset_adapt)
**Entry Point**: `wizard-asset-generation-service.js`

---

### `hero_image`
**Purpose**: Complete hero image generation
**Flow**: image_prompt_generation → image_generation → image_caption
**Entry Point**: `services/hero-image.js`

---

### `video_create_manifest`
**Purpose**: Create new video storyboard
**Flow**: video_config → video_storyboard → video_compliance
**Entry Point**: `video/service.js`

---

### `video_regenerate`
**Purpose**: Regenerate video with modifications
**Entry Point**: `video/service.js`

---

### `video_caption_update`
**Purpose**: Update video captions only
**Entry Point**: `video/service.js`

---

### `video_render`
**Purpose**: Render video from manifest using Veo
**Entry Point**: `video/service.js`
**Note**: Invokes Veo API directly (not LLM)

---

## Logging-Only Tasks

These identifiers appear in usage logs but are not request taskTypes.

| Logged As | Request TaskType | Rationale |
|-----------|------------------|-----------|
| `suggestions` | `suggest` | Historical naming |
| `refinement` | `refine` | Historical naming |

---

## Special Tasks

### `video_generation`
**Purpose**: Track Veo API usage in billing
**Not a request taskType** - used only for usage logging after video rendering.
**Entry Point**: `video/service.js → recordLlmUsage()`

---

## Provider Configuration

Default provider settings from `config/llm-config.js`:

| Task Category | Provider | Model |
|--------------|----------|-------|
| Most text tasks | Gemini | gemini-3-pro-preview |
| Image generation | Gemini | gemini-3-pro-image-preview |
| Video generation | Veo | veo-3.0-generate-preview |

---

## Output Schemas Location

All Zod output schemas are defined in:
```
services/api-gateway/src/llm/schemas/index.js
```

Schema naming convention: `{TaskName}OutputSchema`

---

**See Also**:
- [LLM_TASK_INTEGRATION_GUIDE.md](./LLM_TASK_INTEGRATION_GUIDE.md) - How to add new tasks
- [DATA_MODEL.md](./DATA_MODEL.md) - Firestore collections
- [CODING_STANDARDS.md](./CODING_STANDARDS.md) - Error handling, logging
