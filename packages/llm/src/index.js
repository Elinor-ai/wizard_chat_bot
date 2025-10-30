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

const DEFAULT_TASK_MAP = {
  chat: process.env.LLM_CHAT_PROVIDER ?? "openai:gpt-4o-mini",
  "chat-response": process.env.LLM_CHAT_PROVIDER ?? "openai:gpt-4o-mini",
  "wizard.required.enrich": process.env.LLM_ASSET_COPY_PROVIDER ?? "openai:gpt-4o-mini",
  "wizard.optional.enrich": process.env.LLM_ASSET_COPY_PROVIDER ?? "openai:gpt-4o-mini",
  "wizard.channel.recommend":
    process.env.LLM_CHANNEL_PROVIDER ??
    process.env.LLM_CHAT_PROVIDER ??
    "openai:gpt-4o-mini",
  "asset.image.generate": process.env.LLM_IMAGE_PROVIDER ?? "openai:dall-e-3",
  "asset.video.generate": process.env.LLM_VIDEO_PROVIDER ?? "runway:gen-2"
};

const PROVIDER_API_KEYS = {
  chat: process.env.LLM_CHAT_API_KEY,
  "chat-response": process.env.LLM_CHAT_API_KEY,
  "wizard.required.enrich": process.env.LLM_ASSET_COPY_API_KEY,
  "wizard.optional.enrich": process.env.LLM_ASSET_COPY_API_KEY,
  "wizard.channel.recommend": process.env.LLM_CHANNEL_API_KEY ?? process.env.LLM_CHAT_API_KEY,
  "asset.image.generate": process.env.LLM_IMAGE_API_KEY,
  "asset.video.generate": process.env.LLM_VIDEO_API_KEY
};

function parseProviderConfig(providerString) {
  const [provider, model] = providerString.split(":");
  return {
    provider,
    model
  };
}

const CREDIT_RATIO = Number(process.env.CREDIT_PER_1000_TOKENS ?? 10);

function estimateTokens(payload, prompt) {
  const promptSize = prompt?.template ? prompt.template.length : 0;
  const payloadSize = payload ? JSON.stringify(payload).length : 0;
  return Math.max(1, Math.ceil((promptSize + payloadSize) / 4));
}

function tokensToCredits(tokens) {
  return Math.ceil((tokens / 1000) * CREDIT_RATIO);
}

export class LLMOrchestrator {
  constructor({ registry, validator, logger } = {}) {
    this.registry = registry ?? new PromptRegistry();
    this.validator = validator ?? new SchemaValidator();
    this.logger = logger ?? createLogger("llm-orchestrator");
    this.taskMap = { ...DEFAULT_TASK_MAP };
  }

  resolveProvider(taskType) {
    const providerString = this.taskMap[taskType] ?? this.taskMap[taskType.split(".")[0]];
    if (!providerString) {
      return { provider: "stub", model: "placeholder", apiKey: undefined };
    }
    const { provider, model } = parseProviderConfig(providerString);
    const key = PROVIDER_API_KEYS[taskType] ?? PROVIDER_API_KEYS[taskType.split(".")[0]];
    return { provider, model, apiKey: key };
  }

  async run(task) {
    const parsed = taskSchema.parse(task);
    let prompt = this.registry.getPrompt(parsed.type);
    if (!prompt) {
      this.logger.warn({ taskType: parsed.type }, "No prompt registered; using synthetic prompt");
      prompt = {
        id: parsed.type,
        version: parsed.type,
        template: ""
      };
    }
    const providerConfig = this.resolveProvider(parsed.type);
    this.logger.info({ taskType: parsed.type, provider: providerConfig.provider, model: providerConfig.model }, "Dispatching LLM task");
    const response = await this.execute(parsed.type, prompt, parsed.payload, {
      ...parsed.options,
      provider: providerConfig.provider,
      model: providerConfig.model,
      apiKey: providerConfig.apiKey,
      promptVersion: prompt?.version ?? prompt?.id ?? parsed.type
    });
    return this.validator.validate(prompt, response);
  }

  /* istanbul ignore next -- integrate provider later */
  async execute(taskType, prompt, payload, options) {
    const tokens = estimateTokens(payload, prompt);
    const credits = tokensToCredits(tokens);
    const safeOptions = { ...options, taskType };
    delete safeOptions.apiKey;
    this.logger.debug(
      { promptId: prompt?.id ?? taskType, tokens, credits, provider: options.provider },
      "LLM execution stubbed"
    );

    if (taskType === "wizard.channel.recommend") {
      const role = payload?.confirmed?.roleCategory ?? "multi-role teams";
      const location = payload?.confirmed?.location?.city ?? "priority markets";
      return {
        content: {
          recommendations: [
            {
              channel: "linkedin",
              reason: `Target experienced ${role} talent concentrated around ${location}.`,
              expectedCPA: 48
            },
            {
              channel: "tiktok",
              reason: "High reach short-form campaigns for awareness and applicant velocity.",
              expectedCPA: 32
            },
            {
              channel: "telegram",
              reason: "Engage niche communities with personalized messaging and fast feedback loops.",
              expectedCPA: 28
            }
          ]
        },
        metadata: { options: safeOptions, payload, tokensUsed: tokens, creditsCharged: credits }
      };
    }

    if (taskType === "chat" || taskType === "chat-response") {
      const snippet = payload?.message
        ? payload.message.slice(0, 160)
        : "general assistant guidance";
      return {
        content: `Stubbed copilot reply covering: ${snippet}`,
        metadata: { options: safeOptions, payload, tokensUsed: tokens, creditsCharged: credits }
      };
    }

    return {
      content: `LLM response placeholder for ${prompt?.id ?? taskType}`,
      metadata: { options: safeOptions, payload, tokensUsed: tokens, creditsCharged: credits }
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
