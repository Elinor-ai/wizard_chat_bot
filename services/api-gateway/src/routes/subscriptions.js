import { Router } from "express";
import { z } from "zod";
import { wrapAsync, httpError } from "@wizard/utils";
import {
  getBaseUsdPerCredit,
  getSubscriptionPlan,
  listSubscriptionPlans
} from "../config/subscription-plans.js";

const CREDIT_PURCHASE_COLLECTION = "creditPurchases";

function getAuthenticatedUserId(req) {
  const userId = req.user?.id;
  if (!userId) {
    throw httpError(401, "Unauthorized");
  }
  return userId;
}

function sanitizeUser(userDoc) {
  if (!userDoc) return null;
  let sanitizedAuth = userDoc.auth;
  if (sanitizedAuth?.passwordHash) {
    // eslint-disable-next-line no-unused-vars
    const { passwordHash, ...rest } = sanitizedAuth;
    sanitizedAuth = rest;
  }
  return {
    ...userDoc,
    auth: sanitizedAuth
  };
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

      const userDoc = await firestore.getDocument("users", userId);
      if (!userDoc) {
        throw httpError(404, "User not found");
      }

      const creditsSnapshot = {
        balance: Number(userDoc.credits?.balance ?? 0) + plan.totalCredits,
        reserved: Number(userDoc.credits?.reserved ?? 0),
        lifetimeUsed: Number(userDoc.credits?.lifetimeUsed ?? 0)
      };

      const usageSnapshot = {
        ...(userDoc.usage ?? {}),
        remainingCredits:
          Number(userDoc.usage?.remainingCredits ?? 0) + plan.totalCredits
      };

      const sanitizedPayment = {
        cardholder: payload.payment.cardholder || "Sandbox User",
        cardNumber: payload.payment.cardNumber || "000000000000",
        expiry: payload.payment.expiry || "",
        cvc: payload.payment.cvc || "",
        postalCode: payload.payment.postalCode || ""
      };

      const paymentRecord = {
        userId,
        planId: plan.id,
        planName: plan.name,
        creditsPurchased: plan.credits,
        bonusCredits: plan.bonusCredits ?? 0,
        totalCredits: plan.totalCredits,
        priceUsd: plan.priceUsd,
        currency: plan.currency,
        usdPerCredit: plan.effectiveUsdPerCredit,
        paymentMethod: {
          brand: detectCardBrand(sanitizedPayment.cardNumber),
          last4: sanitizedPayment.cardNumber.slice(-4) || "0000",
          cardholder: sanitizedPayment.cardholder
        },
        createdAt: new Date()
      };

      const purchaseEntry = await firestore.addDocument(
        CREDIT_PURCHASE_COLLECTION,
        paymentRecord
      );

      const updatedUser = await firestore.saveDocument("users", userId, {
        credits: creditsSnapshot,
        usage: usageSnapshot,
        updatedAt: new Date()
      });

      logger.info(
        { userId, planId: plan.id, purchaseId: purchaseEntry.id },
        "subscriptions.purchase_recorded"
      );

      res.json({
        purchase: {
          id: purchaseEntry.id,
          planId: plan.id,
          planName: plan.name,
          credits: plan.credits,
          bonusCredits: plan.bonusCredits ?? 0,
          totalCredits: plan.totalCredits,
          priceUsd: plan.priceUsd,
          currency: plan.currency,
          processedAt: paymentRecord.createdAt,
          paymentMethod: {
            brand: paymentRecord.paymentMethod.brand,
            last4: paymentRecord.paymentMethod.last4
          }
        },
        credits: creditsSnapshot,
        usage: usageSnapshot,
        user: sanitizeUser(updatedUser)
      });
    })
  );

  return router;
}
