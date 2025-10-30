import { createLogger, loadEnv } from "@wizard/utils";

class PublishingService {
  constructor({ logger }) {
    this.logger = logger;
  }

  async start() {
    this.logger.info("Publishing service ready (stub)");
  }
}

async function main() {
  loadEnv();
  const logger = createLogger("publishing-service");
  const service = new PublishingService({ logger });
  await service.start();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Publishing service failed to start", error);
  process.exit(1);
});
