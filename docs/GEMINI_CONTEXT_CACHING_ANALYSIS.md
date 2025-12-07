# Gemini Context Caching Implementation Analysis

**Date**: December 3, 2024
**Status**: Infrastructure Ready ✅
**Estimated Cost Savings**: 60-80% reduction on input tokens

---

## Executive Summary

The codebase is **already prepared** for Gemini Context Caching with existing infrastructure for tracking cached tokens, calculating costs, and recording usage. Implementation primarily requires enabling caching in the Gemini adapter and restructuring prompts to separate cacheable context from dynamic inputs.

### Key Findings

- ✅ Usage tracking already supports `cachedTokens` ([llm-usage-ledger.js:167](services/api-gateway/src/services/llm-usage-ledger.js#L167))
- ✅ Pricing already configured at $0.20/M tokens ([pricing-rates.js:44](services/api-gateway/src/config/pricing-rates.js#L44))
- ✅ Cost calculation already includes cached token pricing
- 🎯 **10x cost reduction** on cached input tokens ($2.00 → $0.20 per million)
- 🎯 Estimated **60-80% of input tokens are cacheable** across workflows

---

## Current State Analysis

### 1. LLM Infrastructure Overview

**All 14 tasks use Gemini:**

| Task | Model | Use Case | Max Tokens | Frequency |
|------|-------|----------|------------|-----------|
| `suggest` | gemini-3-pro-preview | Job field suggestions | 8,192 | Every job creation |
| `refine` | gemini-3-pro-preview | Job description refinement | 8,192 | Every job refinement |
| `channels` | gemini-3-pro-preview | Channel recommendations | 8,192 | Every job publish |
| `copilot_agent` | gemini-3-pro-preview | Chat agent | 2,048 | Per chat interaction |
| `company_intel` | gemini-3-pro-preview | Company research | 4,096 | Once per company |
| `asset_master` | gemini-3-pro-preview | Asset generation | 8,192 | Per channel selected |
| `asset_channel_batch` | gemini-3-pro-preview | Batch asset generation | 8,192 | Per batch request |
| `asset_adapt` | gemini-3-pro-preview | Platform adaptation | 8,192 | Per asset variant |
| `video_storyboard` | gemini-3-pro-preview | Video storyboarding | 8,192 | Per video |
| `video_caption` | gemini-3-pro-preview | Video captions | 2,000 | Per video |
| `video_compliance` | gemini-3-pro-preview | Compliance checking | 2,000 | Per video |
| `image_prompt_generation` | gemini-3-pro-preview | Image prompt generation | 2,048 | Per image |
| `image_caption` | gemini-3-pro-preview | Image captions | 800 | Per image |
| `image_generation` | gemini-3-pro-image-preview | Image generation | 50 | Per image |

**Source**: [llm-config.js](services/api-gateway/src/config/llm-config.js), [tasks.js](services/api-gateway/src/llm/tasks.js)

### 2. Current Pricing (Without Caching)

From [pricing-rates.js:38-58](services/api-gateway/src/config/pricing-rates.js#L38-L58):

```javascript
"gemini-3-pro-preview": {
  promptTokenTiers: [
    {
      maxPromptTokens: 200_000,
      inputUsdPerMillionTokens: 2,      // ← Current cost
      outputUsdPerMillionTokens: 12,
      cachedUsdPerMillionTokens: 0.20   // ← 10x cheaper!
    }
  ]
}
```

**Cache Storage Cost**: $4.50 per million tokens per hour ([pricing-rates.js:34](services/api-gateway/src/config/pricing-rates.js#L34))

### 3. Existing Infrastructure (Ready!)

#### Usage Tracking Already Supports Caching

[llm-usage-ledger.js:166-168](services/api-gateway/src/services/llm-usage-ledger.js#L166-L168):
```javascript
const cachedTokens = normalizeTokens(
  usageMetrics.cachedTokens ?? metadata?.cachedTokens ?? metadata?.cachedPromptTokens
);
```

#### Cost Calculation Already Configured

[llm-usage-ledger.js:285-295](services/api-gateway/src/services/llm-usage-ledger.js#L285-L295):
```javascript
const textPricing = resolveTextPricing(provider, model, { promptTokens: inputTokens });
inputCostPerMillionUsd = textPricing.inputUsdPerMillionTokens ?? 0;
outputCostPerMillionUsd = textPricing.outputUsdPerMillionTokens ?? 0;
cachedInputCostPerMillionUsd =
  textPricing.cachedUsdPerMillionTokens ?? inputCostPerMillionUsd ?? 0;

const inputCost = (inputCostPerMillionUsd * inputTokens) / MILLION;
const outputCost = (outputCostPerMillionUsd * billableOutputTokens) / MILLION;
const cachedCost = (cachedInputCostPerMillionUsd * cachedTokens) / MILLION;
estimatedCostUsd = inputCost + outputCost + cachedCost;
```

#### Database Schema Ready

Entry payload already includes ([llm-usage-ledger.js:337](services/api-gateway/src/services/llm-usage-ledger.js#L337)):
```javascript
entryPayload.cachedTokens = cachedTokens;
entryPayload.cachedInputCostPerMillionUsd = cachedInputCostPerMillionUsd;
```

---

## Context Caching Opportunity Map

### High-Value Cacheable Context

#### 1. **JOB_FIELD_GUIDE** (Static Schema)

**Location**: [llm/domain/job-fields.js](services/api-gateway/src/llm/domain/job-fields.js)

**Used In**:
- `suggest` ([prompts/suggest.js](services/api-gateway/src/llm/prompts/suggest.js))
- `refine` ([prompts/refine.js:73](services/api-gateway/src/llm/prompts/refine.js#L73))
- `channels` ([prompts/channels.js](services/api-gateway/src/llm/prompts/channels.js))

**Size**: ~1,500 tokens (150+ lines of field definitions)

**Characteristics**:
- ✅ Completely static (never changes)
- ✅ Used in every job creation/refinement
- ✅ Large schema (roleTitle, location, jobDescription, coreDuties, mustHaves, benefits, etc.)

**Frequency**: 2-3 times per job (suggest → refine → channels)

**Savings Potential**:
- Without cache: 1,500 tokens × $2.00/M = $0.003 per call
- With cache: 1,500 tokens × $0.20/M = $0.0003 per call
- **Savings**: $0.0027 per cached call × 2 additional calls = **$0.0054 per job**

---

#### 2. **Job Context** (`jobSnapshot`)

**Used In**:
- `refine` ([prompts/refine.js:74](services/api-gateway/src/llm/prompts/refine.js#L74))
- `asset_master` ([prompts/assets.js:86](services/api-gateway/src/llm/prompts/assets.js#L86))
- `video_storyboard` ([prompts/video-storyboard.js:96](services/api-gateway/src/llm/prompts/video-storyboard.js#L96))
- `video_caption` ([prompts/video-caption.js](services/api-gateway/src/llm/prompts/video-caption.js))
- `video_compliance` ([prompts/video-compliance.js](services/api-gateway/src/llm/prompts/video-compliance.js))
- `channels` ([prompts/channels.js](services/api-gateway/src/llm/prompts/channels.js))

**Example Structure**:
```javascript
{
  roleTitle: "Senior Backend Engineer",
  companyName: "Botson Labs",
  location: "Tel Aviv, Israel",
  industry: "Artificial Intelligence / SaaS",
  seniorityLevel: "senior",
  employmentType: "full_time",
  workModel: "hybrid",
  jobDescription: "Lead the team delivering AI-assisted hiring tools...",
  coreDuties: ["Design scalable APIs", "Partner with product"],
  mustHaves: ["3+ years with Node.js", "Experience with Firestore"],
  benefits: ["Flexible hybrid schedule", "Equity refresh annually"],
  salary: "120k-180k",
  currency: "USD"
}
```

**Size**: ~2,000-3,000 tokens (depending on job complexity)

**Characteristics**:
- ✅ Changes only when job is edited
- ✅ Reused across ALL generation tasks for a job
- ✅ Large context (10-15 fields with arrays)

**Frequency**: 6+ times per job workflow (refine → assets → videos → captions)

**Savings Potential**:
- Without cache: 2,500 tokens × $2.00/M = $0.005 per call
- With cache: 2,500 tokens × $0.20/M = $0.0005 per call
- **Savings**: $0.0045 per cached call × 5 additional calls = **$0.0225 per job**

**Cache Invalidation**: Update cache when job is edited (detect via `updatedAt` timestamp)

---

#### 3. **Company Context** (`companyContext`, `companySnapshot`)

**Used In**:
- `refine` ([prompts/refine.js:9-11](services/api-gateway/src/llm/prompts/refine.js#L9-L11))
- `asset_master` ([prompts/assets.js](services/api-gateway/src/llm/prompts/assets.js))
- `video_storyboard` ([prompts/video-storyboard.js:115-122](services/api-gateway/src/llm/prompts/video-storyboard.js#L115-L122))
- `company_intel` ([prompts/company-intel.js:60](services/api-gateway/src/llm/prompts/company-intel.js#L60))

**Example Structure** ([company-intel.js:3-29](services/api-gateway/src/llm/prompts/company-intel.js#L3-L29)):
```javascript
{
  id: "company123",
  name: "Botson Labs",
  primaryDomain: "botsonlabs.com",
  website: "https://botsonlabs.com",
  companyType: "company",
  industry: "Artificial Intelligence",
  employeeCountBucket: "51-200",
  hqCountry: "Israel",
  hqCity: "Tel Aviv",
  tagline: "AI-powered recruiting OS",
  description: "We build recruiting tools for modern teams...",
  toneOfVoice: "professional, tech-forward, accessible",
  brand: {
    logoUrl: "https://...",
    primaryColor: "#3B82F6",
    fontFamilyPrimary: "Inter"
  },
  socials: {
    linkedin: "https://linkedin.com/company/botsonlabs",
    twitter: "https://twitter.com/botsonlabs"
  }
}
```

**Size**: ~1,500-2,000 tokens

**Characteristics**:
- ✅ Changes infrequently (only on company profile updates)
- ✅ Shared across ALL jobs for a company
- ✅ Large profile with branding, tone, social links

**Frequency**: Multiple times per company (across all jobs)

**Savings Potential**:
- Without cache: 1,800 tokens × $2.00/M = $0.0036 per call
- With cache: 1,800 tokens × $0.20/M = $0.00036 per call
- **Savings**: $0.00324 per cached call × 10+ jobs per company = **$0.0324+ per company**

**Cache Invalidation**: Update cache when company profile is edited

---

#### 4. **Channel Metadata & Specs**

**Used In**:
- `asset_master` ([prompts/assets.js:44-53](services/api-gateway/src/llm/prompts/assets.js#L44-L53))
- `video_storyboard` ([prompts/video-storyboard.js:85-95](services/api-gateway/src/llm/prompts/video-storyboard.js#L85-L95))

**Example Structure**:
```javascript
{
  id: "TIKTOK_LEAD",
  name: "TikTok",
  placement: "Lead Generation",
  medium: "video",
  duration_window: "15-30 seconds",
  aspect_ratio: "9:16 (vertical)",
  captioning: "Required, burned-in",
  safe_zones: "Top 12% and bottom 20% for UI",
  compliance_notes: "No discriminatory language"
}
```

**Size**: ~500-800 tokens per channel

**Characteristics**:
- ✅ Completely static (never changes)
- ✅ Reused for every asset generated for that channel
- ✅ Detailed specs (duration, aspect ratio, safe zones, compliance)

**Frequency**: Every asset generation for the channel

**Savings Potential**:
- Without cache: 650 tokens × $2.00/M = $0.0013 per call
- With cache: 650 tokens × $0.20/M = $0.00013 per call
- **Savings**: $0.00117 per cached call

---

### Context Reuse Patterns

#### Pattern 1: Job Creation Workflow

```
User creates job
  ↓
1. suggest (JOB_FIELD_GUIDE) ← CACHE THIS
  ↓
2. refine (JOB_FIELD_GUIDE + company + job) ← REUSE CACHE + ADD job
  ↓
3. channels (job + company) ← REUSE job + company cache
  ↓
4. asset_master (job + company + channel) ← REUSE job + company cache
  ↓
5. video_storyboard (job + company + channel + branding) ← REUSE all
  ↓
6. video_caption (job + video manifest) ← REUSE job cache
  ↓
7. video_compliance (job + video manifest) ← REUSE job cache
```

**Total Cacheable Tokens**: ~5,000-7,000 tokens across 7 calls
**Without Caching**: 6,000 × $2.00/M = $0.012
**With Caching**: 1st call: 6,000 × $2.00/M = $0.012, Next 6 calls: 6,000 × $0.20/M = $0.0012
**Savings**: **$0.0108 per job workflow (90% reduction!)**

#### Pattern 2: Multi-Channel Asset Generation

```
User selects 3 channels (LinkedIn, TikTok, Instagram)
  ↓
For each channel:
  - asset_master (job + company + channel) ← job + company cached
  - video_storyboard (job + company + channel) ← job + company cached
  - asset_adapt (job + company + channel) ← job + company cached
```

**3 channels × 3 tasks = 9 LLM calls**
**Cacheable Context**: job (2,500 tokens) + company (1,800 tokens) = 4,300 tokens
**Savings**: 4,300 tokens × ($2.00 - $0.20)/M × 9 calls = **$0.069 per multi-channel generation**

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1) 🎯 HIGH PRIORITY

#### Goal
Enable basic context caching in Gemini adapter and implement caching for highest-impact tasks.

#### Tasks

**1. Update GeminiAdapter to Support Context Caching**

File: [services/api-gateway/src/llm/providers/gemini-adapter.js](services/api-gateway/src/llm/providers/gemini-adapter.js)

**Current `invoke()` method** ([gemini-adapter.js:139-148](services/api-gateway/src/llm/providers/gemini-adapter.js#L139-L148)):
```javascript
async invoke({
  model,
  system,
  user,
  mode = "text",
  temperature = 0.2,
  maxTokens = 800,
  taskType = null,
  route = null,
}) {
  // ... existing implementation
}
```

**Add new parameters**:
```javascript
async invoke({
  model,
  system,
  user,
  mode = "text",
  temperature = 0.2,
  maxTokens = 800,
  taskType = null,
  route = null,
  cacheableContext = null,  // ← NEW: Prefix to cache
  cacheTtlSeconds = 300      // ← NEW: Cache duration (5 min default)
}) {
  // ... existing setup ...

  let contents;
  if (cacheableContext) {
    // Use Google GenAI caching
    const cacheablePrompt = typeof cacheableContext === 'string'
      ? cacheableContext
      : JSON.stringify(cacheableContext, null, 2);

    contents = [
      {
        role: "user",
        parts: [{ text: cacheablePrompt }],
        cache: true,  // Mark for caching
        cacheTtl: cacheTtlSeconds
      },
      {
        role: "user",
        parts: [{ text: userText }]
      }
    ];
  } else {
    contents = userText || systemText;
  }

  // ... rest of implementation ...
}
```

**2. Update Orchestrator to Pass Caching Config**

File: [services/api-gateway/src/llm/orchestrator.js:34-74](services/api-gateway/src/llm/orchestrator.js#L34-L74)

**Add to task config**:
```javascript
const options = {
  model: selection.model,
  system: task.system,
  user: userPrompt,
  mode: task.mode ?? "text",
  temperature: task.temperature ?? 0.2,
  maxTokens: this.resolveValue(task.maxTokens, selection.provider),
  taskType: taskName,
  route: requestRoute,
  // ↓ NEW: Pass caching config if task supports it
  cacheableContext: task.cacheableContextBuilder?.(context) ?? null,
  cacheTtlSeconds: task.cacheTtlSeconds ?? 300
};
```

**3. Implement Caching in High-Impact Tasks**

##### Task: `refine` (Job Refinement)

File: [services/api-gateway/src/llm/tasks.js:65-76](services/api-gateway/src/llm/tasks.js#L65-L76)

**Before**:
```javascript
refine: {
  system: "You are a senior hiring editor...",
  builder: buildRefinementInstructions,
  parser: parseRefinementResult,
  mode: "json",
  temperature: 0.15,
  maxTokens: { default: 900, gemini: 8192 },
  retries: 2,
  strictOnRetry: true,
  previewLogger: logRefinementPreview,
}
```

**After**:
```javascript
refine: {
  system: "You are a senior hiring editor...",
  builder: buildRefinementInstructions,
  cacheableContextBuilder: (context) => {
    // Extract cacheable static context
    return {
      jobSchema: JOB_FIELD_GUIDE,
      companyContext: context.companyContext ?? "Use a modern, professional tone."
    };
  },
  parser: parseRefinementResult,
  mode: "json",
  temperature: 0.15,
  maxTokens: { default: 900, gemini: 8192 },
  cacheTtlSeconds: 600,  // Cache for 10 minutes
  retries: 2,
  strictOnRetry: true,
  previewLogger: logRefinementPreview,
}
```

**Update builder** ([prompts/refine.js:4-85](services/api-gateway/src/llm/prompts/refine.js#L4-L85)):
```javascript
export function buildRefinementInstructions(context = {}) {
  // Don't include jobSchema and companyContext in dynamic prompt
  // They're now in cacheableContext

  const payloadObject = {
    role: "You are a Conversion Copywriter and Recruitment SEO Strategist.",
    mission: "Take the user's rough job draft and transform it...",

    // Remove: jobSchema: JOB_FIELD_GUIDE,
    // Remove: context_layer.company_profile: companyContextStr,

    jobDraft: context.jobDraft ?? {},
    attempt: context.attempt ?? 0,
    retryGuidance: strictNotes,
  };

  return JSON.stringify(payloadObject, null, 2);
}
```

##### Task: `video_storyboard` (Video Generation)

File: [services/api-gateway/src/llm/tasks.js:136-147](services/api-gateway/src/llm/tasks.js#L136-L147)

**Add caching**:
```javascript
video_storyboard: {
  system: "You craft structured storyboards...",
  builder: buildVideoStoryboardPrompt,
  cacheableContextBuilder: (context) => {
    return {
      job_context: buildJobContext(context.jobSnapshot ?? {}),
      company_branding: buildBrandingContext(context.branding ?? {}),
      channel_spec: {
        id: context.spec?.channelId,
        duration: context.spec?.duration,
        aspectRatio: context.spec?.aspectRatio,
        safeZones: context.spec?.safeZones,
        compliance: context.spec?.complianceNotes
      }
    };
  },
  parser: parseVideoStoryboardResult,
  mode: "json",
  temperature: 0.25,
  maxTokens: { default: 900, gemini: 8192 },
  cacheTtlSeconds: 600,  // Cache for 10 minutes
  retries: 2,
  strictOnRetry: true,
  previewLogger: logVideoPreview,
}
```

**4. Add Cache Metrics to Usage Logging**

The infrastructure already tracks `cachedTokens`! Just ensure the Gemini response includes this metadata.

Update [gemini-adapter.js:460-488](services/api-gateway/src/llm/providers/gemini-adapter.js#L460-L488) to extract cached token count:

```javascript
const usage = response?.usageMetadata;
const thoughtTokens = usage?.thoughtsTokenCount ?? 0;
const candidateTokens = usage?.candidatesTokenCount ?? null;
const cachedPromptTokens = usage?.cachedContentTokenCount ?? 0;  // ← NEW!

const metadata = usage
  ? {
      promptTokens: usage.promptTokenCount ?? null,
      responseTokens: responseTokenSum,
      thoughtsTokens: thoughtTokens || null,
      totalTokens: usage.totalTokenCount ?? null,
      cachedTokens: cachedPromptTokens || null,  // ← NEW!
      finishReason: response?.candidates?.[0]?.finishReason ?? null,
      searchQueries: searchQueryCount
    }
  : undefined;
```

The existing usage tracking will automatically:
- Record cached tokens to Firestore/BigQuery ✅
- Calculate cost savings ✅
- Update user credit balance ✅

**Estimated Impact**:
- ✅ Enable caching infrastructure
- 💰 Save ~$0.02 per job workflow
- 📊 Track cache hit rates in BigQuery
- ⏱️ 3-5 days implementation time

---

### Phase 2: Optimization (Week 2) 💡 MEDIUM PRIORITY

#### Goal
Extend caching to asset generation tasks and implement cache invalidation logic.

#### Tasks

**1. Implement Caching in Asset Generation Tasks**

Apply caching to:
- `asset_master` ([tasks.js:100-111](services/api-gateway/src/llm/tasks.js#L100-L111))
- `asset_channel_batch` ([tasks.js:112-123](services/api-gateway/src/llm/tasks.js#L112-L123))
- `asset_adapt` ([tasks.js:124-135](services/api-gateway/src/llm/tasks.js#L124-L135))

**Cache key**: `job:${jobId}:company:${companyId}`

**2. Implement Cache Invalidation**

Create a cache invalidation service:

```javascript
// services/api-gateway/src/services/cache-invalidation.js

export async function invalidateJobCache(jobId) {
  // Called when job is updated
  // Clear cached contexts for this job
  await geminiAdapter.clearCache({ jobId });
}

export async function invalidateCompanyCache(companyId) {
  // Called when company profile is updated
  // Clear cached contexts for this company
  await geminiAdapter.clearCache({ companyId });
}
```

**Hook into update endpoints**:
- [routes/wizard.js](services/api-gateway/src/routes/wizard.js) - Job updates
- Company profile update endpoint

**3. Add Cache Hit/Miss Metrics**

Extend [llm/logger.js](services/api-gateway/src/llm/logger.js) to track:
```javascript
llmLogger.info({
  taskType,
  jobId,
  cacheHit: cachedTokens > 0,
  cachedTokens,
  freshTokens: inputTokens,
  cacheRatio: cachedTokens / (cachedTokens + inputTokens),
  savingsUsd: (cachedTokens * (2.00 - 0.20)) / MILLION
}, "llm.cache.stats");
```

**Estimated Impact**:
- 💰 Additional $0.03-0.05 per job savings
- 🔄 Proper cache lifecycle management
- ⏱️ 5-7 days implementation time

---

### Phase 3: Advanced Features (Week 3) 🚀 LOW PRIORITY

#### Goal
Implement cache warmup, shared company context across jobs, and advanced monitoring.

#### Tasks

**1. Implement Cache Warmup**

Pre-cache common contexts when job is created:

```javascript
// services/api-gateway/src/services/cache-warmup.js

export async function warmupJobCache(jobId, companyId) {
  // Load job and company data
  const job = await firestore.getDocument("jobs", jobId);
  const company = await firestore.getDocument("companies", companyId);

  // Pre-cache contexts for upcoming tasks
  await Promise.all([
    geminiAdapter.warmCache({
      key: `job:${jobId}:schema`,
      context: { jobSchema: JOB_FIELD_GUIDE },
      ttl: 3600
    }),
    geminiAdapter.warmCache({
      key: `job:${jobId}:context`,
      context: buildJobContext(job),
      ttl: 600
    }),
    geminiAdapter.warmCache({
      key: `company:${companyId}:context`,
      context: buildCompanyContext(company),
      ttl: 3600
    })
  ]);
}
```

Call after job creation in [routes/wizard.js](services/api-gateway/src/routes/wizard.js).

**2. Shared Company Context Across Jobs**

Use company-level cache keys that persist across multiple jobs:

```javascript
cacheKey: `company:${companyId}:profile:v1`
ttl: 3600  // 1 hour (shared across all jobs for this company)
```

**3. Add Cache Monitoring Dashboard**

Query BigQuery for cache metrics:
```sql
SELECT
  DATE(timestamp) as date,
  taskType,
  COUNT(*) as total_calls,
  SUM(cachedTokens) as total_cached_tokens,
  SUM(inputTokens) as total_input_tokens,
  AVG(cachedTokens / NULLIF(inputTokens + cachedTokens, 0)) as avg_cache_ratio,
  SUM(estimatedCostUsd) as total_cost_usd,
  SUM((cachedTokens * (2.00 - 0.20)) / 1000000) as savings_usd
FROM `LLMsUsage`
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
  AND provider = 'gemini'
GROUP BY date, taskType
ORDER BY date DESC, total_calls DESC
```

**Estimated Impact**:
- 💰 Additional 10-15% savings via cache warmup
- 📊 Full visibility into cache performance
- ⏱️ 5-7 days implementation time

---

## Cost-Benefit Analysis

### Current State (No Caching)

**Example Job Workflow**:
1. Suggest: 2,000 input tokens
2. Refine: 3,500 input tokens (JOB_FIELD_GUIDE + company + job)
3. Channels: 2,500 input tokens (job + company)
4. Asset Master: 3,000 input tokens (job + company + channel)
5. Video Storyboard: 3,500 input tokens (job + company + channel + branding)
6. Video Caption: 2,500 input tokens (job + video)
7. Video Compliance: 2,000 input tokens (job + video)

**Total Input Tokens**: 19,000 tokens
**Cost**: 19,000 × $2.00/M = **$0.038**

### With Context Caching (Phase 1)

**Cacheable Context** (first call):
- JOB_FIELD_GUIDE: 1,500 tokens
- Company context: 1,800 tokens
- Job context: 2,500 tokens
- Channel specs: 700 tokens
- **Total**: 6,500 tokens → **Cache for subsequent calls**

**Costs**:
1. Suggest: 2,000 × $2.00/M = $0.004
2. Refine: (1,000 new + 3,500 cached × $0.20/M) = $0.002 + $0.0007 = $0.0027
3. Channels: (500 new + 2,500 cached × $0.20/M) = $0.001 + $0.0005 = $0.0015
4. Asset Master: (500 new + 3,000 cached × $0.20/M) = $0.001 + $0.0006 = $0.0016
5. Video Storyboard: (800 new + 3,500 cached × $0.20/M) = $0.0016 + $0.0007 = $0.0023
6. Video Caption: (500 new + 2,500 cached × $0.20/M) = $0.001 + $0.0005 = $0.0015
7. Video Compliance: (500 new + 2,000 cached × $0.20/M) = $0.001 + $0.0004 = $0.0014

**Total Cost**: **$0.015**
**Savings**: $0.038 - $0.015 = **$0.023 per job (60% reduction)**

**Cache Storage Cost**: 6,500 tokens × $4.50/M/hour × (10 minutes / 60) = **$0.0000488** (negligible)

### ROI Calculation

**Assumptions**:
- 1,000 jobs created per month
- Average 7 LLM calls per job workflow

**Monthly Savings**:
- **Without caching**: 1,000 jobs × $0.038 = $38.00/month
- **With caching**: 1,000 jobs × $0.015 = $15.00/month
- **Net savings**: **$23.00/month** (60% reduction)

**Annual Savings**: **$276/year**

**Implementation Cost**:
- Phase 1: ~40 hours of dev time
- Phase 2: ~30 hours
- Phase 3: ~30 hours
- **Total**: ~100 hours

**Break-even**: Immediate (savings start from first deployment)

---

## Risk Assessment & Mitigation

### Risk 1: Cache Invalidation Complexity

**Risk**: Stale cached data if job/company updated but cache not invalidated

**Mitigation**:
- Implement cache TTLs (5-10 minutes default)
- Hook into update endpoints to explicitly invalidate
- Add cache versioning (`v1`, `v2`) in cache keys
- Monitor cache hit rates for unexpected patterns

**Severity**: Medium
**Likelihood**: Medium

### Risk 2: Increased Latency on First Call

**Risk**: First call with caching may be slightly slower due to cache setup

**Mitigation**:
- Implement cache warmup during job creation (Phase 3)
- Set appropriate TTLs to keep cache warm
- Monitor P50/P95/P99 latencies in production

**Severity**: Low
**Likelihood**: High

### Risk 3: Cache Storage Costs

**Risk**: Cache storage costs ($4.50/M tokens/hour) could offset savings if TTLs too long

**Mitigation**:
- Start with conservative 5-10 minute TTLs
- Monitor storage costs in BigQuery
- Adjust TTLs based on actual usage patterns
- Consider: storage cost < 1% of token savings

**Severity**: Low
**Likelihood**: Low

### Risk 4: API Breaking Changes

**Risk**: Gemini API context caching feature changes or becomes unavailable

**Mitigation**:
- Graceful fallback: if caching fails, proceed without cache
- Feature flag for caching: `ENABLE_CONTEXT_CACHING=true`
- Monitor Gemini API changelog

**Severity**: Medium
**Likelihood**: Low

---

## Monitoring & Success Metrics

### Key Metrics to Track

**1. Cost Metrics** (From BigQuery):
```sql
-- Daily cost savings from caching
SELECT
  DATE(timestamp) as date,
  SUM(inputTokens) as total_input_tokens,
  SUM(cachedTokens) as total_cached_tokens,
  SUM(estimatedCostUsd) as actual_cost_usd,
  SUM(inputTokens * 2.00 / 1000000) + SUM(cachedTokens * 0.20 / 1000000) as cost_without_cache_usd,
  (SUM(inputTokens * 2.00 / 1000000) + SUM(cachedTokens * 0.20 / 1000000)) - SUM(estimatedCostUsd) as savings_usd
FROM `LLMsUsage`
WHERE provider = 'gemini'
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY date
ORDER BY date DESC
```

**2. Cache Performance Metrics**:
- **Cache hit rate**: `cachedTokens / (inputTokens + cachedTokens)`
- **Average cached tokens per call**: `AVG(cachedTokens)`
- **Cache efficiency**: `SUM(cachedTokens) / SUM(totalTokens)`

**3. Quality Metrics**:
- Response quality (user ratings) before/after caching
- Error rates for cached vs non-cached calls
- Output consistency between cached and non-cached calls

**4. Performance Metrics**:
- P50/P95/P99 latency for cached vs non-cached calls
- Cache warmup success rate
- Cache invalidation frequency

### Success Criteria

**Phase 1 Success**:
- ✅ Cache hit rate > 50% for refine/video tasks
- ✅ Cost reduction > 40% on cached calls
- ✅ Zero increase in error rates
- ✅ Latency increase < 100ms on first call

**Phase 2 Success**:
- ✅ Cache hit rate > 70% across all tasks
- ✅ Cost reduction > 60% overall
- ✅ Cache invalidation working correctly (no stale data issues)

**Phase 3 Success**:
- ✅ Cache warmup reduces first-call latency by > 50%
- ✅ Company-level caching provides 80%+ hit rate for multi-job workflows
- ✅ Full visibility into cache performance via dashboard

---

## Next Steps

### Immediate Actions (This Week)

1. ✅ **Review this analysis** with engineering team
2. 🔍 **Validate token estimates** with production logs
3. 🧪 **Set up staging environment** for testing
4. 📋 **Create implementation tickets** for Phase 1

### Phase 1 Implementation Checklist

- [ ] Update `GeminiAdapter.invoke()` to support `cacheableContext` parameter
- [ ] Update `LlmOrchestrator.run()` to pass caching config
- [ ] Add `cacheableContextBuilder` to `refine` task
- [ ] Add `cacheableContextBuilder` to `video_storyboard` task
- [ ] Update Gemini response parsing to extract `cachedContentTokenCount`
- [ ] Verify cached token tracking in Firestore/BigQuery
- [ ] Deploy to staging and run E2E tests
- [ ] Monitor cache metrics for 48 hours in staging
- [ ] Deploy to production with feature flag
- [ ] Monitor for 1 week, validate savings

### Questions for Discussion

1. **Cache TTL Strategy**: Start with 5 minutes or 10 minutes? Should we vary by task type?
2. **Cache Invalidation**: Manual webhook or automatic detection via `updatedAt` timestamps?
3. **Feature Flag**: Should caching be opt-in or opt-out initially?
4. **Monitoring**: Do we need real-time alerting if cache hit rate drops below threshold?

---

## Appendix: Code Examples

### Example 1: Refine Task with Caching

**Before**:
```javascript
// Task configuration
refine: {
  system: "You are a senior hiring editor...",
  builder: buildRefinementInstructions,  // Includes JOB_FIELD_GUIDE
  parser: parseRefinementResult,
  mode: "json",
  temperature: 0.15,
  maxTokens: { default: 900, gemini: 8192 }
}

// Prompt builder
export function buildRefinementInstructions(context) {
  return JSON.stringify({
    role: "...",
    jobSchema: JOB_FIELD_GUIDE,  // ← 1,500 tokens
    companyContext: context.companyContext,  // ← 1,800 tokens
    jobDraft: context.jobDraft  // ← 500 tokens (dynamic)
  }, null, 2);
}
```

**After**:
```javascript
// Task configuration
refine: {
  system: "You are a senior hiring editor...",
  builder: buildRefinementInstructions,
  cacheableContextBuilder: (context) => ({
    jobSchema: JOB_FIELD_GUIDE,  // ← Cached!
    companyContext: context.companyContext  // ← Cached!
  }),
  parser: parseRefinementResult,
  mode: "json",
  temperature: 0.15,
  maxTokens: { default: 900, gemini: 8192 },
  cacheTtlSeconds: 600  // 10 minutes
}

// Prompt builder (only dynamic content)
export function buildRefinementInstructions(context) {
  return JSON.stringify({
    role: "...",
    // jobSchema and companyContext moved to cacheableContext
    jobDraft: context.jobDraft  // ← Only this is sent fresh
  }, null, 2);
}
```

**Result**:
- First call: 3,800 tokens × $2.00/M = $0.0076
- Subsequent calls: 500 tokens × $2.00/M + 3,300 cached × $0.20/M = $0.001 + $0.00066 = **$0.00166**
- **Savings**: $0.00594 per cached call (78% reduction)

### Example 2: Video Storyboard with Caching

**Before**:
```javascript
export function buildVideoStoryboardPrompt({ jobSnapshot, spec, branding }) {
  return JSON.stringify({
    role: "You craft short-form recruiting video storyboards...",
    job_context: buildJobContext(jobSnapshot),  // ← 2,500 tokens
    channel: {
      id: spec.channelId,
      duration: spec.duration,  // ← 700 tokens
      aspectRatio: spec.aspectRatio,
      safeZones: spec.safeZones
    },
    branding_context: buildBrandingContext(branding)  // ← 800 tokens
  }, null, 2);
}
```

**After**:
```javascript
// Task config
video_storyboard: {
  system: "You craft structured storyboards...",
  builder: buildVideoStoryboardPrompt,
  cacheableContextBuilder: (context) => ({
    job_context: buildJobContext(context.jobSnapshot),  // ← Cached!
    channel: {
      id: context.spec.channelId,
      duration: context.spec.duration,  // ← Cached!
      aspectRatio: context.spec.aspectRatio,
      safeZones: context.spec.safeZones
    },
    branding_context: buildBrandingContext(context.branding)  // ← Cached!
  }),
  parser: parseVideoStoryboardResult,
  mode: "json",
  cacheTtlSeconds: 600
}

// Prompt builder (only dynamic/variable content)
export function buildVideoStoryboardPrompt({ jobSnapshot, spec, branding }) {
  return JSON.stringify({
    role: "You craft short-form recruiting video storyboards...",
    // job_context, channel, branding moved to cacheableContext
    // Only include truly dynamic fields here (if any)
  }, null, 2);
}
```

**Result**:
- First call: 4,000 tokens × $2.00/M = $0.008
- Subsequent calls: 4,000 cached × $0.20/M = **$0.0008**
- **Savings**: $0.0072 per cached call (90% reduction)

---

## References

### Gemini API Documentation
- [Context Caching Guide](https://ai.google.dev/gemini-api/docs/caching)
- [Pricing Details](https://ai.google.dev/pricing)
- [Token Usage Best Practices](https://ai.google.dev/gemini-api/docs/tokens)

### Internal Documentation
- [Video Generation Feature](docs/VIDEO_GENERATION_FEATURE.md)
- [Architecture Diagram](docs/ARCHITECTURE_DIAGRAM.md)
- [System Overview](docs/SYSTEM_OVERVIEW.md)
- [LLM Usage Tracking](docs/llm-usage-tracking.md)

### Key Files Referenced
- [gemini-adapter.js](services/api-gateway/src/llm/providers/gemini-adapter.js) - Gemini API wrapper
- [llm-usage-ledger.js](services/api-gateway/src/services/llm-usage-ledger.js) - Usage tracking & cost calculation
- [pricing-rates.js](services/api-gateway/src/config/pricing-rates.js) - Rate card configuration
- [tasks.js](services/api-gateway/src/llm/tasks.js) - Task registry
- [orchestrator.js](services/api-gateway/src/llm/orchestrator.js) - LLM orchestration layer

---

**Document Version**: 1.0
**Last Updated**: December 3, 2024
**Author**: Claude Code Analysis
**Status**: Ready for Review ✅
