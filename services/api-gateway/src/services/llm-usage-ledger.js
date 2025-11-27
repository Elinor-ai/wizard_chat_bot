import {
  resolveCreditConversion,
  resolveImagePricing,
  resolveTextPricing,
  resolveVideoPricing,
  resolveProviderPlanName
} from "../config/pricing-rates.js";

const MILLION = 1_000_000;
const DEBUG_TASKS = new Set([
  "image_generation",
  "image_prompt_generation",
  "image_caption",
  "video_generation"
]);

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

function maybeLogPricingDebug({
  logger,
  usageContext,
  provider,
  model,
  resolvedUsageType,
  inputTokens,
  outputTokens,
  cachedTokens,
  totalTokens,
  usageMetrics,
  pricingPlan,
  usdPerCredit,
  inputCostPerMillionUsd,
  outputCostPerMillionUsd,
  cachedInputCostPerMillionUsd,
  imageCostPerUnitUsd,
  videoCostPerSecondUsd,
  estimatedCostUsd
}) {
  const taskType = usageContext?.taskType;
  if (!taskType || !DEBUG_TASKS.has(taskType)) {
    return;
  }
  logger?.info?.(
    {
      taskType,
      provider,
      model,
      usageType: resolvedUsageType,
      inputTokens,
      outputTokens,
      cachedTokens,
      totalTokens,
      usageMetrics,
      pricingPlan,
      usdPerCredit,
      inputCostPerMillionUsd,
      outputCostPerMillionUsd,
      cachedInputCostPerMillionUsd,
      imageCostPerUnitUsd,
      videoCostPerSecondUsd,
      estimatedCostUsd
    },
    "llm.usage.debug.pricing"
  );
}

export async function recordLlmUsage({
  firestore,
  bigQuery,
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
    const imagePricing = resolveImagePricing(provider, model, { promptTokens: inputTokens });
    imageCostPerUnitUsd = imagePricing.costPerUnitUsd ?? 0;
    const inputImageCostPerMillionUsd = imagePricing.inputUsdPerMillionTokens;
    const outputImageCostPerMillionUsd = imagePricing.outputUsdPerMillionTokens;
    const cachedImageCostPerMillionUsd =
      imagePricing.cachedUsdPerMillionTokens ??
      (typeof inputImageCostPerMillionUsd === "number" ? inputImageCostPerMillionUsd : undefined);
    const units =
      typeof usageMetrics.units === "number" && usageMetrics.units > 0
        ? usageMetrics.units
        : 1;
    const hasTokenCounts = inputTokens > 0 || outputTokens > 0 || cachedTokens > 0;
    const hasTokenRates =
      typeof inputImageCostPerMillionUsd === "number" ||
      typeof outputImageCostPerMillionUsd === "number" ||
      typeof cachedImageCostPerMillionUsd === "number";

    if (hasTokenCounts && hasTokenRates) {
      inputCostPerMillionUsd = inputImageCostPerMillionUsd;
      outputCostPerMillionUsd = outputImageCostPerMillionUsd;
      cachedInputCostPerMillionUsd = cachedImageCostPerMillionUsd;
      const inputCost =
        ((inputImageCostPerMillionUsd ?? 0) * inputTokens) / MILLION;
      const outputCost =
        ((outputImageCostPerMillionUsd ?? 0) * outputTokens) / MILLION;
      const cachedCost =
        ((cachedImageCostPerMillionUsd ?? 0) * cachedTokens) / MILLION;
      estimatedCostUsd = inputCost + outputCost + cachedCost;
    } else {
      estimatedCostUsd = imageCostPerUnitUsd * units;
    }
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
    const textPricing = resolveTextPricing(provider, model, { promptTokens: inputTokens });
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

  maybeLogPricingDebug({
    logger,
    usageContext,
    provider,
    model,
    resolvedUsageType,
    inputTokens,
    outputTokens,
    cachedTokens,
    totalTokens,
    usageMetrics,
    pricingPlan,
    usdPerCredit,
    inputCostPerMillionUsd,
    outputCostPerMillionUsd,
    cachedInputCostPerMillionUsd,
    imageCostPerUnitUsd,
    videoCostPerSecondUsd,
    estimatedCostUsd: entryPayload.estimatedCostUsd
  });

  try {
    await firestore.recordLlmUsage(entryPayload);
  } catch (error) {
    logger?.warn?.({ err: error }, "llm.usage.ledger_write_failed");
  }

  if (bigQuery?.addDocument) {
    try {
      await bigQuery.addDocument(entryPayload);
      logger?.debug?.(
        {
          taskType: entryPayload.taskType,
          provider: entryPayload.provider,
          model: entryPayload.model,
          tokensUsed: entryPayload.totalTokens
        },
        "Successfully recorded LLM usage to BigQuery"
      );
    } catch (error) {
      // Check if it's a permission error
      const isPermissionError = error.message?.includes("Permission") || error.message?.includes("denied");
      const logLevel = isPermissionError ? "warn" : "error";

      logger?.[logLevel]?.(
        {
          err: error,
          taskType: entryPayload.taskType,
          errorType: isPermissionError ? "permission_denied" : "insertion_failed",
          hint: isPermissionError
            ? "Grant bigquery.tables.updateData permission to the service account"
            : "Check data format and BigQuery table schema"
        },
        "Failed to record LLM usage to BigQuery, continuing with Firestore only"
      );
    }
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
  bigQuery,
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
    bigQuery,
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
