import "express-async-errors";
import { createApp } from "./server.js";
import { loadEnv, createLogger } from "@wizard/utils";
import { createFirestoreAdapter, createBigQueryAdapter } from "@wizard/data";
import { llmClient } from "./llm-client.js";

async function main() {
  const env = loadEnv();
  const logger = createLogger("api-gateway");
  const firestore = createFirestoreAdapter();
  const bigQuery = createBigQueryAdapter();

  const app = createApp({ logger, firestore, bigQuery, llmClient });
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
