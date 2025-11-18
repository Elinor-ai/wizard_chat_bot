const DRAFT_PREFIX = "wizard:draft";
const ONE_HOUR_MS = 60 * 60 * 1000;

function buildKey(userId, jobId) {
  if (!userId) return null;
  const suffix = jobId ?? "new";
  return `${DRAFT_PREFIX}:${userId}:${suffix}`;
}

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readEntry(key) {
  if (!isBrowser() || !key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

export function loadDraft({ userId, jobId, ttl = ONE_HOUR_MS } = {}) {
  const key = buildKey(userId, jobId);
  const entry = readEntry(key);
  if (!entry) return null;

  const age = Date.now() - (entry.updatedAt ?? 0);
  if (Number.isFinite(ttl) && ttl > 0 && age > ttl) {
    clearDraft({ userId, jobId });
    return null;
  }
  return entry;
}

export function saveDraft({
  userId,
  jobId,
  state,
  includeOptional,
  currentStepIndex,
  maxVisitedIndex,
  companyId = null,
  ttl = ONE_HOUR_MS,
} = {}) {
  const key = buildKey(userId, jobId);
  if (!isBrowser() || !key) return;
  try {
    const entry = {
      userId,
      jobId: jobId ?? null,
      state: state ?? {},
      includeOptional: Boolean(includeOptional),
      currentStepIndex: Number.isFinite(currentStepIndex) ? currentStepIndex : 0,
      maxVisitedIndex: Number.isFinite(maxVisitedIndex) ? maxVisitedIndex : 0,
      companyId: companyId ?? null,
      updatedAt: Date.now(),
      ttl,
    };
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Ignore storage failures (quota, JSON issues, etc.)
  }
}

export function clearDraft({ userId, jobId } = {}) {
  if (!isBrowser()) return;
  const key = buildKey(userId, jobId);
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
