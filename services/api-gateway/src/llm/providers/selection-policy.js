import { llmLogger } from "../logger.js";

export function parseProviderSpec(spec, { defaultProvider, defaultModel }) {
  if (!spec) {
    return {
      provider: defaultProvider,
      model: defaultModel,
      modelProvided: false,
    };
  }
  const [maybeProvider, ...rest] = spec.split(":");
  if (rest.length === 0) {
    if (["openai", "gemini"].includes(maybeProvider)) {
      return {
        provider: maybeProvider,
        model: defaultModel,
        modelProvided: false,
      };
    }
    if (maybeProvider.startsWith("gemini-")) {
      return { provider: "gemini", model: maybeProvider, modelProvided: true };
    }
    return {
      provider: defaultProvider,
      model: maybeProvider,
      modelProvided: true,
    };
  }
  const modelPart = rest.join(":");
  return {
    provider: maybeProvider || defaultProvider,
    model: modelPart || defaultModel,
    modelProvided: modelPart.length > 0,
  };
}

export class ProviderSelectionPolicy {
  constructor(config) {
    this.config = config;
    this.cache = new Map();
  }

  select(task) {
    if (this.cache.has(task)) {
      return this.cache.get(task);
    }

    const resolved = this.resolve(task);
    this.cache.set(task, resolved);
    llmLogger.info(
      { task, provider: resolved.provider, model: resolved.model },
      "LLM provider configured"
    );
    return resolved;
  }

  resolve(task) {
    const config = this.config[task];
    if (!config) {
      throw new Error(`No provider selection config for task ${task}`);
    }
    const spec =
      process.env[config.env] !== undefined
        ? process.env[config.env]
        : config.defaultSpec;

    const parsed = parseProviderSpec(spec, {
      defaultProvider: config.defaultProvider,
      defaultModel: config.providerDefaults[config.defaultProvider],
    });

    const provider = parsed.provider || config.defaultProvider;
    const model =
      parsed.modelProvided && parsed.model
        ? parsed.model
        : config.providerDefaults[provider] ??
          config.providerDefaults.default ??
          config.providerDefaults[config.defaultProvider];

    return { provider, model };
  }
}
