import {
  CampaignSchema,
  CHANNEL_CATALOG,
  CHANNEL_CATALOG_MAP,
} from "@wizard/core";

export function canonicalizeChannel(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  return normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export const SUPPORTED_CHANNELS = CampaignSchema.shape.channel.options;
export const SUPPORTED_CHANNEL_MAP = SUPPORTED_CHANNELS.reduce(
  (acc, channel) => {
    acc[canonicalizeChannel(channel)] = channel;
    return acc;
  },
  {}
);

export { CHANNEL_CATALOG, CHANNEL_CATALOG_MAP };
