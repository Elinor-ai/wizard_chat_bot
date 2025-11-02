import express from "express";
import cors from "cors";
import morgan from "morgan";
import { notFound, errorHandler } from "@wizard/utils";
import { wizardRouter } from "./routes/wizard.js";
import { chatRouter } from "./routes/chat.js";
import { authRouter } from "./routes/auth.js";
import { assetsRouter } from "./routes/assets.js";
import { dashboardRouter } from "./routes/dashboard.js";

const corsConfig = {
  origin: "http://localhost:3000",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-user-id"]
};

export function createApp({ logger, firestore, llmClient }) {
  const app = express();

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

  app.use("/auth", authRouter({ firestore, logger }));
  app.use("/wizard", wizardRouter({ firestore, logger, llmClient }));
  app.use("/chat", chatRouter({ firestore, llmClient, logger }));
  app.use("/assets", assetsRouter({ firestore, logger }));
  app.use("/dashboard", dashboardRouter({ firestore, logger }));

  app.use(notFound);
  app.use(errorHandler(logger));

  return app;
}
