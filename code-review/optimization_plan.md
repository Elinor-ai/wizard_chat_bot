# Implementation Plan - Open Question Code Optimizations

## Goal
Improve code structure, maintainability, and user experience based on the review of the "Open Question" feature implementation.

## User Review Required
> [!NOTE]
> These are non-breaking refactors and improvements.

---

## Completed Changes ✅

### Backend Service Refactoring

#### [COMPLETED] [service.js](file:///Users/elinorisraeli/Desktop/wizard_chat_bot/services/api-gateway/src/golden-interviewer/service.js)

1.  ✅ **Extracted `formatValueForRefinement`**: Added as a proper class method after `getAllowCustomInput()` at line 281-301. Handles strings, arrays, and objects for clean text representation.
2.  ✅ **Metadata Updates**: `lastToolAllowCustomInput` is now handled consistently via `getAllowCustomInput()` helper.

### Frontend Accessibility Improvements

#### [COMPLETED] [IconGridSelect.js](file:///Users/elinorisraeli/Desktop/wizard_chat_bot/apps/web/components/golden-interview/inputs/IconGridSelect.js)
- ✅ Added `aria-label` and `aria-pressed` to option buttons
- ✅ Added `role`, `aria-label`, `tabIndex`, and keyboard navigation to "Add Other" card
- ✅ Added `aria-label` to custom input field
- ✅ Added `aria-label` to remove buttons
- ✅ Added `aria-hidden` to decorative elements

#### [COMPLETED] [ToggleList.js](file:///Users/elinorisraeli/Desktop/wizard_chat_bot/apps/web/components/golden-interview/inputs/ToggleList.js)
- ✅ Added `aria-label` and `aria-pressed` to toggle buttons
- ✅ Added `aria-label` and `aria-pressed` to custom value buttons
- ✅ Added `role`, `aria-label`, `tabIndex`, and keyboard navigation to "Add Other" toggle
- ✅ Added `aria-label` to custom input field and submit button
- ✅ Added `aria-hidden` to decorative elements

#### [COMPLETED] [GradientCardGrid.js](file:///Users/elinorisraeli/Desktop/wizard_chat_bot/apps/web/components/golden-interview/inputs/GradientCardGrid.js)
- ✅ Added `aria-label` and `aria-pressed` to card buttons
- ✅ Added `aria-label` and `aria-pressed` to custom value cards
- ✅ Added `role`, `aria-label`, `tabIndex`, and keyboard navigation to "Add Other" card
- ✅ Added `aria-label` to custom input, Add button, and Cancel button
- ✅ Added `aria-hidden` to decorative elements

#### [COMPLETED] [ChipCloud.js](file:///Users/elinorisraeli/Desktop/wizard_chat_bot/apps/web/components/golden-interview/inputs/ChipCloud.js)
- ✅ Added `aria-label` and `aria-pressed` to chip buttons
- ✅ Added `aria-label` and `aria-pressed` to custom chip buttons
- ✅ Added `role` and `aria-label` to custom input container
- ✅ Added `aria-label` to custom input field and "+ Add" button
- ✅ Added `aria-label` to remove buttons
- ✅ Added `aria-hidden` to decorative checkmarks

#### [COMPLETED] [DetailedCardSelect.js](file:///Users/elinorisraeli/Desktop/wizard_chat_bot/apps/web/components/golden-interview/inputs/DetailedCardSelect.js)
- ✅ Added `aria-label` and `aria-pressed` to option cards
- ✅ Added `aria-label` and `aria-pressed` to custom value cards
- ✅ Added `role`, `aria-label`, `tabIndex`, and keyboard navigation to "Add New" card
- ✅ Added `aria-label` to title input, description textarea, Cancel button, and Add button
- ✅ Added `aria-hidden` to decorative elements

---

## Pending Improvements

### Additional Accessibility Enhancements
1. **Focus trap in custom input modes**: When entering custom input mode, trap focus within the input area until the user submits or cancels.
2. **Screen reader announcements**: Add `aria-live` regions to announce selection changes.
3. **Reduced motion support**: Add `prefers-reduced-motion` media query handling for animations.

### Code Quality
1. **Extract shared accessibility patterns**: Create a reusable hook or HOC for common accessibility patterns (aria-pressed buttons, keyboard navigation, etc.).
2. **Unit tests for accessibility**: Add automated accessibility tests using @testing-library/jest-dom and axe-core.

---

## Verification Plan
1.  **Run existing tests**: Ensure no regressions (`npm test`).
2.  **Manual Verification**: Verify the refactored logic still triggers refinement correctly.
3.  **Accessibility Testing**:
    - Test with screen reader (VoiceOver on Mac, NVDA on Windows)
    - Verify keyboard navigation works for all custom input flows
    - Check focus management when entering/exiting custom input mode
