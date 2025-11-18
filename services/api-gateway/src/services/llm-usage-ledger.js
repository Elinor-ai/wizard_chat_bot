const TOKENS_PER_CREDIT = Number(process.env.LLM_TOKENS_PER_CREDIT ?? "1000");

function normalizeTokens(value) {
  if (value === undefined || value === null) {
    return 0;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return 0;
  }
  return Math.round(num);
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }
  const finishReason =
    typeof metadata.finishReason === "string" ? metadata.finishReason : undefined;
  if (!finishReason) {
    return undefined;
  }
  return { finishReason };
}

async function updateUserUsageCounters({
  firestore,
  logger,
  userId,
  tokensUsed,
  creditsUsed,
  timestamp
}) {
  if (!userId || tokensUsed <= 0) {
    return;
  }
  try {
    const userDoc = await firestore.getDocument("users", userId);
    if (!userDoc) {
      return;
    }
    const usageSnapshot =
      typeof userDoc.usage === "object" && userDoc.usage !== null
        ? { ...userDoc.usage }
        : {};
    usageSnapshot.totalTokensUsed = normalizeTokens(usageSnapshot.totalTokensUsed) + tokensUsed;
    usageSnapshot.remainingTokens = (usageSnapshot.remainingTokens ?? 0) - tokensUsed;
    usageSnapshot.remainingCredits = (usageSnapshot.remainingCredits ?? 0) - creditsUsed;
    usageSnapshot.lastActiveAt = timestamp;

    await firestore.saveDocument("users", userId, {
      usage: usageSnapshot,
      updatedAt: new Date()
    });
  } catch (error) {
    logger?.warn?.({ err: error, userId }, "llm.usage.user_update_failed");
  }
}

export async function recordLlmUsage({
  firestore,
  logger,
  usageContext = {},
  provider,
  model,
  metadata,
  status = "success",
  errorReason
}) {
  if (!firestore?.recordLlmUsage) {
    logger?.debug?.("llm.usage.ledger_not_configured");
    return;
  }

  const inputTokens = normalizeTokens(metadata?.promptTokens);
  const outputTokens = normalizeTokens(metadata?.responseTokens);
  const derivedTotal = inputTokens + outputTokens;
  const totalTokens = normalizeTokens(metadata?.totalTokens ?? derivedTotal);
  const timestamp = new Date();
  const creditsUsed =
    totalTokens > 0 && TOKENS_PER_CREDIT > 0
      ? Number((totalTokens / TOKENS_PER_CREDIT).toFixed(6))
      : 0;

  const entryPayload = {
    userId: usageContext.userId ?? null,
    jobId: usageContext.jobId ?? null,
    taskType: usageContext.taskType ?? "unspecified",
    provider: provider ?? "unknown",
    model: model ?? "unknown",
    inputTokens,
    outputTokens,
    totalTokens,
    creditsUsed,
    status,
    errorReason,
    timestamp,
    metadata: sanitizeMetadata(metadata)
  };

  try {
    await firestore.recordLlmUsage(entryPayload);
  } catch (error) {
    logger?.warn?.({ err: error }, "llm.usage.ledger_write_failed");
  }

  await updateUserUsageCounters({
    firestore,
    logger,
    userId: usageContext.userId,
    tokensUsed: totalTokens,
    creditsUsed,
    timestamp
  });
}

export async function recordLlmUsageFromResult({
  firestore,
  logger,
  usageContext = {},
  result
}) {
  if (!result) {
    return;
  }
  const metadata = result.metadata ?? null;
  const provider = result.provider ?? usageContext.provider ?? "unknown";
  const model = result.model ?? usageContext.model ?? "unknown";
  const status = result.error ? "error" : "success";
  const errorReason = result.error?.reason ?? null;

  await recordLlmUsage({
    firestore,
    logger,
    usageContext,
    provider,
    model,
    metadata,
    status,
    errorReason
  });
}
