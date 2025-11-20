import {
  resolveCreditConversion,
  resolveImagePricing,
  resolveTextPricing,
  resolveVideoPricing,
  resolveProviderPlanName
} from "../config/pricing-rates.js";

const MILLION = 1_000_000;

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
    usageSnapshot.remainingCredits = (usageSnapshot.remainingCredits ?? 0) - creditsUsed;
    usageSnapshot.lastActiveAt = timestamp;

    const creditsSnapshot =
      typeof userDoc.credits === "object" && userDoc.credits !== null
        ? { ...userDoc.credits }
        : {};
    creditsSnapshot.balance = usageSnapshot.remainingCredits;
    if (typeof creditsSnapshot.reserved !== "number") {
      creditsSnapshot.reserved = 0;
    }
    if (typeof creditsSnapshot.lifetimeUsed !== "number") {
      creditsSnapshot.lifetimeUsed = 0;
    }

    await firestore.saveDocument("users", userId, {
      usage: usageSnapshot,
      credits: creditsSnapshot,
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
  errorReason,
  usageType = "text",
  usageMetrics = {}
}) {
  if (!firestore?.recordLlmUsage) {
    logger?.debug?.("llm.usage.ledger_not_configured");
    return;
  }

  const inputTokens = normalizeTokens(metadata?.promptTokens);
  const outputTokens = normalizeTokens(metadata?.responseTokens);
  const derivedTotal = inputTokens + outputTokens;
  const totalTokens = normalizeTokens(metadata?.totalTokens ?? derivedTotal);
  const cachedTokens = normalizeTokens(
    usageMetrics.cachedTokens ?? metadata?.cachedTokens ?? metadata?.cachedPromptTokens
  );
  const timestamp = new Date();
  const resolvedUsageType = usageType ?? usageContext.usageType ?? "text";

  let estimatedCostUsd = 0;
  let inputCostPerMillionUsd;
  let outputCostPerMillionUsd;
  let cachedInputCostPerMillionUsd;
  let imageCostPerUnitUsd;
  let videoCostPerSecondUsd;

  const usdPerCredit = resolveCreditConversion(provider);
  const pricingPlan = resolveProviderPlanName(provider);

  if (resolvedUsageType === "image") {
    const imagePricing = resolveImagePricing(provider, model);
    imageCostPerUnitUsd = imagePricing.costPerUnitUsd ?? 0;
    const units =
      typeof usageMetrics.units === "number" && usageMetrics.units > 0
        ? usageMetrics.units
        : 1;
    estimatedCostUsd = imageCostPerUnitUsd * units;
  } else if (resolvedUsageType === "video") {
    const videoPricing = resolveVideoPricing(provider, model);
    videoCostPerSecondUsd = videoPricing.costPerSecondUsd ?? 0;
    const seconds =
      typeof usageMetrics.seconds === "number" && usageMetrics.seconds > 0
        ? usageMetrics.seconds
        : 0;
    const perUnit =
      typeof usageMetrics.units === "number" && usageMetrics.units > 0
        ? usageMetrics.units
        : 0;
    if (videoCostPerSecondUsd > 0 && seconds > 0) {
      estimatedCostUsd += videoCostPerSecondUsd * seconds;
    }
    if (videoPricing.costPerUnitUsd && perUnit > 0) {
      estimatedCostUsd += videoPricing.costPerUnitUsd * perUnit;
    }
  } else {
    const textPricing = resolveTextPricing(provider, model);
    inputCostPerMillionUsd = textPricing.inputUsdPerMillionTokens ?? 0;
    outputCostPerMillionUsd = textPricing.outputUsdPerMillionTokens ?? 0;
    cachedInputCostPerMillionUsd =
      textPricing.cachedUsdPerMillionTokens ?? inputCostPerMillionUsd ?? 0;

    const inputCost =
      (inputCostPerMillionUsd * inputTokens) / MILLION;
    const outputCost =
      (outputCostPerMillionUsd * outputTokens) / MILLION;
    const cachedCost =
      (cachedInputCostPerMillionUsd * cachedTokens) / MILLION;
    estimatedCostUsd = inputCost + outputCost + cachedCost;
  }

  if (!Number.isFinite(estimatedCostUsd) || estimatedCostUsd < 0) {
    estimatedCostUsd = 0;
  }
  const creditsUsed =
    usdPerCredit > 0 ? Number((estimatedCostUsd / usdPerCredit).toFixed(6)) : 0;
  const tokenCreditRatio =
    creditsUsed > 0 && totalTokens > 0
      ? Number((totalTokens / creditsUsed).toFixed(4))
      : null;

  const entryPayload = {
    userId: usageContext.userId ?? null,
    jobId: usageContext.jobId ?? null,
    taskType: usageContext.taskType ?? "unspecified",
    provider: provider ?? "unknown",
    model: model ?? "unknown",
    inputTokens,
    outputTokens,
    totalTokens,
    cachedTokens,
    inputCostPerMillionUsd,
    outputCostPerMillionUsd,
    cachedInputCostPerMillionUsd,
    imageCostPerUnitUsd,
    videoCostPerSecondUsd,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
    creditsUsed,
    pricingPlan,
    usdPerCredit,
    tokenCreditRatio,
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
  result,
  usageType,
  usageMetrics
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
    errorReason,
    usageType: usageType ?? usageContext.usageType ?? "text",
    usageMetrics: usageMetrics ?? usageContext.usageMetrics ?? {}
  });
}
