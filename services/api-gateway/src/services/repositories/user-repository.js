/**
 * @file user-repository.js
 * Repository for user document access.
 * Firestore access for the "users" collection.
 */

import { httpError } from "@wizard/utils";
import { UserSchema } from "@wizard/core";

const USER_COLLECTION = "users";

/**
 * Sanitize user document for API response (remove sensitive fields)
 * @param {Object} userDoc - Raw user document
 * @returns {Object|null} Sanitized user or null
 */
export function sanitizeUserForResponse(userDoc) {
  if (!userDoc) return null;
  let sanitizedAuth = userDoc.auth;
  if (sanitizedAuth?.passwordHash) {
    const { passwordHash, ...rest } = sanitizedAuth;
    sanitizedAuth = rest;
  }
  return {
    ...userDoc,
    auth: sanitizedAuth
  };
}

/**
 * Get user by ID
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User document or null
 */
export async function getUserById(firestore, userId) {
  return firestore.getDocument(USER_COLLECTION, userId);
}

/**
 * Get user by ID with 404 error if not found
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User document
 * @throws {HttpError} If user not found
 */
export async function getUserByIdOrThrow(firestore, userId) {
  const user = await firestore.getDocument(USER_COLLECTION, userId);
  if (!user) {
    throw httpError(404, "User not found");
  }
  return user;
}

/**
 * Query user by email
 * @param {Object} firestore - Firestore instance
 * @param {string} email - Email address
 * @returns {Promise<Object|null>} User document or null
 */
export async function getUserByEmail(firestore, email) {
  const results = await firestore.queryDocuments(
    USER_COLLECTION,
    "auth.email",
    "==",
    email
  );
  return results.length > 0 ? results[0] : null;
}

/**
 * Check if user exists by email
 * @param {Object} firestore - Firestore instance
 * @param {string} email - Email address
 * @returns {Promise<boolean>} True if user exists
 */
export async function userExistsByEmail(firestore, email) {
  const results = await firestore.queryDocuments(
    USER_COLLECTION,
    "auth.email",
    "==",
    email
  );
  return results.length > 0;
}

/**
 * Create a new user
 * @param {Object} firestore - Firestore instance
 * @param {Object} user - User document (must include id)
 * @returns {Promise<Object>} Created user document
 */
export async function createUser(firestore, user) {
  return firestore.saveDocument(USER_COLLECTION, user.id, user);
}

/**
 * Update user document (partial update)
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated user document
 */
export async function updateUser(firestore, userId, updates) {
  return firestore.saveDocument(USER_COLLECTION, userId, {
    ...updates,
    updatedAt: updates.updatedAt ?? new Date()
  });
}

/**
 * Update user profile
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @param {Object} existingProfile - Current profile
 * @param {Object} profileUpdates - Profile fields to update
 * @returns {Promise<Object>} Updated user document
 */
export async function updateUserProfile(firestore, userId, existingProfile, profileUpdates) {
  const updates = {
    profile: {
      ...existingProfile,
      ...profileUpdates
    },
    updatedAt: new Date()
  };
  return firestore.saveDocument(USER_COLLECTION, userId, updates);
}

/**
 * Update user preferences
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @param {Object} existingPreferences - Current preferences
 * @param {Object} preferencesUpdates - Preferences fields to update
 * @returns {Promise<Object>} Updated user document
 */
export async function updateUserPreferences(firestore, userId, existingPreferences, preferencesUpdates) {
  const updates = {
    preferences: {
      ...existingPreferences,
      ...preferencesUpdates
    },
    updatedAt: new Date()
  };
  return firestore.saveDocument(USER_COLLECTION, userId, updates);
}

/**
 * Update user password hash
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @param {Object} existingAuth - Current auth object
 * @param {string} newPasswordHash - New password hash
 * @returns {Promise<Object>} Updated user document
 */
export async function updateUserPassword(firestore, userId, existingAuth, newPasswordHash) {
  const updates = {
    auth: {
      ...existingAuth,
      passwordHash: newPasswordHash
    },
    updatedAt: new Date()
  };
  return firestore.saveDocument(USER_COLLECTION, userId, updates);
}

/**
 * Update user login tracking info
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @param {Object} existingUsage - Current usage object
 * @param {Object} existingSecurity - Current security object
 * @returns {Promise<Object>} Updated user document
 */
export async function updateUserLoginInfo(firestore, userId, existingUsage, existingSecurity) {
  const now = new Date();
  const updates = {
    usage: {
      ...(existingUsage ?? {}),
      lastActiveAt: now
    },
    security: {
      ...(existingSecurity ?? {}),
      lastLoginAt: now
    },
    updatedAt: now
  };
  return firestore.saveDocument(USER_COLLECTION, userId, updates);
}

/**
 * Link a company to user profile
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @param {Object} existingProfile - Current profile
 * @param {string} companyId - Company ID to link
 * @param {string} [companyDomain] - Company domain
 * @returns {Promise<Object>} Updated user document
 */
export async function linkCompanyToUser(firestore, userId, existingProfile, companyId, companyDomain) {
  const companyIds = Array.isArray(existingProfile?.companyIds)
    ? [...existingProfile.companyIds]
    : [];

  if (companyId && !companyIds.includes(companyId)) {
    companyIds.push(companyId);
  }

  const nextProfile = {
    ...(existingProfile ?? {}),
    companyIds,
    companyDomain: existingProfile?.companyDomain ?? companyDomain ?? null,
    mainCompanyId: existingProfile?.mainCompanyId ?? companyId ?? null
  };

  return firestore.saveDocument(USER_COLLECTION, userId, {
    profile: nextProfile,
    updatedAt: new Date()
  });
}

/**
 * Set user's main company
 * @param {Object} firestore - Firestore instance
 * @param {string} userId - User ID
 * @param {Object} existingProfile - Current profile
 * @param {string} companyId - Company ID to set as main
 * @returns {Promise<Object>} Updated user document
 */
export async function setUserMainCompany(firestore, userId, existingProfile, companyId) {
  const companyIds = Array.isArray(existingProfile?.companyIds)
    ? existingProfile.companyIds.filter((value) => typeof value === "string" && value.trim().length > 0)
    : [];

  if (!companyIds.includes(companyId)) {
    throw httpError(400, "Company not linked to this user");
  }

  const nextProfile = {
    ...(existingProfile ?? {}),
    mainCompanyId: companyId,
    companyIds
  };

  return firestore.saveDocument(USER_COLLECTION, userId, {
    profile: nextProfile,
    updatedAt: new Date()
  });
}
