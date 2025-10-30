import express from "express";
import cors from "cors";
import morgan from "morgan";
import { notFound, errorHandler } from "@wizard/utils";
import { wizardRouter } from "./routes/wizard.js";
import { chatRouter } from "./routes/chat.js";
import { authRouter } from "./routes/auth.js";
import { assetsRouter } from "./routes/assets.js";

export function createApp({ orchestrator, logger, firestore }) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(
    morgan("tiny", {
      stream: {
        write: (message) => logger.info(message.trim())
      }
    })
  );

  app.use("/auth", authRouter({ firestore, logger }));
  app.use(
    "/wizard",
    wizardRouter({
      orchestrator,
      logger,
      firestore
    })
  );
  app.use("/chat", chatRouter({ orchestrator, logger }));
  app.use("/assets", assetsRouter({ firestore, logger }));

  app.use(notFound);
  app.use(errorHandler(logger));

  return app;
}
