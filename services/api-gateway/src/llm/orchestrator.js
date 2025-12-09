import { llmLogger } from "./logger.js";
import { safePreview } from "./utils/parsing.js";
import { getRequestContext } from "./request-context.js";

export class LlmOrchestrator {
  constructor({ adapters, policy, tasks }) {
    this.adapters = adapters;
    this.policy = policy;
    this.tasks = tasks;
  }

  resolveValue(configValue, provider) {
    if (configValue === undefined || configValue === null) {
      return undefined;
    }
    if (typeof configValue === "number") {
      return configValue;
    }
    if (
      typeof configValue === "object" &&
      configValue !== null &&
      !Array.isArray(configValue)
    ) {
      if (configValue[provider] !== undefined) {
        return configValue[provider];
      }
      if (configValue.default !== undefined) {
        return configValue.default;
      }
    }
    return configValue;
  }

  async run(taskName, context = {}) {
    const task = this.tasks[taskName];
    if (!task) {
      throw new Error(`Unknown LLM task: ${taskName}`);
    }

    const selection = this.policy.select(taskName);
    const adapter = this.adapters[selection.provider];
    if (!adapter) {
      throw new Error(`No adapter registered for provider ${selection.provider}`);
    }

    const retries = task.retries ?? 1;
    let attempt = 0;
    let lastError = null;

    while (attempt < retries) {
      const strictMode = Boolean(task.strictOnRetry && attempt > 0);
      const builderContext = { ...context, attempt, strictMode };
      const userPrompt = task.builder(builderContext);

      if (typeof userPrompt !== "string" || userPrompt.trim().length === 0) {
        throw new Error(`Task ${taskName} builder returned an empty prompt`);
      }

      const requestRoute =
        context?.__routePath ??
        context?.routePath ??
        getRequestContext()?.route ??
        null;

      // Support dynamic system prompts via systemBuilder function
      const systemPrompt =
        typeof task.systemBuilder === "function"
          ? task.systemBuilder(builderContext)
          : task.system;

      const options = {
        model: selection.model,
        system: systemPrompt,
        user: userPrompt,
        mode: task.mode ?? "text",
        temperature: task.temperature ?? 0.2,
        maxTokens: this.resolveValue(task.maxTokens, selection.provider),
        taskType: taskName,
        route: requestRoute,
      };

      llmLogger.info(
        {
          task: taskName,
          provider: selection.provider,
          model: selection.model,
          attempt,
        },
        "LLM invocation starting"
      );

      let response;
      try {
        response = await adapter.invoke(options);
      } catch (error) {
        lastError = {
          reason: "invoke_failed",
          message: error?.message ?? String(error),
        };
        llmLogger.warn(
          {
            task: taskName,
            provider: selection.provider,
            model: selection.model,
            attempt,
            err: error,
          },
          "LLM adapter invocation failed"
        );
        attempt += 1;
        continue;
      }

      if (typeof task.previewLogger === "function") {
        try {
          task.previewLogger(selection.provider, response?.text ?? "");
        } catch (previewError) {
          llmLogger.debug(
            { task: taskName, err: previewError },
            "Preview logger failed"
          );
        }
      }

      let parsed;
      try {
        const parserContext = {
          ...builderContext,
          provider: selection.provider,
          model: selection.model,
        };
        parsed = task.parser(response, parserContext);
      } catch (parseError) {
        parsed = {
          error: {
            reason: "parser_exception",
            message: parseError?.message ?? String(parseError),
            rawPreview: safePreview(response?.text),
          },
        };
      }

      if (parsed && !parsed.error) {
        return {
          task: taskName,
          provider: selection.provider,
          model: selection.model,
          ...parsed,
        };
      }

      lastError = parsed?.error ?? {
        reason: "parse_failed",
        message: "Parser did not produce a result",
        rawPreview: safePreview(response?.text),
      };

      llmLogger.warn(
        {
          task: taskName,
          provider: selection.provider,
          model: selection.model,
          attempt,
          error: lastError.reason,
        },
        "LLM parser failure"
      );

      attempt += 1;
    }

    return {
      task: taskName,
      provider: selection.provider,
      model: selection.model,
      error:
        lastError ??
        {
          reason: "unknown_failure",
          message: "LLM task exhausted retries with no parser result",
        },
    };
  }
}
