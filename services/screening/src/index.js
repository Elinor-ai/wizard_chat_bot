import { createLogger, loadEnv } from "@wizard/utils";

class ScreeningService {
  constructor({ logger }) {
    this.logger = logger;
  }

  async start() {
    this.logger.info("Screening service ready (stub)");
  }
}

async function main() {
  loadEnv();
  const logger = createLogger("screening-service");
  const service = new ScreeningService({ logger });
  await service.start();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Screening service failed to start", error);
  process.exit(1);
});
