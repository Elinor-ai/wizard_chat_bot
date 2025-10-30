import { createLogger, loadEnv } from "@wizard/utils";

class CampaignOrchestratorService {
  constructor({ logger }) {
    this.logger = logger;
  }

  async start() {
    this.logger.info("Campaign orchestrator service ready (stub)");
  }
}

async function main() {
  loadEnv();
  const logger = createLogger("campaign-orchestrator-service");
  const service = new CampaignOrchestratorService({ logger });
  await service.start();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Campaign orchestrator service failed to start", error);
  process.exit(1);
});
