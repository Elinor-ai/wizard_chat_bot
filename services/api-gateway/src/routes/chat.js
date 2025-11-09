import { Router } from "express";
import { z } from "zod";
import { wrapAsync } from "@wizard/utils";
import { JobSchema } from "@wizard/core";

const chatRequestSchema = z.object({
  jobId: z.string().optional(),
  userMessage: z.string().min(1),
  intent: z.record(z.string(), z.unknown()).optional()
});

const JOB_COLLECTION = "jobs";

export function chatRouter({ firestore, llmClient, logger }) {
  const router = Router();

  router.post(
    "/message",
    wrapAsync(async (req, res) => {
      const payload = chatRequestSchema.parse(req.body ?? {});

      let draftState = {};
      if (payload.jobId) {
        const job = await firestore.getDocument(JOB_COLLECTION, payload.jobId);
        if (job) {
          const parsed = JobSchema.safeParse(job);
          if (parsed.success) {
            draftState = parsed.data;
          }
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
