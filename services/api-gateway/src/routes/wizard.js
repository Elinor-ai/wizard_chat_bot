import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { wrapAsync, httpError } from "@wizard/utils";
import { JobSchema, JobSuggestionSchema, deriveJobStatusFromState } from "@wizard/core";

const JOB_COLLECTION = "jobs";
const SUGGESTION_COLLECTION = "jobSuggestions";

const looseObjectSchema = z.object({}).catchall(z.unknown());

const ALLOWED_INTAKE_KEYS = [
  "roleTitle",
  "companyName",
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
  upcomingFieldIds: z.array(z.string()).optional(),
  visibleFieldIds: z.array(z.string()).optional()
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

function createBaseJob({ jobId, userId, now }) {
  return JobSchema.parse({
    id: jobId,
    ownerUserId: userId,
    orgId: null,
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
    location: "",
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
      nextJob[key] = incomingValue;
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

  router.post(
    "/draft",
    wrapAsync(async (req, res) => {
      const userId = requireUserId(req);
      const payload = draftRequestSchema.parse(req.body ?? {});

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
            now
          });
        }
      } else {
        baseJob = createBaseJob({ jobId, userId, now });
      }

      const mergedJob = mergeIntakeIntoJob(baseJob, payload.state ?? {}, { userId, now });
      const progress = computeRequiredProgress(mergedJob);
      const jobWithProgress = applyRequiredProgress(mergedJob, progress, now);
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
        state: savedJob.stateMachine?.currentState ?? "DRAFT"
      });
    })
  );

  router.post(
    "/suggestions",
    wrapAsync(async (req, res) => {
      const userId = requireUserId(req);
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
      const userId = requireUserId(req);
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

  return router;
}
