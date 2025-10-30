import { createLogger, loadEnv } from "@wizard/utils";

class CreditsService {
  constructor({ logger }) {
    this.logger = logger;
  }

  async start() {
    this.logger.info("Credits service ready (stub)");
  }
}

async function main() {
  loadEnv();
  const logger = createLogger("credits-service");
  const service = new CreditsService({ logger });
  await service.start();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Credits service failed to start", error);
  process.exit(1);
});
