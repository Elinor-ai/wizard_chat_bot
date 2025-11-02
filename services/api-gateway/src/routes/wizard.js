import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { wrapAsync, httpError } from "@wizard/utils";

const DRAFT_COLLECTION = "jobsDraft";

const draftRequestSchema = z.object({
  jobId: z.string().optional(),
  state: z.record(z.string(), z.unknown()).default({}),
  intent: z.record(z.string(), z.unknown()).optional(),
  currentStepId: z.string()
});

const suggestionsRequestSchema = z.object({
  jobId: z.string(),
  state: z.record(z.string(), z.unknown()).default({}),
  intent: z.record(z.string(), z.unknown()).optional(),
  currentStepId: z.string()
});

const mergeRequestSchema = z.object({
  jobId: z.string(),
  fieldId: z.string(),
  value: z.unknown()
});

function requireUserId(req) {
  const userId = req.headers["x-user-id"];
  if (!userId || typeof userId !== "string") {
    throw httpError(401, "Missing x-user-id header");
  }
  return userId;
}

function valueProvided(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return Boolean(value);
}

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseLocation(state = {}) {
  const city =
    state["location.city"] ??
    state?.location?.city ??
    (typeof state.location === "string" ? state.location.split(",")[0]?.trim() : undefined);
  const countryRaw =
    state["location.country"] ??
    state?.location?.country ??
    (typeof state.location === "string" ? state.location.split(",")[1]?.trim() : undefined);
  const radiusRaw = state["location.radiusKm"] ?? state?.location?.radiusKm;
  const remoteFlag =
    state.workModel === "remote" ||
    (typeof state.location === "string" && /remote/i.test(state.location));
  const geoLat =
    state["location.geo.latitude"] ??
    state?.location?.geo?.latitude ??
    state["location.geo.lat"];
  const geoLng =
    state["location.geo.longitude"] ??
    state?.location?.geo?.longitude ??
    state["location.geo.lng"];

  const geo =
    geoLat !== undefined && geoLng !== undefined
      ? {
          latitude: Number(geoLat),
          longitude: Number(geoLng)
        }
      : null;

  const country = countryRaw ? countryRaw.slice(0, 2).toUpperCase() : undefined;
  const radiusKm =
    radiusRaw === undefined || radiusRaw === null || radiusRaw === ""
      ? undefined
      : Number(radiusRaw);

  if (city || country) {
    return {
      geo,
      city: city ?? (remoteFlag ? "Remote" : "Unknown"),
      country: country ?? (remoteFlag ? "US" : "US"),
      radiusKm,
      workModel: state.workModel ?? (remoteFlag ? "remote" : "on_site"),
      label: [city, country].filter(Boolean).join(", ") || (remoteFlag ? "Remote" : "Unknown")
    };
  }

  if (remoteFlag) {
    return {
      geo: null,
      city: "Remote",
      country: "US",
      radiusKm: undefined,
      workModel: "remote",
      label: "Remote"
    };
  }

  if (typeof state.location === "string" && state.location.trim().length > 0) {
    const [cityPart, countryPart] = state.location.split(",").map((item) => item.trim());
    const fallbackCity = cityPart ?? state.location;
    const fallbackCountry = (countryPart ?? "US").slice(0, 2).toUpperCase();
    return {
      geo: null,
      city: fallbackCity,
      country: fallbackCountry,
      radiusKm: 10,
      workModel: state.workModel ?? "on_site",
      label: [fallbackCity, fallbackCountry].filter(Boolean).join(", ")
    };
  }

  return {
    geo: null,
    city: "Remote",
    country: "US",
    radiusKm: undefined,
    workModel: state.workModel ?? "remote",
    label: "Remote"
  };
}

function normaliseKey(value, fallback = "general") {
  if (!value) return fallback;
  return String(value).trim().toLowerCase() || fallback;
}

function buildMarketIntelligence(state = {}) {
  const locationParsed = parseLocation(state);
  const locationKey = normaliseKey(locationParsed.city ?? locationParsed.label ?? "remote", "remote");
  const roleKey = normaliseKey(state.roleCategory, "general");
  const ROLE_MARKET_BENCHMARKS = {
    general: {
      salary: { mid: 70000, high: 90000, currency: "USD" },
      mustHaves: ["Proven track record of reliability", "Ability to collaborate across functions"],
      benefits: ["Health insurance", "401(k) with match", "Paid time off"],
      locations: { remote: 1, default: 1 },
      notes: "Balanced expectations across most customer-facing roles."
    },
    engineering: {
      salary: { mid: 145000, high: 172000, currency: "USD" },
      mustHaves: [
        "Experience building distributed systems",
        "Exposure to TypeScript/JavaScript backends",
        "Comfort with event-driven architectures"
      ],
      benefits: ["Equity refreshers", "Learning stipend", "Comprehensive health coverage"],
      locations: { remote: 1, "san francisco": 1.25, "new york": 1.1, default: 1 },
      notes: "Engineering talent markets reward clarity on scope and growth."
    },
    hospitality: {
      salary: { mid: 2300, high: 2700, currency: "GBP" },
      mustHaves: ["Customer-first mindset", "POS familiarity", "Weekend availability"],
      benefits: ["Shift meals", "Paid holidays", "Pension contributions"],
      locations: { remote: 1, london: 1.05, default: 1 },
      notes: "Hospitality roles benefit from clarity on tips and team culture."
    }
  };

  const roleIntel = ROLE_MARKET_BENCHMARKS[roleKey] ?? ROLE_MARKET_BENCHMARKS.general;
  const locationMultiplier =
    roleIntel.locations?.[locationKey] ??
    roleIntel.locations?.[locationParsed.city?.toLowerCase?.() ?? ""] ??
    roleIntel.locations?.default ??
    1;

  const mid = Math.round(roleIntel.salary.mid * locationMultiplier);
  const high = Math.round(roleIntel.salary.high * locationMultiplier);

  return {
    roleKey,
    location: {
      city: locationParsed.city,
      country: locationParsed.country,
      label: locationParsed.label ?? "Remote",
      multiplier: locationMultiplier
    },
    salaryBands: {
      p50: mid,
      p75: high,
      currency: roleIntel.salary.currency
    },
    mustHaveExamples: roleIntel.mustHaves,
    benefitNorms: roleIntel.benefits,
    hiringNotes: roleIntel.notes
  };
}

function buildFallbackResponse(stepId, state, marketIntel) {
  const response = {
    suggestions: [],
    skip: [],
    followUpToUser: []
  };

  const normalisedStep = stepId ?? "";
  const title = String(state?.title ?? "").toLowerCase();

  if (["compensation-benefits", "compensation"].includes(normalisedStep)) {
    const salary = marketIntel.salaryBands;
    if (!valueProvided(state["salary.currency"])) {
      response.suggestions.push({
        id: `fallback-salary-currency-${Date.now()}`,
        fieldId: "salary.currency",
        proposal: salary.currency,
        confidence: 0.62,
        rationale: "Aligns compensation currency with market benchmarks for this role."
      });
    }
    if (!valueProvided(state["salary.min"])) {
      response.suggestions.push({
        id: `fallback-salary-min-${Date.now()}`,
        fieldId: "salary.min",
        proposal: Math.round(salary.p50),
        confidence: 0.65,
        rationale: `Typical offers for ${marketIntel.roleKey} roles near ${marketIntel.location.label} start around ${salary.currency} ${salary.p50}.`
      });
    }
    if (!valueProvided(state["salary.max"])) {
      response.suggestions.push({
        id: `fallback-salary-max-${Date.now()}`,
        fieldId: "salary.max",
        proposal: Math.round(salary.p75),
        confidence: 0.6,
        rationale: `Upper range in ${marketIntel.location.label} reaches ${salary.currency} ${salary.p75}.`
      });
    }
    if (!valueProvided(state["salary.period"])) {
      response.suggestions.push({
        id: `fallback-salary-period-${Date.now()}`,
        fieldId: "salary.period",
        proposal: "month",
        confidence: 0.55,
        rationale: "Monthly ranges make comparison easier for candidates and analytics."
      });
    }
    if (!valueProvided(state.benefits)) {
      response.suggestions.push({
        id: `fallback-benefits-${Date.now()}`,
        fieldId: "benefits",
        proposal: marketIntel.benefitNorms.join(", "),
        confidence: 0.58,
        rationale: "Spell out benefits that nudge apply rates."
      });
    }
  } else if (["requirements-skills", "requirements"].includes(normalisedStep)) {
    if (!valueProvided(state["requirements.mustHave"])) {
      response.suggestions.push({
        id: `fallback-must-${Date.now()}`,
        fieldId: "requirements.mustHave",
        proposal: marketIntel.mustHaveExamples.join("\n"),
        confidence: 0.62,
        rationale: "These competencies repeatedly show up in successful hires."
      });
    }
    if (!valueProvided(state["requirements.niceToHave"])) {
      response.suggestions.push({
        id: `fallback-nice-${Date.now()}`,
        fieldId: "requirements.niceToHave",
        proposal: marketIntel.mustHaveExamples.map((item) => `Bonus: ${item}`).join("\n"),
        confidence: 0.54,
        rationale: "Bonus skills give the copilot more copy angles without excluding applicants."
      });
    }
    if (!valueProvided(state.experienceLevel)) {
      response.suggestions.push({
        id: `fallback-exp-${Date.now()}`,
        fieldId: "experienceLevel",
        proposal: "mid",
        confidence: 0.5,
        rationale: "Mid-level is the default for most growth-stage teams."
      });
    }
    if (!valueProvided(state.language)) {
      response.suggestions.push({
        id: `fallback-language-${Date.now()}`,
        fieldId: "language",
        proposal: marketIntel.location.country === "IL" ? "he-IL" : "en-US",
        confidence: 0.48,
        rationale: "Set a base language for downstream asset generation."
      });
    }
    if (!valueProvided(state.roleCategory)) {
      response.suggestions.push({
        id: `fallback-role-${Date.now()}`,
        fieldId: "roleCategory",
        proposal: marketIntel.roleKey,
        confidence: 0.55,
        rationale: "Clear taxonomy unlocks better benchmarking downstream."
      });
    }
  } else if (normalisedStep === "schedule-availability") {
    if (!valueProvided(state.schedule)) {
      response.suggestions.push({
        id: `fallback-schedule-${Date.now()}`,
        fieldId: "schedule",
        proposal: "Sunday-Thursday, core hours 09:00-18:00",
        confidence: 0.46,
        rationale: "Clarify availability expectations so candidates self-qualify."
      });
    }
    if (!valueProvided(state.licenses) && title.includes("driver")) {
      response.suggestions.push({
        id: `fallback-license-${Date.now()}`,
        fieldId: "licenses",
        proposal: "Valid local driver license (Category B)",
        confidence: 0.68,
        rationale: "Driving roles typically mandate verified licensing."
      });
    }
  } else if (normalisedStep === "location-precision") {
    if ((state.workModel ?? "").toLowerCase() === "remote") {
      response.skip.push({
        fieldId: "location.radiusKm",
        reason: "Remote roles do not require a commute radius."
      });
    } else if (!valueProvided(state["location.radiusKm"])) {
      response.suggestions.push({
        id: `fallback-radius-${Date.now()}`,
        fieldId: "location.radiusKm",
        proposal: 25,
        confidence: 0.42,
        rationale: "Start with a 25km radius for local targeting; you can refine later."
      });
    }
    if (!valueProvided(state["location.geo.latitude"]) && marketIntel.location.city) {
      response.followUpToUser.push("Would you like us to pin the office latitude/longitude for channel geofencing?");
    }
  } else {
    if (!valueProvided(state.title)) {
      response.suggestions.push({
        id: `fallback-title-${Date.now()}`,
        fieldId: "title",
        proposal: `Senior ${marketIntel.roleKey}`,
        confidence: 0.48,
        rationale: "Clear seniority keeps the job searchable across boards."
      });
    }
  }

  if (title.includes("waiter")) {
    response.followUpToUser.push("Do you include tips or service charge on top of base pay?");
    if (["compensation-benefits", "compensation"].includes(normalisedStep)) {
      response.suggestions.push({
        id: `hospitality-benefits-${Date.now()}`,
        fieldId: "benefits",
        proposal: "Shared service charge, team meal each shift, paid training programme",
        confidence: 0.7,
        rationale: "Hospitality applicants expect clarity on gratuities and daily perks."
      });
    }
  }

  return response;
}

export function wizardRouter({ firestore, logger, llmClient }) {
  const router = Router();

  router.post(
    "/draft",
    wrapAsync(async (req, res) => {
      const userId = requireUserId(req);
      const payload = draftRequestSchema.parse(req.body ?? {});

      const draftId = payload.jobId ?? `draft_${uuid()}`;
      const now = new Date();

      await firestore.saveDocument(DRAFT_COLLECTION, draftId, {
        jobId: draftId,
        userId,
        state: payload.state,
        currentStepId: payload.currentStepId,
        intent: payload.intent ?? {},
        updatedAt: now
      });

      logger.info({ draftId, userId, step: payload.currentStepId }, "Draft persisted");

      res.json({ draftId, status: "saved" });
    })
  );

  router.post(
    "/suggestions",
    wrapAsync(async (req, res) => {
      requireUserId(req);
      const payload = suggestionsRequestSchema.parse(req.body ?? {});

      const draft = await firestore.getDocument(DRAFT_COLLECTION, payload.jobId);
      const mergedState = draft?.state
        ? { ...draft.state, ...payload.state }
        : payload.state;

      const locationLabel =
        mergedState?.["location.city"] && mergedState?.["location.country"]
          ? `${mergedState["location.city"]}, ${mergedState["location.country"]}`
          : mergedState?.location ?? "";

      const context = {
        jobTitle: mergedState?.title ?? "",
        location: locationLabel,
        currentStepId: payload.currentStepId,
        state: mergedState
      };

      let response = null;
      if (llmClient?.askSuggestions) {
        response = await llmClient.askSuggestions(context);
      }
      if (!response) {
        const marketIntel = buildMarketIntelligence(context.state);
        response = buildFallbackResponse(context.currentStepId, context.state, marketIntel);
      }

      res.json({
        suggestions: response.suggestions ?? [],
        skip: response.skip ?? [],
        followUpToUser: response.followUpToUser ?? []
      });
    })
  );

  router.post(
    "/suggestions/merge",
    wrapAsync(async (req, res) => {
      const userId = requireUserId(req);
      const payload = mergeRequestSchema.parse(req.body ?? {});

      const draft = await firestore.getDocument(DRAFT_COLLECTION, payload.jobId);
      if (!draft) {
        throw httpError(404, "Draft not found");
      }

      const now = new Date();
      const nextState = {
        ...(draft.state ?? {}),
        [payload.fieldId]: payload.value
      };

      await firestore.saveDocument(DRAFT_COLLECTION, payload.jobId, {
        state: nextState,
        updatedAt: now,
        lastMergedBy: userId
      });

      res.json({ status: "ok" });
    })
  );

  return router;
}
