# Golden Interviewer Service - Architecture Documentation

> **Purpose**: This document provides a comprehensive overview of the Golden Interviewer system for AI models and developers who need to understand, extend, or integrate with this codebase.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Phase 1: Universal Golden Schema](#phase-1-universal-golden-schema)
4. [Phase 2: UI Component Library](#phase-2-ui-component-library)
5. [Phase 3: AI Agent Registry](#phase-3-ai-agent-registry)
6. [Phase 4: Backend Service](#phase-4-backend-service)
7. [Data Flow Architecture](#data-flow-architecture)
8. [File Structure](#file-structure)
9. [Component Reference](#component-reference)
10. [Integration Guide](#integration-guide)
11. [Extension Guidelines](#extension-guidelines)

---

## Executive Summary

The **Golden Interviewer** is an AI-powered job information extraction system that:

1. **Collects** rich, structured job information through interactive UI components
2. **Stores** data in a comprehensive, validated schema (Zod)
3. **Enables** an AI agent to dynamically select appropriate UI components based on context

The system bridges four domains:
- **Data Schema** (Zod) - Defines WHAT information we collect
- **UI Components** (React) - Defines HOW users input information
- **AI Registry** (JSON Schema) - Defines HOW the AI agent selects and configures components
- **Backend Service** (Node.js/Express) - Orchestrates the conversation between User, Firestore, and LLM

---

## System Overview

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                           GOLDEN INTERVIEWER SYSTEM                                │
├───────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │   PHASE 1      │  │   PHASE 2      │  │   PHASE 3      │  │   PHASE 4      │  │
│  │   Zod Schema   │  │   React UI     │  │   AI Registry  │  │   Backend      │  │
│  │                │  │   Components   │  │                │  │   Service      │  │
│  │ golden-schema  │──│  32 Components │◀─│  registry.js   │◀─│ golden-        │  │
│  │ .js            │  │  in /inputs/   │  │                │  │ interviewer/   │  │
│  │                │  │                │  │  Maps to JSON  │  │                │  │
│  │ Defines data   │  │ Collect user   │  │  Schema for    │  │ Orchestrates   │  │
│  │ structure      │  │ input visually │  │  AI agent      │  │ LLM + Firestore│  │
│  └────────────────┘  └────────────────┘  └────────────────┘  └────────────────┘  │
│           │                   │                   │                   │           │
│           └───────────────────┴───────────────────┴───────────────────┘           │
│                                       ▼                                           │
│                      ┌──────────────────────────┐                                 │
│                      │   UniversalGoldenSchema  │                                 │
│                      │   (Validated Output)     │                                 │
│                      └──────────────────────────┘                                 │
│                                                                                    │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Universal Golden Schema

### Location
```
packages/core/src/schemas/golden-schema.js
```

### Purpose
Defines a comprehensive Zod schema for storing ALL possible job-related information. This schema was translated from a YAML specification covering 9 major domains of job information.

### Schema Structure

```javascript
UniversalGoldenSchema = {
  financial_reality,      // Compensation, equity, bonuses, hidden value
  time_and_life,          // Schedule, flexibility, time off, commute
  environment,            // Physical space, amenities, safety, neighborhood
  humans_and_culture,     // Team, management, social dynamics, values
  growth_trajectory,      // Learning, career path, skill building
  stability_signals,      // Company health, job security, benefits
  role_reality,           // Day-to-day, autonomy, workload, success metrics
  unique_value,           // Hidden perks, status signals, personal meaning
  extraction_metadata     // Source tracking, confidence scores, AI inference data
}
```

### Key Design Decisions

1. **All fields are optional** (`.optional()`) - Supports incremental extraction during interviews
2. **Modular sub-schemas** - Each domain is a separate exportable schema
3. **24 Enums defined** - For constrained values (e.g., `PayFrequencyEnum`, `RemoteFrequencyEnum`)
4. **JSDoc typedefs** - Enable IDE autocompletion

### Enums Reference

| Category | Enums |
|----------|-------|
| Financial | `PayFrequencyEnum`, `VariableCompensationTypeEnum`, `EquityTypeEnum`, `PaymentMethodEnum` |
| Schedule | `ScheduleTypeEnum`, `RemoteFrequencyEnum`, `PtoStructureEnum`, `OvertimeExpectedEnum` |
| Environment | `PhysicalSpaceTypeEnum`, `NoiseLevelEnum` |
| Culture | `ManagementApproachEnum`, `SocialPressureEnum`, `MeetingLoadEnum` |
| Stability | `CompanyStageEnum`, `RevenueTrendEnum`, `PositionTypeEnum`, `EmploymentTypeGoldenEnum` |
| Role | `VarietyLevelEnum`, `DecisionAuthorityEnum`, `SupervisionLevelEnum`, `WorkloadIntensityEnum`, `WorkloadPredictabilityEnum` |
| Metadata | `SeniorityDetectedEnum` |

### Usage Example

```javascript
import { UniversalGoldenSchema, FinancialRealitySchema } from '@wizard/core';

// Validate partial data
const partialData = {
  financial_reality: {
    base_compensation: {
      amount_or_range: "$80,000 - $100,000",
      pay_frequency: "annual",
      currency: "USD"
    }
  }
};

const result = UniversalGoldenSchema.safeParse(partialData);
```

---

## Phase 2: UI Component Library

### Location
```
apps/web/components/golden-interview/inputs/
```

### Purpose
32 interactive React components for collecting job information through engaging, visual interfaces. Each component is:
- **Controlled** - Accepts `value` and `onChange` props
- **Generic** - No hardcoded questions; all content via props
- **Styled** - Tailwind CSS with glow/gradient aesthetics

### Component Categories

#### 1. Visual Quantifiers & Sliders (8 components)

| Component | File | Description | Best For |
|-----------|------|-------------|----------|
| `CircularGauge` | `CircularGauge.js` | Circular SVG dial with center value | Salary, team size, budgets |
| `StackedBarInput` | `StackedBarInput.js` | Multiple sliders → stacked bar | Pay structure breakdown |
| `EquityBuilder` | `EquityBuilder.js` | 2-step wizard (type → details) | Equity packages |
| `GradientSlider` | `GradientSlider.js` | Gradient track with sub-options | Remote flexibility spectrum |
| `BipolarScaleList` | `BipolarScaleList.js` | Sliders between two extremes | Culture fit assessment |
| `RadarChartInput` | `RadarChartInput.js` | Interactive spider/radar chart | Multi-dimensional ratings |
| `DialGroup` | `DialGroup.js` | Multiple dials with average | Autonomy assessment |
| `BrandValueMeter` | `BrandValueMeter.js` | Vertical bars + star rating | Brand/reputation value |

#### 2. Grids, Cards & Selectors (5 components)

| Component | File | Description | Best For |
|-----------|------|-------------|----------|
| `IconGridSelect` | `IconGridSelect.js` | Grid of icon cards | Benefits, amenities |
| `DetailedCardSelect` | `DetailedCardSelect.js` | Cards with icon+title+description | Shift patterns, management style |
| `GradientCardGrid` | `GradientCardGrid.js` | Cards with gradient backgrounds | Mood/vibe selection |
| `SuperpowerGrid` | `SuperpowerGrid.js` | Traits + custom input | Team strengths |
| `VisualNodeMap` | `VisualNodeMap.js` | Central node + orbiting satellites | Team structure |

#### 3. Lists & Toggles (6 components)

| Component | File | Description | Best For |
|-----------|------|-------------|----------|
| `ToggleList` | `ToggleList.js` | Vertical toggles with checkmarks | Red flags, concerns |
| `ChipCloud` | `ChipCloud.js` | Grouped selectable tags | Tech stack, skills |
| `SegmentedRowList` | `SegmentedRowList.js` | Rows with segmented controls | Physical demands |
| `ExpandableInputList` | `ExpandableInputList.js` | Items expand to reveal input | Values with evidence |
| `PerkRevealer` | `PerkRevealer.js` | Category tabs + toggleable items | Hidden perks |
| `CounterStack` | `CounterStack.js` | +/- steppers with total | PTO calculator |

#### 4. Interactive & Gamified (6 components)

| Component | File | Description | Best For |
|-----------|------|-------------|----------|
| `TokenAllocator` | `TokenAllocator.js` | Distribute tokens across categories | Priority budgeting |
| `SwipeDeck` | `SwipeDeck.js` | Tinder-style card swiping | Rapid yes/no decisions |
| `ReactionScale` | `ReactionScale.js` | Emoji reaction buttons | Sentiment capture |
| `ComparisonDuel` | `ComparisonDuel.js` | A vs B side-by-side | Trade-off decisions |
| `HeatMapGrid` | `HeatMapGrid.js` | Color-cycling grid cells | Availability calendar |
| `WeekScheduler` | `WeekScheduler.js` | Drag-to-paint week grid | Schedule input |

#### 5. Rich Input & Text (7 components)

| Component | File | Description | Best For |
|-----------|------|-------------|----------|
| `SmartTextArea` | `SmartTextArea.js` | Rotating prompts + shuffle | Open-ended questions |
| `TagInputTextArea` | `TagInputTextArea.js` | Word counter + suggestion tags | Focused short input |
| `ChatSimulator` | `ChatSimulator.js` | Mini chat with quick replies | Conversational Q&A |
| `TimelineBuilder` | `TimelineBuilder.js` | Vertical timeline with inputs | Career retrospective |
| `ComparisonTableInput` | `ComparisonTableInput.js` | Two-column comparison | Expectation vs reality |
| `QAInputList` | `QAInputList.js` | Question/Answer pairs | FAQ building |
| `MediaUploadPlaceholder` | `MediaUploadPlaceholder.js` | Audio/photo/video placeholder | Voice notes, photos |

### Component Props Pattern

All components follow this controlled component pattern:

```javascript
<ComponentName
  value={currentValue}           // Current state
  onChange={handleChange}        // State updater
  title="Optional Title"         // Display title
  // ... component-specific props
/>
```

---

## Phase 3: AI Agent Registry

### Location
```
apps/web/components/golden-interview/registry.js
```

### Purpose
Bridges React components with AI agent by providing:
1. **Component imports** - For rendering
2. **JSON Schema definitions** - For AI understanding
3. **Helper functions** - For dynamic component selection

### COMPONENT_CATALOG Structure

```javascript
COMPONENT_CATALOG = {
  "circular_gauge": {
    component: CircularGauge,  // React component
    schema: {
      name: "circular_gauge",
      description: "A circular SVG slider for...",
      category: "visual_quantifiers",
      valueType: "number",
      props: {
        label: {
          type: "string",
          description: "Title displayed in center",
          required: false,
          example: "Annual Salary"
        },
        min: { type: "number", default: 0 },
        max: { type: "number", default: 100 },
        // ...more props
      },
      useCases: ["Salary range", "Team size", "Budget"]
    }
  },
  // ...31 more components
}
```

### Helper Functions

| Function | Purpose | Returns |
|----------|---------|---------|
| `getComponent(type)` | Get React component by key | `React.Component \| null` |
| `getComponentSchema(type)` | Get schema definition | `Object \| null` |
| `hasComponent(type)` | Check if component exists | `boolean` |
| `getComponentTypes()` | List all component keys | `string[]` |
| `getComponentsByCategory(cat)` | Filter by category | `Object` |
| `getCatalogSummary()` | AI-friendly overview | `Object[]` |
| `getAgentToolDefinitions()` | Schema-only export | `Object` |
| `validateComponentProps(type, props)` | Validate props | `{valid, errors}` |

### AI Agent Integration

The AI agent can:

1. **Discover available components**:
```javascript
const summary = getCatalogSummary();
// Returns: [{ type, name, description, category, valueType, useCases }, ...]
```

2. **Get detailed schema for a component**:
```javascript
const schema = getComponentSchema('circular_gauge');
// Returns full prop definitions, types, descriptions
```

3. **Select component based on data type**:
```javascript
// For salary input → circular_gauge
// For benefits checklist → icon_grid
// For culture fit → bipolar_scale
```

4. **Validate configuration**:
```javascript
const { valid, errors } = validateComponentProps('icon_grid', {
  options: [...],
  multiple: true
});
```

---

## Phase 4: Backend Service

### Location
```
services/api-gateway/src/golden-interviewer/
```

### Purpose
The backend service orchestrates the interview process, acting as the "brain" that:
1. Manages interview sessions in Firestore
2. Invokes the LLM with appropriate prompts
3. Extracts and updates the Golden Schema
4. Selects UI tools for each question

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     GOLDEN INTERVIEWER BACKEND                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────┐                                                   │
│   │    Client       │                                                   │
│   │  (React App)    │                                                   │
│   └────────┬────────┘                                                   │
│            │                                                            │
│            ▼                                                            │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐  │
│   │     Router      │────▶│     Service     │────▶│    Firestore    │  │
│   │ golden-interview│     │ GoldenInterviewer│    │   (Sessions)    │  │
│   │     .js         │     │   Service.js    │     └─────────────────┘  │
│   └─────────────────┘     └────────┬────────┘                          │
│                                    │                                    │
│                                    ▼                                    │
│                           ┌─────────────────┐                          │
│                           │   LLM Adapter   │                          │
│                           │    (OpenAI)     │                          │
│                           └────────┬────────┘                          │
│                                    │                                    │
│                                    ▼                                    │
│                           ┌─────────────────┐                          │
│                           │    Prompts      │                          │
│                           │  + Tools Def    │                          │
│                           └─────────────────┘                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Files

| File | Purpose |
|------|---------|
| `tools-definition.js` | `UI_TOOLS_SCHEMA` - All 32 component definitions for LLM |
| `prompts.js` | System prompts and conversation builders |
| `service.js` | `GoldenInterviewerService` - Main orchestration logic |
| `index.js` | Module exports |

### API Endpoints

Registered at `/golden-interview` with authentication required:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/start` | Start a new interview session |
| `POST` | `/chat` | Process a conversation turn |
| `GET` | `/session/:id` | Get session status |
| `GET` | `/session/:id/schema` | Get current golden schema |
| `GET` | `/session/:id/history` | Get conversation history |
| `POST` | `/session/:id/complete` | Complete the interview |

### The Conversation Turn Flow

```
1. INPUT: User sends message + UI response
         │
         ▼
2. LOAD: Service loads session from Firestore
         │
         ▼
3. PROMPT: Build prompt with:
         - System prompt (tools, schema, instructions)
         - Current schema state
         - Conversation history
         - User's input
         │
         ▼
4. LLM: Invoke OpenAI with JSON mode
         │
         ▼
5. PARSE: Extract structured response:
         {
           message: "...",
           extraction: { updates: {...} },
           ui_tool: { type: "...", props: {...} },
           completion_percentage: 25,
           interview_phase: "compensation"
         }
         │
         ▼
6. UPDATE: Apply extractions to golden schema
         │
         ▼
7. SAVE: Store updated session in Firestore
         │
         ▼
8. RESPOND: Return message + UI tool to client
```

### LLM Response Format

The LLM returns structured JSON:

```json
{
  "message": "Great! You mentioned the salary is around $85k. Now let's talk about the benefits...",
  "extraction": {
    "updates": {
      "financial_reality.base_compensation.amount_or_range": "$85,000",
      "financial_reality.base_compensation.pay_frequency": "annual"
    },
    "confidence": {
      "financial_reality.base_compensation.amount_or_range": 0.95
    }
  },
  "ui_tool": {
    "type": "icon_grid",
    "props": {
      "title": "What benefits are offered?",
      "options": [
        { "id": "health", "label": "Health Insurance", "icon": "🏥" },
        { "id": "dental", "label": "Dental", "icon": "🦷" },
        { "id": "401k", "label": "401k Match", "icon": "💰" }
      ],
      "multiple": true
    }
  },
  "next_priority_fields": [
    "stability_signals.benefits_security.health_insurance",
    "time_and_life.time_off.pto_days"
  ],
  "completion_percentage": 15,
  "interview_phase": "compensation"
}
```

### Session Schema

Sessions are stored in Firestore (`golden_interview_sessions` collection):

```javascript
{
  sessionId: "abc123xyz",
  userId: "user_456",
  createdAt: Timestamp,
  updatedAt: Timestamp,
  status: "active" | "completed" | "abandoned",
  turnCount: 5,
  goldenSchema: {
    financial_reality: { ... },
    time_and_life: { ... },
    // ... extracted data
  },
  conversationHistory: [
    {
      role: "assistant",
      content: "Welcome! Let's learn about this role...",
      timestamp: Timestamp,
      uiTool: { type: "gradient_cards", props: {...} }
    },
    {
      role: "user",
      content: "It's a startup in fintech",
      timestamp: Timestamp,
      uiResponse: { selected: "startup" }
    }
    // ...
  ],
  metadata: {
    completionPercentage: 35,
    currentPhase: "environment",
    lastToolUsed: "icon_grid"
  }
}
```

### Interview Phases

The agent progresses through these phases:

1. **opening** (0-10%) - Basic role info, company type
2. **compensation** (10-25%) - Salary, bonuses, equity, benefits
3. **time_flexibility** (25-40%) - Schedule, remote work, PTO
4. **environment** (40-50%) - Workspace, amenities, location
5. **culture** (50-65%) - Team size, management style, values
6. **growth** (65-80%) - Career path, learning opportunities
7. **stability** (70-85%) - Company health, job security
8. **role_details** (85-95%) - Day-to-day, autonomy, challenges
9. **unique_value** (90-95%) - Special perks, what makes this unique
10. **closing** (95-100%) - Fill remaining gaps, confirm key details

### Usage Example

```javascript
// Start a new session
const response = await fetch('/golden-interview/start', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ...', 'Content-Type': 'application/json' },
  body: JSON.stringify({ initialData: {} })
});

const { sessionId, response: firstTurn } = await response.json();
// firstTurn = { message: "...", ui_tool: {...}, completion_percentage: 0 }

// Process a turn
const chatResponse = await fetch('/golden-interview/chat', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ...', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId,
    userMessage: "It's a fintech startup",
    uiResponse: { selected: "startup" }
  })
});

const turn = await chatResponse.json();
// turn = { message: "...", ui_tool: {...}, completion_percentage: 10, ... }
```

### Key Service Methods

| Method | Purpose |
|--------|---------|
| `startSession({ userId, initialData })` | Create new session, generate first question |
| `processTurn({ sessionId, userMessage, uiResponse })` | Process user input, generate next question |
| `completeSession(sessionId)` | Mark session complete, return final schema |
| `getSessionStatus(sessionId)` | Get session metadata |
| `getGoldenSchema(sessionId)` | Get current extracted data |
| `getConversationHistory(sessionId)` | Get chat history |

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. AI AGENT DECISION                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Agent receives context: "Ask about compensation"                 │    │
│  │ Agent queries: getCatalogSummary()                               │    │
│  │ Agent selects: "circular_gauge" for salary                       │    │
│  │ Agent configures: { min: 30000, max: 200000, prefix: "$" }       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼                                           │
│  2. UI RENDERING                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ const Component = getComponent('circular_gauge');                │    │
│  │ <Component value={value} onChange={onChange} {...agentConfig} /> │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼                                           │
│  3. USER INTERACTION                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ User interacts with circular gauge                               │    │
│  │ Component calls onChange(85000)                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼                                           │
│  4. DATA STORAGE                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Map component output to UniversalGoldenSchema:                   │    │
│  │ {                                                                │    │
│  │   financial_reality: {                                           │    │
│  │     base_compensation: {                                         │    │
│  │       amount_or_range: "85000",                                  │    │
│  │       pay_frequency: "annual"                                    │    │
│  │     }                                                            │    │
│  │   }                                                              │    │
│  │ }                                                                │    │
│  │ Validate with UniversalGoldenSchema.safeParse()                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
wizard_chat_bot/
├── packages/
│   └── core/
│       └── src/
│           ├── schemas/
│           │   └── golden-schema.js          # Phase 1: Zod schema
│           └── index.js                       # Exports golden schema
│
├── services/
│   └── api-gateway/
│       └── src/
│           ├── golden-interviewer/           # Phase 4: Backend service
│           │   ├── index.js                  # Module exports
│           │   ├── tools-definition.js       # UI_TOOLS_SCHEMA for LLM
│           │   ├── prompts.js                # System prompts & builders
│           │   └── service.js                # GoldenInterviewerService
│           ├── routes/
│           │   └── golden-interview.js       # API router endpoints
│           └── server.js                     # Express app (imports router)
│
└── apps/
    └── web/
        └── components/
            └── golden-interview/
                ├── GOLDEN_INTERVIEWER_ARCHITECTURE.md  # This file
                ├── registry.js                # Phase 3: AI registry
                └── inputs/                    # Phase 2: UI components
                    ├── DynamicInputRegistry.js
                    ├── CircularGauge.js
                    ├── StackedBarInput.js
                    ├── EquityBuilder.js
                    ├── GradientSlider.js
                    ├── BipolarScaleList.js
                    ├── RadarChartInput.js
                    ├── DialGroup.js
                    ├── BrandValueMeter.js
                    ├── IconGridSelect.js
                    ├── DetailedCardSelect.js
                    ├── GradientCardGrid.js
                    ├── SuperpowerGrid.js
                    ├── VisualNodeMap.js
                    ├── ToggleList.js
                    ├── ChipCloud.js
                    ├── SegmentedRowList.js
                    ├── ExpandableInputList.js
                    ├── PerkRevealer.js
                    ├── CounterStack.js
                    ├── TokenAllocator.js
                    ├── SwipeDeck.js
                    ├── ReactionScale.js
                    ├── ComparisonDuel.js
                    ├── HeatMapGrid.js
                    ├── WeekScheduler.js
                    ├── SmartTextArea.js
                    ├── TagInputTextArea.js
                    ├── ChatSimulator.js
                    ├── TimelineBuilder.js
                    ├── ComparisonTableInput.js
                    ├── QAInputList.js
                    └── MediaUploadPlaceholder.js
```

---

## Component Reference

### Quick Lookup: Schema Field → Recommended Component

| Golden Schema Field | Recommended Component | Why |
|--------------------|-----------------------|-----|
| `financial_reality.base_compensation.amount_or_range` | `circular_gauge` | Numeric range with visual feedback |
| `financial_reality.variable_compensation` | `stacked_bar` | Shows breakdown of compensation types |
| `financial_reality.equity` | `equity_builder` | Multi-step equity configuration |
| `time_and_life.flexibility.remote_frequency` | `gradient_slider` | Spectrum with sub-options |
| `humans_and_culture.management_style` | `detailed_cards` | Rich descriptions needed |
| `humans_and_culture.team_composition` | `node_map` | Visual team structure |
| `environment.amenities` | `icon_grid` | Multi-select checklist |
| `stability_signals.benefits_security` | `perk_revealer` | Categorized benefits |
| `role_reality.day_to_day` | `smart_textarea` | Open-ended description |
| `growth_trajectory.skill_building` | `chip_cloud` | Tag-based selection |
| `unique_value.hidden_perks` | `expandable_list` | Items with evidence |

---

## Integration Guide

### For AI Agent Developers

1. **Import the registry**:
```javascript
import {
  COMPONENT_CATALOG,
  getComponent,
  getComponentSchema,
  getCatalogSummary
} from '@/components/golden-interview/registry';
```

2. **Provide catalog to AI context**:
```javascript
const toolDefinitions = getCatalogSummary();
// Include in system prompt or tool definitions
```

3. **Handle AI component selection**:
```javascript
function renderAgentSelectedComponent(agentResponse) {
  const { componentType, config, question } = agentResponse;
  const Component = getComponent(componentType);

  return (
    <div>
      <h3>{question}</h3>
      <Component
        value={value}
        onChange={handleChange}
        {...config}
      />
    </div>
  );
}
```

### For Frontend Developers

1. **Direct component import**:
```javascript
import CircularGauge from '@/components/golden-interview/inputs/CircularGauge';

<CircularGauge
  value={salary}
  onChange={setSalary}
  label="Annual Salary"
  min={30000}
  max={200000}
  prefix="$"
/>
```

2. **Dynamic rendering**:
```javascript
import DynamicInput from '@/components/golden-interview/inputs/DynamicInputRegistry';

<DynamicInput
  type="circular_gauge"
  value={value}
  onChange={onChange}
  {...props}
/>
```

---

## Extension Guidelines

### Adding a New Component

1. **Create the React component** in `/inputs/NewComponent.js`:
```javascript
"use client";

export default function NewComponent({ value, onChange, ...props }) {
  // Implementation
}
```

2. **Add to DynamicInputRegistry.js**:
```javascript
import NewComponent from "./NewComponent";

export const InputRegistry = {
  // ...existing
  "new_component": NewComponent,
};
```

3. **Add to registry.js**:
```javascript
import NewComponent from "./inputs/NewComponent";

export const COMPONENT_CATALOG = {
  // ...existing
  new_component: {
    component: NewComponent,
    schema: {
      name: "new_component",
      description: "Description for AI",
      category: "appropriate_category",
      valueType: "string | number | object | array",
      props: {
        // Define all props with types and descriptions
      },
      useCases: ["Use case 1", "Use case 2"]
    }
  }
};
```

4. **Update golden-schema.js** if new data fields are needed.

### Schema Prop Definition Format

```javascript
propName: {
  type: "string" | "number" | "boolean" | "array" | "object",
  description: "Clear description for AI understanding",
  required: true | false,
  default: "default value if any",
  enum: ["option1", "option2"],  // If constrained values
  items: { /* For arrays */ },
  properties: { /* For objects */ },
  example: "Example value"
}
```

---

## Summary

The Golden Interviewer system provides:

1. **Comprehensive Data Model** - `UniversalGoldenSchema` captures all job information
2. **Rich UI Library** - 32 interactive components for engaging data collection
3. **AI-Ready Registry** - JSON Schema definitions enable AI agent integration
4. **Backend Orchestration** - Node.js service manages LLM conversations and data extraction

This architecture enables an AI agent to dynamically interview users about job opportunities, selecting the most appropriate UI component for each question while storing responses in a validated, structured format.

### Full System Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Backend   │────▶│    LLM      │────▶│  Firestore  │
│  (React +   │◀────│  (Service)  │◀────│  (OpenAI)   │     │  (Sessions) │
│  UI Tools)  │     │             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │                   │                   │
       ▼                   ▼                   ▼
   registry.js      tools-definition.js   prompts.js
   (32 React        (32 UI schemas        (System prompt +
    components)      for LLM)              conversation builders)
```

---

*Document Version: 2.0*
*Last Updated: December 2024*
*Phases Completed: 1, 2, 3, 4*
