import { llmLogger } from "../logger.js";

export class ProviderSelectionPolicy {
  constructor(config) {
    this.config = { ...config };
    this.cache = new Map();
  }

  select(task) {
    if (!this.cache.has(task)) {
      const resolved = this.resolve(task);
      this.cache.set(task, resolved);
      llmLogger.info(
        { task, provider: resolved.provider, model: resolved.model },
        "LLM provider configured"
      );
    }
    return this.cache.get(task);
  }

  resolve(task) {
    const taskConfig = this.config[task];
    if (!taskConfig) {
      throw new Error(`No provider selection config for task ${task}`);
    }

    const provider = typeof taskConfig.provider === "string"
      ? taskConfig.provider.trim()
      : null;
    const model = typeof taskConfig.model === "string"
      ? taskConfig.model.trim()
      : null;

    if (!provider || !model) {
      throw new Error(`Provider/model missing for task ${task}`);
    }

    return { provider, model };
  }
}
