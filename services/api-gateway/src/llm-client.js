import { loadEnv } from "@wizard/utils";
import { llmLogger } from "./llm/logger.js";
import { OpenAIAdapter } from "./llm/providers/openai-adapter.js";
import { GeminiAdapter } from "./llm/providers/gemini-adapter.js";
import { ProviderSelectionPolicy } from "./llm/providers/selection-policy.js";
import { LlmOrchestrator } from "./llm/orchestrator.js";
import { TASK_REGISTRY } from "./llm/tasks.js";

loadEnv();

const DEFAULT_OPENAI_CHAT_MODEL =
  process.env.OPENAI_CHAT_MODEL ?? process.env.LLM_CHAT_MODEL ?? "gpt-4o-mini";
const DEFAULT_OPENAI_SUGGEST_MODEL =
  process.env.OPENAI_SUGGEST_MODEL ??
  process.env.LLM_SUGGESTION_MODEL ??
  DEFAULT_OPENAI_CHAT_MODEL;
const DEFAULT_OPENAI_REFINE_MODEL =
  process.env.OPENAI_REFINE_MODEL ??
  process.env.LLM_REFINE_MODEL ??
  DEFAULT_OPENAI_CHAT_MODEL;
const DEFAULT_OPENAI_CHANNEL_MODEL =
  process.env.OPENAI_CHANNEL_MODEL ??
  process.env.LLM_CHANNEL_MODEL ??
  DEFAULT_OPENAI_CHAT_MODEL;
const DEFAULT_OPENAI_ASSET_MODEL =
  process.env.OPENAI_ASSET_MODEL ??
  process.env.LLM_ASSET_MODEL ??
  DEFAULT_OPENAI_CHANNEL_MODEL;

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY ?? process.env.LLM_CHAT_API_KEY ?? null;
const OPENAI_API_URL =
  process.env.OPENAI_API_URL ?? "https://api.openai.com/v1/chat/completions";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ?? process.env.LLM_GEMINI_API_KEY ?? null;
const GEMINI_API_URL =
  process.env.GEMINI_API_URL ??
  "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_SUGGEST_MODEL =
  process.env.GEMINI_SUGGEST_MODEL ?? "gemini-flash-latest";
const DEFAULT_GEMINI_CHAT_MODEL =
  process.env.GEMINI_CHAT_MODEL ?? "gemini-flash-latest";
const DEFAULT_GEMINI_REFINE_MODEL =
  process.env.GEMINI_REFINE_MODEL ?? DEFAULT_GEMINI_CHAT_MODEL;
const DEFAULT_GEMINI_CHANNEL_MODEL =
  process.env.GEMINI_CHANNEL_MODEL ?? "gemini-flash-latest";
const DEFAULT_GEMINI_ASSET_MODEL =
  process.env.GEMINI_ASSET_MODEL ?? DEFAULT_GEMINI_CHAT_MODEL;

const providerSelectionConfig = {
  suggest: {
    env: "LLM_SUGGESTION_PROVIDER",
    defaultProvider: "openai",
    defaultSpec: `openai:${DEFAULT_OPENAI_SUGGEST_MODEL}`,
    providerDefaults: {
      openai: DEFAULT_OPENAI_SUGGEST_MODEL,
      gemini: DEFAULT_GEMINI_SUGGEST_MODEL,
    },
  },
  refine: {
    env: "LLM_REFINE_PROVIDER",
    defaultProvider: "openai",
    defaultSpec: `openai:${DEFAULT_OPENAI_REFINE_MODEL}`,
    providerDefaults: {
      openai: DEFAULT_OPENAI_REFINE_MODEL,
      gemini: DEFAULT_GEMINI_REFINE_MODEL,
    },
  },
  channels: {
    env: "LLM_CHANNEL_PROVIDER",
    defaultProvider: "openai",
    defaultSpec: `openai:${DEFAULT_OPENAI_CHANNEL_MODEL}`,
    providerDefaults: {
      openai: DEFAULT_OPENAI_CHANNEL_MODEL,
      gemini: DEFAULT_GEMINI_CHANNEL_MODEL,
    },
  },
  chat: {
    env: "LLM_CHAT_PROVIDER",
    defaultProvider: "openai",
    defaultSpec: `openai:${DEFAULT_OPENAI_CHAT_MODEL}`,
    providerDefaults: {
      openai: DEFAULT_OPENAI_CHAT_MODEL,
      gemini: DEFAULT_GEMINI_CHAT_MODEL,
    },
  },
  asset_master: {
    env: "LLM_ASSET_PROVIDER",
    defaultProvider: "openai",
    defaultSpec: `openai:${DEFAULT_OPENAI_ASSET_MODEL}`,
    providerDefaults: {
      openai: DEFAULT_OPENAI_ASSET_MODEL,
      gemini: DEFAULT_GEMINI_ASSET_MODEL,
    },
  },
  asset_channel_batch: {
    env: "LLM_ASSET_PROVIDER",
    defaultProvider: "openai",
    defaultSpec: `openai:${DEFAULT_OPENAI_ASSET_MODEL}`,
    providerDefaults: {
      openai: DEFAULT_OPENAI_ASSET_MODEL,
      gemini: DEFAULT_GEMINI_ASSET_MODEL,
    },
  },
  asset_adapt: {
    env: "LLM_ASSET_PROVIDER",
    defaultProvider: "openai",
    defaultSpec: `openai:${DEFAULT_OPENAI_ASSET_MODEL}`,
    providerDefaults: {
      openai: DEFAULT_OPENAI_ASSET_MODEL,
      gemini: DEFAULT_GEMINI_ASSET_MODEL,
    },
  },
};

const adapters = {
  openai: new OpenAIAdapter({
    apiKey: OPENAI_API_KEY,
    apiUrl: OPENAI_API_URL,
  }),
  gemini: new GeminiAdapter({
    apiKey: GEMINI_API_KEY,
    apiUrl: GEMINI_API_URL,
  }),
};

const selectionPolicy = new ProviderSelectionPolicy(providerSelectionConfig);
const orchestrator = new LlmOrchestrator({
  adapters,
  policy: selectionPolicy,
  tasks: TASK_REGISTRY,
});

async function askSuggestions(context) {
  try {
    const result = await orchestrator.run("suggest", context);
    if (result.error) {
      return {
        error: {
          ...result.error,
          provider: result.provider,
          model: result.model,
        },
      };
    }
    return {
      provider: result.provider,
      model: result.model,
      candidates: result.candidates ?? [],
      metadata: result.metadata ?? null,
    };
  } catch (error) {
    llmLogger.warn({ err: error }, "askSuggestions orchestrator failure");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error),
      },
    };
  }
}

async function askRefineJob(context) {
  try {
    const result = await orchestrator.run("refine", context);
    if (result.error) {
      return {
        error: {
          ...result.error,
          provider: result.provider,
          model: result.model,
        },
      };
    }
    return {
      provider: result.provider,
      model: result.model,
      refinedJob: result.refinedJob ?? {},
      summary: result.summary ?? null,
      metadata: result.metadata ?? null,
    };
  } catch (error) {
    llmLogger.warn({ err: error }, "askRefineJob orchestrator failure");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error),
      },
    };
  }
}

async function askChannelRecommendations(context) {
  try {
    const result = await orchestrator.run("channels", context);
    if (result.error) {
      return {
        error: {
          ...result.error,
          provider: result.provider,
          model: result.model,
        },
      };
    }
    return {
      provider: result.provider,
      model: result.model,
      recommendations: result.recommendations ?? [],
      metadata: result.metadata ?? null,
    };
  } catch (error) {
    llmLogger.warn({ err: error }, "askChannelRecommendations orchestrator failure");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error),
      },
    };
  }
}

async function askChat({ userMessage, draftState, intent }) {
  try {
    const result = await orchestrator.run("chat", {
      userMessage,
      draftState,
      intent,
    });
    if (result.error) {
      llmLogger.warn(
        { error: result.error, provider: result.provider },
        "Chat task returned error"
      );
      return buildChatFallback({ draftState });
    }
    return result.message;
  } catch (error) {
    llmLogger.warn({ err: error }, "askChat orchestrator failure");
    return buildChatFallback({ draftState });
  }
}

function buildChatFallback({ draftState }) {
  const title = draftState?.title ? ` about ${draftState.title}` : "";
  const location = draftState?.location ? ` in ${draftState.location}` : "";
  return `Understood. I'll take that into account${title}${location ? ` ${location}` : ""}.`;
}

async function askChannelPicker(context) {
  try {
    const result = await orchestrator.run("channel_picker", context);
    if (result.error) {
      return {
        error: {
          ...result.error,
          provider: result.provider,
          model: result.model,
        },
      };
    }
    return {
      provider: result.provider,
      model: result.model,
      jobTitle: result.jobTitle ?? null,
      geo: result.geo ?? null,
      roleFamily: result.roleFamily ?? null,
      topChannel: result.topChannel ?? null,
      recommendedMedium: result.recommendedMedium ?? null,
      copyHint: result.copyHint ?? null,
      alternatives: result.alternatives ?? [],
      complianceFlags: result.complianceFlags ?? [],
      metadata: result.metadata ?? null,
    };
  } catch (error) {
    llmLogger.warn({ err: error }, "askChannelPicker orchestrator failure");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error),
      },
    };
  }
}

async function askAssetMaster(context) {
  try {
    const result = await orchestrator.run("asset_master", context);
    if (result.error) {
      return {
        error: {
          ...result.error,
          provider: result.provider,
          model: result.model
        }
      };
    }
    return {
      provider: result.provider,
      model: result.model,
      asset: result.asset ?? null,
      metadata: result.metadata ?? null
    };
  } catch (error) {
    llmLogger.warn({ err: error }, "askAssetMaster orchestrator failure");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error)
      }
    };
  }
}

async function askAssetChannelBatch(context) {
  try {
    const result = await orchestrator.run("asset_channel_batch", context);
    if (result.error) {
      return {
        error: {
          ...result.error,
          provider: result.provider,
          model: result.model
        }
      };
    }
    return {
      provider: result.provider,
      model: result.model,
      assets: result.assets ?? [],
      metadata: result.metadata ?? null
    };
  } catch (error) {
    llmLogger.warn({ err: error }, "askAssetChannelBatch orchestrator failure");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error)
      }
    };
  }
}

async function askAssetAdapt(context) {
  try {
    const result = await orchestrator.run("asset_adapt", context);
    if (result.error) {
      return {
        error: {
          ...result.error,
          provider: result.provider,
          model: result.model
        }
      };
    }
    return {
      provider: result.provider,
      model: result.model,
      asset: result.asset ?? null,
      metadata: result.metadata ?? null
    };
  } catch (error) {
    llmLogger.warn({ err: error }, "askAssetAdapt orchestrator failure");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error)
      }
    };
  }
}

export const llmClient = {
  askChat,
  askSuggestions,
  askChannelRecommendations,
  askRefineJob,
  askChannelPicker,
  askAssetMaster,
  askAssetChannelBatch,
  askAssetAdapt,
};
