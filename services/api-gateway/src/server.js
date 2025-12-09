import express from "express";
import cors from "cors";
import morgan from "morgan";
import fs from "node:fs";
import path from "node:path";
import { notFound, errorHandler } from "@wizard/utils";
import { wizardRouter } from "./routes/wizard.js";
import { copilotRouter } from "./routes/copilot.js";
import { authRouter } from "./routes/auth.js";
import { assetsRouter } from "./routes/assets.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { contactRouter } from "./routes/contact.js";
import { usersRouter } from "./routes/users.js";
import { requireAuth } from "./middleware/require-auth.js";
import { videosRouter } from "./routes/videos.js";
import { companiesRouter } from "./routes/companies.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";
import { llmRouter } from "./routes/llm.js";
import { goldenInterviewRouter } from "./routes/golden-interview.js";
import {
  getBaseUsdPerCredit,
  listSubscriptionPlans,
} from "./config/subscription-plans.js";
import { requestContextMiddleware } from "./llm/request-context.js";
import { VIDEO_BEHAVIOR_CONFIG } from "./config/llm-config.js";

const corsConfig = {
  origin: "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

export function createApp({ logger, firestore, bigQuery, llmClient }) {
  const app = express();

  app.use(cors(corsConfig));
  app.options("*", cors(corsConfig));

  app.use(express.json({ limit: "2mb" }));
  app.use(requestContextMiddleware);
  app.use(
    morgan("tiny", {
      stream: {
        write: (message) => logger.info(message.trim()),
      },
    })
  );

  // Output directory is now configured in code (VIDEO_BEHAVIOR_CONFIG), not via .env
  const videoAssetDir = path.resolve(VIDEO_BEHAVIOR_CONFIG.outputDir);
  fs.mkdirSync(videoAssetDir, { recursive: true });
  app.use(
    "/video-assets",
    express.static(videoAssetDir, { fallthrough: true, maxAge: "5m" })
  );

  app.locals.firestore = firestore;
  app.locals.bigQuery = bigQuery;

  const authMiddleware = requireAuth({ logger });

  app.use(
    "/api/llm",
    authMiddleware,
    llmRouter({ llmClient, firestore, bigQuery, logger })
  );

  app.use("/auth", authRouter({ firestore, bigQuery, logger }));
  app.use("/contact", contactRouter({ logger }));
  // Copilot routes - NO llmClient or bigQuery passed
  // GET /chat only - LLM calls go through POST /api/llm with taskType: "copilot_agent"
  app.use(
    "/wizard/copilot",
    authMiddleware,
    copilotRouter({ firestore, logger })
  );
  app.use(
    "/wizard",
    authMiddleware,
    wizardRouter({ firestore, logger })
  );
  app.use(
    "/assets",
    authMiddleware,
    assetsRouter({ firestore, bigQuery, logger })
  );
  // Videos routes - NO llmClient passed
  // All LLM calls go through HTTP POST /api/llm
  app.use(
    "/videos",
    authMiddleware,
    videosRouter({ firestore, bigQuery, logger })
  );
  app.use(
    "/dashboard",
    authMiddleware,
    dashboardRouter({ firestore, bigQuery, logger })
  );
  app.use(
    "/users",
    authMiddleware,
    usersRouter({ firestore, bigQuery, logger })
  );
  // Companies routes - NO llmClient passed
  // All LLM calls go through HTTP POST /api/llm
  app.use(
    "/companies",
    authMiddleware,
    companiesRouter({ firestore, bigQuery, logger })
  );
  // Golden Interview routes - NO llmClient or bigQuery passed
  // All LLM calls go through HTTP POST /api/llm
  app.use(
    "/golden-interview",
    authMiddleware,
    goldenInterviewRouter({ firestore, logger })
  );
  const publicSubscriptionsRouter = express.Router();
  publicSubscriptionsRouter.get("/plans", (req, res, next) => {
    try {
      const plans = listSubscriptionPlans();
      res.json({
        plans,
        currency: "USD",
        usdPerCredit: getBaseUsdPerCredit(),
      });
    } catch (error) {
      next(error);
    }
  });
  app.use("/subscriptions", publicSubscriptionsRouter);

  app.use(
    "/subscriptions",
    authMiddleware,
    subscriptionsRouter({ firestore, bigQuery, logger })
  );

  logger.warn(
    "Legacy LLM endpoints (wizard/chat/copilot/assets/etc.) are deprecated; please route through POST /api/llm."
  );

  app.use(notFound);
  app.use(errorHandler(logger));

  return app;
}
