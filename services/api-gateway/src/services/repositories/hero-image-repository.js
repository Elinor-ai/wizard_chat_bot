/**
 * @file hero-image-repository.js
 * Repository for hero image document persistence.
 */

import { JobHeroImageSchema } from "@wizard/core";

const HERO_IMAGE_COLLECTION = "jobImages";

/**
 * Load a hero image document.
 * @param {Object} firestore - Firestore instance
 * @param {string} jobId - Job ID
 * @returns {Promise<Object|null>} Parsed hero image document or null
 */
export async function loadHeroImage(firestore, jobId) {
  const existing = await firestore.getDocument(HERO_IMAGE_COLLECTION, jobId);
  if (!existing) return null;
  const parsed = JobHeroImageSchema.safeParse(existing);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

/**
 * Save or update a hero image document.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.jobId - Job ID
 * @param {string} params.ownerUserId - Owner user ID
 * @param {string|null} params.companyId - Company ID
 * @param {Object} params.patch - Fields to update
 * @param {Date} params.now - Current timestamp
 * @returns {Promise<Object>} Saved hero image document
 */
export async function saveHeroImage({
  firestore,
  jobId,
  ownerUserId,
  companyId = null,
  patch,
  now = new Date(),
}) {
  const existing = await loadHeroImage(firestore, jobId);
  const payload = JobHeroImageSchema.parse({
    id: jobId,
    jobId,
    companyId: companyId ?? existing?.companyId ?? null,
    ownerUserId,
    status: existing?.status ?? "PENDING",
    prompt: existing?.prompt ?? null,
    promptProvider: existing?.promptProvider ?? null,
    promptModel: existing?.promptModel ?? null,
    promptMetadata: existing?.promptMetadata,
    imageUrl: existing?.imageUrl ?? null,
    imageBase64: existing?.imageBase64 ?? null,
    imageProvider: existing?.imageProvider ?? null,
    imageModel: existing?.imageModel ?? null,
    imageMetadata: existing?.imageMetadata,
    caption: existing?.caption ?? null,
    captionHashtags: existing?.captionHashtags ?? null,
    failure: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...patch,
  });
  await firestore.saveDocument(HERO_IMAGE_COLLECTION, jobId, payload);
  return payload;
}

/**
 * Save a hero image failure.
 * @param {Object} params
 * @param {Object} params.firestore - Firestore instance
 * @param {string} params.jobId - Job ID
 * @param {string} params.ownerUserId - Owner user ID
 * @param {string|null} params.companyId - Company ID
 * @param {string} params.reason - Failure reason
 * @param {string|null} params.message - Failure message
 * @param {string|null} params.rawPreview - Raw preview data
 * @param {Date} params.now - Current timestamp
 * @returns {Promise<Object>} Updated hero image document
 */
export async function saveHeroImageFailure({
  firestore,
  jobId,
  ownerUserId,
  companyId = null,
  reason,
  message,
  rawPreview,
  now = new Date(),
}) {
  return saveHeroImage({
    firestore,
    jobId,
    ownerUserId,
    companyId,
    now,
    patch: {
      status: "FAILED",
      failure: {
        reason,
        message: message ?? null,
        rawPreview: rawPreview ?? null,
        occurredAt: now,
      },
    },
  });
}

/**
 * Load all hero images for a user, optionally filtered by job ID.
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - Owner user ID
 * @param {string|null} [jobId] - Optional job ID filter
 * @returns {Promise<Object[]>} Array of raw hero image documents
 */
export async function loadHeroImagesForUser(firestore, userId, jobId = null) {
  const filters = [{ field: "ownerUserId", operator: "==", value: userId }];
  if (jobId) {
    filters.push({ field: "jobId", operator: "==", value: jobId });
  }
  const docs = await firestore.listCollection(HERO_IMAGE_COLLECTION, filters);
  return docs ?? [];
}

/**
 * Serialize a hero image document for API response.
 * @param {Object|null} document - Hero image document
 * @returns {Object|null} Serialized hero image
 */
export function serializeHeroImage(document) {
  if (!document) {
    return null;
  }
  return {
    jobId: document.jobId,
    status: document.status,
    prompt: document.prompt,
    promptProvider: document.promptProvider,
    promptModel: document.promptModel,
    imageUrl: document.imageUrl,
    imageBase64: document.imageBase64,
    imageMimeType: document.imageMimeType ?? null,
    imageProvider: document.imageProvider,
    imageModel: document.imageModel,
    failure: document.failure ?? null,
    updatedAt: document.updatedAt,
    metadata: document.imageMetadata ?? null,
    caption: document.caption ?? null,
    captionHashtags: document.captionHashtags ?? null,
  };
}
