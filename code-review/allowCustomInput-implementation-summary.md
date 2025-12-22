# allowCustomInput Implementation Summary

## Date: 2025-12-22
## Branch: feature/golden-refine-allowCustomInput

---

## What Was Done

Implemented a system where the LLM dynamically decides when to enable custom text input on UI components, and the backend uses this flag to trigger golden refine validation - without maintaining a hardcoded list of component types.

---

## Why This Was Done

### The Problem

Previously, the backend had a hardcoded list of "refineable" tool types:

```javascript
// OLD CODE - service.js
isRefineableToolType(toolType) {
  const REFINEABLE_TOOLS = ["smart_textarea", "tag_input"];
  return REFINEABLE_TOOLS.includes(toolType);
}
```

This approach had issues:
1. **Not scalable** - Adding custom input to new components required backend changes
2. **Tightly coupled** - Backend needed to know about frontend component types
3. **Inflexible** - Couldn't dynamically enable/disable custom input per question

### The Solution

Move the decision to the LLM via the `allowCustomInput` flag:
1. LLM decides if a question is open-ended
2. LLM sets `allowCustomInput: true` on the UI tool
3. Backend stores this flag and uses it to trigger refine
4. No hardcoded component list needed

---

## Files Changed

### Backend

#### `services/api-gateway/src/golden-interviewer/service.js`

**Changes:**
1. Renamed `isRefineableToolType()` to `isImplicitTextInputTool()` - now handles all inherently text-based tools:
   - `smart_textarea` - Pure text area
   - `tag_input` - Pure text input
   - `chat_simulator` - Chat with text input
   - `timeline_builder` - Timeline with text inputs
   - `comparison_table` - Two-column text inputs
   - `qa_list` - Q&A text pairs
   - `expandable_list` - Expandable text inputs
   - `superpower_grid` - Grid with text input area

2. Added new helper `getAllowCustomInput(uiTool)`:
```javascript
getAllowCustomInput(uiTool) {
  if (!uiTool) return false;
  const explicitFlag = uiTool.props?.allowCustomInput || false;
  const implicitFlag = this.isImplicitTextInputTool(uiTool.type);
  return explicitFlag || implicitFlag;
}
```

3. Added `lastToolAllowCustomInput` to session metadata storage (lines 414 and 1103)

4. Simplified `shouldRefine` logic:
```javascript
// OLD
const shouldRefine = this.isRefineableToolType(previousToolType) && ...

// NEW
const previousToolAllowCustomInput = session.metadata?.lastToolAllowCustomInput || false;
const shouldRefine = previousToolAllowCustomInput && ...
```

---

### Tools Definition

#### `services/api-gateway/src/golden-interviewer/tools-definition.js`

Added `allowCustomInput` and `customInputPlaceholder` props to:

1. **toggle_list** (lines 961-974):
```javascript
allowCustomInput: {
  type: "boolean",
  description: "When true, displays an 'Add Other' toggle that expands to a text input...",
  default: false,
},
customInputPlaceholder: {
  type: "string",
  default: "Type your answer...",
}
```

2. **gradient_cards** (lines 779-792):
```javascript
allowCustomInput: {
  type: "boolean",
  description: "When true, displays an 'Add Other' card that allows users to enter a custom option...",
  default: false,
},
customInputPlaceholder: {
  type: "string",
  default: "Describe your vibe...",
}
```

---

### Prompt

#### `services/api-gateway/src/golden-interviewer/prompts.js`

Updated the "ALLOW CUSTOM INPUT" section (lines 151-233) to:

1. List all components that support `allowCustomInput`:
   - icon_grid
   - detailed_cards
   - chip_cloud
   - toggle_list (NEW)
   - gradient_cards (NEW)

2. Document implicitly text-based components (all trigger refine automatically):
   - smart_textarea - Pure text area
   - tag_input - Pure text input
   - chat_simulator - Chat with text input
   - timeline_builder - Timeline with text inputs
   - comparison_table - Two-column text inputs
   - qa_list - Q&A text pairs
   - expandable_list - Expandable text inputs
   - superpower_grid - Grid with text input area

3. Provide guidance on when to use vs not use custom input

---

### Frontend

#### `apps/web/components/golden-interview/inputs/ToggleList.js`

Added custom input support:
- New props: `allowCustomInput`, `customInputPlaceholder`
- State management for custom input mode
- "Add Other" toggle with inline text input
- Custom values displayed as selected toggles with pencil icon
- Keyboard support (Enter to submit, Escape to cancel)

#### `apps/web/components/golden-interview/inputs/GradientCardGrid.js`

Added custom input support:
- New props: `allowCustomInput`, `customInputPlaceholder`
- State management for custom input mode
- "Add Other" card with dashed border
- Custom values displayed as selected cards with slate gradient
- Add/Cancel buttons in input mode

---

## How It Works Now

### Flow Diagram

```
1. LLM generates question
   ├── Is this an open-ended question?
   │   └── Yes: Set allowCustomInput: true on UI tool
   │   └── No: Leave allowCustomInput: false (or omit)
   │
   └── Is this an implicit text component?
       └── smart_textarea, tag_input, chat_simulator, timeline_builder,
           comparison_table, qa_list, expandable_list, superpower_grid
       └── These are implicitly text-based (no flag needed)

2. Backend receives LLM response
   └── Stores lastToolAllowCustomInput in session metadata
       (combines explicit flag + implicit detection)

3. User submits response
   └── Backend checks: previousToolAllowCustomInput === true?
       └── Yes: Call golden_refine API to validate/suggest
       └── No: Save directly without refinement

4. Frontend renders component
   └── If allowCustomInput: true
       └── Show "Add Other" option
       └── User can type custom text
       └── Custom values displayed with visual indicator
```

### Components Supporting Custom Input

#### Explicit Custom Input (via `allowCustomInput: true`)

| Component | Custom Input UI | Custom Value Format |
|-----------|-----------------|---------------------|
| icon_grid | "Add Other" card | Raw text string |
| detailed_cards | "Add New Option" card | Object `{id, title, description, isCustom}` |
| chip_cloud | "+ Add" chip | Raw text string |
| toggle_list | "Add Other" toggle | Raw text string |
| gradient_cards | "Add Other" card | Raw text string |

#### Implicit Text Components (always trigger refine)

| Component | Description | Value Format |
|-----------|-------------|--------------|
| smart_textarea | Text area with rotating prompts | Raw text string |
| tag_input | Large text input with suggestions | Raw text string |
| chat_simulator | Mini chat interface | Structured object |
| timeline_builder | Timeline with text inputs | Structured object |
| comparison_table | Two-column text inputs | Structured object |
| qa_list | Q&A text input pairs | Structured object |
| expandable_list | Expandable text inputs | Structured object |
| superpower_grid | Grid with text input area | Structured object |

---

## Benefits of This Approach

1. **LLM-Driven** - The LLM decides based on question context, not component type
2. **Decoupled** - Backend doesn't need to know which components support custom input
3. **Scalable** - Adding custom input to new components is a frontend-only change
4. **Flexible** - Same component can have custom input enabled or disabled per question
5. **Consistent** - All custom input flows through the same `allowCustomInput` flag

---

## Testing Checklist

### Implicit Text Components (should always trigger refine)
- [ ] `smart_textarea` triggers golden refine
- [ ] `tag_input` triggers golden refine
- [ ] `chat_simulator` triggers golden refine
- [ ] `timeline_builder` triggers golden refine
- [ ] `comparison_table` triggers golden refine
- [ ] `qa_list` triggers golden refine
- [ ] `expandable_list` triggers golden refine
- [ ] `superpower_grid` triggers golden refine

### Explicit Custom Input Components
- [ ] `icon_grid` with `allowCustomInput: true` triggers refine
- [ ] `icon_grid` with `allowCustomInput: false` does NOT trigger refine
- [ ] `detailed_cards` with `allowCustomInput: true` triggers refine
- [ ] `chip_cloud` with `allowCustomInput: true` triggers refine
- [ ] `toggle_list` shows "Add Other" when `allowCustomInput: true`
- [ ] `gradient_cards` shows "Add Other" when `allowCustomInput: true`

### General
- [ ] Custom values display correctly with visual indicators
- [ ] Custom values are passed correctly to backend
- [ ] LLM sets `allowCustomInput: true` for open-ended questions
