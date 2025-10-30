import { z } from "zod";
import { createLogger } from "@wizard/utils";

const taskSchema = z.object({
  type: z.string(),
  payload: z.unknown(),
  options: z
    .object({
      model: z.string().optional(),
      temperature: z.number().optional(),
      maxTokens: z.number().optional()
    })
    .default({})
});

export class LLMOrchestrator {
  constructor({ registry, validator, logger } = {}) {
    this.registry = registry ?? new PromptRegistry();
    this.validator = validator ?? new SchemaValidator();
    this.logger = logger ?? createLogger("llm-orchestrator");
  }

  async run(task) {
    const parsed = taskSchema.parse(task);
    const prompt = this.registry.getPrompt(parsed.type);
    if (!prompt) {
      this.logger.warn({ taskType: parsed.type }, "No prompt registered; returning stub response");
      return {
        content: `Stubbed orchestrator response for ${parsed.type}`,
        metadata: { skipped: true }
      };
    }
    this.logger.info({ taskType: parsed.type }, "Dispatching LLM task");
    const response = await this.execute(prompt, parsed.payload, parsed.options);
    return this.validator.validate(prompt, response);
  }

  /* istanbul ignore next -- integrate provider later */
  async execute(prompt, payload, options) {
    this.logger.warn({ promptId: prompt.id }, "LLM execution stubbed");
    return {
      content: `LLM response placeholder for ${prompt.id}`,
      metadata: { options, payload }
    };
  }
}

export class PromptRegistry {
  constructor() {
    this.prompts = new Map();
  }

  register(prompt) {
    this.prompts.set(prompt.id, prompt);
  }

  getPrompt(taskType) {
    return Array.from(this.prompts.values()).find(
      (item) => item.version === taskType || item.id === taskType
    );
  }
}

export class SchemaValidator {
  validate(prompt, response) {
    if (!prompt?.guardrails?.schema) {
      return response;
    }
    const schema = z.object(prompt.guardrails.schema);
    return schema.parse(response.content ?? {});
  }
}
