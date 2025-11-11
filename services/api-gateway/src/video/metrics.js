const counters = new Map();

export function incrementMetric(logger, name, delta = 1, extra = {}) {
  const nextValue = (counters.get(name) ?? 0) + delta;
  counters.set(name, nextValue);
  logger.info({ metric: name, delta, value: nextValue, ...extra }, "Video metric updated");
}
