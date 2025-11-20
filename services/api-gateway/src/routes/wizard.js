import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { wrapAsync, httpError } from "@wizard/utils";
import sharp from "sharp";
import {
  CampaignSchema,
  JobChannelRecommendationSchema,
  JobFinalSchema,
  JobRefinementSchema,
  JobSchema,
  ConfirmedJobDetailsSchema,
  JobSuggestionSchema,
  deriveJobStatusFromState,
  ChannelIdEnum,
  JobAssetRecordSchema,
  JobAssetRunSchema,
  JobAssetStatusEnum,
  JobAssetRunStatusEnum,
  JobHeroImageSchema,
  CompanyDiscoveredJobSchema,
  CompanySchema
} from "@wizard/core";
import { createAssetPlan } from "../llm/domain/asset-plan.js";
import { recordLlmUsageFromResult } from "../services/llm-usage-ledger.js";
import { listCompaniesForUser } from "./companies.js";

const JOB_COLLECTION = "jobs";
const SUGGESTION_COLLECTION = "jobSuggestions";
const CHANNEL_RECOMMENDATION_COLLECTION = "jobChannelRecommendations";
const REFINEMENT_COLLECTION = "jobRefinements";
const FINAL_JOB_COLLECTION = "jobFinalJobs";
const JOB_ASSET_COLLECTION = "jobAssets";
const JOB_ASSET_RUN_COLLECTION = "jobAssetRuns";
const HERO_IMAGE_COLLECTION = "jobHeroImages";
const SUPPORTED_CHANNELS = CampaignSchema.shape.channel.options;
const ASSET_STATUS = JobAssetStatusEnum.enum;
const RUN_STATUS = JobAssetRunStatusEnum.enum;

const looseObjectSchema = z.object({}).catchall(z.unknown());

async function compressBase64Image(base64, { maxBytes = 900000 } = {}) {
  if (!base64) {
    return { base64: null, mimeType: null };
  }
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length <= maxBytes) {
    return { base64, mimeType: "image/png" };
  }
  try {
    const compressed = await sharp(buffer)
      .jpeg({
        quality: 75,
        chromaSubsampling: "4:4:4"
      })
      .toBuffer();
    if (compressed.length <= maxBytes) {
      return {
        base64: compressed.toString("base64"),
        mimeType: "image/jpeg"
      };
    }
    return { base64: null, mimeType: "image/jpeg" };
  } catch (error) {
    return { base64, mimeType: "image/png" };
  }
}

const ALLOWED_INTAKE_KEYS = [
  "roleTitle",
  "companyName",
  "logoUrl",
  "location",
  "zipCode",
  "industry",
  "seniorityLevel",
  "employmentType",
  "workModel",
  "jobDescription",
  "coreDuties",
  "mustHaves",
  "benefits",
  "salary",
  "salaryPeriod",
  "currency"
];
const ARRAY_FIELD_KEYS = new Set(["coreDuties", "mustHaves", "benefits"]);
const ENUM_FIELD_KEYS = ["workModel", "employmentType", "seniorityLevel"];

const REQUIRED_FIELD_PATHS = [
  "roleTitle",
  "companyName",
  "location",
  "seniorityLevel",
  "employmentType",
  "jobDescription"
];

const draftRequestSchema = z.object({
  jobId: z.string().optional(),
  state: looseObjectSchema.default({}),
  intent: looseObjectSchema.optional(),
  currentStepId: z.string(),
  companyId: z.string().nullable().optional()
});

const suggestionsRequestSchema = z.object({
  jobId: z.string(),
  state: looseObjectSchema.default({}),
  intent: looseObjectSchema.optional(),
  currentStepId: z.string(),
  updatedFieldId: z.string().optional(),
  updatedFieldValue: z.unknown().optional(),
  emptyFieldIds: z.array(z.string()).optional(),
  upcomingFieldIds: z.array(z.string()).optional(),
  visibleFieldIds: z.array(z.string()).optional()
});

const mergeRequestSchema = z.object({
  jobId: z.string(),
  fieldId: z.string(),
  value: z.unknown()
});

const channelRecommendationRequestSchema = z.object({
  jobId: z.string(),
  forceRefresh: z.boolean().optional()
});

const refinementRequestSchema = z.object({
  jobId: z.string(),
  forceRefresh: z.boolean().optional()
});

const finalizeRequestSchema = z.object({
  jobId: z.string(),
  finalJob: ConfirmedJobDetailsSchema,
  source: z.enum(["original", "refined", "edited"]).optional()
});

const assetGenerationRequestSchema = z.object({
  jobId: z.string(),
  channelIds: z.array(ChannelIdEnum).min(1),
  source: z.enum(["original", "refined", "edited"]).optional()
});

const assetStatusRequestSchema = z.object({
  jobId: z.string()
});

const heroImageRequestSchema = z.object({
  jobId: z.string(),
  forceRefresh: z.boolean().optional()
});

const importCompanyJobRequestSchema = z.object({
  companyJobId: z.string().min(1, "companyJobId is required"),
  companyId: z.string().optional()
});

function getAuthenticatedUserId(req) {
  const userId = req.user?.id;
  if (!userId) {
    throw httpError(401, "Unauthorized");
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

function sanitizeImportValue(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function sanitizeMultilineValue(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function deriveCompanyDisplayName(company) {
  return (
    sanitizeImportValue(company?.name) ||
    sanitizeImportValue(company?.brand?.name) ||
    sanitizeImportValue(company?.primaryDomain) ||
    "Your company"
  );
}

function deriveCompanyLocation(company) {
  const city = sanitizeImportValue(company?.hqCity);
  const country = sanitizeImportValue(company?.hqCountry);
  const parts = [city, country].filter(Boolean);
  return parts.join(", ");
}

function buildImportedJobState({ company, companyJob }) {
  const state = {};
  const fallbackTitle = sanitizeImportValue(companyJob?.title) || "Imported role";
  state.roleTitle = fallbackTitle;
  state.companyName = deriveCompanyDisplayName(company);
  state.location =
    sanitizeImportValue(companyJob?.location) ||
    deriveCompanyLocation(company) ||
    "Remote";

  const normalizedDescription = sanitizeMultilineValue(companyJob?.description);
  const descriptionBlocks = [];
  if (normalizedDescription) {
    descriptionBlocks.push(normalizedDescription);
  } else {
    descriptionBlocks.push(
      `This role was imported from ${companyJob?.source ?? "an external job posting"} to speed up your workflow.`
    );
  }
  const normalizedUrl = sanitizeImportValue(companyJob?.url);
  if (normalizedUrl) {
    descriptionBlocks.push(`Original posting: ${normalizedUrl}`);
  }
  state.jobDescription = descriptionBlocks.join("\n\n").trim();

  const logoUrl =
    sanitizeImportValue(company?.logoUrl) ||
    sanitizeImportValue(company?.brand?.logoUrl) ||
    sanitizeImportValue(company?.brand?.iconUrl);
  if (logoUrl) {
    state.logoUrl = logoUrl;
  }
  const industry = sanitizeImportValue(company?.industry);
  if (industry) {
    state.industry = industry;
  }

  return state;
}

function createBaseJob({ jobId, userId, companyId = null, now }) {
  return JobSchema.parse({
    id: jobId,
    ownerUserId: userId,
    orgId: null,
    companyId: companyId ?? null,
    status: "draft",
    stateMachine: {
      currentState: "DRAFT",
      previousState: null,
      history: [],
      requiredComplete: false,
      optionalComplete: false,
      lastTransitionAt: now,
      lockedByRequestId: null
    },
    roleTitle: "",
    companyName: "",
    logoUrl: "",
    location: "",
    zipCode: "",
    jobDescription: "",
    coreDuties: [],
    mustHaves: [],
    benefits: [],
    salary: "",
    salaryPeriod: "",
    currency: "",
    confirmed: {},
    createdAt: now,
    updatedAt: now,
    archivedAt: null
  });
}

function normalizeIntakeValue(existingValue, incomingValue, key) {
  if (incomingValue === undefined) {
    return existingValue;
  }

  if (incomingValue === null) {
    if (Array.isArray(existingValue) || ARRAY_FIELD_KEYS.has(key)) {
      return [];
    }
    if (typeof existingValue === "string" || !ARRAY_FIELD_KEYS.has(key)) {
      return "";
    }
    return null;
  }

  return incomingValue;
}

function mergeIntakeIntoJob(job, incomingState = {}, { now }) {
  const nextJob = deepClone(job);

  for (const key of ALLOWED_INTAKE_KEYS) {
    if (!(key in incomingState)) {
      continue;
    }
    const incomingValue = incomingState[key];
    const existingValue = nextJob[key];

    if (isPlainObject(incomingValue) && isPlainObject(existingValue)) {
      nextJob[key] = deepMerge(existingValue, incomingValue);
    } else {
      nextJob[key] = normalizeIntakeValue(existingValue, incomingValue, key);
    }
  }

  nextJob.updatedAt = now;
  return nextJob;
}

function computeRequiredProgress(jobState) {
  const total = REQUIRED_FIELD_PATHS.length;
  let completed = 0;

  for (const fieldPath of REQUIRED_FIELD_PATHS) {
    if (valueProvidedAt(jobState, fieldPath)) {
      completed += 1;
    }
  }

  return {
    total,
    completed,
    allComplete: completed === total,
    started: completed > 0
  };
}

function applyRequiredProgress(job, progress, now) {
  const nextJob = deepClone(job);
  const machine = normalizeStateMachine(nextJob.stateMachine, now);

  machine.history = Array.isArray(machine.history) ? machine.history : [];
  machine.requiredComplete = progress.allComplete;

  if (progress.allComplete) {
    if (machine.currentState === "DRAFT") {
      machine.history.push({
        from: "DRAFT",
        to: "REQUIRED_IN_PROGRESS",
        at: now,
        reason: "Started filling required fields"
      });
      machine.currentState = "REQUIRED_IN_PROGRESS";
    }
    if (machine.currentState === "REQUIRED_IN_PROGRESS") {
      machine.history.push({
        from: "REQUIRED_IN_PROGRESS",
        to: "REQUIRED_COMPLETE",
        at: now,
        reason: "All required fields complete"
      });
      machine.currentState = "REQUIRED_COMPLETE";
    }
  } else if (progress.started && machine.currentState === "DRAFT") {
    machine.history.push({
      from: "DRAFT",
      to: "REQUIRED_IN_PROGRESS",
      at: now,
      reason: "Started filling required fields"
    });
    machine.currentState = "REQUIRED_IN_PROGRESS";
  }

  machine.lastTransitionAt = now;
  machine.previousState = machine.history.at(-1)?.from ?? machine.previousState ?? null;

  const optionalTouched =
    valueProvidedAt(nextJob, "workModel") ||
    valueProvidedAt(nextJob, "industry") ||
    valueProvidedAt(nextJob, "zipCode") ||
    valueProvidedAt(nextJob, "currency") ||
    valueProvidedAt(nextJob, "salary") ||
    valueProvidedAt(nextJob, "salaryPeriod") ||
    valueProvidedAt(nextJob, "benefits") ||
    valueProvidedAt(nextJob, "coreDuties") ||
    valueProvidedAt(nextJob, "mustHaves");

  if (optionalTouched) {
    machine.optionalComplete = true;
    if (machine.currentState === "REQUIRED_COMPLETE") {
      machine.history.push({
        from: "REQUIRED_COMPLETE",
        to: "OPTIONAL_IN_PROGRESS",
        at: now,
        reason: "Optional context added"
      });
      machine.currentState = "OPTIONAL_IN_PROGRESS";
    } else if (machine.currentState === "OPTIONAL_IN_PROGRESS") {
      machine.history.push({
        from: "OPTIONAL_IN_PROGRESS",
        to: "OPTIONAL_COMPLETE",
        at: now,
        reason: "Optional context enriched"
      });
      machine.currentState = "OPTIONAL_COMPLETE";
    }
  }

  nextJob.stateMachine = machine;
  nextJob.status = deriveJobStatusFromState(machine.currentState);
  return nextJob;
}

function normalizeStateMachine(rawState, now) {
  const fallback = {
    currentState: "DRAFT",
    previousState: null,
    history: [],
    requiredComplete: false,
    optionalComplete: false,
    lastTransitionAt: now,
    lockedByRequestId: null
  };

  if (!isPlainObject(rawState)) {
    return fallback;
  }

  return {
    currentState: typeof rawState.currentState === "string" ? rawState.currentState : fallback.currentState,
    previousState: rawState.previousState ?? fallback.previousState,
    history: Array.isArray(rawState.history) ? rawState.history.slice() : [],
    requiredComplete:
      typeof rawState.requiredComplete === "boolean"
        ? rawState.requiredComplete
        : Boolean(rawState.required_complete ?? fallback.requiredComplete),
    optionalComplete:
      typeof rawState.optionalComplete === "boolean"
        ? rawState.optionalComplete
        : Boolean(rawState.optional_complete ?? fallback.optionalComplete),
    lastTransitionAt: rawState.lastTransitionAt ?? rawState.last_transition_at ?? now,
    lockedByRequestId: rawState.lockedByRequestId ?? rawState.locked_by_request_id ?? null
  };
}


function mapCandidatesByField(candidates = []) {
  const map = {};
  candidates.forEach((candidate) => {
    map[candidate.fieldId] = candidate;
  });
  return map;
}

async function loadSuggestionDocument(firestore, jobId) {
  const existing = await firestore.getDocument(SUGGESTION_COLLECTION, jobId);
  if (!existing) return null;
  const parsed = JobSuggestionSchema.safeParse(existing);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

async function overwriteSuggestionDocument({
  firestore,
  logger,
  jobId,
  candidates,
  provider,
  model,
  metadata,
  now
}) {
  const telemetry = metadata && Object.keys(metadata).length > 0
    ? {
        promptTokens:
          metadata.promptTokens ?? metadata.promptTokenCount ?? null,
        candidateTokens:
          metadata.candidateTokens ?? metadata.candidatesTokenCount ?? null,
        totalTokens:
          metadata.totalTokens ?? metadata.totalTokenCount ?? null,
        finishReason: metadata.finishReason ?? null
      }
    : undefined;
  const payload = JobSuggestionSchema.parse({
    id: jobId,
    jobId,
    schema_version: "3",
    candidates: mapCandidatesByField(candidates),
    provider,
    model,
    metadata: telemetry,
    updatedAt: now
  });

  await firestore.saveDocument(SUGGESTION_COLLECTION, jobId, payload);
  logger.info(
    { jobId, suggestions: candidates.length, provider, model },
    "Persisted LLM suggestions"
  );

  return payload;
}

async function persistSuggestionFailure({
  firestore,
  logger,
  jobId,
  reason,
  rawPreview,
  error,
  now
}) {
  const existing = await loadSuggestionDocument(firestore, jobId);

  const payload = JobSuggestionSchema.parse({
    id: jobId,
    jobId,
    schema_version: "3",
    candidates: existing?.candidates ?? {},
    provider: existing?.provider,
    model: existing?.model,
    metadata: existing?.metadata,
    lastFailure: {
      reason,
      rawPreview,
      error,
      occurredAt: now
    },
    updatedAt: existing?.updatedAt ?? now
  });

  await firestore.saveDocument(SUGGESTION_COLLECTION, jobId, payload);
  logger.warn({ jobId, reason }, "Persisted suggestion failure");
  return payload;
}

function selectSuggestionsForFields(candidateMap = {}, fieldIds = []) {
  if (!Array.isArray(fieldIds) || fieldIds.length === 0) {
    return Object.values(candidateMap ?? {});
  }
  return fieldIds
    .map((fieldId) => candidateMap?.[fieldId])
    .filter(Boolean)
    .map((candidate) => ({
      fieldId: candidate.fieldId,
      value: candidate.value,
      rationale: candidate.rationale ?? "",
      confidence: candidate.confidence ?? undefined,
      source: candidate.source ?? "expert-assistant"
    }));
}

async function acknowledgeSuggestionField({
  firestore,
  jobId,
  fieldId,
  logger,
  now
}) {
  const existing = await loadSuggestionDocument(firestore, jobId);
  if (!existing || !existing.candidates?.[fieldId]) {
    return;
  }

  const candidateMap = { ...existing.candidates };
  delete candidateMap[fieldId];

  const payload = JobSuggestionSchema.parse({
    id: jobId,
    jobId,
    schema_version: "3",
    candidates: candidateMap,
    provider: existing.provider,
    model: existing.model,
    metadata: existing.metadata,
    lastFailure: existing.lastFailure,
    updatedAt: now
  });

  await firestore.saveDocument(SUGGESTION_COLLECTION, jobId, payload);
  logger.info({ jobId, fieldId }, "Suggestion removed after merge");
}

async function loadRefinementDocument(firestore, jobId) {
  if (
    jobId === undefined &&
    firestore &&
    typeof firestore === "object" &&
    firestore.firestore &&
    firestore.jobId
  ) {
    jobId = firestore.jobId;
    firestore = firestore.firestore;
  }
  const existing = await firestore.getDocument(REFINEMENT_COLLECTION, jobId);
  if (!existing) return null;
  const parsed = JobRefinementSchema.safeParse(existing);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

async function overwriteRefinementDocument({
  firestore,
  logger,
  jobId,
  refinedJob,
  summary,
  provider,
  model,
  metadata,
  now
}) {
  const payload = JobRefinementSchema.parse({
    id: jobId,
    jobId,
    schema_version: "1",
    refinedJob,
    summary: summary ?? null,
    provider,
    model,
    metadata,
    updatedAt: now
  });

  await firestore.saveDocument(REFINEMENT_COLLECTION, jobId, payload);
  logger.info({ jobId, provider, model }, "Persisted job refinement");
  return payload;
}

async function persistRefinementFailure({
  firestore,
  logger,
  jobId,
  reason,
  message,
  rawPreview,
  now
}) {
  const existing = await loadRefinementDocument(firestore, jobId);
  const payload = JobRefinementSchema.parse({
    id: jobId,
    jobId,
    schema_version: "1",
    refinedJob: existing?.refinedJob ?? {},
    summary: existing?.summary ?? null,
    provider: existing?.provider,
    model: existing?.model,
    metadata: existing?.metadata,
    lastFailure: {
      reason,
      message: message ?? null,
      rawPreview: rawPreview ?? null,
      occurredAt: now
    },
    updatedAt: existing?.updatedAt ?? now
  });

  await firestore.saveDocument(REFINEMENT_COLLECTION, jobId, payload);
  logger.warn({ jobId, reason }, "Persisted refinement failure");
  return payload;
}

async function loadFinalJobDocument(firestore, jobId) {
  const existing = await firestore.getDocument(FINAL_JOB_COLLECTION, jobId);
  if (!existing) return null;
  const parsed = JobFinalSchema.safeParse(existing);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

async function overwriteFinalJobDocument({
  firestore,
  logger,
  jobId,
  finalJob,
  source,
  now
}) {
  const payload = JobFinalSchema.parse({
    id: jobId,
    jobId,
    schema_version: "1",
    job: finalJob,
    source,
    updatedAt: now
  });

  await firestore.saveDocument(FINAL_JOB_COLLECTION, jobId, payload);
  logger.info({ jobId, source }, "Persisted final job version");
  return payload;
}

async function loadChannelRecommendationDocument(firestore, jobId) {
  const existing = await firestore.getDocument(
    CHANNEL_RECOMMENDATION_COLLECTION,
    jobId
  );
  if (!existing) return null;
  const parsed = JobChannelRecommendationSchema.safeParse(existing);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

async function overwriteChannelRecommendationDocument({
  firestore,
  logger,
  jobId,
  recommendations,
  provider,
  model,
  metadata,
  now
}) {
  const payload = JobChannelRecommendationSchema.parse({
    id: jobId,
    jobId,
    schema_version: "1",
    recommendations,
    provider,
    model,
    metadata:
      metadata && Object.keys(metadata).length > 0
        ? {
            promptTokens: metadata.promptTokens ?? null,
            responseTokens: metadata.responseTokens ?? null,
            totalTokens: metadata.totalTokens ?? null,
            finishReason: metadata.finishReason ?? null
          }
        : undefined,
    updatedAt: now
  });

  await firestore.saveDocument(
    CHANNEL_RECOMMENDATION_COLLECTION,
    jobId,
    payload
  );
  logger.info(
    { jobId, recommendations: recommendations.length, provider, model },
    "Persisted channel recommendations"
  );
  return payload;
}

async function persistChannelRecommendationFailure({
  firestore,
  logger,
  jobId,
  reason,
  message,
  rawPreview,
  now
}) {
  const existing = await loadChannelRecommendationDocument(firestore, jobId);

  const payload = JobChannelRecommendationSchema.parse({
    id: jobId,
    jobId,
    schema_version: "1",
    recommendations: existing?.recommendations ?? [],
    provider: existing?.provider,
    model: existing?.model,
    metadata: existing?.metadata,
    lastFailure: {
      reason,
      message: message ?? null,
      rawPreview: rawPreview ?? null,
      occurredAt: now
    },
    updatedAt: existing?.updatedAt ?? now
  });

  await firestore.saveDocument(
    CHANNEL_RECOMMENDATION_COLLECTION,
    jobId,
    payload
  );
  logger.warn(
    { jobId, reason },
    "Persisted channel recommendation failure"
  );
  return payload;
}

async function loadHeroImageDocument(firestore, jobId) {
  const existing = await firestore.getDocument(HERO_IMAGE_COLLECTION, jobId);
  if (!existing) return null;
  const parsed = JobHeroImageSchema.safeParse(existing);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

async function upsertHeroImageDocument({
  firestore,
  jobId,
  ownerUserId,
  patch,
  now = new Date()
}) {
  const existing = await loadHeroImageDocument(firestore, jobId);
  const payload = JobHeroImageSchema.parse({
    id: jobId,
    jobId,
    ownerUserId,
    status: existing?.status ?? "PENDING",
    prompt: existing?.prompt ?? null,
    promptProvider: existing?.promptProvider ?? null,
    promptModel: existing?.promptModel ?? null,
    promptMetadata: existing?.promptMetadata,
    imageUrl: existing?.imageUrl ?? null,
    imageBase64: existing?.imageBase64 ?? null,
    imageProvider: existing?.imageProvider ?? null,
    imageModel: existing?.imageModel ?? null,
    imageMetadata: existing?.imageMetadata,
    failure: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...patch
  });
  await firestore.saveDocument(HERO_IMAGE_COLLECTION, jobId, payload);
  return payload;
}

async function persistHeroImageFailure({
  firestore,
  jobId,
  ownerUserId,
  reason,
  message,
  rawPreview,
  now = new Date()
}) {
  return upsertHeroImageDocument({
    firestore,
    jobId,
    ownerUserId,
    now,
    patch: {
      status: "FAILED",
      failure: {
        reason,
        message: message ?? null,
        rawPreview: rawPreview ?? null,
        occurredAt: now
      }
    }
  });
}

function serializeHeroImage(document) {
  if (!document) {
    return null;
  }
  return {
    jobId: document.jobId,
    status: document.status,
    prompt: document.prompt,
    promptProvider: document.promptProvider,
    promptModel: document.promptModel,
    imageUrl: document.imageUrl,
    imageBase64: document.imageBase64,
    imageMimeType: document.imageMimeType ?? null,
    imageProvider: document.imageProvider,
    imageModel: document.imageModel,
    failure: document.failure ?? null,
    updatedAt: document.updatedAt,
    metadata: document.imageMetadata ?? null
  };
}

function buildJobSnapshot(job) {
  return ALLOWED_INTAKE_KEYS.reduce((acc, key) => {
    acc[key] = job?.[key];
    return acc;
  }, {});
}

function buildPlanKey(channelId, formatId) {
  return `${channelId}:${formatId}`;
}

function buildAssetId(jobId, channelId, formatId) {
  return `${jobId}:${buildPlanKey(channelId, formatId)}`;
}

function serializeJobAsset(record) {
  if (!record) return null;
  return {
    id: record.id,
    jobId: record.jobId,
    channelId: record.channelId,
    formatId: record.formatId,
    artifactType: record.artifactType,
    status: record.status,
    provider: record.provider ?? null,
    model: record.model ?? null,
    llmRationale: record.llmRationale ?? null,
    content: record.content ?? null,
    failure: record.failure ?? null,
    updatedAt: record.updatedAt ?? record.createdAt ?? null
  };
}

function serializeAssetRun(run) {
  if (!run) return null;
  return {
    id: run.id,
    jobId: run.jobId,
    status: run.status,
    channelIds: run.channelIds ?? [],
    formatIds: run.formatIds ?? [],
    stats: run.stats ?? null,
    startedAt: run.startedAt ?? null,
    completedAt: run.completedAt ?? null,
    error: run.error ?? null
  };
}

function normalizeJobAsset(raw) {
  const parsed = JobAssetRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function normalizeJobAssetRun(raw) {
  const parsed = JobAssetRunSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

async function loadJobAssets(firestore, jobId) {
  const docs = await firestore.queryDocuments(
    JOB_ASSET_COLLECTION,
    "jobId",
    "==",
    jobId
  );
  return docs.map(normalizeJobAsset).filter(Boolean);
}

async function loadLatestAssetRun(firestore, jobId) {
  const runs = await firestore.queryDocuments(
    JOB_ASSET_RUN_COLLECTION,
    "jobId",
    "==",
    jobId
  );
  const parsed = runs.map(normalizeJobAssetRun).filter(Boolean);
  parsed.sort(
    (a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  return parsed[0] ?? null;
}

async function persistAssetRecord({ firestore, record }) {
  const payload = JobAssetRecordSchema.parse(record);
  await firestore.saveDocument(JOB_ASSET_COLLECTION, payload.id, payload);
  return payload;
}

async function persistAssetRun({ firestore, run }) {
  const payload = JobAssetRunSchema.parse(run);
  await firestore.saveDocument(JOB_ASSET_RUN_COLLECTION, payload.id, payload);
  return payload;
}

function incrementRunStats(stats, metadata, succeeded) {
  if (!stats) return stats;
  if (succeeded) {
    stats.assetsCompleted = (stats.assetsCompleted ?? 0) + 1;
  }
  if (metadata) {
    const promptTokens = Number(metadata.promptTokens ?? metadata.prompt_tokens);
    const responseTokens = Number(
      metadata.responseTokens ?? metadata.response_tokens
    );
    if (!Number.isNaN(promptTokens)) {
      stats.promptTokens = (stats.promptTokens ?? 0) + promptTokens;
    }
    if (!Number.isNaN(responseTokens)) {
      stats.responseTokens = (stats.responseTokens ?? 0) + responseTokens;
    }
  }
  return stats;
}

function createAssetRecordsFromPlan({
  jobId,
  ownerUserId,
  plan,
  sourceJobVersion,
  now
}) {
  const records = new Map();
  plan.items.forEach((item) => {
    const record = {
      id: buildAssetId(jobId, item.channelId, item.formatId),
      jobId,
      ownerUserId,
      channelId: item.channelId,
      formatId: item.formatId,
      artifactType: item.artifactType,
      blueprintVersion: plan.version,
      status: ASSET_STATUS.PENDING,
      planId: item.planId,
      batchKey: item.batchKey,
      requiresMaster: item.requiresMaster,
      derivedFromAssetId: item.derivedFromFormatId
        ? buildAssetId(jobId, item.channelId, item.derivedFromFormatId)
        : null,
      derivedFromFormatId: item.derivedFromFormatId ?? null,
      sourceJobVersion,
      createdAt: now,
      updatedAt: now
    };
    records.set(item.planId, record);
  });
  return records;
}

function normalizeFinalJobPayload(finalJob = {}) {
  const normalized = { ...finalJob };
  ENUM_FIELD_KEYS.forEach((key) => {
    if (normalized[key] === "") {
      delete normalized[key];
    }
  });
  if (typeof normalized.logoUrl === "string") {
    const trimmed = normalized.logoUrl.trim();
    if (trimmed.length === 0) {
      delete normalized.logoUrl;
    } else {
      normalized.logoUrl = trimmed;
    }
  }
  return normalized;
}

function buildChannelMetaMap(channelMeta = []) {
  const map = {};
  channelMeta.forEach((meta) => {
    if (!meta?.id) return;
    map[meta.id] = meta;
  });
  return map;
}

function buildMasterContext(record) {
  if (!record) return null;
  return {
    plan_id: record.planId ?? buildPlanKey(record.channelId, record.formatId),
    rationale: record.llmRationale ?? null,
    content: record.content ?? {}
  };
}

async function runAssetGenerationPipeline({
  firestore,
  llmClient,
  plan,
  assetRecords,
  jobSnapshot,
  channelMetaMap,
  logger,
  trackUsage,
  usageContext
}) {
  const stats = {
    assetsPlanned: plan.items.length,
    assetsCompleted: 0,
    promptTokens: 0,
    responseTokens: 0
  };
  let hasFailures = false;
  const baseUsage = {
    userId: usageContext?.userId ?? null,
    jobId: usageContext?.jobId ?? null
  };
  const logUsage = async (result, taskType) => {
    if (typeof trackUsage !== "function" || !result) {
      return;
    }
    await trackUsage(result, { ...baseUsage, taskType });
  };

  const markFailure = async (
    record,
    reason,
    message,
    rawPreview,
    metadata
  ) => {
    const now = new Date();
    record.status = ASSET_STATUS.FAILED;
    record.failure = {
      reason: reason ?? "asset_generation_failed",
      message: message ?? null,
      rawPreview: rawPreview ?? null,
      occurredAt: now
    };
    record.updatedAt = now;
    incrementRunStats(stats, metadata, false);
    await persistAssetRecord({ firestore, record });
    hasFailures = true;
  };

  const markSuccess = async (
    record,
    assetPayload,
    provider,
    model,
    metadata
  ) => {
    const now = new Date();
    record.status = ASSET_STATUS.READY;
    record.provider = provider ?? null;
    record.model = model ?? null;
    record.llmRationale = assetPayload?.rationale ?? null;
    record.content = assetPayload?.content ?? null;
    record.failure = undefined;
    record.updatedAt = now;
    incrementRunStats(stats, metadata, true);
    await persistAssetRecord({ firestore, record });
  };

  const markGenerating = async (record) => {
    if (!record) return;
    record.status = ASSET_STATUS.GENERATING;
    record.updatedAt = new Date();
    await persistAssetRecord({ firestore, record });
  };

  const masters = plan.masters ?? [];
  for (const item of masters) {
    const record = assetRecords.get(item.planId);
    if (!record) {
      continue;
    }
    await markGenerating(record);
    const result = await llmClient.askAssetMaster({
      planItem: item,
      channelMeta: channelMetaMap[item.channelId],
      jobSnapshot
    });
    await logUsage(result, "asset_master");
    if (result?.asset) {
      await markSuccess(
        record,
        result.asset,
        result.provider,
        result.model,
        result.metadata
      );
    } else {
      const error = result?.error ?? {};
      await markFailure(
        record,
        error.reason ?? "asset_master_failed",
        error.message ?? null,
        error.rawPreview ?? null,
        result?.metadata
      );
    }
  }

  const standalone = plan.standalone ?? [];
  const standaloneByChannel = new Map();
  standalone.forEach((item) => {
    const list = standaloneByChannel.get(item.channelId) ?? [];
    list.push(item);
    standaloneByChannel.set(item.channelId, list);
  });

  for (const [channelId, items] of standaloneByChannel.entries()) {
    const records = items
      .map((item) => assetRecords.get(item.planId))
      .filter(Boolean);
    for (const record of records) {
      await markGenerating(record);
    }

    const result = await llmClient.askAssetChannelBatch({
      planItems: items,
      jobSnapshot,
      channelMetaMap
    });
    await logUsage(result, "asset_channel_batch");

    if (result?.error) {
      for (const record of records) {
        await markFailure(
          record,
          result.error.reason ?? "asset_channel_batch_failed",
          result.error.message ?? null,
          result.error.rawPreview ?? null,
          result.metadata
        );
      }
      continue;
    }

    const assetMap = new Map();
    (result.assets ?? []).forEach((asset) => {
      const planId = asset.planId ?? asset.plan_id ?? null;
      if (!planId) return;
      assetMap.set(planId, asset);
    });

    for (const item of items) {
      const record = assetRecords.get(item.planId);
      if (!record) continue;
      const assetPayload = assetMap.get(item.planId);
      if (!assetPayload) {
        await markFailure(
          record,
          "asset_missing",
          `LLM batch missing payload for ${item.planId}`,
          null,
          result.metadata
        );
        continue;
      }
      await markSuccess(
        record,
        assetPayload,
        result.provider,
        result.model,
        result.metadata
      );
    }
  }

  const adaptations = plan.adaptations ?? [];
  for (const item of adaptations) {
    const record = assetRecords.get(item.planId);
    if (!record) continue;
    const masterPlanId = buildPlanKey(item.channelId, item.derivedFromFormatId);
    const masterRecord = assetRecords.get(masterPlanId);
    if (!masterRecord || masterRecord.status !== ASSET_STATUS.READY) {
      await markFailure(
        record,
        "missing_master_asset",
        "Master asset missing or not ready",
        null,
        null
      );
      continue;
    }
    await markGenerating(record);
    const result = await llmClient.askAssetAdapt({
      planItem: item,
      masterAsset: buildMasterContext(masterRecord),
      jobSnapshot,
      channelMeta: channelMetaMap[item.channelId]
    });
    await logUsage(result, "asset_adapt");
    if (result?.asset) {
      await markSuccess(
        record,
        result.asset,
        result.provider,
        result.model,
        result.metadata
      );
    } else {
      const error = result?.error ?? {};
      await markFailure(
        record,
        error.reason ?? "asset_adapt_failed",
        error.message ?? null,
        error.rawPreview ?? null,
        result?.metadata
      );
    }
  }

  return {
    stats,
    hasFailures,
    records: Array.from(assetRecords.values())
  };
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
export function wizardRouter({ firestore, logger, llmClient }) {
  const router = Router();
  const trackLlmUsage = (result, usageContext, options = {}) =>
    recordLlmUsageFromResult({
      firestore,
      logger,
      usageContext,
      result,
      usageType: options.usageType,
      usageMetrics: options.usageMetrics
    });

  router.post(
    "/import-company-job",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = importCompanyJobRequestSchema.parse(req.body ?? {});
      const userProfile = req.user?.profile ?? {};
      const allowedCompanyIds = new Set(
        Array.isArray(userProfile.companyIds)
          ? userProfile.companyIds.filter(
              (value) => typeof value === "string" && value.trim().length > 0
            )
          : []
      );
      const normalizedMainCompanyId =
        typeof userProfile.mainCompanyId === "string" && userProfile.mainCompanyId.trim().length > 0
          ? userProfile.mainCompanyId.trim()
          : null;
      if (normalizedMainCompanyId) {
        allowedCompanyIds.add(normalizedMainCompanyId);
      }
      const requestedCompanyId =
        typeof payload.companyId === "string" && payload.companyId.trim().length > 0
          ? payload.companyId.trim()
          : null;
      const resolvedCompanyId = requestedCompanyId ?? normalizedMainCompanyId ?? null;
      if (!resolvedCompanyId) {
        throw httpError(400, "Company identifier required to import a job");
      }
      let hasCompanyAccess = allowedCompanyIds.has(resolvedCompanyId);
      if (!hasCompanyAccess) {
        try {
          const accessibleCompanies = await listCompaniesForUser({
            firestore,
            user: req.user,
            logger
          });
          hasCompanyAccess = accessibleCompanies.some(
            (company) => company.id === resolvedCompanyId
          );
        } catch (error) {
          logger?.warn?.(
            { userId, companyId: resolvedCompanyId, err: error },
            "Failed to cross-check company access; defaulting to denial"
          );
          hasCompanyAccess = false;
        }
      }
      if (!hasCompanyAccess) {
        throw httpError(403, "You do not have access to this company");
      }

      const companyRecord = await firestore.getDocument("companies", resolvedCompanyId);
      if (!companyRecord) {
        throw httpError(404, "Company not found");
      }
      const company = CompanySchema.parse(companyRecord);

      const companyJobRecord = await firestore.getDocument("companyJobs", payload.companyJobId);
      if (!companyJobRecord) {
        throw httpError(404, "Discovered job not found");
      }
      const companyJob = CompanyDiscoveredJobSchema.parse(companyJobRecord);
      if (companyJob.companyId !== company.id) {
        throw httpError(403, "Job does not belong to the selected company");
      }
      if (companyJob.isActive === false) {
        throw httpError(409, "This job is no longer marked as active");
      }

      const now = new Date();
      const jobId = `job_${uuid()}`;
      const baseJob = createBaseJob({
        jobId,
        userId,
        companyId: company.id,
        now
      });

      const importedState = buildImportedJobState({
        company,
        companyJob
      });
      const mergedJob = mergeIntakeIntoJob(baseJob, importedState, { userId, now });
      const progress = computeRequiredProgress(mergedJob);
      const jobWithProgress = applyRequiredProgress(mergedJob, progress, now);
      jobWithProgress.companyId = company.id;
      jobWithProgress.importContext = {
        source: "external_import",
        externalSource: companyJob.source ?? null,
        externalUrl: companyJob.url ?? null,
        companyJobId: companyJob.id,
        importedAt: now
      };
      const validatedJob = JobSchema.parse(jobWithProgress);
      const savedJob = await firestore.saveDocument(JOB_COLLECTION, jobId, validatedJob);

      const responseState = ALLOWED_INTAKE_KEYS.reduce((acc, key) => {
        acc[key] = savedJob[key];
        return acc;
      }, {});

      logger.info(
        { jobId, companyId: company.id, companyJobId: companyJob.id },
        "Imported discovered job into wizard draft"
      );

      res.status(201).json({
        jobId,
        state: responseState,
        includeOptional: Boolean(savedJob.stateMachine?.optionalComplete),
        updatedAt: savedJob.updatedAt ?? savedJob.createdAt ?? now,
        status: savedJob.status ?? null,
        companyId: savedJob.companyId ?? null,
        importContext: savedJob.importContext ?? null
      });
    })
  );

  router.post(
    "/draft",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = draftRequestSchema.parse(req.body ?? {});
      const userProfile = req.user?.profile ?? {};
      const normalizedMainCompanyId =
        typeof userProfile.mainCompanyId === "string" && userProfile.mainCompanyId.trim().length > 0
          ? userProfile.mainCompanyId.trim()
          : null;
      const allowedCompanySet = new Set(
        Array.isArray(userProfile.companyIds)
          ? userProfile.companyIds.filter((value) => typeof value === "string" && value.trim().length > 0)
          : []
      );
      if (normalizedMainCompanyId) {
        allowedCompanySet.add(normalizedMainCompanyId);
      }
      const requestedCompanyId =
        typeof payload.companyId === "string" && payload.companyId.trim().length > 0
          ? payload.companyId.trim()
          : null;
      const selectedCompanyId =
        requestedCompanyId && allowedCompanySet.has(requestedCompanyId) ? requestedCompanyId : null;

      const jobId = payload.jobId ?? `job_${uuid()}`;
      const now = new Date();
      const existing = await firestore.getDocument(JOB_COLLECTION, jobId);

      let baseJob;
      if (existing) {
        const parsed = JobSchema.safeParse(existing);
        if (parsed.success) {
          baseJob = parsed.data;
        } else {
          logger.warn(
            { jobId, issues: parsed.error.issues },
            "Existing job failed schema validation; reinitialising base job"
          );
          baseJob = createBaseJob({
            jobId,
            userId: existing.ownerUserId ?? userId,
            companyId: selectedCompanyId ?? normalizedMainCompanyId ?? null,
            now
          });
        }
        if (!baseJob.companyId) {
          baseJob = {
            ...baseJob,
            companyId: selectedCompanyId ?? normalizedMainCompanyId ?? null
          };
        }
      } else {
        baseJob = createBaseJob({
          jobId,
          userId,
          companyId: selectedCompanyId ?? normalizedMainCompanyId ?? null,
          now
        });
      }

      const mergedJob = mergeIntakeIntoJob(baseJob, payload.state ?? {}, { userId, now });
      const progress = computeRequiredProgress(mergedJob);
      const jobWithProgress = applyRequiredProgress(mergedJob, progress, now);
      if (!jobWithProgress.companyId && (selectedCompanyId || normalizedMainCompanyId)) {
        jobWithProgress.companyId = selectedCompanyId ?? normalizedMainCompanyId ?? null;
      }
      const validatedJob = JobSchema.parse(jobWithProgress);

      const savedJob = await firestore.saveDocument(JOB_COLLECTION, jobId, validatedJob);

      logger.info(
        {
          jobId,
          userId,
          step: payload.currentStepId,
          state: savedJob.stateMachine?.currentState
        },
        "Job persisted"
      );

      res.json({
        jobId,
        status: savedJob.status,
        state: savedJob.stateMachine?.currentState ?? "DRAFT",
        companyId: savedJob.companyId ?? null
      });
    })
  );

  router.post(
    "/suggestions",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = suggestionsRequestSchema.parse(req.body ?? {});

      const job = await firestore.getDocument(JOB_COLLECTION, payload.jobId);
      if (!job) {
        throw httpError(404, "Job not found");
      }

      const parsedJob = JobSchema.parse(job);
      const now = new Date();
      const mergedJob = mergeIntakeIntoJob(parsedJob, payload.state ?? {}, { userId, now });
      const progress = computeRequiredProgress(mergedJob);

      if (!progress.allComplete) {
        logger.info(
          { jobId: payload.jobId, currentStepId: payload.currentStepId },
          "Suggestions requested before required intake completed"
        );
        return res.json({
          jobId: payload.jobId,
          suggestions: [],
          updatedAt: null,
          refreshed: false,
          failure: null
        });
      }

      const visibleFieldIds =
        Array.isArray(payload.visibleFieldIds) && payload.visibleFieldIds.length > 0
          ? payload.visibleFieldIds
          : Array.isArray(payload.emptyFieldIds) && payload.emptyFieldIds.length > 0
          ? payload.emptyFieldIds
          : [];

      let suggestionDoc = await loadSuggestionDocument(firestore, payload.jobId);
      const shouldRefresh =
        !suggestionDoc ||
        payload.intent?.forceRefresh === true ||
        (payload.updatedFieldId && payload.updatedFieldValue !== undefined);

      let refreshed = false;

      if (shouldRefresh && llmClient?.askSuggestions) {
        const llmPayload = {
          updatedFieldId: payload.updatedFieldId,
          updatedFieldValue: payload.updatedFieldValue,
          previousSuggestions: suggestionDoc?.candidates ?? {},
          visibleFieldIds,
          jobSnapshot: ALLOWED_INTAKE_KEYS.reduce((acc, key) => {
            acc[key] = mergedJob[key];
            return acc;
          }, {})
        };

        const llmResult = await llmClient.askSuggestions(llmPayload);
        await trackLlmUsage(llmResult, {
          userId,
          jobId: payload.jobId,
          taskType: "wizard_suggestions"
        });
        if (llmResult?.candidates?.length > 0) {
          suggestionDoc = await overwriteSuggestionDocument({
            firestore,
            logger,
            jobId: payload.jobId,
            candidates: llmResult.candidates,
            provider: llmResult.provider,
            model: llmResult.model,
            metadata: llmResult.metadata,
            now
          });
          refreshed = true;
        } else if (llmResult?.error) {
          suggestionDoc = await persistSuggestionFailure({
            firestore,
            logger,
            jobId: payload.jobId,
            reason: llmResult.error.reason ?? "unknown_error",
            rawPreview: llmResult.error.rawPreview ?? null,
            error: llmResult.error.message ?? null,
            now
          });
          refreshed = true;
        } else {
          suggestionDoc = await persistSuggestionFailure({
            firestore,
            logger,
            jobId: payload.jobId,
            reason: "no_suggestions",
            rawPreview: null,
            error: "LLM returned no candidates",
            now
          });
          refreshed = true;
        }
      }

      const suggestions = selectSuggestionsForFields(
        suggestionDoc?.candidates ?? {},
        visibleFieldIds
      );

      res.json({
        jobId: payload.jobId,
        suggestions,
        updatedAt: suggestionDoc?.updatedAt ?? null,
        refreshed,
        failure: suggestionDoc?.lastFailure ?? null
      });
    })
  );

  router.post(
    "/suggestions/merge",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = mergeRequestSchema.parse(req.body ?? {});

      const job = await firestore.getDocument(JOB_COLLECTION, payload.jobId);
      if (!job) {
        throw httpError(404, "Job not found");
      }

      const parsedJob = JobSchema.parse(job);
      const now = new Date();
      const nextJob = deepClone(parsedJob);

      setDeep(nextJob, payload.fieldId, payload.value);
      nextJob.updatedAt = now;

      const progress = computeRequiredProgress(nextJob);
      const jobWithProgress = applyRequiredProgress(nextJob, progress, now);
      const validatedJob = JobSchema.parse(jobWithProgress);

      await firestore.saveDocument(JOB_COLLECTION, payload.jobId, validatedJob);
      await acknowledgeSuggestionField({
        firestore,
        jobId: payload.jobId,
        fieldId: payload.fieldId,
        logger,
        now
      });

      res.json({ status: "ok" });
    })
  );

  router.post(
    "/refine",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = refinementRequestSchema.parse(req.body ?? {});

      const job = await firestore.getDocument(JOB_COLLECTION, payload.jobId);
      if (!job) {
        throw httpError(404, "Job not found");
      }

      const parsedJob = JobSchema.parse(job);
      if (!parsedJob.stateMachine?.requiredComplete) {
        throw httpError(
          409,
          "Complete required questions before running refinement."
        );
      }

      const now = new Date();
      const jobSnapshot = buildJobSnapshot(parsedJob);

      let refinementDoc = await loadRefinementDocument(
        firestore,
        payload.jobId
      );

      let refreshed = false;

      if (
        payload.forceRefresh === true ||
        !refinementDoc ||
        refinementDoc.lastFailure
      ) {
        const llmResult = await llmClient.askRefineJob({
          jobSnapshot,
          confirmed: parsedJob.confirmed ?? {},
        });
        await trackLlmUsage(llmResult, {
          userId,
          jobId: payload.jobId,
          taskType: "job_refinement"
        });

        if (llmResult?.refinedJob) {
          refinementDoc = await overwriteRefinementDocument({
            firestore,
            logger,
            jobId: payload.jobId,
            refinedJob: llmResult.refinedJob,
            summary: llmResult.summary ?? null,
            provider: llmResult.provider,
            model: llmResult.model,
            metadata: llmResult.metadata,
            now
          });
          refreshed = true;
        } else if (llmResult?.error) {
          refinementDoc = await persistRefinementFailure({
            firestore,
            logger,
            jobId: payload.jobId,
            reason: llmResult.error.reason ?? "unknown_error",
            message: llmResult.error.message ?? null,
            rawPreview: llmResult.error.rawPreview ?? null,
            now
          });
          refreshed = true;
        }
      }

      if (!refinementDoc) {
        throw httpError(500, "Failed to load job refinement");
      }

      res.json({
        jobId: payload.jobId,
        refinedJob: refinementDoc.refinedJob ?? {},
        summary: refinementDoc.summary ?? null,
        provider: refinementDoc.provider ?? null,
        model: refinementDoc.model ?? null,
        updatedAt: refinementDoc.updatedAt ?? null,
        refreshed,
        failure: refinementDoc.lastFailure ?? null,
        originalJob: jobSnapshot
      });
    })
  );

  router.post(
    "/refine/finalize",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = finalizeRequestSchema.parse(req.body ?? {});

      const job = await firestore.getDocument(JOB_COLLECTION, payload.jobId);
      if (!job) {
        throw httpError(404, "Job not found");
      }

      const parsedJob = JobSchema.parse(job);
      const now = new Date();
      const finalJob = normalizeFinalJobPayload(payload.finalJob);
      const source = payload.source ?? "refined";

      const progressCheck = computeRequiredProgress(finalJob);
      if (!progressCheck.allComplete) {
        throw httpError(
          422,
          "Final job must include all required fields before publishing."
        );
      }

      const nextJob = deepClone(parsedJob);
      for (const fieldId of ALLOWED_INTAKE_KEYS) {
        const value = finalJob[fieldId];
        if (value === undefined) {
          setDeep(nextJob, fieldId, undefined);
        } else {
          setDeep(nextJob, fieldId, value);
        }
      }
      nextJob.confirmed = {
        ...(nextJob.confirmed ?? {}),
        ...finalJob
      };
      nextJob.updatedAt = now;

      const finalProgress = computeRequiredProgress(nextJob);
      const jobWithProgress = applyRequiredProgress(nextJob, finalProgress, now);
      const validatedJob = JobSchema.parse(jobWithProgress);
      await firestore.saveDocument(JOB_COLLECTION, payload.jobId, validatedJob);

      await overwriteFinalJobDocument({
        firestore,
        logger,
        jobId: payload.jobId,
        finalJob,
        source,
        now
      });

      const channelResult = await llmClient.askChannelRecommendations({
        jobSnapshot: buildJobSnapshot(validatedJob),
        confirmed: validatedJob.confirmed ?? finalJob,
        supportedChannels: SUPPORTED_CHANNELS,
        existingChannels: Array.isArray(validatedJob.campaigns)
          ? validatedJob.campaigns
              .map((campaign) => campaign?.channel)
              .filter((channel) => typeof channel === "string")
          : []
      });
      await trackLlmUsage(channelResult, {
        userId,
        jobId: payload.jobId,
        taskType: "channel_recommendations"
      });

      let channelDoc = null;

      if (channelResult?.recommendations?.length > 0) {
        channelDoc = await overwriteChannelRecommendationDocument({
          firestore,
          logger,
          jobId: payload.jobId,
          recommendations: channelResult.recommendations,
          provider: channelResult.provider,
          model: channelResult.model,
          metadata: channelResult.metadata,
          now
        });
      } else if (channelResult?.error) {
        channelDoc = await persistChannelRecommendationFailure({
          firestore,
          logger,
          jobId: payload.jobId,
          reason: channelResult.error.reason ?? "unknown_error",
          message: channelResult.error.message ?? null,
          rawPreview: channelResult.error.rawPreview ?? null,
          now
        });
      } else {
        channelDoc = await persistChannelRecommendationFailure({
          firestore,
          logger,
          jobId: payload.jobId,
          reason: "no_recommendations",
          message: "LLM returned no channel recommendations",
          rawPreview: null,
          now
        });
      }

      res.json({
        jobId: payload.jobId,
        finalJob,
        source,
        channelRecommendations: channelDoc?.recommendations ?? [],
        channelUpdatedAt: channelDoc?.updatedAt ?? null,
        channelFailure: channelDoc?.lastFailure ?? null
      });
    })
  );

  router.post(
    "/assets/generate",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = assetGenerationRequestSchema.parse(req.body ?? {});

      const job = await firestore.getDocument(JOB_COLLECTION, payload.jobId);
      if (!job) {
        throw httpError(404, "Job not found");
      }
      if (job.ownerUserId && job.ownerUserId !== userId) {
        throw httpError(403, "You do not have access to this job");
      }

      const finalJob = await loadFinalJobDocument(firestore, payload.jobId);
      if (!finalJob?.job) {
        throw httpError(
          409,
          "Finalize the job before generating assets."
        );
      }

      const channelIds = Array.from(new Set(payload.channelIds));
      const plan = createAssetPlan({ channelIds });
      if (!plan.items || plan.items.length === 0) {
        throw httpError(
          400,
          "No asset formats available for the selected channels."
        );
      }

      const now = new Date();
      const sourceJobVersion = payload.source ?? finalJob.source ?? "refined";
      const jobSnapshot = finalJob.job ?? buildJobSnapshot(job);
      const assetRecords = createAssetRecordsFromPlan({
        jobId: payload.jobId,
        ownerUserId: job.ownerUserId ?? userId,
        plan,
        sourceJobVersion,
        now
      });

      for (const record of assetRecords.values()) {
        await persistAssetRecord({ firestore, record });
      }

      let run = {
        id: `run_${uuid()}`,
        jobId: payload.jobId,
        ownerUserId: job.ownerUserId ?? userId,
        blueprintVersion: plan.version,
        channelIds,
        formatIds: plan.items.map((item) => item.formatId),
        status: RUN_STATUS.RUNNING,
        stats: {
          assetsPlanned: plan.items.length,
          assetsCompleted: 0,
          promptTokens: 0,
          responseTokens: 0
        },
        startedAt: now,
        completedAt: null
      };

      run = await persistAssetRun({ firestore, run });

      try {
        const { stats, hasFailures, records } =
          await runAssetGenerationPipeline({
            firestore,
            llmClient,
            plan,
            assetRecords,
            jobSnapshot,
            channelMetaMap: buildChannelMetaMap(plan.channelMeta),
            logger,
            usageContext: { userId, jobId: payload.jobId },
            trackUsage: trackLlmUsage
          });

        run.stats = stats;
        run.status = hasFailures
          ? RUN_STATUS.FAILED
          : RUN_STATUS.COMPLETED;
        run.completedAt = new Date();
        if (!hasFailures) {
          run.error = undefined;
        } else {
          run.error = {
            reason: "partial_failure",
            message: "One or more assets failed to generate"
          };
        }
        run = await persistAssetRun({ firestore, run });

        res.json({
          jobId: payload.jobId,
          run: serializeAssetRun(run),
          assets: records.map(serializeJobAsset)
        });
      } catch (error) {
        logger.error(
          { err: error, jobId: payload.jobId },
          "Asset generation pipeline crashed"
        );
        run.status = RUN_STATUS.FAILED;
        run.completedAt = new Date();
        run.error = {
          reason: "asset_pipeline_failed",
          message: error?.message ?? "Asset pipeline failed"
        };
        await persistAssetRun({ firestore, run });
        throw httpError(500, "Asset generation failed");
      }
    })
  );

  router.get(
    "/assets",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const jobIdRaw = Array.isArray(req.query.jobId)
        ? req.query.jobId[0]
        : req.query.jobId;
      if (!jobIdRaw || typeof jobIdRaw !== "string") {
        throw httpError(400, "jobId query parameter required");
      }
      const payload = assetStatusRequestSchema.parse({
        jobId: jobIdRaw
      });

      const job = await firestore.getDocument(JOB_COLLECTION, payload.jobId);
      if (!job) {
        throw httpError(404, "Job not found");
      }
      if (job.ownerUserId && job.ownerUserId !== userId) {
        throw httpError(403, "You do not have access to this job");
      }

      const [assets, run] = await Promise.all([
        loadJobAssets(firestore, payload.jobId),
        loadLatestAssetRun(firestore, payload.jobId)
      ]);

      res.json({
        jobId: payload.jobId,
        assets: assets.map(serializeJobAsset),
        run: serializeAssetRun(run)
      });
    })
  );

  router.post(
    "/channels/recommendations",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const payload = channelRecommendationRequestSchema.parse(req.body ?? {});

      const job = await firestore.getDocument(JOB_COLLECTION, payload.jobId);
      if (!job) {
        throw httpError(404, "Job not found");
      }

      const parsedJob = JobSchema.parse(job);
      if (!parsedJob.stateMachine?.requiredComplete) {
        throw httpError(
          409,
          "Complete all required questions before generating channels."
        );
      }

      const now = new Date();
      let doc = await loadChannelRecommendationDocument(
        firestore,
        payload.jobId
      );

      const shouldRefresh =
        !doc || payload.forceRefresh === true;

      let refreshed = false;

      if (shouldRefresh && llmClient?.askChannelRecommendations) {
        const llmResult = await llmClient.askChannelRecommendations({
          jobSnapshot: buildJobSnapshot(parsedJob),
          confirmed: parsedJob.confirmed ?? {},
          supportedChannels: SUPPORTED_CHANNELS,
          existingChannels: Array.isArray(parsedJob.campaigns)
            ? parsedJob.campaigns
                .map((campaign) => campaign?.channel)
                .filter((channel) => typeof channel === "string")
            : []
        });
        await trackLlmUsage(llmResult, {
          userId,
          jobId: payload.jobId,
          taskType: "channel_recommendations"
        });

        if (llmResult?.recommendations?.length > 0) {
          doc = await overwriteChannelRecommendationDocument({
            firestore,
            logger,
            jobId: payload.jobId,
            recommendations: llmResult.recommendations,
            provider: llmResult.provider,
            model: llmResult.model,
            metadata: llmResult.metadata,
            now
          });
          refreshed = true;
        } else if (llmResult?.error) {
          doc = await persistChannelRecommendationFailure({
            firestore,
            logger,
            jobId: payload.jobId,
            reason: llmResult.error.reason ?? "unknown_error",
            message: llmResult.error.message ?? null,
            rawPreview: llmResult.error.rawPreview ?? null,
            now
          });
          refreshed = true;
        } else {
          doc = await persistChannelRecommendationFailure({
            firestore,
            logger,
            jobId: payload.jobId,
            reason: "no_recommendations",
            message: "LLM returned no channel recommendations",
            rawPreview: null,
            now
          });
          refreshed = true;
        }
      }

      const supportedSet = new Set(SUPPORTED_CHANNELS);
      const recommendations = (doc?.recommendations ?? []).filter((item) =>
        supportedSet.has(item.channel)
      );

      res.json({
        jobId: payload.jobId,
        recommendations,
        updatedAt: doc?.updatedAt ?? null,
        refreshed,
        failure: doc?.lastFailure ?? null
      });
    })
  );

  router.get(
    "/hero-image",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const jobIdRaw = Array.isArray(req.query.jobId)
        ? req.query.jobId[0]
        : req.query.jobId;
      if (!jobIdRaw || typeof jobIdRaw !== "string") {
        throw httpError(400, "jobId query parameter required");
      }

      const job = await firestore.getDocument(JOB_COLLECTION, jobIdRaw);
      if (!job) {
        throw httpError(404, "Job not found");
      }
      if (job.ownerUserId && job.ownerUserId !== userId) {
        throw httpError(403, "You do not have access to this job");
      }

      const document = await loadHeroImageDocument(firestore, jobIdRaw);
      res.json({
        jobId: jobIdRaw,
        heroImage: serializeHeroImage(document)
      });
    })
  );

  router.post(
    "/hero-image",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      logger.info({ body: req.body }, "image request payload");
      const payload = heroImageRequestSchema.parse(req.body ?? {});

      try {
        const job = await firestore.getDocument(JOB_COLLECTION, payload.jobId);
        if (!job) {
          throw httpError(404, "Job not found");
        }
        if (job.ownerUserId && job.ownerUserId !== userId) {
          throw httpError(403, "You do not have access to this job");
        }

        const existing = await loadHeroImageDocument(firestore, payload.jobId);
        if (
          existing &&
          !payload.forceRefresh &&
          (existing.status === "READY" ||
            existing.status === "PROMPTING" ||
            existing.status === "GENERATING")
        ) {
          res.json({
            jobId: payload.jobId,
            heroImage: serializeHeroImage(existing)
          });
          return;
        }

        const now = new Date();
        const finalJob = await loadFinalJobDocument(firestore, payload.jobId);
        const refinement =
          (await loadRefinementDocument(firestore, payload.jobId)) ?? null;
        const refinedSnapshot =
          finalJob?.job ?? refinement?.refinedJob ?? buildJobSnapshot(job);

        const ownerId = job.ownerUserId ?? userId;

        logger.info(
          { jobId: payload.jobId, userId },
          "image generation requested"
        );

        let document = await upsertHeroImageDocument({
          firestore,
          jobId: payload.jobId,
          ownerUserId: ownerId,
          now,
          patch: {
            status: "PROMPTING",
            imageBase64: null,
            imageUrl: null,
            failure: null
          }
        });
        logger.info(
          {
            jobId: payload.jobId,
            heroStatus: document.status
          },
          "image status set to PROMPTING"
        );

        let promptResult;
        let imageResult;

        try {
          promptResult = await llmClient.askHeroImagePrompt({
            refinedJob: refinedSnapshot
          });
          await trackLlmUsage(promptResult, {
            userId,
            jobId: payload.jobId,
            taskType: "image_prompt_generation"
          });

          if (promptResult.error) {
            await persistHeroImageFailure({
              firestore,
              jobId: payload.jobId,
              ownerUserId: ownerId,
              reason: promptResult.error.reason ?? "prompt_failed",
              message: promptResult.error.message,
              rawPreview: promptResult.error.rawPreview ?? null,
              now: new Date()
            });
            logger.error(
              {
                jobId: payload.jobId,
                reason: promptResult.error.reason,
                message: promptResult.error.message
              },
              "image prompt generation failed"
            );
            throw httpError(
              500,
              promptResult.error.message ?? "Image prompt generation failed"
            );
          }

          logger.info(
            {
              jobId: payload.jobId,
              provider: promptResult.provider,
              model: promptResult.model
            },
            "image prompt generated"
          );

          document = await upsertHeroImageDocument({
            firestore,
            jobId: payload.jobId,
            ownerUserId: ownerId,
            patch: {
              status: "GENERATING",
              prompt: promptResult.prompt,
              promptProvider: promptResult.provider ?? null,
              promptModel: promptResult.model ?? null,
              promptMetadata: promptResult.metadata ?? null
            }
          });
          logger.info(
            {
              jobId: payload.jobId,
              promptProvider: promptResult.provider,
              promptModel: promptResult.model
            },
            "image status set to GENERATING"
          );

          imageResult = await llmClient.runImageGeneration({
            prompt: promptResult.prompt,
            negativePrompt: promptResult.negativePrompt ?? undefined,
            style: promptResult.style ?? undefined
          });
          await trackLlmUsage(
            imageResult,
            {
              userId,
              jobId: payload.jobId,
              taskType: "image_generation"
            },
            {
              usageType: "image",
              usageMetrics: {
                units: 1
              }
            }
          );

          if (imageResult.error) {
            await persistHeroImageFailure({
              firestore,
              jobId: payload.jobId,
              ownerUserId: ownerId,
              reason: imageResult.error.reason ?? "generation_failed",
              message: imageResult.error.message,
              rawPreview: imageResult.error.rawPreview ?? null,
              now: new Date()
            });
            logger.error(
              {
                jobId: payload.jobId,
                reason: imageResult.error.reason,
                message: imageResult.error.message
              },
              "image generation failed"
            );
            throw httpError(
              500,
              imageResult.error.message ?? "Image generation failed"
            );
          }

          logger.info(
            {
              jobId: payload.jobId,
              provider: imageResult.provider,
              model: imageResult.model
            },
            "image generated successfully"
          );
        } catch (error) {
          logger.error(
            {
              jobId: payload.jobId,
              err: error
            },
            "image pipeline threw"
          );
          throw error;
        }

        const compression = await compressBase64Image(imageResult.imageBase64, {
          maxBytes: 900000
        });
        const storedBase64 = compression.base64;
        const storedMimeType = compression.mimeType ?? "image/png";
        const storedUrl = storedBase64 ? imageResult.imageUrl ?? null : imageResult.imageUrl ?? null;

        document = await upsertHeroImageDocument({
          firestore,
          jobId: payload.jobId,
          ownerUserId: ownerId,
          patch: {
            status: "READY",
            imageBase64: storedBase64,
            imageUrl: storedUrl,
            imageMimeType: storedBase64 ? storedMimeType : null,
            imageProvider: imageResult.provider ?? null,
            imageModel: imageResult.model ?? null,
            imageMetadata: imageResult.metadata ?? null
          }
        });
        logger.info(
          {
            jobId: payload.jobId,
            imageProvider: imageResult.provider,
            imageModel: imageResult.model
          },
          "image status set to READY"
        );

        res.json({
          jobId: payload.jobId,
          heroImage: serializeHeroImage(document)
        });
      } catch (error) {
        logger.error(
          {
            jobId: payload.jobId,
            err: error
          },
          "image route failed"
        );
        throw error;
      }
    })
  );

  router.get(
    "/:jobId",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const { jobId } = req.params;
      if (!jobId) {
        throw httpError(400, "Job identifier required");
      }

      const job = await firestore.getDocument(JOB_COLLECTION, jobId);
      if (!job) {
        throw httpError(404, "Job not found");
      }

      if (job.ownerUserId && job.ownerUserId !== userId) {
        throw httpError(403, "You do not have access to this job");
      }

      const parsedJob = JobSchema.parse(job);
      const latestFields = ALLOWED_INTAKE_KEYS.reduce((acc, key) => {
        acc[key] = parsedJob[key];
        return acc;
      }, {});

      res.json({
        jobId: parsedJob.id,
        state: latestFields,
        includeOptional: Boolean(parsedJob.stateMachine?.optionalComplete),
        updatedAt: parsedJob.updatedAt ?? parsedJob.createdAt ?? null,
        status: parsedJob.status ?? null,
        companyId: parsedJob.companyId ?? null,
        importContext: parsedJob.importContext ?? null
      });
    })
  );

  return router;
}
