import express from "express";
import cors from "cors";
import morgan from "morgan";
import fs from "node:fs";
import path from "node:path";
import { notFound, errorHandler } from "@wizard/utils";
import { wizardRouter } from "./routes/wizard.js";
import { chatRouter } from "./routes/chat.js";
import { copilotRouter } from "./routes/copilot.js";
import { authRouter } from "./routes/auth.js";
import { assetsRouter } from "./routes/assets.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { contactRouter } from "./routes/contact.js";
import { usersRouter } from "./routes/users.js";
import { requireAuth } from "./middleware/require-auth.js";
import { videosRouter } from "./routes/videos.js";
import { companiesRouter } from "./routes/companies.js";
import { startCompanyIntelWorker } from "./services/company-intel.js";

const corsConfig = {
  origin: "http://localhost:3000",
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

export function createApp({ logger, firestore, llmClient }) {
  const app = express();
  startCompanyIntelWorker({ firestore, llmClient, logger });

  app.use(cors(corsConfig));
  app.options("*", cors(corsConfig));

  app.use(express.json({ limit: "2mb" }));
  app.use(
    morgan("tiny", {
      stream: {
        write: (message) => logger.info(message.trim())
      }
    })
  );

  const videoAssetDir = path.resolve(process.env.VIDEO_RENDER_OUTPUT_DIR ?? "./tmp/video-renders");
  fs.mkdirSync(videoAssetDir, { recursive: true });
  app.use("/video-assets", express.static(videoAssetDir, { fallthrough: true, maxAge: "5m" }));

  const authMiddleware = requireAuth({ logger });

  app.use("/auth", authRouter({ firestore, logger }));
  app.use("/contact", contactRouter({ logger }));
  app.use("/wizard/copilot", authMiddleware, copilotRouter({ firestore, llmClient, logger }));
  app.use("/wizard", authMiddleware, wizardRouter({ firestore, logger, llmClient }));
  app.use("/chat", authMiddleware, chatRouter({ firestore, llmClient, logger }));
  app.use("/assets", authMiddleware, assetsRouter({ firestore, logger }));
  app.use("/videos", authMiddleware, videosRouter({ firestore, llmClient, logger }));
  app.use("/dashboard", authMiddleware, dashboardRouter({ firestore, logger }));
  app.use("/users", authMiddleware, usersRouter({ firestore, logger }));
  app.use("/companies", authMiddleware, companiesRouter({ firestore, logger }));

  app.use(notFound);
  app.use(errorHandler(logger));

  return app;
}
