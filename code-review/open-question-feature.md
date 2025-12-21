# Code Review: Open Question (Custom Input) Feature

## Overview

This document describes the implementation of the "Open Question" feature for the Golden Interview system. This feature allows users to provide custom text input when the predefined options don't match their answer.

**Date:** 2025-12-21
**Branch:** refactore-cmps
**Feature:** Allow custom user input in IconGridSelect component

---

## Problem Statement

Previously, users were forced to pick from a fixed set of options in the Golden Interview UI. This was problematic for questions where the provided options might not be exhaustive, such as:

- "What software do you use?"
- "Who are your competitors?"
- "What tools does your team use?"
- "What tech stack do you work with?"

Users had no way to add their own custom answers if their response wasn't listed.

---

## Solution

Implemented a full-stack solution that:

1. **Backend:** Teaches the LLM when to enable custom input
2. **Frontend:** Renders an "Add Other" card that transforms into a text input
3. **Data Flow:** Passes custom text values alongside option IDs seamlessly

---

## Files Changed

### 1. Backend: Tool Definitions

**File:** `services/api-gateway/src/golden-interviewer/tools-definition.js`

#### Changes Made

Added two new properties to the `icon_grid` schema:

```javascript
allowCustomInput: {
  type: "boolean",
  description:
    "When true, displays an 'Add Other' card that allows users to type a custom answer not listed in the options. Use this for open-ended questions where the provided options might not be exhaustive (e.g., 'What software do you use?', 'Who are your competitors?', 'What tools does your team use?'). The custom text value will be passed directly in the onChange event instead of an option ID.",
  required: false,
  default: false,
},
customInputPlaceholder: {
  type: "string",
  description:
    "Placeholder text shown in the custom input field when allowCustomInput is true",
  required: false,
  default: "Type your answer...",
},
```

Also updated `useCases` array to include:
- "Software/tools selection with custom additions"
- "Competitor identification"

#### Why These Changes

- The LLM needs to know this capability exists in order to use it
- The schema defines the contract between the LLM's output and the frontend components
- Adding to `useCases` helps the LLM understand when this component is appropriate

---

### 2. Backend: System Prompt

**File:** `services/api-gateway/src/golden-interviewer/prompts.js`

#### Changes Made

1. **Updated the CONDENSED_TOOL_SCHEMA table** to include `allowCustomInput` as a prop for `icon_grid`:

```
| icon_grid | Visual multi-select with icons | **title**, **options**[{id,label,icon}], multiple, allowCustomInput | ... |
```

2. **Added a new section "ALLOW CUSTOM INPUT (Open Questions)"** in the CRITICAL RULES:

```markdown
### 6. ALLOW CUSTOM INPUT (Open Questions)
When asking questions where the provided options might NOT be exhaustive, you MUST set `allowCustomInput: true` on icon_grid components.

**ALWAYS use allowCustomInput: true for:**
- Software/tools questions: "What software do you use?", "Which tools does your team use?"
- Competitor questions: "Who are your main competitors?"
- Industry-specific tools: "What CRM/ERP/platforms do you use?"
- Role-specific technologies: "What tech stack do you work with?"
- Any question where "Other" would be a common answer
```

Also included a complete JSON example and explanation of how custom values work.

#### Why These Changes

- The LLM needs explicit instructions on **when** to use this feature
- Without clear guidelines, the LLM might never set `allowCustomInput: true`
- The example provides a copy-paste reference for correct usage
- Explaining that custom values are "raw text strings (not IDs)" prevents confusion

---

### 3. Frontend: IconGridSelect Component

**File:** `apps/web/components/golden-interview/inputs/IconGridSelect.js`

#### Changes Made

**A. Added new imports and state:**

```javascript
import { useState, useRef, useEffect } from "react";

// New props
allowCustomInput = false,
customInputPlaceholder = "Type your answer...",

// New state
const [isAddingCustom, setIsAddingCustom] = useState(false);
const [customInputValue, setCustomInputValue] = useState("");
const customInputRef = useRef(null);
```

**B. Renamed `selectedIds` to `selectedValues`:**

This reflects that the array can now contain both option IDs AND custom text strings.

**C. Added custom input handlers:**

```javascript
// Handle submitting custom input
const handleCustomInputSubmit = () => {
  const trimmedValue = customInputValue.trim();
  if (!trimmedValue) {
    setIsAddingCustom(false);
    return;
  }
  handleSelect(trimmedValue); // Pass raw text, not an ID
  setCustomInputValue("");
  setIsAddingCustom(false);
};

// Handle keyboard events
const handleCustomInputKeyDown = (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleCustomInputSubmit();
  } else if (e.key === "Escape") {
    setCustomInputValue("");
    setIsAddingCustom(false);
  }
};
```

**D. Added "Add Other" card to the grid:**

```jsx
{allowCustomInput && (
  <div
    className={`relative aspect-square p-4 rounded-xl border-2 border-dashed ...`}
    onClick={() => !isAddingCustom && setIsAddingCustom(true)}
  >
    {isAddingCustom ? (
      // Input mode - shows text field
      <input
        ref={customInputRef}
        type="text"
        value={customInputValue}
        onChange={(e) => setCustomInputValue(e.target.value)}
        onKeyDown={handleCustomInputKeyDown}
        onBlur={handleCustomInputSubmit}
        placeholder={customInputPlaceholder}
        autoFocus
      />
    ) : (
      // Button mode - shows plus icon
      <>
        <svg>...</svg>
        <span>Add Other</span>
      </>
    )}
  </div>
)}
```

**E. Updated selected summary to handle custom values:**

```jsx
{selectedValues.map((val) => {
  const option = options.find((o) => o.id === val);
  const isCustom = !option; // If no matching option, it's a custom value

  return (
    <span key={val}>
      {isCustom ? (
        // Show pencil icon for custom values
        <svg>...</svg>
      ) : isEmoji ? (
        <span>{option?.icon}</span>
      ) : (
        <DynamicIcon name={option?.icon} />
      )}
      <span>{isCustom ? val : option?.label}</span>
      ...
    </span>
  );
})}
```

#### Why These Changes

| Change | Reason |
|--------|--------|
| Dashed border on "Add Other" card | Visually distinguishes it from regular options |
| Auto-focus on input | Better UX - user can start typing immediately |
| Enter to submit | Standard form behavior |
| Escape to cancel | Allows user to back out without submitting |
| Blur to submit | Submits when user clicks elsewhere |
| Pencil icon for custom values | Visual indicator that this was user-typed |
| Display custom text directly | Shows the actual user input instead of an ID |

---

### 4. Frontend: ChatInterface (Verification Only)

**File:** `apps/web/components/golden-interview/ChatInterface.js`

#### Analysis

No changes were required. The existing implementation is already robust:

```javascript
const handleDynamicSubmit = () => {
  if (dynamicValue === null || dynamicValue === undefined) return;
  sendMessage(null, dynamicValue);
};
```

The `dynamicValue` is passed directly to the API without format validation. This means:

- Single string values work (option ID or custom text)
- Arrays with mixed content work (option IDs + custom text)
- The backend receives exactly what the component produces

#### Why No Changes

The ChatInterface was designed with flexibility in mind. It doesn't assume:
- What type of value the UI component produces
- What format the API expects
- Whether values are IDs or raw text

This abstraction layer made adding custom input seamless.

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         LLM Response                            │
│  { "ui_tool": { "type": "icon_grid", "props": {                │
│      "allowCustomInput": true, ...                              │
│  }}}                                                            │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    IconGridSelect Component                     │
│  - Renders predefined options                                   │
│  - Renders "Add Other" card (when allowCustomInput=true)        │
│  - User clicks option → onChange(["option_id"])                 │
│  - User types custom → onChange(["option_id", "Custom Text"])   │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       ChatInterface                             │
│  dynamicValue = ["slack", "Custom Tool Name"]                   │
│  sendMessage(null, dynamicValue)                                │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend API                             │
│  uiResponse: ["slack", "Custom Tool Name"]                      │
│  → Saved to Golden Schema                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Testing Recommendations

1. **Single-select mode:**
   - Select a predefined option → verify it's highlighted
   - Click "Add Other" → type text → press Enter → verify custom text becomes the value
   - Verify clicking another option replaces the custom text

2. **Multi-select mode:**
   - Select multiple predefined options
   - Add a custom value → verify it appears in the chips below
   - Remove the custom value → verify it's gone
   - Verify custom values count toward `maxSelections`

3. **Edge cases:**
   - Empty custom input → should be ignored
   - Whitespace-only input → should be trimmed and ignored
   - Very long custom text → should display properly
   - Special characters → should be handled correctly

4. **LLM Integration:**
   - Ask about software/tools → verify LLM sets `allowCustomInput: true`
   - Submit a mix of IDs and custom text → verify backend receives correctly

---

## Future Improvements

1. **Validation:** Could add a `customInputValidator` prop for format validation
2. **Suggestions:** Could show autocomplete suggestions for custom input
3. **Limit custom entries:** Could add `maxCustomEntries` prop
4. **Edit custom values:** Could allow editing existing custom values inline

---

## Phase 2: Extended to Additional Components

**Date:** 2025-12-21

Following the successful implementation for IconGridSelect, the "Open Question" feature has been extended to two additional components.

---

### 5. Frontend: DetailedCardSelect Component

**File:** `apps/web/components/golden-interview/inputs/DetailedCardSelect.js`

#### Changes Made

**A. Added new props and state:**

```javascript
// New props
allowCustomInput = false,
customTitlePlaceholder = "Enter title...",
customDescriptionPlaceholder = "Enter description (optional)...",

// New state
const [isAddingCustom, setIsAddingCustom] = useState(false);
const [customTitle, setCustomTitle] = useState("");
const [customDescription, setCustomDescription] = useState("");
const titleInputRef = useRef(null);
```

**B. Renamed `selectedIds` to `selectedValues`:**

This allows the array to contain both option IDs AND custom value objects.

**C. Added helper function for ID extraction:**

```javascript
const getValueId = (val) => (typeof val === "object" && val?.id ? val.id : val);
```

**D. Added custom card form submission:**

```javascript
const handleCustomSubmit = () => {
  const trimmedTitle = customTitle.trim();
  if (!trimmedTitle) {
    setIsAddingCustom(false);
    return;
  }

  // Create custom value object with unique ID
  const customValue = {
    id: `custom-${Date.now()}`,
    title: trimmedTitle,
    description: customDescription.trim() || undefined,
    isCustom: true,
  };

  handleSelect(customValue);
  // Reset form...
};
```

**E. Added "Add New Option" card with form:**

- Dashed border styling to distinguish from regular cards
- Title input field (required)
- Description textarea (optional)
- Add/Cancel buttons
- Keyboard support (Enter to submit, Escape to cancel)

**F. Renders selected custom cards:**

Custom value objects are displayed as cards with:
- Pencil icon (indicates user-created)
- "Custom" badge
- Title and optional description
- Click to deselect

#### Why These Changes

| Change | Reason |
|--------|--------|
| Object-based custom values | Cards need structured data (title + description) unlike simple chips |
| Unique timestamp ID | Prevents collisions and enables proper React key handling |
| `isCustom: true` flag | Allows backend/frontend to identify user-created entries |
| Two-field form | Matches the card format (title + description) |

---

### 6. Frontend: ChipCloud Component

**File:** `apps/web/components/golden-interview/inputs/ChipCloud.js`

#### Changes Made

**A. Added new props and state:**

```javascript
// New props
allowCustomInput = false,
customInputPlaceholder = "Add custom...",

// New state
const [isAddingCustom, setIsAddingCustom] = useState(false);
const [customInputValue, setCustomInputValue] = useState("");
const customInputRef = useRef(null);
```

**B. Added custom chip detection:**

```javascript
const isCustomChip = (itemId) => {
  for (const group of safeGroups) {
    const safeItems = Array.isArray(group.items) ? group.items : [];
    if (safeItems.some((item) => item?.id === itemId)) {
      return false;
    }
  }
  return true;
};

const customChips = safeValue.filter(isCustomChip);
```

**C. Added custom chip submission:**

```javascript
const handleCustomSubmit = () => {
  const trimmedValue = customInputValue.trim();
  if (!trimmedValue) {
    setIsAddingCustom(false);
    return;
  }

  // Don't add duplicates
  if (!safeValue.includes(trimmedValue)) {
    if (!maxSelections || safeValue.length < maxSelections) {
      onChange([...safeValue, trimmedValue]);
    }
  }
  // Reset...
};
```

**D. Added "+ Add" chip with inline input:**

- "+ Add" button chip with dashed border
- Transforms into inline text input when clicked
- Keyboard support (Enter to submit, Escape to cancel)
- Respects `maxSelections` limit

**E. Custom chips section:**

- "Custom" label header when custom chips exist
- Custom chips displayed with checkmark
- Pencil icon in the selected summary for custom values

#### Why These Changes

| Change | Reason |
|--------|--------|
| Inline input in chip style | Matches the visual language of chip selection |
| Duplicate prevention | Avoids adding the same custom value twice |
| Respects maxSelections | Custom chips count toward the limit |
| "Custom" group header | Visually separates user-created from predefined chips |

---

### 7. Backend: Tool Definitions Updates

**File:** `services/api-gateway/src/golden-interviewer/tools-definition.js`

#### Changes for `detailed_cards`:

```javascript
allowCustomInput: {
  type: "boolean",
  description:
    "When true, displays an 'Add New Option' card that allows users to create a custom card with their own title and description. Use this for open-ended questions where the provided options might not be exhaustive (e.g., 'What are your marketing goals?', 'Describe your ideal work arrangement'). Custom values are returned as objects with {id, title, description, isCustom: true}.",
  required: false,
  default: false,
},
customTitlePlaceholder: { ... },
customDescriptionPlaceholder: { ... },
```

Updated `useCases` to include:
- "Marketing goals with custom additions"
- "Work arrangement preferences"

#### Changes for `chip_cloud`:

```javascript
allowCustomInput: {
  type: "boolean",
  description:
    "When true, displays a '+ Add' chip that allows users to type custom tags/keywords not listed in the options. Use this for open-ended tag questions where users might have unique inputs (e.g., 'What keywords describe your brand?', 'What technologies do you use?'). Custom values are added as raw text strings to the selection array.",
  required: false,
  default: false,
},
customInputPlaceholder: { ... },
```

Updated `useCases` to include:
- "Brand keywords with custom additions"
- "Custom tag entry"

---

### 8. Backend: System Prompt Updates

**File:** `services/api-gateway/src/golden-interviewer/prompts.js`

Updated the CONDENSED_TOOL_SCHEMA table to show `allowCustomInput` for all three components.

Expanded the "ALLOW CUSTOM INPUT (Open Questions)" section to:
1. List all three supported components
2. Add new use cases (marketing keywords, goals)
3. Provide examples for each component type
4. Explain the different data formats returned

---

## Summary of Custom Value Data Formats

| Component | Custom Value Format | Example |
|-----------|---------------------|---------|
| `icon_grid` | Raw text string | `"Custom Tool Name"` |
| `detailed_cards` | Object with id, title, description | `{ id: "custom-1703...", title: "My Goal", description: "...", isCustom: true }` |
| `chip_cloud` | Raw text string | `"custom-keyword"` |

---

## Additional Testing Recommendations

### DetailedCardSelect:
1. Click "Add New Option" → verify form appears
2. Enter title only → click Add → verify card appears with title
3. Enter title + description → verify both display
4. Click custom card → verify it's deselected
5. Cancel button → verify form closes without adding

### ChipCloud:
1. Click "+ Add" chip → verify inline input appears
2. Type text → press Enter → verify chip appears as selected
3. Verify custom chip shows in "Selected" summary with pencil icon
4. Try adding duplicate → verify it's ignored
5. Verify maxSelections is respected for custom chips

---

## Phase 3: Typing Indicator Positioning Fix

**Date:** 2025-12-21

### Problem

The typing/thinking indicator (bouncing dots) was appearing as a separate block below the message, visually distant from the question text. Users expected it to appear near the message for better visual association.

### Solution

**File:** `apps/web/components/golden-interview/ChatInterface.js`

Moved the typing indicator to be inline with the message area:

#### Before (lines 675-701):
```jsx
{/* Message div */}
<div className="mb-8 ...">
  {/* message content */}
</div>

{/* Typing indicator - separate block */}
{isTyping && (
  <div className="mb-6 flex items-center gap-3">
    {/* Large icon box + large dots */}
  </div>
)}
```

#### After:
```jsx
{/* Message container with inline typing indicator */}
<div className="mb-8">
  <div className="text-lg ...">
    {/* message content */}
  </div>

  {/* Typing indicator - inline with message */}
  {isTyping && (
    <div className="mt-4 flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50">
        <BulbIcon className="h-4 w-4 text-primary-500" />
      </div>
      <div className="flex gap-1 rounded-lg bg-slate-100 px-3 py-2">
        <span className="h-1.5 w-1.5 animate-bounce ..." />
        <span className="h-1.5 w-1.5 animate-bounce ..." />
        <span className="h-1.5 w-1.5 animate-bounce ..." />
      </div>
      <span className="text-sm text-slate-400">Thinking...</span>
    </div>
  )}
</div>
```

#### Changes Made:
| Change | Reason |
|--------|--------|
| Wrapped message + indicator in single container | Groups them visually |
| Used `mt-4` instead of `mb-6` | Positions below message with less separation |
| Smaller icon box (h-8 w-8 vs h-10 w-10) | More subtle appearance |
| Smaller dots (h-1.5 w-1.5 vs h-2 w-2) | Less visually heavy |
| Added "Thinking..." text | Clearer indication of what's happening |

---

## Conclusion

This implementation provides a seamless way for users to add custom answers while maintaining backward compatibility with existing functionality. The changes are minimal, focused, and follow existing patterns in the codebase.

**Components with Custom Input Support:**
- IconGridSelect (Phase 1)
- DetailedCardSelect (Phase 2)
- ChipCloud (Phase 2)

**UI Improvements:**
- Typing indicator now appears inline with message text (Phase 3)
- Unified typing indicator - hides message during loading (Phase 4)

**Backend Improvements:**
- Golden Refine triggers for custom input components (Phase 4)

---

## Phase 4: Unified Typing Indicator & Refine for Custom Input

**Date:** 2025-12-21

### Problem 1: Dual Typing Indicators

The typing indicator was showing separately from the message - the message would display, then the typing indicator would appear below it. This created two separate visual elements during the loading state instead of one unified indicator.

### Solution 1: Unified Typing Indicator

**File:** `apps/web/components/golden-interview/ChatInterface.js`

Changed from showing message + separate indicator to showing ONLY the indicator when typing:

#### Before:
```jsx
{/* Question / Message - always visible */}
<div className="mb-8 ...">
  {/* message content */}
</div>

{/* Typing Indicator - shown below message */}
{isTyping && (
  <div className="mb-6 ...">
    {/* indicator */}
  </div>
)}
```

#### After:
```jsx
{/* Typing Indicator OR Message - mutually exclusive */}
{isTyping ? (
  <div className="mb-6 flex items-center gap-3">
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
      <BulbIcon className="h-5 w-5 text-primary-500" />
    </div>
    <div className="flex gap-1.5 rounded-xl bg-slate-100 px-4 py-3">
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
    </div>
  </div>
) : (
  /* Question / Message - only shown when not typing */
  <div className="mb-8 ...">
    {/* message content */}
  </div>
)}
```

#### Result:
- When `isTyping=true`: Only the typing indicator shows (message hidden)
- When `isTyping=false`: Message and component show (indicator hidden)
- Single unified loading state instead of dual elements

---

### Problem 2: Refine Not Triggered for Custom Input

The `golden_refine` validation was only triggered for `smart_textarea` and `tag_input` tools. When users entered custom text via `allowCustomInput: true` on components like `icon_grid`, `detailed_cards`, or `chip_cloud`, the refine check was bypassed.

### Solution 2: Refine Triggered by allowCustomInput Flag

**File:** `services/api-gateway/src/golden-interviewer/service.js`

#### A. Store allowCustomInput flag in session metadata

**Line 399** (first turn - startSession):
```javascript
session.metadata.lastToolUsed = firstTurnResponse.ui_tool?.type;
session.metadata.lastToolAllowCustomInput = firstTurnResponse.ui_tool?.props?.allowCustomInput || false;
```

**Line 1085** (subsequent turns - processTurn):
```javascript
session.metadata = {
  ...session.metadata,
  lastToolUsed: parsed.ui_tool?.type,
  lastToolAllowCustomInput: parsed.ui_tool?.props?.allowCustomInput || false,
  // ... other fields
};
```

#### B. Update shouldRefine logic (lines 632-639)

**Before:**
```javascript
const previousToolType = session.metadata?.lastToolUsed;
const shouldRefine = this.isRefineableToolType(previousToolType) &&
  valueToSave !== null &&
  typeof valueToSave === "string" &&
  valueToSave.trim().length > 0 &&
  !isSkip &&
  !acceptRefinedValue;
```

**After:**
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

#### Refine Trigger Logic:

| Condition | Triggers Refine |
|-----------|-----------------|
| Tool is `smart_textarea` | Yes (always free-text) |
| Tool is `tag_input` | Yes (always free-text) |
| Tool has `allowCustomInput: true` | Yes (user can enter custom text) |
| Tool is selection-only (no custom input) | No |

#### Data Flow:

```
┌─────────────────────────────────────────────────────────────────┐
│                    LLM Response (Turn N)                        │
│  ui_tool: { type: "icon_grid", props: { allowCustomInput: true }}│
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Session Metadata Saved                       │
│  lastToolUsed: "icon_grid"                                      │
│  lastToolAllowCustomInput: true                                 │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    User Submits (Turn N+1)                      │
│  userMessage: "Custom Tool Name" (free text from custom input)  │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    shouldRefine Check                           │
│  previousToolAllowCustomInput = true → shouldRefine = true      │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    golden_refine API Called                     │
│  → Validates free-text input                                    │
│  → Returns suggestions if quality could improve                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Summary of Phase 4 Changes

| File | Change | Purpose |
|------|--------|---------|
| `ChatInterface.js` | Ternary for typing indicator vs message | Single unified loading state |
| `service.js:399` | Store `lastToolAllowCustomInput` (first turn) | Track if tool allows custom input |
| `service.js:1085` | Store `lastToolAllowCustomInput` (subsequent turns) | Track if tool allows custom input |
| `service.js:633-634` | Check `previousToolAllowCustomInput` in shouldRefine | Trigger refine for custom input |

---

## Testing Recommendations for Phase 4

### Unified Typing Indicator:
1. Submit a response → verify only typing indicator shows (no message visible)
2. When response loads → verify message appears and indicator disappears
3. No "flash" of message before indicator

### Refine for Custom Input:
1. Get an `icon_grid` with `allowCustomInput: true`
2. Add a custom text value via "Add Other"
3. Submit → verify `golden_refine` is called (check backend logs)
4. If quality="could_improve" → verify suggestions UI appears
5. Select suggestion or keep original → verify it proceeds

### Edge Cases:
1. Select only predefined options (no custom) → refine should still trigger if `allowCustomInput: true`
2. Mixed selection (predefined + custom) → refine should trigger
3. `allowCustomInput: false` → refine should NOT trigger for selection-only components
