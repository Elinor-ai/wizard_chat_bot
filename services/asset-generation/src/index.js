import { createLogger, loadEnv } from "@wizard/utils";
import { LLMOrchestrator } from "@wizard/llm";

class AssetGenerationService {
  constructor({ logger, orchestrator }) {
    this.logger = logger;
    this.orchestrator = orchestrator;
  }

  async start() {
    this.logger.info("Asset generation service ready (stub)");
  }
}

async function main() {
  loadEnv();
  const logger = createLogger("asset-generation-service");
  const orchestrator = new LLMOrchestrator({ logger });
  const service = new AssetGenerationService({ logger, orchestrator });
  await service.start();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Asset generation service failed to start", error);
  process.exit(1);
});
