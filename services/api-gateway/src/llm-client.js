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

loadEnv();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? null;
const OPENAI_API_URL =
  process.env.OPENAI_API_URL ?? "https://api.openai.com/v1/chat/completions";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? null;
const GEMINI_API_URL =
  process.env.GEMINI_API_URL ??
  "https://generativelanguage.googleapis.com/v1beta";

const DALL_E_API_KEY =
  process.env.DALL_E_API_KEY ?? OPENAI_API_KEY;
const IMAGEN_API_KEY =
  process.env.IMAGEN_API_KEY ?? GEMINI_API_KEY;
const STABILITY_API_KEY =
  process.env.STABILITY_API_KEY ??
  process.env.STABLE_DIFFUSION_API_KEY ??
  null;

const providerSelectionConfig = LLM_TASK_CONFIG;

const adapters = {
  openai: new OpenAIAdapter({
    apiKey: OPENAI_API_KEY,
    apiUrl: OPENAI_API_URL,
  }),
  gemini: new GeminiAdapter({
    apiKey: GEMINI_API_KEY,
    apiUrl: GEMINI_API_URL,
  }),
  "dall-e": new DalleImageAdapter({
    apiKey: DALL_E_API_KEY,
  }),
  imagen: new ImagenImageAdapter({
    apiKey: IMAGEN_API_KEY,
  }),
  stable_diffusion: new StableDiffusionAdapter({
    apiKey: STABILITY_API_KEY,
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

async function askImageCaption(context) {
  try {
    const result = await orchestrator.run("image_caption", context);
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

async function askChat({ userMessage, draftState, intent, companyContext }) {
  try {
    const result = await orchestrator.run("chat", {
      userMessage,
      draftState,
      intent,
      companyContext
    });
    if (result.error) {
      llmLogger.warn(
        { error: result.error, provider: result.provider },
        "Chat task returned error"
      );
      return {
        provider: result.provider ?? null,
        model: result.model ?? null,
        message: buildChatFallback({ draftState }),
        metadata: result.metadata ?? null,
        error: result.error
      };
    }
    return {
      provider: result.provider,
      model: result.model,
      message: result.message,
      metadata: result.metadata ?? null
    };
  } catch (error) {
    llmLogger.warn({ err: error }, "askChat orchestrator failure");
    return {
      provider: null,
      model: null,
      message: buildChatFallback({ draftState }),
      metadata: null,
      error: {
        reason: "exception",
        message: error?.message ?? String(error)
      }
    };
  }
}

async function askCompanyIntel(context) {
  try {
    const result = await orchestrator.run("company_intel", context);
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
    const result = await orchestrator.run("copilot_agent", context);
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

function buildChatFallback({ draftState }) {
  const title = draftState?.title ? ` about ${draftState.title}` : "";
  const location = draftState?.location ? ` in ${draftState.location}` : "";
  return `Understood. I'll take that into account${title}${location ? ` ${location}` : ""}.`;
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

async function askVideoStoryboard(context) {
  try {
    const result = await orchestrator.run("video_storyboard", context);
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
    const result = await orchestrator.run("video_caption", context);
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
    const result = await orchestrator.run("video_compliance", context);
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
    const result = await orchestrator.run("image_prompt_generation", context);
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
        task: "image_generation"
      },
      "runImageGeneration:start"
    );
    const result = await orchestrator.run("image_generation", context);
    if (result.error) {
      llmLogger.error(
        {
          task: "image_generation",
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

export const llmClient = {
  askChat,
  askSuggestions,
  askChannelRecommendations,
  askRefineJob,
  askCompanyIntel,
  askAssetMaster,
  askAssetChannelBatch,
  askAssetAdapt,
  askVideoStoryboard,
  askVideoCaption,
  askVideoCompliance,
  runCopilotAgent,
  askHeroImagePrompt,
  askImageCaption,
  runImageGeneration
};
