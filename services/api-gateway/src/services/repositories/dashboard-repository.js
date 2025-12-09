/**
 * @file dashboard-repository.js
 * Repository for dashboard data access.
 * Aggregates data from jobs, jobAssets, creditPurchases, and users collections.
 */

import { JobAssetRecordSchema } from "@wizard/core";

const JOB_COLLECTION = "jobs";
const JOB_ASSETS_COLLECTION = "jobAssets";
const CREDIT_PURCHASES_COLLECTION = "creditPurchases";
const USER_COLLECTION = "users";

/**
 * Get all jobs for a user
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of job documents
 */
export async function getJobsForUser(firestore, userId) {
  return firestore.listCollection(JOB_COLLECTION, [
    { field: "ownerUserId", operator: "==", value: userId }
  ]);
}

/**
 * Get all assets for a user
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of parsed asset documents
 */
export async function getAssetsForUser(firestore, userId) {
  const docs = await firestore.queryDocuments(
    JOB_ASSETS_COLLECTION,
    "ownerUserId",
    "==",
    userId
  );
  return docs
    .map((doc) => {
      const parsed = JobAssetRecordSchema.safeParse(doc);
      return parsed.success ? parsed.data : null;
    })
    .filter(Boolean);
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
  return firestore.queryDocuments(CREDIT_PURCHASES_COLLECTION, "userId", "==", userId);
}

/**
 * Get user document for dashboard data
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User document or null
 */
export async function getUserForDashboard(firestore, userId) {
  return firestore.getDocument(USER_COLLECTION, userId);
}

/**
 * Load all dashboard data in parallel
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Object with jobs, assets, purchases, userDoc
 */
export async function loadDashboardData(firestore, userId) {
  const [jobs, assets, purchases, userDoc] = await Promise.all([
    getJobsForUser(firestore, userId),
    getAssetsForUser(firestore, userId),
    getCreditPurchasesForUser(firestore, userId),
    getUserForDashboard(firestore, userId)
  ]);
  return { jobs, assets, purchases, userDoc };
}

/**
 * Load summary data (jobs, assets, user)
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Object with jobs, assets, userDoc
 */
export async function loadSummaryData(firestore, userId) {
  const [jobs, assets, userDoc] = await Promise.all([
    getJobsForUser(firestore, userId),
    getAssetsForUser(firestore, userId),
    getUserForDashboard(firestore, userId)
  ]);
  return { jobs, assets, userDoc };
}

/**
 * Load campaigns data (jobs only)
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of job documents
 */
export async function loadCampaignsData(firestore, userId) {
  return getJobsForUser(firestore, userId);
}

/**
 * Load ledger data (jobs and purchases)
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Object with jobs and purchases
 */
export async function loadLedgerData(firestore, userId) {
  const [jobs, purchases] = await Promise.all([
    getJobsForUser(firestore, userId),
    getCreditPurchasesForUser(firestore, userId)
  ]);
  return { jobs, purchases };
}

/**
 * Load activity data (jobs and assets)
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Object with jobs and assets
 */
export async function loadActivityData(firestore, userId) {
  const [jobs, assets] = await Promise.all([
    getJobsForUser(firestore, userId),
    getAssetsForUser(firestore, userId)
  ]);
  return { jobs, assets };
}
