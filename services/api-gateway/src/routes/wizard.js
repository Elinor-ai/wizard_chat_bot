import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { wrapAsync, httpError } from "@wizard/utils";
import { JobSchemaV2 } from "@wizard/core";

const DRAFT_COLLECTION = "jobsDraft";

const looseObjectSchema = z.object({}).catchall(z.unknown());

const draftRequestSchema = z.object({
  jobId: z.string().optional(),
  state: looseObjectSchema.default({}),
  intent: looseObjectSchema.optional(),
  currentStepId: z.string()
});

const suggestionsRequestSchema = z.object({
  jobId: z.string(),
  state: looseObjectSchema.default({}),
  intent: looseObjectSchema.optional(),
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, update) {
  if (!isPlainObject(update)) {
    return update === undefined ? base : update;
  }

  const result = isPlainObject(base) ? { ...base } : {};

  const keys = new Set([
    ...Object.keys(isPlainObject(base) ? base : {}),
    ...Object.keys(update)
  ]);

  for (const key of keys) {
    const incoming = update[key];
    const existing = isPlainObject(base) ? base[key] : undefined;

    if (incoming === undefined) {
      continue;
    }

    if (isPlainObject(incoming) && isPlainObject(existing)) {
      const mergedChild = deepMerge(existing, incoming);
      if (mergedChild === undefined || (isPlainObject(mergedChild) && Object.keys(mergedChild).length === 0)) {
        delete result[key];
      } else {
        result[key] = mergedChild;
      }
    } else if (Array.isArray(incoming)) {
      result[key] = incoming.slice();
    } else {
      result[key] = incoming;
    }
  }

  return result;
}

function deepClone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function getDeep(target, path) {
  if (!path || !target) return path ? undefined : target;
  const parts = path.split(".");
  let current = target;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function setDeep(target, path, value) {
  if (!path) return;
  const parts = path.split(".");
  const last = parts.pop();
  let current = target;
  for (const part of parts) {
    if (!isPlainObject(current[part])) {
      current[part] = {};
    }
    current = current[part];
  }
  if (value === undefined) {
    delete current[last];
  } else {
    current[last] = value;
  }
}

function createBaseDraft({ draftId, userId, nowMs }) {
  return {
    schema_version: "2",
    core: {
      job_id: draftId,
      company_id: userId,
      job_title: "",
      job_title_variations: [],
      industry: "",
      sub_industry: "",
      job_family: "",
      seniority_level: "mid"
    },
    location: {},
    role_description: {
      recruiter_input: "",
      tldr_pitch: "",
      day_to_day: [],
      problem_being_solved: "",
      impact_metrics: {},
      responsibilities: {
        core: [],
        growth: [],
        collaborative: []
      },
      first_30_60_90_days: {}
    },
    compensation: {},
    benefits: {
      standout_benefits: []
    },
    requirements: {},
    application_process: {},
    company_context: {},
    metadata: {
      created_at: nowMs,
      updated_at: nowMs,
      created_by: userId,
      extraction_source: "manual_form",
      tags: [],
      approval_status: "draft"
    }
  };
}

function ensureMetadata(nextDraft, { userId, nowMs }) {
  const metadata = isPlainObject(nextDraft.metadata) ? { ...nextDraft.metadata } : {};
  metadata.created_at =
    typeof metadata.created_at === "number" ? metadata.created_at : nowMs;
  metadata.updated_at = nowMs;
  metadata.created_by = metadata.created_by || userId;
  metadata.extraction_source = metadata.extraction_source || "manual_form";
  metadata.approval_status = metadata.approval_status || "draft";
  metadata.tags = Array.isArray(metadata.tags)
    ? metadata.tags
    : typeof metadata.tags === "string" && metadata.tags.trim().length > 0
    ? [metadata.tags.trim()]
    : [];
  nextDraft.metadata = metadata;
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

function valueProvidedAt(state, path) {
  return valueProvided(getDeep(state, path));
}

function parseLocation(state = {}) {
  const city = getDeep(state, "location.city");
  const country = getDeep(state, "location.country");
  const radiusRaw = getDeep(state, "location.radius_km");
  const workModelRaw = getDeep(state, "location.work_model");
  const geoCandidate = getDeep(state, "location.geo");
  const geoLat = getDeep(state, "location.geo.latitude");
  const geoLng = getDeep(state, "location.geo.longitude");

  let geo = null;
  if (
    isPlainObject(geoCandidate) &&
    geoCandidate.latitude !== undefined &&
    geoCandidate.longitude !== undefined
  ) {
    geo = {
      latitude: Number(geoCandidate.latitude),
      longitude: Number(geoCandidate.longitude)
    };
  } else if (geoLat !== undefined && geoLng !== undefined) {
    geo = {
      latitude: Number(geoLat),
      longitude: Number(geoLng)
    };
  }

  const normalizedWorkModel =
    typeof workModelRaw === "string" && workModelRaw.trim().length > 0
      ? workModelRaw.trim().toLowerCase()
      : undefined;
  const remoteFlag = normalizedWorkModel === "remote";

  const normalizedCity =
    typeof city === "string" && city.trim().length > 0
      ? city.trim()
      : remoteFlag
      ? "Remote"
      : undefined;

  const normalizedCountry =
    typeof country === "string" && country.trim().length > 0
      ? country.trim().slice(0, 2).toUpperCase()
      : remoteFlag
      ? "US"
      : undefined;

  const radiusKm =
    radiusRaw === undefined || radiusRaw === null || radiusRaw === ""
      ? undefined
      : Number(radiusRaw);

  const label =
    [normalizedCity, normalizedCountry].filter(Boolean).join(", ") ||
    (remoteFlag ? "Remote" : "Unknown");

  return {
    geo,
    city: normalizedCity ?? null,
    country: normalizedCountry ?? null,
    radiusKm,
    workModel: remoteFlag ? "remote" : normalizedWorkModel ?? "on_site",
    label
  };
}

function normaliseKey(value, fallback = "general") {
  if (!value) return fallback;
  return String(value).trim().toLowerCase() || fallback;
}

function buildMarketIntelligence(state = {}) {
  const locationParsed = parseLocation(state);
  const locationKey = normaliseKey(locationParsed.city ?? locationParsed.label ?? "remote", "remote");
  const roleKey = normaliseKey(getDeep(state, "core.job_family"), "general");
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
      workModel: locationParsed.workModel ?? "remote",
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
  const title = String(getDeep(state, "core.job_title") ?? "").toLowerCase();
  const workModel = String(
    getDeep(state, "location.work_model") ?? marketIntel.location.workModel ?? ""
  ).toLowerCase();

  if (["compensation-benefits", "compensation"].includes(normalisedStep)) {
    const salary = marketIntel.salaryBands;
    if (!valueProvidedAt(state, "compensation.salary_range.currency")) {
      response.suggestions.push({
        id: `fallback-salary-currency-${Date.now()}`,
        fieldId: "compensation.salary_range.currency",
        proposal: salary.currency,
        confidence: 0.62,
        rationale: "Aligns compensation currency with market benchmarks for this role."
      });
    }
    if (!valueProvidedAt(state, "compensation.salary_range.min")) {
      response.suggestions.push({
        id: `fallback-salary-min-${Date.now()}`,
        fieldId: "compensation.salary_range.min",
        proposal: Math.round(salary.p50),
        confidence: 0.65,
        rationale: `Typical offers for ${marketIntel.roleKey} roles near ${marketIntel.location.label} start around ${salary.currency} ${salary.p50}.`
      });
    }
    if (!valueProvidedAt(state, "compensation.salary_range.max")) {
      response.suggestions.push({
        id: `fallback-salary-max-${Date.now()}`,
        fieldId: "compensation.salary_range.max",
        proposal: Math.round(salary.p75),
        confidence: 0.6,
        rationale: `Upper range in ${marketIntel.location.label} reaches ${salary.currency} ${salary.p75}.`
      });
    }
    if (!valueProvidedAt(state, "compensation.salary_range.period")) {
      response.suggestions.push({
        id: `fallback-salary-period-${Date.now()}`,
        fieldId: "compensation.salary_range.period",
        proposal: "month",
        confidence: 0.55,
        rationale: "Monthly ranges make comparison easier for candidates and analytics."
      });
    }
    if (!valueProvidedAt(state, "benefits.standout_benefits")) {
      response.suggestions.push({
        id: `fallback-benefits-${Date.now()}`,
        fieldId: "benefits.standout_benefits",
        proposal: marketIntel.benefitNorms.join(", "),
        confidence: 0.58,
        rationale: "Spell out benefits that nudge apply rates."
      });
    }
  } else if (["requirements-skills", "requirements"].includes(normalisedStep)) {
    if (!valueProvidedAt(state, "requirements.hard_requirements.technical_skills.must_have")) {
      response.suggestions.push({
        id: `fallback-must-${Date.now()}`,
        fieldId: "requirements.hard_requirements.technical_skills.must_have",
        proposal: marketIntel.mustHaveExamples.join("\n"),
        confidence: 0.62,
        rationale: "These competencies repeatedly show up in successful hires."
      });
    }
    if (!valueProvidedAt(state, "requirements.preferred_qualifications.skills")) {
      response.suggestions.push({
        id: `fallback-nice-${Date.now()}`,
        fieldId: "requirements.preferred_qualifications.skills",
        proposal: marketIntel.mustHaveExamples.map((item) => `Bonus: ${item}`).join("\n"),
        confidence: 0.54,
        rationale: "Bonus skills give the copilot more copy angles without excluding applicants."
      });
    }
    if (!valueProvidedAt(state, "core.seniority_level")) {
      response.suggestions.push({
        id: `fallback-exp-${Date.now()}`,
        fieldId: "core.seniority_level",
        proposal: "mid",
        confidence: 0.5,
        rationale: "Mid-level is the default for most growth-stage teams."
      });
    }
    if (!valueProvidedAt(state, "metadata.tags")) {
      response.suggestions.push({
        id: `fallback-language-${Date.now()}`,
        fieldId: "metadata.tags",
        proposal: marketIntel.location.country === "IL" ? "he-IL" : "en-US",
        confidence: 0.48,
        rationale: "Use tags to anchor asset generation prompts and routing."
      });
    }
    if (!valueProvidedAt(state, "core.job_family") && marketIntel.roleKey !== "general") {
      response.suggestions.push({
        id: `fallback-role-${Date.now()}`,
        fieldId: "core.job_family",
        proposal: marketIntel.roleKey,
        confidence: 0.55,
        rationale: "Clear taxonomy unlocks better benchmarking downstream."
      });
    }
  } else if (normalisedStep === "schedule-availability") {
    if (!valueProvidedAt(state, "role_description.day_to_day")) {
      response.suggestions.push({
        id: `fallback-schedule-${Date.now()}`,
        fieldId: "role_description.day_to_day",
        proposal: "Sunday-Thursday, core hours 09:00-18:00",
        confidence: 0.46,
        rationale: "Clarify availability expectations so candidates self-qualify."
      });
    }
    if (
      !valueProvidedAt(state, "requirements.hard_requirements.certifications") &&
      title.includes("driver")
    ) {
      response.suggestions.push({
        id: `fallback-license-${Date.now()}`,
        fieldId: "requirements.hard_requirements.certifications",
        proposal: "Valid local driver license (Category B)",
        confidence: 0.68,
        rationale: "Driving roles typically mandate verified licensing."
      });
    }
  } else if (normalisedStep === "location-precision") {
    if (workModel === "remote") {
      response.skip.push({
        fieldId: "location.radius_km",
        reason: "Remote roles do not require a commute radius."
      });
    } else if (!valueProvidedAt(state, "location.radius_km")) {
      response.suggestions.push({
        id: `fallback-radius-${Date.now()}`,
        fieldId: "location.radius_km",
        proposal: 25,
        confidence: 0.42,
        rationale: "Start with a 25km radius for local targeting; you can refine later."
      });
    }
    if (!valueProvidedAt(state, "location.geo.latitude") && marketIntel.location.city) {
      response.followUpToUser.push("Would you like us to pin the office latitude/longitude for channel geofencing?");
    }
  } else {
    if (!valueProvidedAt(state, "core.job_title")) {
      response.suggestions.push({
        id: `fallback-title-${Date.now()}`,
        fieldId: "core.job_title",
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
        fieldId: "benefits.standout_benefits",
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
      const nowMs = now.getTime();

      const existing = await firestore.getDocument(DRAFT_COLLECTION, draftId);
      const baseState = existing?.state
        ? deepClone(existing.state)
        : createBaseDraft({ draftId, userId, nowMs });

      const withIncoming = deepMerge(baseState, payload.state ?? {});
      ensureMetadata(withIncoming, { userId, nowMs });

      const parsedDraft = JobSchemaV2.parse(withIncoming);

      await firestore.saveDocument(DRAFT_COLLECTION, draftId, {
        jobId: draftId,
        userId,
        state: parsedDraft,
        currentStepId: payload.currentStepId,
        intent: payload.intent ?? {},
        createdAt: existing?.createdAt ?? now,
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
      const baseState = draft?.state ? deepClone(draft.state) : {};
      const mergedState = deepMerge(baseState, payload.state ?? {});
      const locationMeta = parseLocation(mergedState);

      const context = {
        jobTitle: getDeep(mergedState, "core.job_title") ?? "",
        location: locationMeta.label,
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
      const nowMs = now.getTime();
      const nextState = deepClone(draft.state ?? {});

      setDeep(nextState, payload.fieldId, payload.value);

      const metadataOwner =
        getDeep(nextState, "metadata.created_by") ??
        getDeep(draft.state ?? {}, "metadata.created_by") ??
        userId;
      ensureMetadata(nextState, { userId: metadataOwner, nowMs });

      const parsedState = JobSchemaV2.parse(nextState);

      await firestore.saveDocument(DRAFT_COLLECTION, payload.jobId, {
        jobId: draft.jobId ?? payload.jobId,
        userId: draft.userId ?? userId,
        state: parsedState,
        currentStepId: draft.currentStepId,
        intent: draft.intent ?? {},
        createdAt: draft.createdAt ?? now,
        updatedAt: now,
        lastMergedBy: userId
      });

      res.json({ status: "ok" });
    })
  );

  return router;
}
