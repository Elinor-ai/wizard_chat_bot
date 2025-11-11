import { resolveVideoSpec } from "@wizard/core";

const BASE_SECONDS = 8;
const EXTEND_SECONDS = 7;

export function computeDurationPlan({ channelId, overrides = {} }) {
  const spec = overrides.spec ?? resolveVideoSpec(channelId);
  const min = overrides.minSeconds ?? spec.duration?.minSeconds ?? BASE_SECONDS;
  const max = overrides.maxSeconds ?? spec.duration?.maxSeconds ?? BASE_SECONDS;
  let extendsNeeded = 0;
  if (min > BASE_SECONDS) {
    extendsNeeded = Math.ceil((min - BASE_SECONDS) / EXTEND_SECONDS);
  }
  let plannedDuration = BASE_SECONDS + extendsNeeded * EXTEND_SECONDS;
  while (plannedDuration > max && extendsNeeded > 0) {
    extendsNeeded -= 1;
    plannedDuration = BASE_SECONDS + extendsNeeded * EXTEND_SECONDS;
  }
  plannedDuration = Math.min(Math.max(plannedDuration, min), max);
  return {
    spec,
    targetSeconds: plannedDuration,
    extendsNeeded,
    baseSeconds: BASE_SECONDS,
    extendSeconds: EXTEND_SECONDS
  };
}
