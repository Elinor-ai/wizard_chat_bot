/**
 * @file subscriptions.js
 * Subscription API Router - handles credit purchases and plans.
 *
 * ARCHITECTURE:
 * - All Firestore access goes through repositories
 * - This router does NOT access firestore directly
 */

import { Router } from "express";
import { z } from "zod";
import { wrapAsync, httpError } from "@wizard/utils";
import {
  getBaseUsdPerCredit,
  getSubscriptionPlan,
  listSubscriptionPlans
} from "../config/subscription-plans.js";
import {
  getUserByIdOrThrow,
  sanitizeUserForResponse
} from "../services/repositories/index.js";
import {
  recordCreditPurchase,
  updateUserCredits,
  calculateCreditsAfterPurchase,
  buildPaymentRecord,
  buildPurchaseResponse
} from "../services/repositories/index.js";

function getAuthenticatedUserId(req) {
  const userId = req.user?.id;
  if (!userId) {
    throw httpError(401, "Unauthorized");
  }
  return userId;
}

function detectCardBrand(cardNumber) {
  if (typeof cardNumber !== "string" || cardNumber.length === 0) {
    return "card";
  }
  const trimmed = cardNumber.replace(/\s+/g, "");
  if (trimmed.startsWith("4")) return "visa";
  if (trimmed.startsWith("5")) return "mastercard";
  if (trimmed.startsWith("3")) return "amex";
  if (trimmed.startsWith("6")) return "discover";
  return "card";
}

const purchaseSchema = z.object({
  planId: z.string().min(1),
  payment: z.object({
    cardholder: z.string().optional().default("")
      .transform((value) => value?.trim() ?? ""),
    cardNumber: z.string().optional().default("")
      .transform((value) => value?.replace(/\s+/g, "") ?? ""),
    expiry: z.string().optional().default("")
      .transform((value) => value?.trim() ?? ""),
    cvc: z.string().optional().default("")
      .transform((value) => value?.trim() ?? ""),
    postalCode: z.string().optional().default("")
      .transform((value) => value?.trim() ?? "")
  })
});

export function subscriptionsRouter({ firestore, logger }) {
  const router = Router();

  router.get(
    "/plans",
    wrapAsync(async (_req, res) => {
      const plans = listSubscriptionPlans();
      res.json({
        plans,
        currency: "USD",
        usdPerCredit: getBaseUsdPerCredit()
      });
    })
  );

  router.post(
    "/purchase",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = purchaseSchema.parse(req.body ?? {});
      const plan = getSubscriptionPlan(payload.planId);
      if (!plan) {
        throw httpError(400, "Unknown subscription plan");
      }

      // Get user via repository
      const userDoc = await getUserByIdOrThrow(firestore, userId);

      // Calculate new credit balances via repository helper
      const { creditsSnapshot, usageSnapshot } = calculateCreditsAfterPurchase(userDoc, plan.totalCredits);

      // Build payment method details
      const sanitizedPayment = {
        cardholder: payload.payment.cardholder || "Sandbox User",
        cardNumber: payload.payment.cardNumber || "000000000000",
        expiry: payload.payment.expiry || "",
        cvc: payload.payment.cvc || "",
        postalCode: payload.payment.postalCode || ""
      };

      const paymentMethod = {
        brand: detectCardBrand(sanitizedPayment.cardNumber),
        last4: sanitizedPayment.cardNumber.slice(-4) || "0000",
        cardholder: sanitizedPayment.cardholder
      };

      // Build and record payment via repository
      const paymentRecord = buildPaymentRecord({ userId, plan, paymentMethod });
      const purchaseEntry = await recordCreditPurchase(firestore, paymentRecord);

      // Update user credits via repository
      await updateUserCredits(firestore, userId, creditsSnapshot, usageSnapshot);

      logger.info(
        { userId, planId: plan.id, purchaseId: purchaseEntry.id },
        "subscriptions.purchase_recorded"
      );

      // Fetch updated user for response
      const updatedUser = await getUserByIdOrThrow(firestore, userId);

      // Build and return response via repository helper
      res.json(buildPurchaseResponse({
        purchaseEntry,
        plan,
        paymentMethod,
        creditsSnapshot,
        usageSnapshot,
        user: sanitizeUserForResponse(updatedUser)
      }));
    })
  );

  return router;
}
