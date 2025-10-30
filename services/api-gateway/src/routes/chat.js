import { Router } from "express";
import { z } from "zod";
import { wrapAsync } from "@wizard/utils";

const chatSchema = z.object({
  message: z.string().min(1),
  history: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(["system", "user", "assistant", "tool"]).default("user"),
        content: z.string()
      })
    )
    .default([])
});

export function chatRouter({ orchestrator, logger }) {
  const router = Router();

  router.post(
    "/command",
    wrapAsync(async (req, res) => {
      const payload = chatSchema.parse(req.body ?? {});
      logger.info({ messageLength: payload.message.length }, "Received chat command");

      const result = await orchestrator.run({
        type: "chat-response",
        payload
      });

      res.json({
        id: `chat-${Date.now()}`,
        reply: result.content ?? "Stubbed chat reply",
        costBreakdown: {
          totalCredits: "0.0",
          tokens: 0,
          inferenceCostUsd: 0
        }
      });
    })
  );

  return router;
}
