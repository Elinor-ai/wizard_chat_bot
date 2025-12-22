# allowCustomInput Enhancement Plan

## Overview

This document outlines the plan to enhance the `allowCustomInput` feature so that:
1. The LLM dynamically decides when to enable custom input based on the question
2. The backend no longer maintains a hardcoded list of "refineable" component types
3. More UI components support the `allowCustomInput` feature

**Date:** 2025-12-22
**Branch:** feature/golden-refine-allowCustomInput

---

## Problem Statement

### Current Backend Logic

The backend currently has a hardcoded list of "refineable" tools in `service.js`:

```javascript
// service.js:250-252
isRefineableToolType(toolType) {
  const REFINEABLE_TOOLS = ["smart_textarea", "tag_input"];
  return REFINEABLE_TOOLS.includes(toolType);
}
```

And the `shouldRefine` check (lines 632-637):

```javascript
const previousToolType = session.metadata?.lastToolUsed;
const previousToolAllowCustomInput = session.metadata?.lastToolAllowCustomInput || false;
const shouldRefine = (this.isRefineableToolType(previousToolType) || previousToolAllowCustomInput) &&
  valueToSave !== null &&
  typeof valueToSave === "string" &&
  valueToSave.trim().length > 0 &&
  !isSkip &&
  !acceptRefinedValue;
```

### Issues with Current Approach

1. **Hardcoded list** - Adding custom input to new components requires backend changes
2. **Dual logic** - Both `isRefineableToolType()` AND `allowCustomInput` flag are checked
3. **Not scalable** - Every new component with text input needs to be added to the list

---

## Current Flow (How it Works Today)

```
1. LLM generates response with ui_tool
   └── Sets allowCustomInput: true if question is open-ended

2. Backend stores in session metadata:
   └── lastToolUsed: "icon_grid"
   └── lastToolAllowCustomInput: true

3. User submits response (next turn)

4. Backend checks shouldRefine:
   └── Is tool in REFINEABLE_TOOLS list? OR
   └── Was lastToolAllowCustomInput: true?

5. If shouldRefine → calls golden_refine API
```

---

## Proposed Solution

### Goal

Make the system fully driven by the `allowCustomInput` flag that the LLM sets, removing the need for a hardcoded component list in the backend.

### New Flow

```
1. LLM generates response with ui_tool
   └── Checks: Is this an open-ended question?
   └── Checks: Does this component support allowCustomInput?
   └── If both yes → Sets allowCustomInput: true

2. Backend stores in session metadata:
   └── lastToolAllowCustomInput: true (or false)

3. User submits response

4. Backend checks shouldRefine:
   └── Was lastToolAllowCustomInput: true?
   └── (No component type checking needed)

5. If shouldRefine → calls golden_refine API
```

---

## Backend Changes

### File: `services/api-gateway/src/golden-interviewer/service.js`

#### 1. Remove `isRefineableToolType` function (lines 250-253)

```javascript
// DELETE THIS:
isRefineableToolType(toolType) {
  const REFINEABLE_TOOLS = ["smart_textarea", "tag_input"];
  return REFINEABLE_TOOLS.includes(toolType);
}
```

#### 2. Simplify `shouldRefine` logic (lines 632-637)

**Before:**
```javascript
const previousToolType = session.metadata?.lastToolUsed;
const previousToolAllowCustomInput = session.metadata?.lastToolAllowCustomInput || false;
const shouldRefine = (this.isRefineableToolType(previousToolType) || previousToolAllowCustomInput) &&
  valueToSave !== null &&
  typeof valueToSave === "string" &&
  valueToSave.trim().length > 0 &&
  !isSkip &&
  !acceptRefinedValue;
```

**After:**
```javascript
const previousToolAllowCustomInput = session.metadata?.lastToolAllowCustomInput || false;
const shouldRefine = previousToolAllowCustomInput &&
  valueToSave !== null &&
  typeof valueToSave === "string" &&
  valueToSave.trim().length > 0 &&
  !isSkip &&
  !acceptRefinedValue;
```

#### 3. Handle `smart_textarea` and `tag_input` implicitly

Since these components are ALWAYS free-text, the LLM prompt should instruct it to ALWAYS set `allowCustomInput: true` when using these tools.

Alternatively, the backend can set this implicitly when storing metadata:

```javascript
// When storing lastToolAllowCustomInput (lines 399 and 1085):
const toolType = parsed.ui_tool?.type;
const isAlwaysTextInput = ["smart_textarea", "tag_input"].includes(toolType);
const allowCustomInput = parsed.ui_tool?.props?.allowCustomInput || isAlwaysTextInput;

session.metadata.lastToolAllowCustomInput = allowCustomInput;
```

This ensures `smart_textarea` and `tag_input` always trigger refine without needing the LLM to explicitly set the flag.

---

## Frontend Changes

### Components That Already Support `allowCustomInput`

| Component | File | Status |
|-----------|------|--------|
| `icon_grid` | `apps/web/components/golden-interview/inputs/IconGridSelect.js` | ✅ Implemented |
| `detailed_cards` | `apps/web/components/golden-interview/inputs/DetailedCardSelect.js` | ✅ Implemented |
| `chip_cloud` | `apps/web/components/golden-interview/inputs/ChipCloud.js` | ✅ Implemented |

### Components to Add `allowCustomInput` Support

| Component | File | UI Approach |
|-----------|------|-------------|
| `toggle_list` | `apps/web/components/golden-interview/inputs/ToggleList.js` | Add "Other" toggle that expands to text input |
| `gradient_cards` | `apps/web/components/golden-interview/inputs/GradientCards.js` | Add "Other" card with dashed border |

### Components That Should NOT Have `allowCustomInput`

These components have structured/numeric input where free text doesn't make sense:

| Category | Components |
|----------|------------|
| **Sliders & Gauges** | `circular_gauge`, `linear_slider`, `gradient_slider`, `bipolar_scale` |
| **Numeric Input** | `counter_stack`, `stacked_bar`, `dial_group`, `brand_meter` |
| **Visualizations** | `radar_chart`, `node_map`, `heat_map`, `week_scheduler` |
| **Specialized** | `token_allocator`, `swipe_deck`, `reaction_scale`, `comparison_duel`, `equity_builder` |
| **Already Text-Based** | `smart_textarea`, `tag_input`, `timeline_builder`, `comparison_table`, `qa_list`, `expandable_list` |
| **Other** | `chat_simulator`, `media_upload`, `perk_revealer`, `segmented_rows` |

---

## Tools Definition Changes

### File: `services/api-gateway/src/golden-interviewer/tools-definition.js`

#### Add `allowCustomInput` to `toggle_list`

```javascript
toggle_list: {
  // ... existing props ...
  props: {
    // ... existing props ...
    allowCustomInput: {
      type: "boolean",
      description:
        "When true, displays an 'Add Other' toggle that expands to a text input, allowing users to add custom items not in the predefined list. Use for questions where the options might not be exhaustive.",
      required: false,
      default: false,
    },
    customInputPlaceholder: {
      type: "string",
      description: "Placeholder text for the custom input field",
      required: false,
      default: "Type your answer...",
    },
  },
  useCases: [
    // ... existing use cases ...
    "Custom concern/worry entry",
    "Feature requests with custom additions",
  ],
}
```

#### Add `allowCustomInput` to `gradient_cards`

```javascript
gradient_cards: {
  // ... existing props ...
  props: {
    // ... existing props ...
    allowCustomInput: {
      type: "boolean",
      description:
        "When true, displays an 'Add Other' card that allows users to enter a custom option. Use for mood/vibe questions where users might have unique preferences.",
      required: false,
      default: false,
    },
    customInputPlaceholder: {
      type: "string",
      description: "Placeholder text for the custom input field",
      required: false,
      default: "Describe your vibe...",
    },
  },
  useCases: [
    // ... existing use cases ...
    "Custom workspace mood entry",
    "Unique culture preferences",
  ],
}
```

---

## Prompt Changes

### File: `services/api-gateway/src/golden-interviewer/prompts.js`

#### Update the "ALLOW CUSTOM INPUT" Section

**Before:**
```markdown
### 6. ALLOW CUSTOM INPUT (Open Questions)
When asking questions where the provided options might NOT be exhaustive,
you MUST set `allowCustomInput: true` on icon_grid components.

**ALWAYS use allowCustomInput: true for:**
- Software/tools questions
- Competitor questions
- etc.
```

**After:**
```markdown
### 6. ALLOW CUSTOM INPUT (Open Questions)

#### Components That Support Custom Input
These components can have `allowCustomInput: true`:
- `icon_grid` - Shows "Add Other" card
- `detailed_cards` - Shows "Add New Option" card
- `chip_cloud` - Shows "+ Add" chip
- `toggle_list` - Shows "Add Other" toggle
- `gradient_cards` - Shows "Add Other" card
- `smart_textarea` - Always allows custom input (inherently free-text)
- `tag_input` - Always allows custom input (inherently free-text)

#### When to Enable Custom Input
Set `allowCustomInput: true` when:
- The question is open-ended
- Predefined options might not cover all possible answers
- Users commonly have unique/custom answers

**Examples of open-ended questions:**
- "What software do you use?" → allowCustomInput: true
- "Who are your competitors?" → allowCustomInput: true
- "What's your ideal work environment?" → allowCustomInput: true
- "What keywords describe your brand?" → allowCustomInput: true

**Examples of closed questions (no custom input needed):**
- "What's your salary range?" → Use slider, no custom input
- "How many people on your team?" → Use counter, no custom input
- "Remote, hybrid, or on-site?" → Fixed options, no custom input

#### Important
- `smart_textarea` and `tag_input` are ALWAYS free-text - treat them as having `allowCustomInput: true` implicitly
- Sliders, gauges, counters, and visualizations do NOT support custom input
- When in doubt about whether a question is open-ended, enable custom input
```

---

## Summary of Changes

### Backend (`service.js`)
1. Remove `isRefineableToolType()` function
2. Simplify `shouldRefine` to only check `lastToolAllowCustomInput`
3. Implicitly set `allowCustomInput: true` for `smart_textarea` and `tag_input`

### Frontend (New Components)
1. Add `allowCustomInput` support to `ToggleList.js`
2. Add `allowCustomInput` support to `GradientCards.js`

### Tools Definition (`tools-definition.js`)
1. Add `allowCustomInput` and `customInputPlaceholder` props to `toggle_list`
2. Add `allowCustomInput` and `customInputPlaceholder` props to `gradient_cards`

### Prompt (`prompts.js`)
1. List all components that support `allowCustomInput`
2. Provide clear guidance on when to enable custom input
3. Explain that `smart_textarea` and `tag_input` are implicitly free-text

---

## Implementation Order

1. **Backend changes** - Remove hardcoded list, simplify shouldRefine logic
2. **Tools definition** - Add allowCustomInput to new components
3. **Prompt updates** - Tell LLM which components support custom input
4. **Frontend: ToggleList** - Implement allowCustomInput UI
5. **Frontend: GradientCards** - Implement allowCustomInput UI
6. **Testing** - Verify refine triggers correctly for all components

---

## Testing Checklist

### Backend
- [ ] `smart_textarea` triggers refine (implicit allowCustomInput)
- [ ] `tag_input` triggers refine (implicit allowCustomInput)
- [ ] `icon_grid` with `allowCustomInput: true` triggers refine
- [ ] `icon_grid` with `allowCustomInput: false` does NOT trigger refine
- [ ] `chip_cloud` with `allowCustomInput: true` triggers refine
- [ ] `detailed_cards` with `allowCustomInput: true` triggers refine
- [ ] Sliders/gauges do NOT trigger refine

### Frontend
- [ ] `toggle_list` shows "Add Other" when `allowCustomInput: true`
- [ ] `gradient_cards` shows "Add Other" when `allowCustomInput: true`
- [ ] Custom values display correctly in selection summary
- [ ] Custom values are passed correctly to backend

### LLM Integration
- [ ] LLM sets `allowCustomInput: true` for open-ended questions
- [ ] LLM does NOT set `allowCustomInput: true` for closed questions
- [ ] LLM uses appropriate components for each question type
