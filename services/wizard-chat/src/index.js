import { createLogger, loadEnv } from "@wizard/utils";
import { LLMOrchestrator } from "@wizard/llm";

class WizardChatService {
  constructor({ logger, orchestrator }) {
    this.logger = logger;
    this.orchestrator = orchestrator;
  }

  async start() {
    this.logger.info("Wizard chat service ready (stub)");
  }
}

async function main() {
  loadEnv();
  const logger = createLogger("wizard-chat-service");
  const orchestrator = new LLMOrchestrator({ logger });
  const service = new WizardChatService({ logger, orchestrator });
  await service.start();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Wizard chat service failed to start", error);
  process.exit(1);
});
