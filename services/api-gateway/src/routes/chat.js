import { Router } from "express";
import { z } from "zod";
import { wrapAsync, httpError } from "@wizard/utils";

const chatRequestSchema = z.object({
  jobId: z.string().optional(),
  userMessage: z.string().min(1),
  intent: z.record(z.string(), z.unknown()).optional()
});

const DRAFT_COLLECTION = "jobsDraft";

function requireUserId(req) {
  const userId = req.headers["x-user-id"];
  if (!userId || typeof userId !== "string") {
    throw httpError(401, "Missing x-user-id header");
  }
  return userId;
}

export function chatRouter({ firestore, llmClient, logger }) {
  const router = Router();

  router.post(
    "/message",
    wrapAsync(async (req, res) => {
      requireUserId(req);
      const payload = chatRequestSchema.parse(req.body ?? {});

      let draftState = {};
      if (payload.jobId) {
        const draft = await firestore.getDocument(DRAFT_COLLECTION, payload.jobId);
        if (draft?.state) {
          draftState = draft.state;
        }
      }

      const assistantMessage = await llmClient.askChat({
        userMessage: payload.userMessage,
        draftState,
        intent: payload.intent ?? {}
      });

      logger.info({ jobId: payload.jobId, messageLength: payload.userMessage.length }, "Chat message handled");

      res.json({ assistantMessage });
    })
  );

  return router;
}
