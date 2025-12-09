/**
 * @file llm-usage-repository.js
 * Repository for LLM usage logging.
 * Firestore and BigQuery access for usage tracking.
 */

/**
 * Record LLM usage entry to Firestore
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {Object} params.entryPayload - Usage entry payload
 * @returns {Promise<void>}
 */
export async function recordToFirestore({ firestore, logger, entryPayload }) {
  if (!firestore?.recordLlmUsage) {
    logger?.debug?.("llm.usage.ledger_not_configured");
    return;
  }

  try {
    await firestore.recordLlmUsage(entryPayload);
  } catch (error) {
    logger?.warn?.({ err: error }, "llm.usage.ledger_write_failed");
  }
}

/**
 * Record LLM usage entry to BigQuery
 * @param {Object} params
 * @param {Object} params.bigQuery - BigQuery instance
 * @param {Object} params.logger - Logger instance
 * @param {Object} params.entryPayload - Usage entry payload
 * @returns {Promise<void>}
 */
export async function recordToBigQuery({ bigQuery, logger, entryPayload }) {
  if (!bigQuery?.addDocument) {
    return;
  }

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

/**
 * Normalize token count to a valid non-negative integer
 * @param {*} value - Token value to normalize
 * @returns {number} Normalized token count
 */
export function normalizeTokens(value) {
  if (value === undefined || value === null) {
    return 0;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return 0;
  }
  return Math.round(num);
}

/**
 * Update user usage counters in Firestore
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {Object} params.logger - Logger instance
 * @param {string} params.userId - User ID
 * @param {number} params.tokensUsed - Tokens used in this operation
 * @param {number} params.creditsUsed - Credits used in this operation
 * @param {Date} params.timestamp - Timestamp of the operation
 * @returns {Promise<void>}
 */
export async function updateUserUsageCounters({
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

/**
 * Sanitize metadata for storage (only keep relevant fields)
 * @param {Object} metadata - Raw metadata object
 * @returns {Object|undefined} Sanitized metadata or undefined
 */
export function sanitizeMetadata(metadata) {
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
