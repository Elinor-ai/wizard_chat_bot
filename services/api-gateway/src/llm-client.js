import { loadEnv } from "@wizard/utils";
import { llmLogger } from "./llm/logger.js";
import { OpenAIAdapter } from "./llm/providers/openai-adapter.js";
import { GeminiAdapter } from "./llm/providers/gemini-adapter.js";
import { ProviderSelectionPolicy } from "./llm/providers/selection-policy.js";
import { LlmOrchestrator } from "./llm/orchestrator.js";
import { TASK_REGISTRY } from "./llm/tasks.js";
import { DalleImageAdapter } from "./llm/providers/dalle-image-adapter.js";
import { ImagenImageAdapter } from "./llm/providers/imagen-image-adapter.js";
import { StableDiffusionAdapter } from "./llm/providers/stable-diffusion-adapter.js";
import { LLM_TASK_CONFIG } from "./config/llm-config.js";
import { LLM_CORE_TASK } from "./config/task-types.js";

loadEnv();

// OpenAI LLM provider configuration
// Set OPENAI_LLM_ENABLED=true to enable OpenAI LLM provider (requires valid OPENAI_API_KEY)
// Note: OPENAI_ENABLED is deprecated but still supported for backwards compatibility
const OPENAI_LLM_ENABLED =
  process.env.OPENAI_LLM_ENABLED === "true" ||
  process.env.OPENAI_ENABLED === "true";
// Warn about deprecated env var
if (process.env.OPENAI_ENABLED && !process.env.OPENAI_LLM_ENABLED) {
  console.warn(
    "[llm-client] OPENAI_ENABLED is deprecated. Please use OPENAI_LLM_ENABLED instead."
  );
}
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? null;
const OPENAI_API_URL =
  process.env.OPENAI_API_URL ?? "https://api.openai.com/v1/chat/completions";

// Validate OpenAI configuration when enabled
if (OPENAI_LLM_ENABLED) {
  const isInvalidKey = !OPENAI_API_KEY ||
    OPENAI_API_KEY === "empty_string" ||
    OPENAI_API_KEY.trim() === "";
  if (isInvalidKey) {
    throw new Error(
      "OpenAI LLM is enabled (OPENAI_LLM_ENABLED=true) but OPENAI_API_KEY is not set to a valid value. " +
      "Either set a valid API key or disable OpenAI by removing OPENAI_LLM_ENABLED."
    );
  }
  llmLogger.info("OpenAI LLM provider is ENABLED");
} else {
  llmLogger.info("OpenAI LLM provider is DISABLED (set OPENAI_LLM_ENABLED=true to enable)");
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? null;
const GEMINI_API_URL =
  process.env.GEMINI_API_URL ??
  "https://generativelanguage.googleapis.com/v1beta";

// DALL-E uses OpenAI API key if not separately configured
const DALL_E_API_KEY =
  process.env.DALL_E_API_KEY || (OPENAI_LLM_ENABLED ? OPENAI_API_KEY : null);
const IMAGEN_API_KEY =
  process.env.IMAGEN_API_KEY ?? GEMINI_API_KEY;
const STABILITY_API_KEY =
  process.env.STABILITY_API_KEY ??
  process.env.STABLE_DIFFUSION_API_KEY ??
  null;

const providerSelectionConfig = LLM_TASK_CONFIG;

// Build adapters object, conditionally including OpenAI when enabled
const adapters = {
  gemini: new GeminiAdapter({
    apiKey: GEMINI_API_KEY,
    apiUrl: GEMINI_API_URL,
  }),
  imagen: new ImagenImageAdapter({
    apiKey: IMAGEN_API_KEY,
  }),
  stable_diffusion: new StableDiffusionAdapter({
    apiKey: STABILITY_API_KEY,
  }),
};

// Only register OpenAI adapters when explicitly enabled
if (OPENAI_LLM_ENABLED) {
  adapters.openai = new OpenAIAdapter({
    apiKey: OPENAI_API_KEY,
    apiUrl: OPENAI_API_URL,
  });
  adapters["dall-e"] = new DalleImageAdapter({
    apiKey: DALL_E_API_KEY,
  });
}

const selectionPolicy = new ProviderSelectionPolicy(providerSelectionConfig);
const orchestrator = new LlmOrchestrator({
  adapters,
  policy: selectionPolicy,
  tasks: TASK_REGISTRY,
});

async function askSuggestions(context) {
  try {
    const result = await orchestrator.run(LLM_CORE_TASK.SUGGEST, context);
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

async function askImageCaption(context) {
  try {
    const result = await orchestrator.run(LLM_CORE_TASK.IMAGE_CAPTION, context);
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
      caption: result.caption ?? null,
      hashtags: Array.isArray(result.hashtags) ? result.hashtags : [],
      metadata: result.metadata ?? null,
    };
  } catch (error) {
    llmLogger.warn({ err: error }, "heroImageCaption orchestrator failure");
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
    const result = await orchestrator.run(LLM_CORE_TASK.REFINE, context);
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
    const result = await orchestrator.run(LLM_CORE_TASK.CHANNELS, context);
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

async function askCompanyIntel(context) {
  try {
    const result = await orchestrator.run(LLM_CORE_TASK.COMPANY_INTEL, context);
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
      profile: result.profile ?? {},
      branding: result.branding ?? {},
      socials: result.socials ?? {},
      jobs: result.jobs ?? [],
      evidence: result.evidence ?? {},
      metadata: result.metadata ?? null
    };
  } catch (error) {
    llmLogger.warn({ err: error }, "askCompanyIntel orchestrator failure");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error)
      }
    };
  }
}

async function runCopilotAgent(context) {
  try {
    const result = await orchestrator.run(LLM_CORE_TASK.COPILOT_AGENT, context);
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
      metadata: result.metadata ?? null,
      type: result.type,
      tool: result.tool,
      input: result.input,
      message: result.message,
      actions: result.actions ?? []
    };
  } catch (error) {
    llmLogger.warn({ err: error }, "runCopilotAgent orchestrator failure");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error)
      }
    };
  }
}

async function askAssetMaster(context) {
  try {
    const result = await orchestrator.run(LLM_CORE_TASK.ASSET_MASTER, context);
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
    const result = await orchestrator.run(LLM_CORE_TASK.ASSET_CHANNEL_BATCH, context);
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
    const result = await orchestrator.run(LLM_CORE_TASK.ASSET_ADAPT, context);
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

async function askVideoConfig(context) {
  try {
    const result = await orchestrator.run(LLM_CORE_TASK.VIDEO_CONFIG, context);
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
      videoConfig: result.videoConfig ?? null,
      metadata: result.metadata ?? null
    };
  } catch (error) {
    llmLogger.warn({ err: error }, "askVideoConfig orchestrator failure");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error)
      }
    };
  }
}

async function askVideoStoryboard(context) {
  try {
    const result = await orchestrator.run(LLM_CORE_TASK.VIDEO_STORYBOARD, context);
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
      shots: result.shots ?? [],
      thumbnail: result.thumbnail ?? null,
      metadata: result.metadata ?? null
    };
  } catch (error) {
    llmLogger.warn({ err: error }, "askVideoStoryboard orchestrator failure");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error)
      }
    };
  }
}

async function askVideoCaption(context) {
  try {
    const result = await orchestrator.run(LLM_CORE_TASK.VIDEO_CAPTION, context);
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
      caption: result.caption ?? null,
      metadata: result.metadata ?? null
    };
  } catch (error) {
    llmLogger.warn({ err: error }, "askVideoCaption orchestrator failure");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error)
      }
    };
  }
}

async function askVideoCompliance(context) {
  try {
    const result = await orchestrator.run(LLM_CORE_TASK.VIDEO_COMPLIANCE, context);
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
      flags: result.flags ?? [],
      metadata: result.metadata ?? null
    };
  } catch (error) {
    llmLogger.warn({ err: error }, "askVideoCompliance orchestrator failure");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error)
      }
    };
  }
}

async function askHeroImagePrompt(context) {
  try {
    llmLogger.info(
      {
        jobId: context?.jobId ?? context?.refinedJob?.jobId ?? null
      },
      "askHeroImagePrompt:start"
    );
    const result = await orchestrator.run(LLM_CORE_TASK.IMAGE_PROMPT_GENERATION, context);
    if (result.error) {
      llmLogger.error(
        {
          jobId: context?.jobId ?? context?.refinedJob?.jobId ?? null,
          reason: result.error.reason,
          message: result.error.message
        },
        "askHeroImagePrompt:error"
      );
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
      prompt: result.prompt,
      negativePrompt: result.negativePrompt ?? null,
      style: result.style ?? null,
      metadata: result.metadata ?? null,
    };
  } catch (error) {
    llmLogger.warn({ err: error }, "askHeroImagePrompt orchestrator failure");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error),
      },
    };
  }
}

async function runImageGeneration(context) {
  try {
    llmLogger.info(
      {
        promptPreview: context?.prompt?.slice(0, 120) ?? null,
        negativePreview: context?.negativePrompt?.slice?.(0, 80) ?? null,
        style: context?.style ?? null,
        task: LLM_CORE_TASK.IMAGE_GENERATION
      },
      "runImageGeneration:start"
    );
    const result = await orchestrator.run(LLM_CORE_TASK.IMAGE_GENERATION, context);
    if (result.error) {
      llmLogger.error(
        {
          task: LLM_CORE_TASK.IMAGE_GENERATION,
          provider: result.provider,
          model: result.model,
          reason: result.error.reason,
          message: result.error.message
        },
        "Image generation task returned error"
      );
      return {
        error: {
          ...result.error,
          provider: result.provider,
          model: result.model,
        },
      };
    }
    llmLogger.info(
      {
        provider: result.provider,
        model: result.model,
        hasBase64: Boolean(result.imageBase64),
        hasUrl: Boolean(result.imageUrl),
        base64Length: result.imageBase64 ? result.imageBase64.length : 0
      },
      "runImageGeneration:success"
    );
    return {
      provider: result.provider,
      model: result.model,
      imageBase64: result.imageBase64 ?? null,
      imageUrl: result.imageUrl ?? null,
      metadata: result.metadata ?? null,
    };
  } catch (error) {
    llmLogger.error({ err: error }, "runImageGeneration orchestrator failure");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error),
      },
    };
  }
}

/**
 * Process a Golden Interviewer conversation turn.
 *
 * @param {object} context - The context for the turn
 * @param {object} context.currentSchema - Current state of the golden schema
 * @param {array} context.conversationHistory - Previous conversation messages
 * @param {string} [context.userMessage] - User's text message
 * @param {object} [context.uiResponse] - Response from UI component
 * @param {string} [context.previousToolType] - The UI tool that was displayed
 * @param {number} [context.turnNumber] - Current turn number
 * @param {boolean} [context.isFirstTurn] - Whether this is the first turn
 * @returns {Promise<object>} - The LLM response with message, extraction, uiTool, etc.
 */
async function askGoldenInterviewerTurn(context) {
  try {
    llmLogger.info(
      {
        sessionId: context?.sessionId ?? null,
        turnNumber: context?.turnNumber ?? null,
        isFirstTurn: context?.isFirstTurn ?? false,
        hasUserMessage: Boolean(context?.userMessage),
        hasUiResponse: Boolean(context?.uiResponse),
      },
      "askGoldenInterviewerTurn:start"
    );

    const result = await orchestrator.run(
      LLM_CORE_TASK.GOLDEN_INTERVIEWER,
      context
    );

    if (result.error) {
      llmLogger.error(
        {
          task: LLM_CORE_TASK.GOLDEN_INTERVIEWER,
          provider: result.provider,
          model: result.model,
          reason: result.error.reason,
          message: result.error.message,
        },
        "askGoldenInterviewerTurn:error"
      );
      return {
        error: {
          ...result.error,
          provider: result.provider,
          model: result.model,
        },
      };
    }

    llmLogger.info(
      {
        provider: result.provider,
        model: result.model,
        completionPercentage: result.completionPercentage ?? 0,
        interviewPhase: result.interviewPhase ?? null,
        hasUiTool: Boolean(result.uiTool),
      },
      "askGoldenInterviewerTurn:success"
    );

    return {
      provider: result.provider,
      model: result.model,
      message: result.message,
      extraction: result.extraction ?? {},
      uiTool: result.uiTool ?? null,
      nextPriorityFields: result.nextPriorityFields ?? [],
      completionPercentage: result.completionPercentage ?? 0,
      interviewPhase: result.interviewPhase ?? "opening",
      metadata: result.metadata ?? null,
      toolReasoning: result.toolReasoning ?? null,
    };
  } catch (error) {
    llmLogger.error(
      { err: error },
      "askGoldenInterviewerTurn orchestrator failure"
    );
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error),
      },
    };
  }
}

export const llmClient = {
  askSuggestions,
  askChannelRecommendations,
  askRefineJob,
  askCompanyIntel,
  askAssetMaster,
  askAssetChannelBatch,
  askAssetAdapt,
  askVideoConfig,
  askVideoStoryboard,
  askVideoCaption,
  askVideoCompliance,
  runCopilotAgent,
  askHeroImagePrompt,
  askImageCaption,
  runImageGeneration,
  askGoldenInterviewerTurn,
};
