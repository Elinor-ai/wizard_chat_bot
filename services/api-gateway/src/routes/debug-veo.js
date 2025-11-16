import { Router } from "express";
import { vertexQuotaMeter, getVertexOperationsSnapshot } from "../video/veo-client.js";

export function debugVeoRouter() {
  const router = Router();

  router.get("/veo/quota", (req, res) => {
    res.json({ quota: vertexQuotaMeter.getSnapshot() });
  });

  router.get("/veo/operations", (req, res) => {
    res.json({ operations: getVertexOperationsSnapshot() });
  });

  return router;
}
