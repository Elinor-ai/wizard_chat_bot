# Wizard Suggestions Architecture

This document describes the wizard flow, LLM-based suggestions system, and optimizations implemented for the job creation wizard.

## Overview

The wizard is a multi-step form for creating job postings. It has:
- **REQUIRED_STEPS (1-3)**: Basic job info that must be completed
- **OPTIONAL_STEPS (4+)**: Additional details that unlock after required steps are complete

Step 4 ("work-style") is the first optional step with fields: `workModel`, `industry`, `zipCode`. This is where LLM suggestions are fetched.

## Key Files

| File | Purpose |
|------|---------|
| `apps/web/components/wizard/use-wizard-controller.js` | Main wizard logic controller with state management, step navigation, and suggestion fetching |
| `apps/web/components/wizard/wizard-services.js` | API service layer for fetching suggestions, persisting drafts, copilot chat |
| `apps/web/components/wizard/wizard-shell.js` | Main UI component with form rendering and loading indicator |
| `apps/web/components/wizard/wizard-suggestion-panel.js` | Chat/suggestion panel (right side) |
| `apps/web/components/wizard/wizard-state.js` | Reducer and initial state for wizard |
| `apps/web/components/wizard/wizard-schema.js` | Step definitions, field schemas, REQUIRED_STEPS, OPTIONAL_STEPS |
| `apps/web/components/wizard/wizard-utils.js` | Utility functions (deepClone, getDeep, setDeep, etc.) |

## Suggestion Flow

### Entry Point: `handleNext` in use-wizard-controller.js

When user clicks "Next step" button:

```
handleNext() → persistCurrentDraft() → goToStep() → fetchSuggestionsForStep()
```

### Optimized Flow (Parallel Mode)

When `jobId` already exists (e.g., step 3→4 transition), the flow is parallelized:

```javascript
// Line 1791-1818 in use-wizard-controller.js
if (existingJobId) {
  goToStep(nextIndex);                    // Navigate immediately
  fetchSuggestionsForStep({...});         // Fire LLM request immediately
  persistCurrentDraft({}, stepId);        // Persist in background (non-blocking)
  return;
}
```

If no `jobId` exists yet, falls back to sequential mode (must persist first to create job).

### `fetchSuggestionsForStep` Function

Located at ~line 1242 in use-wizard-controller.js:

1. Validates user auth and stepId
2. Checks if step is optional (only optional steps get suggestions)
3. Checks if all required fields are complete
4. Aborts any existing request (`suggestionsAbortRef`)
5. Sets loading state: `dispatch({ type: "SET_SUGGESTIONS_LOADING", payload: true })`
6. Calls `fetchStepSuggestions()` from wizard-services.js
7. Processes response: filters, normalizes, stores in `autofilledFields`
8. Creates assistant messages with `kind: "suggestion"`

### Backend Call

`fetchStepSuggestions()` in wizard-services.js calls:
```javascript
WizardApi.fetchSuggestions({
  state,
  currentStepId,
  intent,
  updatedFieldId,
  updatedFieldValue,
  emptyFieldIds,
  upcomingFieldIds,
  visibleFieldIds,
}, { authToken, jobId, signal })
```

The backend endpoint `/wizard/suggestions` calls Gemini LLM to generate suggestions.

## Loading Indicator

The loading indicator is in `wizard-shell.js` (line ~328):

```jsx
{isFetchingSuggestions ? (
  <div className="flex items-center gap-3 rounded-xl border border-primary-200 bg-gradient-to-r from-primary-50 to-white px-4 py-3 shadow-sm">
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-2.5 w-2.5 rounded-full bg-primary-500 animate-bounce"
          style={{ animationDelay: `${index * 0.15}s` }}
        />
      ))}
    </div>
    <span className="text-sm font-medium text-primary-700">
      Generating smart suggestions for you...
    </span>
  </div>
) : null}
```

State is managed via:
- `SET_SUGGESTIONS_LOADING` action sets `isFetchingSuggestions: true`
- `SET_SUGGESTIONS_DONE` action sets `isFetchingSuggestions: false`

## Caching

Suggestions are cached in `suggestionsCacheRef` with 5-minute TTL:

```javascript
const SUGGESTIONS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const suggestionsCacheRef = useRef({});

// Cache structure:
suggestionsCacheRef.current[stepId] = {
  snapshotKey,      // JSON string of field values
  timestamp,        // Date.now()
  response,         // API response
};
```

Cache hit check at ~line 1328:
```javascript
const cacheIsValid = cachedEntry &&
  cachedEntry.snapshotKey === snapshotKey &&
  (Date.now() - cachedEntry.timestamp) < SUGGESTIONS_CACHE_TTL_MS;
```

## Timeout

Suggestions have a 45-second timeout in wizard-services.js:

```javascript
const SUGGESTIONS_TIMEOUT_MS = 60000;

function withTimeout(promise, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    promise.then((result) => {
      clearTimeout(timer);
      resolve(result);
    }).catch((error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
```

## State Management

### Key State Properties

```javascript
{
  state: {},                    // Current draft state (form values)
  committedState: {},           // Last saved state
  jobId: null,                  // Current job ID
  isFetchingSuggestions: false, // Loading state for suggestions
  autofilledFields: {},         // Suggestion metadata per field
  assistantMessages: [],        // Messages shown in panel (includes suggestions)
  copilotConversation: [],      // Chat messages with copilot
  hiddenFields: {},             // Fields hidden based on logic
}
```

### Relevant Actions

| Action | Purpose |
|--------|---------|
| `SET_SUGGESTIONS_LOADING` | Set/clear loading state |
| `SET_SUGGESTIONS_DONE` | Update autofilledFields, assistantMessages after fetch |
| `APPLY_SUGGESTION` | User accepts a suggestion |
| `REJECT_SUGGESTION` | User rejects a suggestion |
| `FIELD_CHANGE` | User manually changes a field |

## Debug Logging

Debug logs are enabled in non-production:

```javascript
const debugEnabled = process.env.NODE_ENV !== "production";
const debug = useCallback((...messages) => {
  if (debugEnabled) {
    console.log("[WizardController]", ...messages);
  }
}, [debugEnabled]);
```

Key debug points:
- `handleNext:parallel-mode` - When using optimized parallel flow
- `handleNext:sequential-mode` - When falling back to sequential
- `suggestions:fetch-start` - When suggestion request starts
- `suggestions:response-received` - When response arrives
- `suggestions:processed` - After processing suggestions
- `suggestions:cache-hit` - When using cached response

## Common Issues & Solutions

### Issue: Suggestions take too long (15+ seconds)

**Root cause**: `handleNext` was awaiting `persistCurrentDraft` before calling `fetchSuggestionsForStep`.

**Solution**: Parallelized the flow when jobId exists. Navigate and fetch suggestions immediately, persist in background.

### Issue: Loading indicator not showing

**Root cause**: `SET_SUGGESTIONS_LOADING` was dispatched after early return checks.

**Solution**: Ensure loading state is set before any async operations.

### Issue: Suggestions returned but not displayed

**Root cause**: Timeout was too short (8s) while backend took 30s.

**Solution**: Increased timeout to 45s.

### Issue: Racing condition with prefetch

**Root cause**: Both prefetch and regular fetch were running simultaneously.

**Solution**: Removed prefetch, rely on optimized parallel flow instead.

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /wizard/suggestions` | Fetch LLM suggestions for a step |
| `POST /wizard/persist` | Save draft state |
| `GET /wizard/job/:jobId` | Fetch existing job draft |
| `POST /wizard/copilot` | Send message to copilot |

## Gemini Integration

Suggestions use Gemini LLM. Key points:
- Model: `gemini-3-pro-preview` or similar
- `GROUNDED_TASKS` in gemini-adapter.js includes "suggest" for Google Search grounding
- Grounding may cause errors if model doesn't support it

## Testing Suggestions Flow

1. Complete steps 1-3 (required steps)
2. Click "Next step" to go to step 4
3. Watch console for `[WizardController]` debug logs
4. Loading indicator should appear immediately
5. Suggestions should populate in ~20-45 seconds (LLM response time)

## File Structure

```
apps/web/components/wizard/
├── use-wizard-controller.js   # Main controller hook
├── wizard-services.js         # API services
├── wizard-shell.js            # Main UI component
├── wizard-suggestion-panel.js # Chat panel
├── wizard-state.js            # Reducer/state
├── wizard-schema.js           # Step/field definitions
├── wizard-utils.js            # Utilities
├── wizard-step-renderer.js    # Step form rendering
└── draft-storage.js           # Local draft persistence
```
