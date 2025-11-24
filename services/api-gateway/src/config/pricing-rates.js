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
    openai: {
      planName: "openai-standard",
      credits: {
        usdPerCredit: null
      },
      text: {
        default: {
          inputUsdPerMillionTokens: 0.5,
          outputUsdPerMillionTokens: 0.5,
          cachedUsdPerMillionTokens: 0.25
        },
        models: {
          "gpt-4o": {
            inputUsdPerMillionTokens: 5,
            outputUsdPerMillionTokens: 15,
            cachedUsdPerMillionTokens: 2.5
          },
          "gpt-4o-mini": {
            inputUsdPerMillionTokens: 0.15,
            outputUsdPerMillionTokens: 0.60,
            cachedUsdPerMillionTokens: 0.05
          },
          "gpt-3.5-turbo": {
            inputUsdPerMillionTokens: 0.50,
            outputUsdPerMillionTokens: 1.50,
            cachedUsdPerMillionTokens: 0.25
          }
        }
      },
      image: {
        models: {
          "gpt-image-1": {
            costPerUnitUsd: 0.04
          }
        },
        default: {
          costPerUnitUsd: 0.04
        }
      },
      video: {
        default: {
          costPerSecondUsd: 0.01
        }
      }
    },
    gemini: {
      planName: "gemini-production",
      credits: {
        usdPerCredit: null
      },
      text: {
        default: {
          inputUsdPerMillionTokens: 0.35,
          outputUsdPerMillionTokens: 0.70,
          cachedUsdPerMillionTokens: 0.20
        },
        models: {
          "gemini-flash-latest": {
            inputUsdPerMillionTokens: 0.35,
            outputUsdPerMillionTokens: 0.70,
            cachedUsdPerMillionTokens: 0.18
          },
          "gemini-pro": {
            inputUsdPerMillionTokens: 0.50,
            outputUsdPerMillionTokens: 1.50,
            cachedUsdPerMillionTokens: 0.25
          }
        }
      },
      image: {
        models: {
          imagen: {
            costPerUnitUsd: 0.05
          },
          "imagen-3.0-fast-generate-001": {
            costPerUnitUsd: 0.03
          },
          "imagen-3.0-generate-001": {
            costPerUnitUsd: 0.05
          },
          nano: {
            costPerUnitUsd: 0.03
          },
          "nano-pro": {
            costPerUnitUsd: 0.05
          }
        },
        default: {
          costPerUnitUsd: 0.04
        }
      }
    },
    stable_diffusion: {
      planName: "sd-enterprise",
      image: {
        default: {
          costPerUnitUsd: 0.02
        }
      }
    }
  }
};

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

export function resolveTextPricing(provider, model) {
  const providerConfig = resolveProviderConfig(provider);
  const sectionRates = resolveSectionRate({ providerConfig, section: "text" });
  const resolved =
    Object.keys(sectionRates).length > 0
      ? resolveModelRate(sectionRates, model)
      : BASE_RATE_CARD.defaults.text;
  const defaults = BASE_RATE_CARD.defaults.text;
  return {
    version: BASE_RATE_CARD.version,
    currency: BASE_RATE_CARD.currency,
    inputUsdPerMillionTokens:
      resolved.inputUsdPerMillionTokens ?? defaults.inputUsdPerMillionTokens,
    outputUsdPerMillionTokens:
      resolved.outputUsdPerMillionTokens ?? defaults.outputUsdPerMillionTokens,
    cachedUsdPerMillionTokens:
      resolved.cachedUsdPerMillionTokens ?? defaults.cachedUsdPerMillionTokens,
    usdPerCredit: resolveUsdPerCredit(provider)
  };
}

export function resolveImagePricing(provider, model) {
  const providerConfig = resolveProviderConfig(provider);
  const sectionRates = resolveSectionRate({ providerConfig, section: "image" });
  const resolved =
    Object.keys(sectionRates).length > 0
      ? resolveModelRate(sectionRates, model)
      : BASE_RATE_CARD.defaults.image;
  const defaults = BASE_RATE_CARD.defaults.image;
  return {
    version: BASE_RATE_CARD.version,
    currency: BASE_RATE_CARD.currency,
    costPerUnitUsd: resolved.costPerUnitUsd ?? defaults.costPerUnitUsd,
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
