import { Router } from "express";
import { z } from "zod";
import { wrapAsync } from "@wizard/utils";
import { JobSchema } from "@wizard/core";
import { recordLlmUsageFromResult } from "../services/llm-usage-ledger.js";
import { loadCompanyContext } from "../services/company-context.js";

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
      const userId = req.user?.id ?? null;

      let draftState = {};
      let companyContext = "";
      if (payload.jobId) {
        const job = await firestore.getDocument(JOB_COLLECTION, payload.jobId);
        if (job) {
          const parsed = JobSchema.safeParse(job);
          if (parsed.success) {
            draftState = parsed.data;
            if (draftState.companyId) {
              companyContext = await loadCompanyContext({
                firestore,
                companyId: draftState.companyId,
                taskType: "copilot_chat",
                logger
              });
            }
          }
        }
      }

      const assistantResponse = await llmClient.askChat({
        userMessage: payload.userMessage,
        draftState,
        intent: payload.intent ?? {},
        companyContext
      });

      await recordLlmUsageFromResult({
        firestore,
        logger,
        usageContext: {
          userId,
          jobId: payload.jobId ?? null,
          taskType: "copilot_chat"
        },
        result: assistantResponse
      });

      logger.info({ jobId: payload.jobId, messageLength: payload.userMessage.length }, "Chat message handled");

      res.json({ assistantMessage: assistantResponse.message });
    })
  );

  return router;
}
