/**
 * @file video-repository.js
 * Repository for video library item document access.
 * Firestore access for the "videoLibraryItems" collection.
 */

import { VideoLibraryItemSchema } from "@wizard/core";

const VIDEO_LIBRARY_COLLECTION = "videoLibraryItems";

/**
 * Normalize a raw video library item.
 * @param {Object} raw - Raw video item data
 * @returns {Object|null} Parsed video item or null
 */
export function normalizeVideoItem(raw) {
  const parsed = VideoLibraryItemSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Load all video items for a user, optionally filtered by job ID.
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - Owner user ID
 * @param {string|null} [jobId] - Optional job ID filter
 * @returns {Promise<Object[]>} Array of normalized video items
 */
export async function loadVideoItemsForUser(firestore, userId, jobId = null) {
  const filters = [{ field: "ownerUserId", operator: "==", value: userId }];
  if (jobId) {
    filters.push({ field: "jobId", operator: "==", value: jobId });
  }
  const docs = await firestore.listCollection(VIDEO_LIBRARY_COLLECTION, filters);
  return docs.map(normalizeVideoItem).filter(Boolean);
}
