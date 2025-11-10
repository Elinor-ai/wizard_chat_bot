import {
  canonicalizeChannel,
  SUPPORTED_CHANNELS,
  SUPPORTED_CHANNEL_MAP,
} from "./channel-catalog.js";

export { canonicalizeChannel, SUPPORTED_CHANNELS, SUPPORTED_CHANNEL_MAP } from "./channel-catalog.js";

export function normaliseChannelRecommendations(
  recommendations = [],
  supportedMap = SUPPORTED_CHANNEL_MAP
) {
  if (!Array.isArray(recommendations)) {
    return [];
  }
  const seen = new Set();
  const result = [];

  recommendations.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const canonical = canonicalizeChannel(entry.channel);
    const supported = supportedMap[canonical];
    if (!supported || seen.has(supported)) {
      return;
    }
    const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
    if (!reason) {
      return;
    }

    let expectedCPA;
    if (entry.expectedCPA !== undefined && entry.expectedCPA !== null) {
      const numeric = Number(entry.expectedCPA);
      if (!Number.isNaN(numeric) && numeric >= 0) {
        expectedCPA = numeric;
      }
    }

    result.push({
      channel: supported,
      reason,
      expectedCPA,
    });
    seen.add(supported);
  });

  return result;
}
