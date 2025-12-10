# Data Model Reference

This document describes the Firestore collections and BigQuery tables used by the Wizard Recruiting OS.

---

## Firestore Collections

### Core Domain

#### `jobs`
**Purpose**: Job postings created through the wizard
**Primary Key**: `job_{uuid}`
**Key Fields**:
- `userId` - Owner user ID
- `companyId` - Associated company
- `intake` - Form data (title, location, description, etc.)
- `step` - Current wizard step
- `state` - Workflow state (REQUIRED_IN_PROGRESS, OPTIONAL_IN_PROGRESS, etc.)

**Repository**: [job-repository.js](../services/api-gateway/src/services/repositories/job-repository.js)

---

#### `companies`
**Purpose**: Company profiles with enrichment data
**Primary Key**: `company_{uuid}`
**Key Fields**:
- `name` - Company name
- `primaryDomain` - Main website domain
- `createdByUserId` - User who created it
- `enrichment` - LLM-generated intelligence data
- `branding` - Logo, colors, fonts

**Repository**: [company-repository.js](../services/api-gateway/src/services/repositories/company-repository.js)

---

#### `users`
**Purpose**: User accounts and profiles
**Primary Key**: `{uuid}`
**Key Fields**:
- `auth` - Provider, email, roles
- `profile` - Name, company, timezone
- `plan` - Subscription tier
- `credits` - Balance, reserved, lifetime used
- `usage` - Jobs created, assets generated

**Repository**: [user-repository.js](../services/api-gateway/src/services/repositories/user-repository.js)

---

### Wizard Flow

#### `jobSuggestions`
**Purpose**: LLM-generated field suggestions for job form
**Primary Key**: `{jobId}`
**Key Fields**:
- `candidates` - Array of suggestions per field
- `autofillCandidates` - Auto-fill recommendations
- `status` - success/failure

**Repository**: [suggestion-repository.js](../services/api-gateway/src/services/repositories/suggestion-repository.js)

---

#### `jobRefinements`
**Purpose**: LLM-refined job descriptions
**Primary Key**: `{jobId}`
**Key Fields**:
- `refinedJob` - Enhanced job object
- `previousVersion` - Before refinement
- `timestamp`

**Repository**: [refinement-repository.js](../services/api-gateway/src/services/repositories/refinement-repository.js)

---

#### `jobChannelRecommendations`
**Purpose**: Recommended publishing channels
**Primary Key**: `{jobId}`
**Key Fields**:
- `recommendations` - Array of channel suggestions
- `selectedChannels` - User selections
- `status`

**Repository**: [channel-repository.js](../services/api-gateway/src/services/repositories/channel-repository.js)

---

#### `jobFinalJobs`
**Purpose**: Finalized job ready for publishing
**Primary Key**: `{jobId}`
**Key Fields**:
- `title`, `description` - Final content
- `requirements`, `benefits` - Structured sections
- `approvedAt`

**Repository**: [final-job-repository.js](../services/api-gateway/src/services/repositories/final-job-repository.js)

---

### Assets

#### `jobAssets`
**Purpose**: Generated marketing assets (text, posts)
**Primary Key**: Auto-generated
**Key Fields**:
- `jobId` - Parent job
- `formatId` - Asset type (LINKEDIN_POST, etc.)
- `channelId` - Target channel
- `content` - Generated content

**Repository**: [asset-repository.js](../services/api-gateway/src/services/repositories/asset-repository.js)

---

#### `jobImages` (Hero Images)
**Purpose**: AI-generated hero images
**Primary Key**: `{jobId}`
**Key Fields**:
- `status` - pending/generating/ready/failed
- `imageUrl` - Generated image URL
- `prompt` - Generation prompt
- `caption` - Alt text

**Repository**: [hero-image-repository.js](../services/api-gateway/src/services/repositories/hero-image-repository.js)

---

#### `videoLibraryItems`
**Purpose**: AI-generated video content
**Primary Key**: Auto-generated
**Key Fields**:
- `jobId` - Parent job
- `activeManifest` - Current storyboard
- `renderTask` - Rendering status and result
- `status` - draft/rendering/ready/failed

**Repository**: [video/service.js](../services/api-gateway/src/video/service.js) (inline)

---

### Chat & Interview

#### `wizardCopilotChats`
**Purpose**: Copilot conversation history
**Primary Key**: `{jobId}`
**Key Fields**:
- `messages` - Array of user/assistant messages
- `contextId` - Current context reference
- `stage` - Wizard stage

**Repository**: [copilot-repository.js](../services/api-gateway/src/services/repositories/copilot-repository.js)

---

#### `golden_interview_sessions`
**Purpose**: Golden Interviewer chat sessions
**Primary Key**: `session_{uuid}`
**Key Fields**:
- `userId`, `companyId` - Context
- `conversationHistory` - Messages
- `extractedData` - Parsed job details
- `status` - active/completed

**Repository**: [golden-interviewer-repository.js](../services/api-gateway/src/services/repositories/golden-interviewer-repository.js)

---

### Billing & Usage

#### `creditPurchases`
**Purpose**: Credit purchase transactions
**Primary Key**: Auto-generated
**Key Fields**:
- `userId`
- `planId` - Subscription plan
- `credits` - Amount purchased
- `amountUsd`
- `purchasedAt`

**Repository**: [subscription-repository.js](../services/api-gateway/src/services/repositories/subscription-repository.js)

---

#### `LLMsUsage`
**Purpose**: LLM API usage logs
**Primary Key**: Auto-generated
**Key Fields**:
- `taskType` - LLM task identifier
- `provider`, `model`
- `inputTokens`, `outputTokens`
- `estimatedCostUsd`
- `userId`, `jobId`

**Repository**: [llm-usage-repository.js](../services/api-gateway/src/services/repositories/llm-usage-repository.js)

---

## BigQuery Tables

### `llm_analytics.usage_logs`
**Purpose**: Aggregated LLM usage for analytics
**Schema**: Mirrors LLMsUsage collection with additional partitioning
**Key Fields**:
- `task_type`, `provider`, `model`
- `input_tokens`, `output_tokens`, `cost_usd`
- `user_id`, `job_id`, `company_id`
- `timestamp` (partitioning key)

**Adapter**: [llm-usage-repository.js](../services/api-gateway/src/services/repositories/llm-usage-repository.js)

---

## ID Formats

| Entity | Format | Example |
|--------|--------|---------|
| Job | `job_{uuid}` | `job_2282a429-8497-43ba-9b00-e186330c1c87` |
| Company | `company_{uuid}` | `company_5bdeea0f-7545-4a18-a059-39415ed008e0` |
| User | `{uuid}` | `b38bb141-8368-40ae-b134-d1bb0fee7d66` |
| Session | `session_{uuid}` | `session_abc123...` |
| Video | Auto-generated | Firestore auto-ID |

---

**Last updated**: December 2024
