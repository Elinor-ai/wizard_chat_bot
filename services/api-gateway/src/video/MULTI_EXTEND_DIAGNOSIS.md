# Multi-Extend Video Repetition: Root Cause Analysis & Fix

## Executive Summary

**Problem:** When generating 22-second videos using Veo multi-extend (8s + 7s + 7s), the output contains the same scene repeated 2-3 times instead of a continuous narrative progression.

**Root Cause:** The SAME prompt is used for ALL Veo API calls (initial + extensions). Each extension tries to recreate the complete storyboard narrative instead of continuing where the previous segment left off.

**Solution:** Implement segment-aware prompting where each extension receives context-specific instructions.

---

## Detailed Analysis

### 1. Current Data Flow

```
manifest-builder.js
    │
    ├─► VideoConfig (tone, targetSeconds, style)
    ├─► RenderPlan (segments: [{kind:"initial", seconds:8}, {kind:"extend", seconds:7}, ...])
    └─► Storyboard (shots: [Hook, Proof, Offer, CTA])
           │
           ▼
renderer.js::buildPrompt(manifest)
    │
    └─► SINGLE prompt containing ALL storyboard shots
           │
           ▼
unified-renderer.js::renderVideo()
    │
    └─► Passes same prompt + renderPlan to VeoClient
           │
           ▼
veo-client.js::generateWithRenderPlan()
    │
    ├─► Initial (8s): Uses SAME prompt
    ├─► Extension 1 (7s): Uses SAME prompt + previous video
    └─► Extension 2 (7s): Uses SAME prompt + previous video
```

### 2. The Problem: Same Prompt for All Calls

In `renderer.js:47-63`, `buildPrompt()` creates ONE prompt:

```javascript
function buildPrompt(manifest) {
  const shots = (manifest?.storyboard ?? [])
    .map((shot) =>
      `${shot.phase}: ${shot.visual} | Text: ${shot.onScreenText} | VO: ${shot.voiceOver}`
    )
    .join("\n");

  return `Create a recruiting short-form video for ${job.title} at ${job.company}...
Storyboard:
${shots}  // <-- ALL shots listed (Hook, Proof, Offer, CTA)
Caption guidance: ${caption}`;
}
```

This prompt is used UNCHANGED for:
1. **Initial generation** (8s) - Veo tries to create the ENTIRE storyboard
2. **Extension 1** (+7s) - Veo gets SAME prompt, tries to create ENTIRE storyboard again
3. **Extension 2** (+7s) - Veo gets SAME prompt, tries to create ENTIRE storyboard again

### 3. Why This Causes Repetition

When Veo receives:
- The SAME "create a recruiting video with Hook → Proof → Offer → CTA" prompt
- PLUS a previous video to extend from

It interprets this as: "Continue the video, but still achieve the complete Hook → Proof → Offer → CTA narrative."

Each extension essentially restarts the narrative because the prompt tells it to create a complete story.

### 4. What's Missing

| Missing Element | Impact |
|-----------------|--------|
| Per-segment prompts | Each segment tries to cover the entire storyboard |
| Extension-specific instructions | No "continue naturally, don't restart" guidance |
| Timeline awareness | No concept of "you're in segment 2 of 3" |
| Phase mapping | Storyboard phases not aligned to segments |

---

## Current API Payloads (Before Fix)

### Initial Call (8s)
```json
{
  "instances": [{
    "prompt": "Create a recruiting short-form video for Software Engineer at TechCorp...
Storyboard:
Hook: Dynamic opening with company logo...
Proof: Show team collaboration...
Offer: Highlight salary and benefits...
CTA: Apply now button..."
  }],
  "parameters": {
    "durationSeconds": 8,
    "aspectRatio": "9:16",
    "generateAudio": true
  }
}
```

### Extension Call 1 (+7s) - SAME PROMPT!
```json
{
  "instances": [{
    "prompt": "Create a recruiting short-form video for Software Engineer at TechCorp...
Storyboard:
Hook: Dynamic opening with company logo...   ← REPEATS HOOK
Proof: Show team collaboration...
Offer: Highlight salary and benefits...
CTA: Apply now button...",
    "video": { "gcsUri": "gs://bucket/previous-8s-video.mp4" }
  }],
  "parameters": {
    "durationSeconds": 7,
    "storageUri": "gs://bucket/output/"
  }
}
```

**Result:** Veo sees "Hook: Dynamic opening..." and tries to create a hook again, leading to repetitive content.

---

## Proposed Fix

### Strategy: Segment-Aware Prompting

Modify the system to generate different prompts for each segment:

1. **Map storyboard phases to segments** based on timing
2. **Add continuation context** for extension calls
3. **Include anti-repetition instructions**

### Implementation Changes

#### A. Modify `veo-client.js::_startExtensionGeneration`

```javascript
async _startExtensionGeneration(request, previousVideoUrl, extendSeconds, stepIndex, totalSteps) {
  console.log(`🔗 Starting Veo extension (+${extendSeconds}s)...`);

  // Build extension-specific prompt
  const extensionPrompt = this._buildExtensionPrompt(
    request.prompt,
    stepIndex,
    totalSteps
  );

  const modifiedRequest = {
    ...request,
    prompt: extensionPrompt,  // Use modified prompt
    duration: extendSeconds,
    providerOptions: {
      ...request.providerOptions,
      veo: {
        ...request.providerOptions?.veo,
        durationSeconds: extendSeconds,
        videoGcsUri,
        storageUri,
      },
    },
  };

  return this.startGeneration(modifiedRequest);
}

_buildExtensionPrompt(basePrompt, stepIndex, totalSteps) {
  const continuationContext = `

[CONTINUATION CONTEXT]
This is segment ${stepIndex + 1} of ${totalSteps} in a continuous video.
IMPORTANT INSTRUCTIONS:
- Continue naturally from the last frame of the previous video
- DO NOT restart the scene or repeat content from earlier segments
- Progress the narrative forward, building on what came before
- Maintain visual and tonal consistency with the previous segment
`;

  // For the final segment, add CTA emphasis
  if (stepIndex === totalSteps - 2) {
    return basePrompt + continuationContext + `
- This is the FINAL segment - end with a strong call to action
- Build to a satisfying conclusion
`;
  }

  return basePrompt + continuationContext;
}
```

#### B. Alternative: Phase-Mapped Prompting (More Sophisticated)

Modify `renderer.js` to generate per-segment prompts based on storyboard phases:

```javascript
/**
 * Builds segment-specific prompts from the manifest.
 * Maps storyboard phases to RenderPlan segments.
 */
function buildSegmentPrompts(manifest, renderPlan) {
  const job = manifest?.job ?? {};
  const shots = manifest?.storyboard ?? [];
  const segments = renderPlan?.segments ?? [];

  if (segments.length <= 1) {
    // Single shot - return full prompt
    return [buildPrompt(manifest)];
  }

  // Calculate time distribution
  const totalSeconds = renderPlan.finalPlannedSeconds;
  const segmentBoundaries = [];
  let cumulative = 0;
  for (const seg of segments) {
    cumulative += seg.seconds;
    segmentBoundaries.push(cumulative);
  }

  // Map shots to segments based on timing
  const segmentShots = segments.map(() => []);
  for (const shot of shots) {
    // Distribute shots across segments proportionally
    const shotMidpoint = (shot.startTime ?? 0) + (shot.durationSeconds ?? 0) / 2;
    const segmentIndex = segmentBoundaries.findIndex(b => shotMidpoint < b);
    const targetSegment = segmentIndex >= 0 ? segmentIndex : segments.length - 1;
    segmentShots[targetSegment].push(shot);
  }

  // Build per-segment prompts
  return segments.map((seg, idx) => {
    const isInitial = idx === 0;
    const isFinal = idx === segments.length - 1;
    const shotsForSegment = segmentShots[idx];

    const shotText = shotsForSegment.length > 0
      ? shotsForSegment.map(s =>
          `${s.phase}: ${s.visual} | Text: ${s.onScreenText}`
        ).join("\n")
      : "Continue the narrative naturally";

    let prompt = `Create a recruiting video segment for ${job.title} at ${job.company}.
Channel: ${manifest?.channelName}.

This is segment ${idx + 1} of ${segments.length} (${seg.seconds}s).
${isInitial ? 'This is the OPENING.' : 'Continue seamlessly from the previous segment.'}
${isFinal ? 'This is the FINAL segment - end with a clear call to action.' : ''}

Focus on:
${shotText}`;

    if (!isInitial) {
      prompt += `

IMPORTANT: Do NOT restart the scene or repeat content.
Continue naturally from where the previous segment ended.`;
    }

    return prompt;
  });
}
```

#### C. Modify `veo-client.js::generateWithRenderPlan`

```javascript
async generateWithRenderPlan(request, renderPlan) {
  // ... existing validation ...

  if (strategy === "multi_extend") {
    const [initialSegment, ...extendSegments] = segments;
    const totalSteps = segments.length;

    // Build segment-specific prompts if renderPlan has them
    // Otherwise, use continuation context approach
    const segmentPrompts = renderPlan.segmentPrompts ?? null;

    // Step 1: Initial generation
    const initialPrompt = segmentPrompts?.[0] ?? request.prompt;
    const initialRequest = { ...request, prompt: initialPrompt };

    const initialStart = await this._startSingleShotGeneration(
      initialRequest,
      initialSegment.seconds
    );
    let currentResult = await this._pollUntilComplete(initialStart.id);

    // Step 2+: Extensions with segment-aware prompts
    for (let i = 0; i < extendSegments.length; i++) {
      const segment = extendSegments[i];
      const stepIndex = i + 1;

      // Use segment-specific prompt or add continuation context
      const extendPrompt = segmentPrompts?.[stepIndex]
        ?? this._buildExtensionPrompt(request.prompt, stepIndex, totalSteps);

      const extendStart = await this._startExtensionGeneration(
        { ...request, prompt: extendPrompt },
        currentResult.videoUrl,
        segment.seconds,
        stepIndex
      );

      currentResult = await this._pollUntilComplete(extendStart.id);
    }

    return { ...currentResult, seconds: renderPlan.finalPlannedSeconds };
  }
}
```

---

## Proposed API Payloads (After Fix)

### Initial Call (8s)
```json
{
  "instances": [{
    "prompt": "Create a recruiting video segment for Software Engineer at TechCorp.
This is segment 1 of 3 (8s). This is the OPENING.

Focus on:
Hook: Dynamic opening with company logo...
Proof (start): Begin showing team collaboration..."
  }],
  "parameters": {
    "durationSeconds": 8,
    "aspectRatio": "9:16",
    "generateAudio": true
  }
}
```

### Extension Call 1 (+7s) - DIFFERENT PROMPT
```json
{
  "instances": [{
    "prompt": "Create a recruiting video segment for Software Engineer at TechCorp.
This is segment 2 of 3 (7s). Continue seamlessly from the previous segment.

Focus on:
Proof (continue): Continue showing team collaboration...
Offer: Highlight salary and benefits...

IMPORTANT: Do NOT restart the scene or repeat content.
Continue naturally from where the previous segment ended.",
    "video": { "gcsUri": "gs://bucket/previous-8s-video.mp4" }
  }],
  "parameters": {
    "durationSeconds": 7,
    "storageUri": "gs://bucket/output/"
  }
}
```

### Extension Call 2 (+7s) - FINAL SEGMENT
```json
{
  "instances": [{
    "prompt": "Create a recruiting video segment for Software Engineer at TechCorp.
This is segment 3 of 3 (7s). This is the FINAL segment.

Focus on:
CTA: Apply now button with clear call to action...

IMPORTANT: Do NOT restart the scene or repeat content.
Build to a satisfying conclusion with a strong call to action.",
    "video": { "gcsUri": "gs://bucket/previous-15s-video.mp4" }
  }],
  "parameters": {
    "durationSeconds": 7,
    "storageUri": "gs://bucket/output/"
  }
}
```

---

## Implementation Priority

### Phase 1: Quick Win (Continuation Context)
Add continuation instructions to extension prompts in `veo-client.js`.
- Minimal code change
- Should reduce repetition significantly
- Estimated: 1-2 hours

### Phase 2: Phase Mapping (Better Results)
Map storyboard phases to segments and generate per-segment prompts.
- More complex but produces truly progressive narratives
- Requires changes to manifest-builder or renderer
- Estimated: 4-6 hours

### Phase 3: Storyboard Restructuring (Best Results)
Modify storyboard LLM to generate segment-aware shots with timing.
- Fundamental architectural improvement
- Requires prompt engineering and schema changes
- Estimated: 1-2 days

---

## Testing Checklist

After implementing fixes:

- [ ] Generate a 22s multi-extend video
- [ ] Verify initial segment (0-8s) shows Hook/opening content
- [ ] Verify extension 1 (8-15s) shows progression, not repetition
- [ ] Verify extension 2 (15-22s) shows CTA/conclusion, not repetition
- [ ] Check visual consistency across segments
- [ ] Check audio continuity across segments
- [ ] Compare with pre-fix output to confirm improvement
