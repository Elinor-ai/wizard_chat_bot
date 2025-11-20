import { resolveCreditConversion } from "./pricing-rates.js";

const PLAN_DEFINITIONS = [
  {
    id: "starter_boost",
    name: "Starter Boost",
    headline: "Kick off hiring",
    description: "Perfect for testing the platform with 1-2 priority roles.",
    credits: 50000,
    bonusCredits: 5000,
    margin: 1.6,
    bestFor: "Individual hiring managers",
    perks: [
      "Instant credit availability",
      "Priority email support",
      "Unused credits roll over"
    ]
  },
  {
    id: "growth_labs",
    name: "Growth Lab",
    headline: "Scale new markets",
    description: "Fund recurring LLM usage for multi-role hiring pods.",
    credits: 150000,
    bonusCredits: 30000,
    margin: 1.45,
    bestFor: "Talent teams supporting 3-5 live searches",
    perks: [
      "Bonus analytics exports",
      "Shared credit pool",
      "Dedicated onboarding call"
    ],
    badge: "Most Popular"
  },
  {
    id: "scale_partners",
    name: "Scale Partner",
    headline: "Always-on recruiting",
    description: "Best value package for companies automating hiring ops.",
    credits: 400000,
    bonusCredits: 120000,
    margin: 1.35,
    bestFor: "Agencies and talent teams running global campaigns",
    perks: [
      "Custom success plan",
      "Quarterly credit reports",
      "Shared SLA with product team"
    ]
  }
];

function applyComputedValues(definition, usdPerCredit) {
  const baseCost = definition.credits * usdPerCredit;
  const priceUsd = Number((baseCost * definition.margin).toFixed(2));
  const totalCredits = definition.credits + (definition.bonusCredits ?? 0);
  return {
    ...definition,
    currency: "USD",
    priceUsd,
    totalCredits,
    effectiveUsdPerCredit: totalCredits > 0 ? Number((priceUsd / totalCredits).toFixed(4)) : 0,
    markupMultiplier: Number(definition.margin.toFixed(2))
  };
}

let cachedPlans = null;

export function listSubscriptionPlans() {
  if (cachedPlans) {
    return cachedPlans;
  }
  const usdPerCredit = resolveCreditConversion();
  cachedPlans = PLAN_DEFINITIONS.map((plan) => applyComputedValues(plan, usdPerCredit));
  return cachedPlans;
}

export function getSubscriptionPlan(planId) {
  if (!planId) return null;
  const plans = listSubscriptionPlans();
  return plans.find((plan) => plan.id === planId) ?? null;
}

export function getBaseUsdPerCredit() {
  return resolveCreditConversion();
}
