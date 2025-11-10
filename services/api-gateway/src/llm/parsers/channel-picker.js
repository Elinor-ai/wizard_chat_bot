import {
  CHANNEL_CATALOG_MAP,
  CHANNEL_CATALOG,
} from "../domain/channel-catalog.js";
import { parseJsonContent, safePreview } from "../utils/parsing.js";

const ROLE_FAMILIES = new Set([
  "hourly",
  "healthcare",
  "tech",
  "creative",
  "corporate",
  "logistics_trades",
]);

function normalizeMedium(channel, requested) {
  if (!channel) return null;
  if (channel.media.includes(requested)) return requested;
  // Fallback preferences: video > image > text order depending on channel support
  const preferenceOrder = ["video", "image", "text"];
  for (const medium of preferenceOrder) {
    if (channel.media.includes(medium)) {
      return medium;
    }
  }
  return channel.media[0] ?? null;
}

export function parseChannelPickerResult(response) {
  const parsed =
    response?.json && typeof response.json === "object"
      ? response.json
      : parseJsonContent(response?.text);

  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        reason: "structured_missing",
        rawPreview: safePreview(response?.text),
        message: "LLM did not return valid channel picker JSON",
      },
    };
  }

  const jobTitle = typeof parsed.job_title === "string" ? parsed.job_title : "";
  const geo =
    parsed.geo && typeof parsed.geo === "object"
      ? {
          country:
            typeof parsed.geo.country === "string"
              ? parsed.geo.country
              : "Unknown",
          region_or_city:
            typeof parsed.geo.region_or_city === "string"
              ? parsed.geo.region_or_city
              : null,
        }
      : { country: "Unknown", region_or_city: null };

  const roleFamily = ROLE_FAMILIES.has(parsed.role_family)
    ? parsed.role_family
    : null;

  const topChannelId = parsed?.top_channel?.id;
  const topChannel = CHANNEL_CATALOG_MAP[topChannelId];
  if (!topChannel) {
    return {
      error: {
        reason: "invalid_channel",
        rawPreview: safePreview(response?.text),
        message: "Top channel missing or not in closed list",
      },
    };
  }

  const fitScore = Number(parsed?.top_channel?.fit_score);
  if (Number.isNaN(fitScore)) {
    return {
      error: {
        reason: "invalid_fit_score",
        rawPreview: safePreview(response?.text),
        message: "Top channel fit score missing",
      },
    };
  }

  let medium =
    typeof parsed.recommended_medium === "string"
      ? parsed.recommended_medium
      : null;
  medium = normalizeMedium(topChannel, medium);

  const copyHint =
    typeof parsed.copy_hint === "string" ? parsed.copy_hint.trim() : "";

  const alternatives = Array.isArray(parsed.alternatives)
    ? parsed.alternatives
        .slice(0, 2)
        .map((alt) => {
          const altChannel = CHANNEL_CATALOG_MAP[alt?.id];
          const altScore = Number(alt?.fit_score);
          if (!altChannel || Number.isNaN(altScore)) {
            return null;
          }
          return {
            id: altChannel.id,
            fit_score: altScore,
          };
        })
        .filter(Boolean)
    : [];

  const compliance = Array.isArray(parsed.compliance_flags)
    ? parsed.compliance_flags
        .filter((flag) => typeof flag === "string")
        .slice(0, 5)
    : [];

  return {
    jobTitle,
    geo,
    roleFamily,
    topChannel: {
      id: topChannel.id,
      name: topChannel.name,
      fitScore: fitScore,
      reasonShort:
        typeof parsed?.top_channel?.reason_short === "string"
          ? parsed.top_channel.reason_short
          : "",
    },
    recommendedMedium: medium ?? topChannel.media[0] ?? "text",
    copyHint,
    alternatives,
    complianceFlags: compliance,
    metadata: response?.metadata ?? null,
  };
}
