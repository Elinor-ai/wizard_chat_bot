/**
 * @file subscription-repository.js
 * Repository for subscription and credit purchase operations.
 * Firestore access for the "creditPurchases" collection and user credit updates.
 */

const CREDIT_PURCHASE_COLLECTION = "creditPurchases";
const USER_COLLECTION = "users";

/**
 * Record a credit purchase
 * @param {Object} firestore - Firestore instance
 * @param {Object} paymentRecord - Payment record to store
 * @returns {Promise<Object>} Created purchase document with id
 */
export async function recordCreditPurchase(firestore, paymentRecord) {
  return firestore.addDocument(CREDIT_PURCHASE_COLLECTION, {
    ...paymentRecord,
    createdAt: paymentRecord.createdAt ?? new Date()
  });
}

/**
 * Get credit purchases for a user
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of purchase documents
 */
export async function getCreditPurchasesForUser(firestore, userId) {
  if (!firestore?.queryDocuments) {
    return [];
  }
  return firestore.queryDocuments(CREDIT_PURCHASE_COLLECTION, "userId", "==", userId);
}

/**
 * Update user credits after a purchase
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @param {Object} creditsSnapshot - New credits object
 * @param {Object} usageSnapshot - New usage object
 * @returns {Promise<Object>} Updated user document
 */
export async function updateUserCredits(firestore, userId, creditsSnapshot, usageSnapshot) {
  return firestore.saveDocument(USER_COLLECTION, userId, {
    credits: creditsSnapshot,
    usage: usageSnapshot,
    updatedAt: new Date()
  });
}

/**
 * Calculate updated credit balances after a purchase
 * @param {Object} userDoc - Current user document
 * @param {number} totalCredits - Credits to add from purchase
 * @returns {Object} Object with creditsSnapshot and usageSnapshot
 */
export function calculateCreditsAfterPurchase(userDoc, totalCredits) {
  const currentBalance = Number(userDoc.usage?.remainingCredits ?? userDoc.credits?.balance ?? 0);
  const currentReserved = Number(userDoc.credits?.reserved ?? 0);
  const currentLifetimeUsed = Number(userDoc.credits?.lifetimeUsed ?? 0);

  const newRemainingCredits = currentBalance + totalCredits;

  const creditsSnapshot = {
    balance: newRemainingCredits + currentReserved,
    reserved: currentReserved,
    lifetimeUsed: currentLifetimeUsed
  };

  const usageSnapshot = {
    ...(userDoc.usage ?? {}),
    remainingCredits: newRemainingCredits
  };

  return { creditsSnapshot, usageSnapshot };
}

/**
 * Build a payment record for storage
 * @param {Object} params
 * @param {string} params.userId - User ID
 * @param {Object} params.plan - Subscription plan
 * @param {Object} params.paymentMethod - Payment method details
 * @returns {Object} Payment record ready for storage
 */
export function buildPaymentRecord({ userId, plan, paymentMethod }) {
  return {
    userId,
    planId: plan.id,
    planName: plan.name,
    creditsPurchased: plan.credits,
    bonusCredits: plan.bonusCredits ?? 0,
    totalCredits: plan.totalCredits,
    priceUsd: plan.priceUsd,
    currency: plan.currency,
    usdPerCredit: plan.effectiveUsdPerCredit,
    paymentMethod,
    createdAt: new Date()
  };
}

/**
 * Build the purchase response
 * @param {Object} params
 * @param {Object} params.purchaseEntry - Saved purchase document
 * @param {Object} params.plan - Subscription plan
 * @param {Object} params.paymentMethod - Payment method details
 * @param {Object} params.creditsSnapshot - Updated credits
 * @param {Object} params.usageSnapshot - Updated usage
 * @param {Object} params.user - Sanitized user document
 * @returns {Object} Purchase response
 */
export function buildPurchaseResponse({ purchaseEntry, plan, paymentMethod, creditsSnapshot, usageSnapshot, user }) {
  return {
    purchase: {
      id: purchaseEntry.id,
      planId: plan.id,
      planName: plan.name,
      credits: plan.credits,
      bonusCredits: plan.bonusCredits ?? 0,
      totalCredits: plan.totalCredits,
      priceUsd: plan.priceUsd,
      currency: plan.currency,
      processedAt: purchaseEntry.createdAt ?? new Date(),
      paymentMethod: {
        brand: paymentMethod.brand,
        last4: paymentMethod.last4
      }
    },
    credits: creditsSnapshot,
    usage: usageSnapshot,
    user
  };
}
