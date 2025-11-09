import {
  SUPPORTED_CHANNEL_MAP,
  normaliseChannelRecommendations,
  canonicalizeChannel,
} from "../domain/channels.js";
import { parseJsonContent, safePreview } from "../utils/parsing.js";

export function parseChannelResult(response, context = {}) {
  const parsed =
    response?.json && typeof response.json === "object"
      ? response.json
      : parseJsonContent(response?.text);

  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        reason: "structured_missing",
        rawPreview: safePreview(response?.text),
        message: "LLM did not return valid channel recommendations JSON",
      },
    };
  }

  const allowedMap = Array.isArray(context.supportedChannels)
    ? context.supportedChannels.reduce((acc, channel) => {
        if (typeof channel === "string") {
          acc[canonicalizeChannel(channel)] = channel;
        }
        return acc;
      }, {})
    : SUPPORTED_CHANNEL_MAP;

  const recommendations = normaliseChannelRecommendations(
    parsed.recommendations ?? parsed.channels ?? [],
    allowedMap
  );

  return {
    recommendations,
    metadata: response?.metadata ?? null,
  };
}
