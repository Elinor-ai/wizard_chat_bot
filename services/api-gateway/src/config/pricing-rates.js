const BASE_RATE_CARD_VERSION = "v1";
const DEFAULT_CURRENCY = "USD";

const BASE_RATE_CARD = {
  version: BASE_RATE_CARD_VERSION,
  currency: DEFAULT_CURRENCY,
  planName: "global-default",
  credits: {
    usdPerCredit: 0.001  // 1 credit = $0.001 (1000 credits = $1)
  },
  defaults: {
    text: {
      inputUsdPerMillionTokens: 0.4,
      outputUsdPerMillionTokens: 0.4,
      cachedUsdPerMillionTokens: 0.2
    },
    image: {
      costPerUnitUsd: 0.03
    },
    video: {
      costPerSecondUsd: 0.002
    }
  },
  providers: {
    gemini: {
      planName: "gemini-production",
      credits: {
        usdPerCredit: null
      },
      grounding: {
        searchUsdPerQuery: 0.014 // $14 per 1,000 queries
      },
      storage: {
        usdPerMillionTokensPerHour: 4.5
      },
      text: {
        models: {
          "gemini-3-pro-preview": {
            promptTokenTiers: [
              {
                maxPromptTokens: 200_000,
                inputUsdPerMillionTokens: 2,
                outputUsdPerMillionTokens: 12,
                cachedUsdPerMillionTokens: 0.20
              },
              {
                inputUsdPerMillionTokens: 4,
                outputUsdPerMillionTokens: 18,
                cachedUsdPerMillionTokens: 0.40
              }
            ]
          }
        },
        default: {
          inputUsdPerMillionTokens: 2,
          outputUsdPerMillionTokens: 12,
          cachedUsdPerMillionTokens: 0.20
        }
      },
      image: {
        models: {
          "gemini-3-pro-image-preview": {
            // Default per-image estimate assumes 1K/2K outputs (~1120 tokens per image).
            costPerUnitUsd: 0.134,
            promptTokenTiers: [
              {
                maxPromptTokens: 200_000,
                inputUsdPerMillionTokens: 2,
                outputUsdPerMillionTokens: 120,
                cachedUsdPerMillionTokens: 0.20
              },
              {
                inputUsdPerMillionTokens: 4,
                outputUsdPerMillionTokens: 120,
                cachedUsdPerMillionTokens: 0.40
              }
            ]
          }
        },
        default: {
          costPerUnitUsd: 0.134,
          inputUsdPerMillionTokens: 2,
          outputUsdPerMillionTokens: 120,
          cachedUsdPerMillionTokens: 0.20
        }
      },
      video: {
        models: {
          "veo-3.1-generate-preview": {
            costPerSecondUsd: 0.40
          }
        },
        default: {
          costPerSecondUsd: 0.40
        }
      }
    },
    veo: {
      planName: "veo-preview",
      credits: {
        usdPerCredit: null
      },
      video: {
        models: {
          "veo-3.1-generate-preview": {
            costPerSecondUsd: 0.40
          }
        },
        default: {
          costPerSecondUsd: 0.40
        }
      }
    },
    // OpenAI Sora video generation pricing
    // Updated: November 2025 - Official OpenAI Sora API pricing
    // See: https://openai.com/api/pricing/
    sora: {
      planName: "sora-production",
      credits: {
        usdPerCredit: null
      },
      video: {
        models: {
          // sora-2: Basic tier at 720p resolution
          "sora-2": {
            // Portrait 720×1280, Landscape 1280×720
            costPerSecondUsd: 0.10
          },
          "sora-2-720p": {
            // Alias for sora-2 at 720p
            costPerSecondUsd: 0.10
          },
          // sora-2-pro: Professional tier with resolution-based pricing
          "sora-2-pro": {
            // Default to 720p tier (Portrait 720×1280, Landscape 1280×720)
            // Use "sora-2-pro-1792p" for higher resolution
            costPerSecondUsd: 0.30
          },
          "sora-2-pro-720p": {
            // Portrait 720×1280, Landscape 1280×720
            costPerSecondUsd: 0.30
          },
          "sora-2-pro-1792p": {
            // Higher resolution tier: Portrait 1024×1792, Landscape 1792×1024
            costPerSecondUsd: 0.50
          }
        },
        // Default to sora-2-pro at 720p as the balanced option
        default: {
          costPerSecondUsd: 0.30
        }
      }
    },
    // ═══════════════════════════════════════════════════════════════
    // Anthropic Claude LLM pricing
    // Updated: December 2025 - Official Anthropic API pricing
    // See: https://www.anthropic.com/pricing
    // ═══════════════════════════════════════════════════════════════
    anthropic: {
      planName: "anthropic-production",
      credits: {
        usdPerCredit: null
      },
      text: {
        models: {
          // ═══════════════════════════════════════════════════════════════
          // Claude Opus Series - Highest capability
          // ═══════════════════════════════════════════════════════════════
          "claude-opus-4-5-20251101": {
            inputUsdPerMillionTokens: 5.0,
            outputUsdPerMillionTokens: 25.0,
            cachedUsdPerMillionTokens: 0.5  // Cache hits: 10% of input
          },
          "claude-opus-4-1-20250929": {
            inputUsdPerMillionTokens: 15.0,
            outputUsdPerMillionTokens: 75.0,
            cachedUsdPerMillionTokens: 1.5
          },
          "claude-opus-4-20250929": {
            inputUsdPerMillionTokens: 15.0,
            outputUsdPerMillionTokens: 75.0,
            cachedUsdPerMillionTokens: 1.5
          },

          // ═══════════════════════════════════════════════════════════════
          // Claude Sonnet Series - Balanced performance/cost
          // ═══════════════════════════════════════════════════════════════
          "claude-sonnet-4-5-20250929": {
            inputUsdPerMillionTokens: 3.0,
            outputUsdPerMillionTokens: 15.0,
            cachedUsdPerMillionTokens: 0.3
          },
          "claude-sonnet-4-20250929": {
            inputUsdPerMillionTokens: 3.0,
            outputUsdPerMillionTokens: 15.0,
            cachedUsdPerMillionTokens: 0.3
          },

          // ═══════════════════════════════════════════════════════════════
          // Claude Haiku Series - Fast & cost-effective
          // ═══════════════════════════════════════════════════════════════
          "claude-haiku-4-5-20250929": {
            inputUsdPerMillionTokens: 1.0,
            outputUsdPerMillionTokens: 5.0,
            cachedUsdPerMillionTokens: 0.1
          },
          "claude-3-5-haiku-20241022": {
            inputUsdPerMillionTokens: 0.8,
            outputUsdPerMillionTokens: 4.0,
            cachedUsdPerMillionTokens: 0.08
          },
          "claude-3-haiku-20240307": {
            inputUsdPerMillionTokens: 0.25,
            outputUsdPerMillionTokens: 1.25,
            cachedUsdPerMillionTokens: 0.03
          }
        },
        // Default to Sonnet 4.5 rates as the recommended balanced option
        default: {
          inputUsdPerMillionTokens: 3.0,
          outputUsdPerMillionTokens: 15.0,
          cachedUsdPerMillionTokens: 0.3
        }
      }
    },

    // OpenAI LLM text generation pricing
    // Updated: November 2025 - Official OpenAI API pricing
    // See: https://openai.com/api/pricing/
    openai: {
      planName: "openai-production",
      credits: {
        usdPerCredit: null
      },
      text: {
        models: {
          // ═══════════════════════════════════════════════════════════════
          // GPT-5 Series (Flagship - November 2025)
          // ═══════════════════════════════════════════════════════════════
          "gpt-5.1": {
            // Flagship model - highest capability
            inputUsdPerMillionTokens: 1.25,
            cachedUsdPerMillionTokens: 0.125,
            outputUsdPerMillionTokens: 10.0
          },
          "gpt-5-mini": {
            // Balanced cost/performance
            inputUsdPerMillionTokens: 0.25,
            cachedUsdPerMillionTokens: 0.025,
            outputUsdPerMillionTokens: 2.0
          },
          "gpt-5-nano": {
            // Most cost-effective for simple tasks
            inputUsdPerMillionTokens: 0.05,
            cachedUsdPerMillionTokens: 0.005,
            outputUsdPerMillionTokens: 0.4
          },
          "gpt-5-pro": {
            // Highest capability, extended thinking
            // Note: No cached input discount for this model
            inputUsdPerMillionTokens: 15.0,
            cachedUsdPerMillionTokens: 15.0,
            outputUsdPerMillionTokens: 120.0
          },

          // ═══════════════════════════════════════════════════════════════
          // GPT-4.1 Series (Fine-tunable - November 2025)
          // ═══════════════════════════════════════════════════════════════
          "gpt-4.1": {
            inputUsdPerMillionTokens: 3.0,
            cachedUsdPerMillionTokens: 0.75,
            outputUsdPerMillionTokens: 12.0
          },
          "gpt-4.1-mini": {
            inputUsdPerMillionTokens: 0.8,
            cachedUsdPerMillionTokens: 0.2,
            outputUsdPerMillionTokens: 3.2
          },
          "gpt-4.1-nano": {
            inputUsdPerMillionTokens: 0.2,
            cachedUsdPerMillionTokens: 0.05,
            outputUsdPerMillionTokens: 0.8
          },

          // ═══════════════════════════════════════════════════════════════
          // o-Series Reasoning Models (November 2025)
          // ═══════════════════════════════════════════════════════════════
          "o3": {
            inputUsdPerMillionTokens: 2.0,
            cachedUsdPerMillionTokens: 0.5,
            outputUsdPerMillionTokens: 8.0
          },
          "o4-mini": {
            // Fine-tunable reasoning model
            inputUsdPerMillionTokens: 4.0,
            cachedUsdPerMillionTokens: 1.0,
            outputUsdPerMillionTokens: 16.0
          },

          // ═══════════════════════════════════════════════════════════════
          // Legacy Models (Pre-GPT-5) - Kept for backward compatibility
          // ═══════════════════════════════════════════════════════════════
          "gpt-4o": {
            // LEGACY: Consider migrating to gpt-5-mini
            inputUsdPerMillionTokens: 2.5,
            outputUsdPerMillionTokens: 10.0
          },
          "gpt-4o-mini": {
            // LEGACY: Consider migrating to gpt-5-nano
            inputUsdPerMillionTokens: 0.15,
            outputUsdPerMillionTokens: 0.6
          },
          "gpt-4-turbo": {
            // LEGACY: Consider migrating to gpt-4.1
            inputUsdPerMillionTokens: 10.0,
            outputUsdPerMillionTokens: 30.0
          },
          "o1": {
            // LEGACY: Consider migrating to o3 or gpt-5-pro
            inputUsdPerMillionTokens: 15.0,
            outputUsdPerMillionTokens: 60.0
          },
          "o1-mini": {
            // LEGACY: Consider migrating to o4-mini
            inputUsdPerMillionTokens: 3.0,
            outputUsdPerMillionTokens: 12.0
          }
        },
        default: {
          // Default to gpt-5-mini rates as the recommended cost-effective option
          inputUsdPerMillionTokens: 0.25,
          cachedUsdPerMillionTokens: 0.025,
          outputUsdPerMillionTokens: 2.0
        }
      },
      image: {
        models: {
          // ═══════════════════════════════════════════════════════════════
          // GPT-image-1 Series (Token-based pricing - November 2025)
          // Note: These models use token-based pricing for both text prompts
          // and image tokens. The rates below are per million tokens.
          // ═══════════════════════════════════════════════════════════════
          "gpt-image-1": {
            // Full-quality image generation
            // Text tokens (prompt):
            inputUsdPerMillionTokens: 5.0,
            cachedUsdPerMillionTokens: 1.25,
            // Image tokens:
            // - Input image: $10.00/M tokens
            // - Cached image: $2.50/M tokens
            // - Output image: $40.00/M tokens
            imageInputUsdPerMillionTokens: 10.0,
            imageCachedUsdPerMillionTokens: 2.5,
            imageOutputUsdPerMillionTokens: 40.0,
            // Legacy per-unit fallback (approx for 1024x1024)
            costPerUnitUsd: 0.08
          },
          "gpt-image-1-mini": {
            // Cost-optimized image generation
            // Text tokens (prompt):
            inputUsdPerMillionTokens: 2.0,
            cachedUsdPerMillionTokens: 0.2,
            // Image tokens:
            // - Input image: $2.50/M tokens
            // - Cached image: $0.25/M tokens
            // - Output image: $8.00/M tokens
            imageInputUsdPerMillionTokens: 2.5,
            imageCachedUsdPerMillionTokens: 0.25,
            imageOutputUsdPerMillionTokens: 8.0,
            // Legacy per-unit fallback (approx for 1024x1024)
            costPerUnitUsd: 0.02
          },

          // ═══════════════════════════════════════════════════════════════
          // Legacy DALL-E Models - Kept for backward compatibility
          // ═══════════════════════════════════════════════════════════════
          "dall-e-3": {
            // LEGACY: Consider migrating to gpt-image-1-mini
            costPerUnitUsd: 0.04
          },
          "dall-e-3-hd": {
            // LEGACY: Consider migrating to gpt-image-1
            costPerUnitUsd: 0.08
          }
        },
        default: {
          // Default to gpt-image-1-mini for cost-effectiveness
          costPerUnitUsd: 0.02,
          inputUsdPerMillionTokens: 2.0,
          cachedUsdPerMillionTokens: 0.2,
          imageOutputUsdPerMillionTokens: 8.0
        }
      },
      // ═══════════════════════════════════════════════════════════════
      // Fine-tuning pricing (for documentation - not used in runtime)
      // These rates are recorded here for reference when planning
      // fine-tuning projects. Actual billing happens through OpenAI.
      // ═══════════════════════════════════════════════════════════════
      fineTuning: {
        models: {
          "gpt-4.1": {
            trainingUsdPerMillionTokens: 25.0
          },
          "gpt-4.1-mini": {
            trainingUsdPerMillionTokens: 5.0
          },
          "gpt-4.1-nano": {
            trainingUsdPerMillionTokens: 1.5
          },
          "o4-mini": {
            // RL fine-tuning: $100/training hour
            trainingUsdPerHour: 100.0
          }
        }
      }
    }
  }
};

function normalizePositiveNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return null;
  }
  return num;
}

function selectPromptTierRate(rateConfig, promptTokens) {
  const tiers = rateConfig?.promptTokenTiers;
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return null;
  }
  const normalizedTokens = normalizePositiveNumber(promptTokens);
  if (normalizedTokens === null) {
    return null;
  }
  const sorted = [...tiers].sort((a, b) => {
    const aMax = typeof a.maxPromptTokens === "number" ? a.maxPromptTokens : Infinity;
    const bMax = typeof b.maxPromptTokens === "number" ? b.maxPromptTokens : Infinity;
    return aMax - bMax;
  });
  for (const tier of sorted) {
    const max = tier.maxPromptTokens;
    if (typeof max === "number" && normalizedTokens <= max) {
      return tier;
    }
  }
  return sorted.find((tier) => typeof tier.maxPromptTokens !== "number") ?? sorted[sorted.length - 1];
}

function mergePromptTierRates(baseRates, promptTokens) {
  if (!baseRates || typeof baseRates !== "object") {
    return baseRates ?? {};
  }
  const tier = selectPromptTierRate(baseRates, promptTokens);
  if (!tier) {
    return baseRates;
  }
  return { ...baseRates, ...tier };
}

function normalizeProvider(provider) {
  if (!provider || typeof provider !== "string") {
    return null;
  }
  return provider.trim().toLowerCase();
}

function resolveProviderConfig(provider) {
  const key = normalizeProvider(provider);
  if (!key) return {};
  return BASE_RATE_CARD.providers[key] ?? {};
}

function resolveSectionRate({ providerConfig, section }) {
  return providerConfig?.[section] ?? {};
}

function resolveModelRate(sectionConfig, model) {
  if (!sectionConfig) return {};
  if (!model) {
    return sectionConfig.default ?? {};
  }
  const normalized = model.trim().toLowerCase();
  const match =
    sectionConfig.models?.[normalized] ??
    Object.entries(sectionConfig.models ?? {}).find(([key]) => key.toLowerCase() === normalized)?.[1];
  if (match) {
    return { ...(sectionConfig.default ?? {}), ...match };
  }
  return sectionConfig.default ?? {};
}

function resolveUsdPerCredit(provider) {
  const providerConfig = resolveProviderConfig(provider);
  return (
    providerConfig?.credits?.usdPerCredit ??
    BASE_RATE_CARD.credits.usdPerCredit
  );
}

function resolveProviderPlan(provider) {
  const providerConfig = resolveProviderConfig(provider);
  return providerConfig?.planName ?? BASE_RATE_CARD.planName ?? BASE_RATE_CARD_VERSION;
}

export function resolveTextPricing(provider, model, pricingContext = {}) {
  const providerConfig = resolveProviderConfig(provider);
  const sectionRates = resolveSectionRate({ providerConfig, section: "text" });
  const resolved =
    Object.keys(sectionRates).length > 0
      ? resolveModelRate(sectionRates, model)
      : BASE_RATE_CARD.defaults.text;
  const defaults = BASE_RATE_CARD.defaults.text;
  const promptTokens =
    pricingContext.promptTokens ??
    pricingContext.inputTokens ??
    null;
  const rateSource = mergePromptTierRates(resolved, promptTokens);
  return {
    version: BASE_RATE_CARD.version,
    currency: BASE_RATE_CARD.currency,
    inputUsdPerMillionTokens:
      rateSource.inputUsdPerMillionTokens ?? defaults.inputUsdPerMillionTokens,
    outputUsdPerMillionTokens:
      rateSource.outputUsdPerMillionTokens ?? defaults.outputUsdPerMillionTokens,
    cachedUsdPerMillionTokens:
      rateSource.cachedUsdPerMillionTokens ?? defaults.cachedUsdPerMillionTokens,
    usdPerCredit: resolveUsdPerCredit(provider)
  };
}

export function resolveImagePricing(provider, model, pricingContext = {}) {
  const providerConfig = resolveProviderConfig(provider);
  const sectionRates = resolveSectionRate({ providerConfig, section: "image" });
  const resolved =
    Object.keys(sectionRates).length > 0
      ? resolveModelRate(sectionRates, model)
      : BASE_RATE_CARD.defaults.image;
  const defaults = BASE_RATE_CARD.defaults.image;
  const promptTokens =
    pricingContext.promptTokens ??
    pricingContext.inputTokens ??
    null;
  const rateSource = mergePromptTierRates(resolved, promptTokens);
  return {
    version: BASE_RATE_CARD.version,
    currency: BASE_RATE_CARD.currency,
    costPerUnitUsd: rateSource.costPerUnitUsd ?? defaults.costPerUnitUsd,
    inputUsdPerMillionTokens: rateSource.inputUsdPerMillionTokens,
    outputUsdPerMillionTokens: rateSource.outputUsdPerMillionTokens,
    cachedUsdPerMillionTokens: rateSource.cachedUsdPerMillionTokens,
    usdPerCredit: resolveUsdPerCredit(provider)
  };
}

export function resolveVideoPricing(provider, model) {
  const providerConfig = resolveProviderConfig(provider);
  const sectionRates = resolveSectionRate({ providerConfig, section: "video" });
  const resolved =
    Object.keys(sectionRates).length > 0
      ? resolveModelRate(sectionRates, model)
      : BASE_RATE_CARD.defaults.video;
  const defaults = BASE_RATE_CARD.defaults.video;
  return {
    version: BASE_RATE_CARD.version,
    currency: BASE_RATE_CARD.currency,
    costPerSecondUsd: resolved.costPerSecondUsd ?? defaults.costPerSecondUsd,
    costPerUnitUsd: resolved.costPerUnitUsd ?? defaults.costPerUnitUsd,
    usdPerCredit: resolveUsdPerCredit(provider)
  };
}

export function resolveGroundingPricing(provider) {
  const providerConfig = resolveProviderConfig(provider);
  return providerConfig?.grounding ?? {};
}

export function resolveStoragePricing(provider) {
  const providerConfig = resolveProviderConfig(provider);
  return providerConfig?.storage ?? {};
}

export function resolveCreditConversion(provider) {
  return resolveUsdPerCredit(provider);
}

export function resolveProviderPlanName(provider) {
  return resolveProviderPlan(provider);
}

export function getRateCardMetadata() {
  return {
    version: BASE_RATE_CARD.version,
    currency: BASE_RATE_CARD.currency
  };
}

export { BASE_RATE_CARD_VERSION };
