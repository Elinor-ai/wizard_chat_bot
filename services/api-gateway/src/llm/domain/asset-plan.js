import {
  buildAssetPlan,
  splitAssetPlan,
  CHANNEL_CATALOG_MAP
} from "@wizard/core";

export function createAssetPlan({ channelIds = [] } = {}) {
  const plan = buildAssetPlan({ channelIds });
  const buckets = splitAssetPlan(plan.items);
  const channelMeta = channelIds.map((channelId) => ({
    id: channelId,
    ...(CHANNEL_CATALOG_MAP[channelId] ?? {})
  }));
  return {
    ...plan,
    ...buckets,
    channelMeta
  };
}
