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
