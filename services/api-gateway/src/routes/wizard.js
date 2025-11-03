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
  currentStepId: z.string(),
  updatedFieldId: z.string().optional(),
  updatedFieldValue: z.unknown().optional(),
  emptyFieldIds: z.array(z.string()).optional(),
  upcomingFieldIds: z.array(z.string()).optional()
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

const STEP_TEASERS = {
  "role-setup": "Next we’ll capture why this role matters so the story resonates with great candidates.",
  "role-story": "Next we’ll cover pay, schedules, and day-to-day details so only people who can actually do the work reach out.",
  "pay-schedule": "Next we’ll define who’s the right fit so you avoid interview churn.",
  "right-fit": "Next we’ll map how applicants move through your process so everything routes cleanly.",
  "apply-flow": "You’re at the finish line—approve when ready and we’ll generate the full hiring pack."
};

function buildNextStepTeaser(stepId) {
  return STEP_TEASERS[stepId] ?? "Keep going—each answer trains your hiring copilot to do more for you.";
}

function normaliseTextSpacing(value) {
  return value
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .join("\n")
    .replace(/\s+\n/g, "\n")
    .trim();
}

function capitaliseFirst(input) {
  if (!input) return input;
  return input.charAt(0).toUpperCase() + input.slice(1);
}

function ensureSentenceEnding(text) {
  if (!text) return text;
  if (text.length < 12) return text;
  if (/[.!?…]$/.test(text.trim())) {
    return text;
  }
  return `${text}.`;
}

function polishFreeformText(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  const normalised = normaliseTextSpacing(trimmed);
  const hasMultipleLines = normalised.includes("\n");

  if (hasMultipleLines) {
    const polishedLines = normalised
      .split("\n")
      .map((line) => ensureSentenceEnding(capitaliseFirst(line.trim())));
    const rebuilt = polishedLines.join("\n");
    return rebuilt !== rawValue ? rebuilt : null;
  }

  const capitalised = capitaliseFirst(normalised);
  const final = ensureSentenceEnding(capitalised);
  return final !== rawValue ? final : null;
}

function buildImprovedValueCandidate({ fieldId, rawValue }) {
  if (!fieldId || rawValue === undefined || rawValue === null) {
    return null;
  }
  const polished = polishFreeformText(rawValue);
  if (!polished) {
    return null;
  }
  return {
    fieldId,
    value: polished,
    rationale: "Smoothed the wording so candidates know exactly what you mean.",
    confidence: 0.55,
    source: "fallback",
    mode: "rewrite"
  };
}

function normaliseAutofillCandidate(candidate, defaults = {}) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const fieldId = candidate.fieldId ?? candidate.field_id ?? defaults.fieldId;
  if (!fieldId || typeof fieldId !== "string") {
    return null;
  }
  const value =
    candidate.value !== undefined
      ? candidate.value
      : candidate.proposal !== undefined
      ? candidate.proposal
      : defaults.value;

  if (value === undefined) {
    return null;
  }

  const confidence =
    typeof candidate.confidence === "number"
      ? candidate.confidence
      : typeof defaults.confidence === "number"
      ? defaults.confidence
      : 0.5;

  const rationale = candidate.rationale ?? defaults.rationale ?? "";
  const source = candidate.source ?? defaults.source ?? "fallback";
  const appliesToFutureStep =
    typeof candidate.appliesToFutureStep === "boolean"
      ? candidate.appliesToFutureStep
      : defaults.appliesToFutureStep ?? false;

  return {
    fieldId,
    value,
    confidence,
    rationale,
    source,
    appliesToFutureStep
  };
}

function normaliseImprovedValue(candidate, defaults = {}) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const fieldId = candidate.fieldId ?? candidate.field_id ?? defaults.fieldId;
  if (!fieldId || typeof fieldId !== "string") {
    return null;
  }
  const value =
    candidate.value !== undefined
      ? candidate.value
      : candidate.proposal !== undefined
      ? candidate.proposal
      : defaults.value;
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const confidence =
    typeof candidate.confidence === "number"
      ? candidate.confidence
      : typeof defaults.confidence === "number"
      ? defaults.confidence
      : 0.6;
  const rationale = candidate.rationale ?? defaults.rationale ?? "Polished for clarity.";
  const source = candidate.source ?? defaults.source ?? "copilot";
  const mode = candidate.mode ?? defaults.mode ?? "rewrite";

  return {
    fieldId,
    value,
    confidence,
    rationale,
    source,
    mode
  };
}

function normaliseIrrelevantField(entry, defaults = {}) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const fieldId = entry.fieldId ?? entry.field_id ?? defaults.fieldId;
  if (!fieldId || typeof fieldId !== "string") {
    return null;
  }
  const reason =
    entry.reason ??
    defaults.reason ??
    "Not relevant based on the information already provided.";

  return { fieldId, reason };
}

function mergeCandidateArrays(base = [], incoming = []) {
  const result = Array.isArray(base) ? base.slice() : [];
  if (!Array.isArray(incoming)) {
    return result;
  }
  for (const candidate of incoming) {
    if (!candidate) continue;
    const index = result.findIndex((item) => item.fieldId === candidate.fieldId);
    if (index >= 0) {
      result[index] = { ...result[index], ...candidate };
    } else {
      result.push(candidate);
    }
  }
  return result;
}

function mergeIrrelevantArrays(base = [], incoming = []) {
  const result = Array.isArray(base) ? base.slice() : [];
  if (!Array.isArray(incoming)) {
    return result;
  }
  for (const entry of incoming) {
    if (!entry) continue;
    const index = result.findIndex((item) => item.fieldId === entry.fieldId);
    if (index >= 0) {
      result[index] = { ...result[index], ...entry };
    } else {
      result.push(entry);
    }
  }
  return result;
}

function convertAutofillToLegacy(autofillCandidates) {
  const baseTimestamp = Date.now();
  return (autofillCandidates ?? []).map((candidate, index) => ({
    id: `suggestion-${candidate.fieldId}-${baseTimestamp + index}`,
    fieldId: candidate.fieldId,
    proposal: candidate.value,
    confidence: candidate.confidence ?? 0.5,
    rationale:
      candidate.rationale ??
      "Preset by the copilot so you can approve or tweak in one click."
  }));
}

function convertIrrelevantToLegacy(irrelevantFields) {
  return (irrelevantFields ?? []).map((entry) => ({
    fieldId: entry.fieldId,
    reason: entry.reason
  }));
}

function ensureUniqueMessages(messages = []) {
  const seen = new Set();
  const result = [];
  for (const message of messages) {
    if (!message || typeof message !== "string") continue;
    const trimmed = message.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function extractImprovedValue(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const candidate = raw.improved_value ?? raw.improvedValue ?? null;
  return normaliseImprovedValue(candidate);
}

function extractAutofillCandidates(raw) {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const candidatesRaw =
    raw.autofill_candidates ?? raw.autofillCandidates ?? raw.suggestions ?? [];
  if (!Array.isArray(candidatesRaw)) {
    return [];
  }
  const normalized = [];
  for (const candidate of candidatesRaw) {
    const normalised = normaliseAutofillCandidate(candidate);
    if (normalised) {
      normalized.push(normalised);
    }
  }
  return normalized;
}

function extractIrrelevantFields(raw) {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const entriesRaw =
    raw.irrelevant_fields ?? raw.irrelevantFields ?? raw.skip ?? [];
  if (!Array.isArray(entriesRaw)) {
    return [];
  }
  const normalized = [];
  for (const entry of entriesRaw) {
    const normalised = normaliseIrrelevantField(entry);
    if (normalised) {
      normalized.push(normalised);
    }
  }
  return normalized;
}

function mergeCopilotResponse(fallback, raw) {
  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const fallbackClone = {
    improved_value: fallback.improved_value ?? null,
    autofill_candidates: Array.isArray(fallback.autofill_candidates)
      ? fallback.autofill_candidates.slice()
      : [],
    irrelevant_fields: Array.isArray(fallback.irrelevant_fields)
      ? fallback.irrelevant_fields.slice()
      : [],
    next_step_teaser: fallback.next_step_teaser ?? null,
    followUpToUser: Array.isArray(fallback.followUpToUser)
      ? fallback.followUpToUser.slice()
      : [],
    suggestions: Array.isArray(fallback.suggestions) ? fallback.suggestions.slice() : [],
    skip: Array.isArray(fallback.skip) ? fallback.skip.slice() : []
  };

  const improved = extractImprovedValue(raw);
  if (improved) {
    fallbackClone.improved_value = improved;
  }

  const autofillCandidates = extractAutofillCandidates(raw);
  if (autofillCandidates.length > 0) {
    fallbackClone.autofill_candidates = mergeCandidateArrays(
      fallbackClone.autofill_candidates,
      autofillCandidates
    );
  }

  const irrelevantFields = extractIrrelevantFields(raw);
  if (irrelevantFields.length > 0) {
    fallbackClone.irrelevant_fields = mergeIrrelevantArrays(
      fallbackClone.irrelevant_fields,
      irrelevantFields
    );
  }

  const nextStep =
    typeof raw.next_step_teaser === "string"
      ? raw.next_step_teaser
      : typeof raw.nextStepTeaser === "string"
      ? raw.nextStepTeaser
      : null;
  if (nextStep && nextStep.trim().length > 0) {
    fallbackClone.next_step_teaser = nextStep.trim();
  }

  const followUpExtras = Array.isArray(raw.followUpToUser)
    ? raw.followUpToUser
    : Array.isArray(raw.follow_up_to_user)
    ? raw.follow_up_to_user
    : [];

  fallbackClone.followUpToUser = ensureUniqueMessages([
    ...fallbackClone.followUpToUser,
    ...followUpExtras,
    fallbackClone.next_step_teaser
  ]);

  fallbackClone.suggestions = convertAutofillToLegacy(fallbackClone.autofill_candidates);
  fallbackClone.skip = convertIrrelevantToLegacy(fallbackClone.irrelevant_fields);

  return fallbackClone;
}

function buildFallbackResponse({
  stepId,
  state,
  marketIntel,
  updatedFieldId,
  updatedFieldValue,
  emptyFieldIds = [],
  upcomingFieldIds = []
}) {
  const autofillMap = new Map();
  const irrelevantMap = new Map();
  const followUps = [];
  const emptyFieldSet = new Set(Array.isArray(emptyFieldIds) ? emptyFieldIds : []);
  const upcomingFieldSet = new Set(Array.isArray(upcomingFieldIds) ? upcomingFieldIds : []);

  function addAutofill(fieldId, value, { confidence = 0.5, rationale = "", source = "fallback" } = {}) {
    const candidate = normaliseAutofillCandidate({
      fieldId,
      value,
      confidence,
      rationale,
      source,
      appliesToFutureStep: upcomingFieldSet.has(fieldId) && !emptyFieldSet.has(fieldId)
    });
    if (candidate) {
      autofillMap.set(fieldId, candidate);
    }
  }

  function addIrrelevant(fieldId, reason) {
    const entry = normaliseIrrelevantField({ fieldId, reason });
    if (entry) {
      irrelevantMap.set(fieldId, entry);
    }
  }

  function addFollowUp(message) {
    if (message && typeof message === "string") {
      followUps.push(message);
    }
  }

  const normalizedStep = stepId ?? "";
  const title = String(getDeep(state, "core.job_title") ?? "").toLowerCase();
  const workModel = String(
    getDeep(state, "location.work_model") ?? marketIntel.location.workModel ?? ""
  ).toLowerCase();

  if (normalizedStep === "role-setup") {
    if (!valueProvidedAt(state, "core.job_family") && marketIntel.roleKey !== "general") {
      addAutofill("core.job_family", marketIntel.roleKey, {
        confidence: 0.55,
        rationale: "Helps tailor benchmarking and campaign targeting from the start."
      });
      addFollowUp("I suggested a team category so benchmarks stay on point—feel free to tweak it.");
    }
    if (!valueProvidedAt(state, "core.seniority_level")) {
      addAutofill("core.seniority_level", "mid", {
        confidence: 0.5,
        rationale: "Mid-level is the most common baseline for balanced pay and autonomy."
      });
    }
    if (workModel === "remote") {
      addIrrelevant("location.radius_km", "Remote roles don’t need a commute radius.");
      addFollowUp("I’ve removed the commute radius question—remote hires don’t need it.");
    } else if (!valueProvidedAt(state, "location.radius_km") && marketIntel.location.label) {
      addAutofill("location.radius_km", 25, {
        confidence: 0.42,
        rationale: "25km radius is a safe starting point for local targeting."
      });
    }
  } else if (normalizedStep === "role-story") {
    if (!valueProvidedAt(state, "role_description.problem_being_solved")) {
      addAutofill("role_description.problem_being_solved", `We need a steady ${getDeep(state, "core.job_title") ?? "team member"} to keep daily operations smooth and customers happy.`, {
        confidence: 0.48,
        rationale: "Frames the role in a way that motivates serious candidates."
      });
    }
    if (!valueProvidedAt(state, "role_description.first_30_60_90_days.days_30")) {
      addAutofill("role_description.first_30_60_90_days.days_30", "Learn our systems, shadow the team, and confidently run shorter shifts by the end of the month.", {
        confidence: 0.46,
        rationale: "Gives new hires a clear early win and filters in self-starters."
      });
    }
    if (!valueProvidedAt(state, "team_context.reporting_structure.reports_to")) {
      addAutofill("team_context.reporting_structure.reports_to", "Hiring Manager or Shift Lead", {
        confidence: 0.44,
        rationale: "Letting candidates know who has their back builds trust."
      });
    }
  } else if (normalizedStep === "pay-schedule") {
    const salary = marketIntel.salaryBands;
    if (!valueProvidedAt(state, "compensation.salary_range.currency")) {
      addAutofill("compensation.salary_range.currency", salary.currency, {
        confidence: 0.62,
        rationale: "Keeps pay transparent and aligned with local norms."
      });
    }
    if (!valueProvidedAt(state, "compensation.salary_range.min")) {
      addAutofill("compensation.salary_range.min", Math.round(salary.p50), {
        confidence: 0.65,
        rationale: `Benchmark starting point for ${marketIntel.roleKey} roles around ${marketIntel.location.label}.`
      });
    }
    if (!valueProvidedAt(state, "compensation.salary_range.max")) {
      addAutofill("compensation.salary_range.max", Math.round(salary.p75), {
        confidence: 0.6,
        rationale: `Upper range that keeps you competitive in ${marketIntel.location.label}.`
      });
    }
    if (!valueProvidedAt(state, "compensation.salary_range.period")) {
      addAutofill("compensation.salary_range.period", "month", {
        confidence: 0.55,
        rationale: "Monthly ranges make it easier for candidates to compare offers."
      });
    }
    if (!valueProvidedAt(state, "benefits.standout_benefits")) {
      addAutofill(
        "benefits.standout_benefits",
        marketIntel.benefitNorms.join("\n"),
        {
          confidence: 0.58,
          rationale: "Highlighting everyday perks boosts apply rates."
        }
      );
      addFollowUp("I filled in common benefits—edit them so they reflect what you actually offer.");
    }
    if (title.includes("waiter") || title.includes("server")) {
      addFollowUp("I highlighted tips and team meals since hospitality candidates care about those first.");
    }
  } else if (normalizedStep === "right-fit") {
    if (!valueProvidedAt(state, "requirements.hard_requirements.technical_skills.must_have")) {
      addAutofill(
        "requirements.hard_requirements.technical_skills.must_have",
        marketIntel.mustHaveExamples.join("\n"),
        {
          confidence: 0.62,
          rationale: "These must-haves appear in successful hires for similar roles."
        }
      );
    }
    if (!valueProvidedAt(state, "requirements.preferred_qualifications.skills")) {
      addAutofill(
        "requirements.preferred_qualifications.skills",
        marketIntel.mustHaveExamples.map((item) => `Bonus: ${item}`).join("\n"),
        {
          confidence: 0.53,
          rationale: "Bonus skills let you delight high performers without excluding solid applicants."
        }
      );
    }
    if (
      !valueProvidedAt(state, "requirements.hard_requirements.certifications") &&
      title.includes("driver")
    ) {
      addAutofill("requirements.hard_requirements.certifications", "Valid local driver license (Category B)", {
        confidence: 0.68,
        rationale: "Driving roles typically mandate verified licensing."
      });
    }
  } else if (normalizedStep === "apply-flow") {
    if (!valueProvidedAt(state, "application_process.apply_method")) {
      addAutofill("application_process.apply_method", "internal_form", {
        confidence: 0.52,
        rationale: "Keeps everything flowing into Wizard forms unless you specify otherwise."
      });
    }
    if (!valueProvidedAt(state, "application_process.steps")) {
      addAutofill(
        "application_process.steps",
        "Quick phone screen\nOn-site or video shadow\nManager conversation\nOffer + references",
        {
          confidence: 0.48,
          rationale: "Setting expectations here keeps candidates engaged through your process."
        }
      );
    }
    if (!valueProvidedAt(state, "application_process.total_timeline")) {
      addAutofill(
        "application_process.total_timeline",
        "About 2 weeks for frontline roles, up to 4 weeks for leadership.",
        {
          confidence: 0.45,
          rationale: "Timeline guidance reduces drop-off and sets honest expectations."
        }
      );
    }
  }

  if (title.includes("waiter")) {
    addFollowUp("Want to mention pooled tips or a guaranteed service charge? That helps floor roles decide fast.");
  }

  const improvedValue = buildImprovedValueCandidate({
    fieldId: updatedFieldId,
    rawValue: updatedFieldValue
  });

  const autofillCandidates = Array.from(autofillMap.values());
  const irrelevantFields = Array.from(irrelevantMap.values());
  const nextStepTeaser = buildNextStepTeaser(normalizedStep);

  const followUpMessages = ensureUniqueMessages([
    ...followUps,
    nextStepTeaser
  ]);

  return {
    improved_value: improvedValue,
    autofill_candidates: autofillCandidates,
    irrelevant_fields: irrelevantFields,
    next_step_teaser: nextStepTeaser,
    followUpToUser: followUpMessages,
    suggestions: convertAutofillToLegacy(autofillCandidates),
    skip: convertIrrelevantToLegacy(irrelevantFields)
  };
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

      const marketIntel = buildMarketIntelligence(context.state);

      const fallbackResponse = buildFallbackResponse({
        stepId: payload.currentStepId,
        state: context.state,
        marketIntel,
        updatedFieldId: payload.updatedFieldId,
        updatedFieldValue: payload.updatedFieldValue,
        emptyFieldIds: payload.emptyFieldIds ?? [],
        upcomingFieldIds: payload.upcomingFieldIds ?? []
      });

      let finalResponse = fallbackResponse;

      if (llmClient?.askSuggestions) {
        const llmPayload = {
          ...context,
          marketIntel,
          updatedFieldId: payload.updatedFieldId,
          updatedFieldValue: payload.updatedFieldValue,
          emptyFieldIds: payload.emptyFieldIds ?? [],
          upcomingFieldIds: payload.upcomingFieldIds ?? []
        };

        const llmRaw = await llmClient.askSuggestions(llmPayload);
        if (llmRaw) {
          finalResponse = mergeCopilotResponse(fallbackResponse, llmRaw);
        }
      }

      res.json(finalResponse);
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
