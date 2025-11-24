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

loadEnv();

if (
  process.env.IMAGE_GENERATION_PROVIDER &&
  process.env.IMAGE_GENERATION_PROVIDER.trim().toLowerCase().startsWith("gemini")
) {
  const trimmed = process.env.IMAGE_GENERATION_PROVIDER.trim();
  process.env.IMAGE_GENERATION_PROVIDER = `imagen${trimmed.slice(
    "gemini".length
  )}`;
}

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
const DEFAULT_OPENAI_VIDEO_MODEL =
  process.env.OPENAI_VIDEO_MODEL ?? DEFAULT_OPENAI_ASSET_MODEL;

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
const DEFAULT_GEMINI_VIDEO_MODEL = process.env.GEMINI_VIDEO_MODEL ?? DEFAULT_GEMINI_ASSET_MODEL;
const DEFAULT_GEMINI_IMAGE_PROMPT_MODEL =
  process.env.GEMINI_IMAGE_PROMPT_MODEL ?? DEFAULT_GEMINI_ASSET_MODEL;

const DEFAULT_COPILOT_SPEC =
  process.env.LLM_COPILOT_PROVIDER ??
  process.env.LLM_CHAT_PROVIDER ??
  `openai:${DEFAULT_OPENAI_CHAT_MODEL}`;
const [DEFAULT_COPILOT_PROVIDER] = DEFAULT_COPILOT_SPEC.split(":");

const DEFAULT_DALLE_IMAGE_MODEL =
  process.env.DALLE_IMAGE_MODEL ?? "gpt-image-1";
const DEFAULT_IMAGEN_IMAGE_MODEL =
  process.env.IMAGEN_IMAGE_MODEL ?? "imagen-3.0-fast-generate-001";
const GEMINI_IMAGE_MODEL_ALIASES = {
  nano: process.env.GEMINI_IMAGE_NANO_MODEL ?? DEFAULT_GEMINI_IMAGE_FAST_MODEL,
  "nano-pro":
    process.env.GEMINI_IMAGE_NANO_PRO_MODEL ?? DEFAULT_GEMINI_IMAGE_PRO_MODEL,
};
const RAW_IMAGE_GENERATION_PROVIDER =
  process.env.IMAGE_GENERATION_PROVIDER ?? "dall-e";
const NORMALIZED_IMAGE_PROVIDER = RAW_IMAGE_GENERATION_PROVIDER.replace("-", "_");
const IMAGE_GENERATION_PROVIDER =
  NORMALIZED_IMAGE_PROVIDER === "gemini" ? "imagen" : NORMALIZED_IMAGE_PROVIDER;

const DEFAULT_STABLE_DIFFUSION_MODEL =
  process.env.STABLE_DIFFUSION_MODEL ?? "sd3";
const DEFAULT_GEMINI_IMAGE_FAST_MODEL =
  process.env.GEMINI_IMAGE_FAST_MODEL ?? "imagen-3.0-fast-generate-001";
const DEFAULT_GEMINI_IMAGE_PRO_MODEL =
  process.env.GEMINI_IMAGE_PRO_MODEL ?? "imagen-3.0-generate-001";
const DEFAULT_GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_GEMINI_IMAGE_FAST_MODEL;
const DEFAULT_IMAGE_GEN_MODEL =
  IMAGE_GENERATION_PROVIDER === "imagen"
    ? (process.env.IMAGEN_IMAGE_MODEL ?? DEFAULT_GEMINI_IMAGE_MODEL)
    : IMAGE_GENERATION_PROVIDER === "stable_diffusion"
      ? DEFAULT_STABLE_DIFFUSION_MODEL
      : DEFAULT_DALLE_IMAGE_MODEL;
const DALL_E_API_KEY =
  process.env.DALL_E_API_KEY ?? process.env.OPENAI_API_KEY ?? null;
const IMAGEN_API_KEY =
  process.env.IMAGEN_API_KEY ?? process.env.GEMINI_API_KEY ?? null;
const STABLE_DIFFUSION_API_KEY =
  process.env.STABLE_DIFFUSION_API_KEY ?? null;

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
  company_intel: {
    env: "LLM_COMPANY_INTEL_PROVIDER",
    defaultProvider: "gemini",
    defaultSpec: `gemini:${DEFAULT_GEMINI_CHAT_MODEL}`,
    providerDefaults: {
      gemini: DEFAULT_GEMINI_CHAT_MODEL,
      openai: DEFAULT_OPENAI_CHAT_MODEL
    }
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
  image_prompt_generation: {
    env: "LLM_IMAGE_PROMPT_PROVIDER",
    defaultProvider: "gemini",
    defaultSpec: `gemini:${DEFAULT_GEMINI_IMAGE_PROMPT_MODEL}`,
    providerDefaults: {
      gemini: DEFAULT_GEMINI_IMAGE_PROMPT_MODEL,
      openai: DEFAULT_OPENAI_ASSET_MODEL,
    },
  },
  image_generation: {
    env: "IMAGE_GENERATION_PROVIDER",
    defaultProvider: IMAGE_GENERATION_PROVIDER,
    defaultSpec: `${IMAGE_GENERATION_PROVIDER}:${DEFAULT_IMAGE_GEN_MODEL}`,
    providerDefaults: {
      "dall-e": DEFAULT_DALLE_IMAGE_MODEL,
      imagen: process.env.IMAGEN_IMAGE_MODEL ?? DEFAULT_GEMINI_IMAGE_MODEL,
      stable_diffusion: DEFAULT_STABLE_DIFFUSION_MODEL,
    },
  },
  hero_image_caption: {
    env: "LLM_ASSET_PROVIDER",
    defaultProvider: "openai",
    defaultSpec: `openai:${DEFAULT_OPENAI_ASSET_MODEL}`,
    providerDefaults: {
      openai: DEFAULT_OPENAI_ASSET_MODEL,
      gemini: DEFAULT_GEMINI_ASSET_MODEL,
    },
  },
  copilot_agent: {
    env: "LLM_COPILOT_PROVIDER",
    defaultProvider: DEFAULT_COPILOT_PROVIDER ?? "openai",
    defaultSpec: DEFAULT_COPILOT_SPEC,
    providerDefaults: {
      openai: DEFAULT_OPENAI_CHAT_MODEL,
      gemini: DEFAULT_GEMINI_CHAT_MODEL,
    },
  },
  video_storyboard: {
    env: "LLM_VIDEO_PROVIDER",
    defaultProvider: "openai",
    defaultSpec: `openai:${DEFAULT_OPENAI_VIDEO_MODEL}`,
    providerDefaults: {
      openai: DEFAULT_OPENAI_VIDEO_MODEL,
      gemini: DEFAULT_GEMINI_VIDEO_MODEL,
    },
  },
  video_caption: {
    env: "LLM_VIDEO_PROVIDER",
    defaultProvider: "openai",
    defaultSpec: `openai:${DEFAULT_OPENAI_VIDEO_MODEL}`,
    providerDefaults: {
      openai: DEFAULT_OPENAI_VIDEO_MODEL,
      gemini: DEFAULT_GEMINI_VIDEO_MODEL,
    },
  },
  video_compliance: {
    env: "LLM_VIDEO_PROVIDER",
    defaultProvider: "openai",
    defaultSpec: `openai:${DEFAULT_OPENAI_VIDEO_MODEL}`,
    providerDefaults: {
      openai: DEFAULT_OPENAI_VIDEO_MODEL,
      gemini: DEFAULT_GEMINI_VIDEO_MODEL,
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
  "dall-e": new DalleImageAdapter({
    apiKey: DALL_E_API_KEY,
  }),
  imagen: new ImagenImageAdapter({
    apiKey: IMAGEN_API_KEY,
    modelAliases: GEMINI_IMAGE_MODEL_ALIASES,
  }),
  stable_diffusion: new StableDiffusionAdapter({
    apiKey: STABLE_DIFFUSION_API_KEY,
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

async function askHeroImageCaption(context) {
  try {
    const result = await orchestrator.run("hero_image_caption", context);
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
        promptPreview: context?.prompt?.slice(0, 120) ?? null
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
  askChannelPicker,
  askAssetMaster,
  askAssetChannelBatch,
  askAssetAdapt,
  askVideoStoryboard,
  askVideoCaption,
  askVideoCompliance,
  runCopilotAgent,
  askHeroImagePrompt,
  askHeroImageCaption,
  runImageGeneration
};
