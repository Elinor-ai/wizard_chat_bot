import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { wrapAsync, httpError } from "@wizard/utils";

const DRAFT_COLLECTION = "jobsDraft";

const draftRequestSchema = z.object({
  jobId: z.string().optional(),
  state: z.record(z.string(), z.unknown()).default({}),
  intent: z.record(z.string(), z.unknown()).optional(),
  currentStepId: z.string()
});

const suggestionsRequestSchema = z.object({
  jobId: z.string(),
  state: z.record(z.string(), z.unknown()).default({}),
  intent: z.record(z.string(), z.unknown()).optional(),
  currentStepId: z.string()
});

const mergeRequestSchema = z.object({
  jobId: z.string(),
  fieldId: z.string(),
  value: z.unknown()
});

function requireUserId(req) {
  const userId = req.headers["x-user-id"];
  if (!userId || typeof userId !== "string") {
    throw httpError(401, "Missing x-user-id header");
  }
  return userId;
}

function getSuggestions(context) {
  const suggestions = [];
  const skip = [];
  const followUpToUser = [];

  const title = String(context.jobTitle ?? context.state?.title ?? "").toLowerCase();
  const stepId = context.currentStepId ?? "core-details";

  if (title.includes("waiter")) {
    if (stepId === "salary") {
      suggestions.push(
        {
          id: "salary_range_auto",
          fieldId: "salary_min",
          proposal: 2100,
          confidence: 0.9,
          rationale: "Entry-level waiter pay in London trends around £2100/mo base before tips."
        },
        {
          id: "salary_range_auto_max",
          fieldId: "salary_max",
          proposal: 2600,
          confidence: 0.9,
          rationale: "Experienced FOH in central London can reach roughly £2600/mo base."
        }
      );
    }

    skip.push({
      fieldId: "hybrid_details",
      reason: "Waiting staff must be on-site. Hybrid schedule not applicable."
    });

    followUpToUser.push("Do you include tips or service charge on top of base pay?");
  }

  return {
    suggestions,
    skip,
    followUpToUser
  };
}

export function wizardRouter({ firestore, logger }) {
  const router = Router();

  router.post(
    "/draft",
    wrapAsync(async (req, res) => {
      const userId = requireUserId(req);
      const payload = draftRequestSchema.parse(req.body ?? {});

      const draftId = payload.jobId ?? `draft_${uuid()}`;
      const now = new Date();

      await firestore.saveDocument(DRAFT_COLLECTION, draftId, {
        jobId: draftId,
        userId,
        state: payload.state,
        currentStepId: payload.currentStepId,
        intent: payload.intent ?? {},
        updatedAt: now
      });

      logger.info({ draftId, userId, step: payload.currentStepId }, "Draft persisted");

      res.json({ draftId, status: "saved" });
    })
  );

  router.post(
    "/suggestions",
    wrapAsync(async (req, res) => {
      requireUserId(req);
      const payload = suggestionsRequestSchema.parse(req.body ?? {});

      const draft = await firestore.getDocument(DRAFT_COLLECTION, payload.jobId);
      const mergedState = draft?.state
        ? { ...draft.state, ...payload.state }
        : payload.state;

      const context = {
        jobTitle: mergedState?.title ?? "",
        location: mergedState?.location ?? "",
        currentStepId: payload.currentStepId,
        state: mergedState
      };

      const response = getSuggestions(context);

      res.json({
        suggestions: response.suggestions ?? [],
        skip: response.skip ?? [],
        followUpToUser: response.followUpToUser ?? []
      });
    })
  );

  router.post(
    "/suggestions/merge",
    wrapAsync(async (req, res) => {
      const userId = requireUserId(req);
      const payload = mergeRequestSchema.parse(req.body ?? {});

      const draft = await firestore.getDocument(DRAFT_COLLECTION, payload.jobId);
      if (!draft) {
        throw httpError(404, "Draft not found");
      }

      const now = new Date();
      const nextState = {
        ...(draft.state ?? {}),
        [payload.fieldId]: payload.value
      };

      await firestore.saveDocument(DRAFT_COLLECTION, payload.jobId, {
        state: nextState,
        updatedAt: now,
        lastMergedBy: userId
      });

      res.json({ status: "ok" });
    })
  );

  return router;
}
