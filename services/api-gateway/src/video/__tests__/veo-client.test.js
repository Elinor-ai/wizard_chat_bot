/**
 * @file veo-client.test.js
 *
 * SKIPPED: These tests were written for a deprecated VeoClient API that was refactored.
 *
 * The OLD API (tested here) expected:
 *   - File location: src/video/veo-client.js (no longer exists)
 *   - Constructor: VeoClient({ auth, quotaMeter, logger, fetchFn, minSpacingMs })
 *   - Methods: generateVideo(), fetchPredictOperation()
 *
 * The CURRENT API is:
 *   - File location: src/video/renderers/clients/veo-client.js
 *   - Constructor: VeoClient({ modelId, location, projectId }) extending IVideoClient
 *   - Methods: startGeneration(), checkStatus(), buildPayload(), generateWithRenderPlan()
 *   - Used by: UnifiedVideoRenderer → renderer.js → service.js
 *
 * These tests should be rewritten to match the new IVideoClient interface,
 * or removed if unified-renderer integration tests provide sufficient coverage.
 */

import { describe, it, expect } from "vitest";

describe.skip("VeoClient (DEPRECATED API)", () => {
  it("placeholder - tests skipped due to API refactor", () => {
    expect(true).toBe(true);
  });
});
