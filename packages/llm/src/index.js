import { randomUUID } from "node:crypto";
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
  "wizard.suggestion.step":
    process.env.LLM_ASSET_COPY_PROVIDER ?? process.env.LLM_CHAT_PROVIDER ?? "openai:gpt-4o-mini",
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
  "wizard.suggestion.step": process.env.LLM_ASSET_COPY_API_KEY ?? process.env.LLM_CHAT_API_KEY,
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
    const rendered = renderPrompt(prompt, payload);
    this.logger.debug(
      {
        promptId: prompt?.id ?? taskType,
        tokens,
        credits,
        provider: options.provider,
        currentStepId: payload?.currentStepId
      },
      "LLM execution stubbed"
    );

    if (taskType === "wizard.suggestion.step") {
      const suggestions = generateStepSuggestions(
        payload?.draftState ?? {},
        payload?.currentStepId ?? "core-details",
        payload?.marketIntelligence ?? {}
      );
      return {
        content: { suggestions },
        metadata: {
          options: safeOptions,
          payload,
          tokensUsed: tokens,
          creditsCharged: credits,
          prompt: rendered.promptText,
          variables: rendered.variables,
          structuredOutput: true
        }
      };
    }

    if (taskType === "wizard.channel.recommend") {
      const role = payload?.confirmed?.roleCategory ?? "multi-role teams";
      const location = payload?.confirmed?.location ?? "priority markets";
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
      metadata: {
        options: safeOptions,
        payload,
        tokensUsed: tokens,
        creditsCharged: credits,
        prompt: rendered.promptText,
        variables: rendered.variables
      }
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

function renderPrompt(prompt, payload) {
  if (!prompt?.template) {
    return { promptText: "", variables: {} };
  }

  const variables = {};
  let promptText = prompt.template;

  if (Array.isArray(prompt.variables)) {
    prompt.variables.forEach((variable) => {
      const value = payload?.[variable];
      const serialised =
        typeof value === "string"
          ? value
          : JSON.stringify(value ?? {}, null, 2);
      variables[variable] = serialised;
      promptText = promptText.replaceAll(`{{${variable}}}`, serialised);
    });
  }

  return { promptText, variables };
}

function generateStepSuggestions(state = {}, stepId, marketIntel = {}) {
  const suggestions = [];
  const createSuggestionId = () => {
    try {
      return randomUUID();
    } catch (error) {
      return `sg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    }
  };

  const hasValue = (value) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (value === null || value === undefined) {
      return false;
    }
    return String(value).trim().length > 0;
  };

  if (stepId === "compensation") {
    if (!hasValue(state.salary) && marketIntel.salary) {
      suggestions.push({
        id: createSuggestionId(),
        fieldId: "salary",
        proposal: marketIntel.salary,
        rationale: `Benchmarked compensation for ${marketIntel.roleKey ?? "this role"} in ${marketIntel.location?.label ?? "your market"}.`,
        confidence: 0.74
      });
    }
    if (!hasValue(state.salaryPeriod) && marketIntel.salaryPeriod) {
      suggestions.push({
        id: createSuggestionId(),
        fieldId: "salaryPeriod",
        proposal: marketIntel.salaryPeriod,
        rationale: "Sets expectations for how pay is calculated for this role.",
        confidence: 0.6
      });
    }
    if (!hasValue(state.currency) && marketIntel.currency) {
      suggestions.push({
        id: createSuggestionId(),
        fieldId: "currency",
        proposal: marketIntel.currency,
        rationale: "Matches regional norms surfaced from benchmark data.",
        confidence: 0.65
      });
    }
    if (!hasValue(state.benefits) && Array.isArray(marketIntel.benefitNorms)) {
      suggestions.push({
        id: createSuggestionId(),
        fieldId: "benefits",
        proposal: marketIntel.benefitNorms.join(", "),
        rationale: "Aligns with benefits packages cited across top offers in this segment.",
        confidence: 0.68
      });
    }
  } else if (stepId === "requirements") {
    if (!hasValue(state.mustHaves) && Array.isArray(marketIntel.mustHaveExamples)) {
      suggestions.push({
        id: createSuggestionId(),
        fieldId: "mustHaves",
        proposal: marketIntel.mustHaveExamples.join("\n"),
        rationale: "Common skill clusters surfaced from recent hires and benchmark roles.",
        confidence: 0.72
      });
    }
    if (!hasValue(state.roleCategory) && marketIntel.roleKey) {
      suggestions.push({
        id: createSuggestionId(),
        fieldId: "roleCategory",
        proposal: marketIntel.roleKey,
        rationale: "Align role taxonomy for downstream analytics and salary benchmarks.",
        confidence: 0.6
      });
    }
  } else if (stepId === "additional") {
    if (!hasValue(state.niceToHaves) && Array.isArray(marketIntel.mustHaveExamples)) {
      suggestions.push({
        id: createSuggestionId(),
        fieldId: "niceToHaves",
        proposal: marketIntel.mustHaveExamples
          .map((item) => `Bonus: ${item}`)
          .join("\n"),
        rationale: "Signal stretch skills without blocking qualified applicants.",
        confidence: 0.55
      });
    }
    if (!hasValue(state.experienceLevel)) {
      suggestions.push({
        id: createSuggestionId(),
        fieldId: "experienceLevel",
        proposal: "mid",
        rationale: "Most teams hire mid-level contributors before expanding into senior scope.",
        confidence: 0.5
      });
    }
  } else {
    if (!hasValue(state.title) && marketIntel.roleKey) {
      suggestions.push({
        id: createSuggestionId(),
        fieldId: "title",
        proposal: `Senior ${marketIntel.roleKey.charAt(0).toUpperCase()}${marketIntel.roleKey.slice(1)}`,
        rationale: "Keep titles searchable and aligned with market expectations.",
        confidence: 0.58
      });
    }
    if (!hasValue(state.location) && marketIntel.location?.label) {
      suggestions.push({
        id: createSuggestionId(),
        fieldId: "location",
        proposal: marketIntel.location.label,
        rationale: "Clarify location to unlock geo-specific channels and salary guidance.",
        confidence: 0.54
      });
    }
  }

  return suggestions;
}
