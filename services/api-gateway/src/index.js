import "express-async-errors";
import { createApp } from "./server.js";
import { loadEnv, createLogger } from "@wizard/utils";
import { LLMOrchestrator } from "@wizard/llm";
import { createFirestoreAdapter } from "@wizard/data";
import { createPromptRegistry } from "./prompts.js";

async function main() {
  const env = loadEnv();
  const logger = createLogger("api-gateway");
  const promptRegistry = createPromptRegistry();
  const orchestrator = new LLMOrchestrator({ logger, registry: promptRegistry });
  const firestore = createFirestoreAdapter();

  const app = createApp({ orchestrator, logger, firestore });
  const port = Number(env.PORT ?? 4000);

  app.listen(port, () => {
    logger.info({ port }, "API gateway listening");
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("API gateway failed to start", error);
  process.exit(1);
});
