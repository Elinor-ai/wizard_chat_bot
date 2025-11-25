import { z } from "zod";
import {
  JobSchema,
  JobSuggestionSchema,
  JobRefinementSchema,
  JobChannelRecommendationSchema,
  JobAssetRecordSchema,
  ChannelRecommendationSchema
} from "@wizard/core";
import {
  ALLOWED_INTAKE_KEYS,
  ARRAY_FIELD_KEYS,
  buildJobSnapshot,
  mergeIntakeIntoJob,
  computeRequiredProgress,
  applyRequiredProgress,
  setDeep
} from "../wizard/job-intake.js";

const JOB_COLLECTION = "jobs";
const SUGGESTION_COLLECTION = "jobSuggestions";
const REFINEMENT_COLLECTION = "jobRefinements";
const CHANNEL_RECOMMENDATION_COLLECTION = "jobChannelRecommendations";
const JOB_ASSET_COLLECTION = "jobAssets";

const editableFields = new Set(ALLOWED_INTAKE_KEYS);
const enumFieldMap = {
  workModel: ["on_site", "hybrid", "remote"],
  employmentType: ["full_time", "part_time", "contract", "temporary", "seasonal", "intern"],
  seniorityLevel: ["entry", "mid", "senior", "lead", "executive"]
};

function normalizeArrayValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        typeof entry === "string" ? entry.trim() : entry === null || entry === undefined ? "" : String(entry)
      )
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }
  return [];
}

function normalizeFieldValue(fieldId, value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (enumFieldMap[fieldId]) {
    const normalized = typeof value === "string" ? value.trim() : String(value);
    if (!enumFieldMap[fieldId].includes(normalized)) {
      throw new Error(
        `Value "${normalized}" is not allowed for ${fieldId}. Permitted values: ${enumFieldMap[
          fieldId
        ].join(", ")}`
      );
    }
    return normalized;
  }
  if (ARRAY_FIELD_KEYS.has(fieldId)) {
    return normalizeArrayValue(value);
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return value;
}

async function loadJob({ firestore, jobId }) {
  const doc = await firestore.getDocument(JOB_COLLECTION, jobId);
  if (!doc) {
    throw new Error("Job not found");
  }
  const parsed = JobSchema.safeParse(doc);
  if (!parsed.success) {
    throw new Error("Job document failed validation");
  }
  return parsed.data;
}

async function loadSuggestions({ firestore, jobId }) {
  const doc = await firestore.getDocument(SUGGESTION_COLLECTION, jobId);
  if (!doc) return null;
  const parsed = JobSuggestionSchema.safeParse(doc);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

async function loadRefinementDocument({ firestore, jobId }) {
  const doc = await firestore.getDocument(REFINEMENT_COLLECTION, jobId);
  if (!doc) {
    return null;
  }
  const parsed = JobRefinementSchema.safeParse(doc);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

async function saveRefinementDocument({
  firestore,
  jobId,
  document,
  refinedJob,
  summary,
  now = new Date()
}) {
  const payload = JobRefinementSchema.parse({
    id: jobId,
    jobId,
    schema_version: "1",
    refinedJob,
    summary: summary ?? document?.summary ?? null,
    provider: document?.provider,
    model: document?.model,
    metadata: document?.metadata,
    lastFailure: document?.lastFailure,
    updatedAt: now
  });
  await firestore.saveDocument(REFINEMENT_COLLECTION, jobId, payload);
  return payload;
}

async function loadChannelRecommendations({ firestore, jobId }) {
  const doc = await firestore.getDocument(
    CHANNEL_RECOMMENDATION_COLLECTION,
    jobId
  );
  if (!doc) return null;
  const parsed = JobChannelRecommendationSchema.safeParse(doc);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

async function saveChannelRecommendations({
  firestore,
  jobId,
  recommendations,
  provider,
  model,
  metadata,
  document,
  now = new Date()
}) {
  const payload = JobChannelRecommendationSchema.parse({
    id: jobId,
    jobId,
    schema_version: "1",
    recommendations,
    provider: provider ?? document?.provider,
    model: model ?? document?.model,
    metadata: metadata ?? document?.metadata,
    lastFailure: document?.lastFailure,
    updatedAt: now
  });
  await firestore.saveDocument(
    CHANNEL_RECOMMENDATION_COLLECTION,
    jobId,
    payload
  );
  return payload;
}

async function loadAssetRecord({ firestore, assetId }) {
  if (!assetId) {
    throw new Error("assetId is required");
  }
  const doc = await firestore.getDocument(JOB_ASSET_COLLECTION, assetId);
  if (!doc) {
    throw new Error("Asset not found");
  }
  const parsed = JobAssetRecordSchema.safeParse(doc);
  if (!parsed.success) {
    throw new Error("Asset record failed validation");
  }
  return parsed.data;
}

async function saveAssetRecord({ firestore, assetId, record }) {
  const payload = JobAssetRecordSchema.parse(record);
  await firestore.saveDocument(JOB_ASSET_COLLECTION, assetId, payload);
  return payload;
}

export const COPILOT_TOOLS = [
  {
    name: "get_job_snapshot",
    description:
      "Return the latest editable job fields so you can reference titles, descriptions, or other context.",
    schema: z
      .object({
        fields: z.array(z.string()).optional()
      })
      .default({}),
    schemaDescription:
      "Input: { \"fields\"?: string[] of field ids to project }. If omitted, return the entire snapshot.",
    async execute(context, input = {}) {
      const job = context.cache.job ?? (context.cache.job = await loadJob(context));
      const snapshot = buildJobSnapshot(job);
      if (Array.isArray(input.fields) && input.fields.length > 0) {
        const filtered = {};
        input.fields.forEach((field) => {
          if (field in snapshot) {
            filtered[field] = snapshot[field];
          }
        });
        return { jobId: job.id, snapshot: filtered };
      }
      return { jobId: job.id, snapshot };
    }
  },
  {
    name: "get_current_suggestions",
    description:
      "Inspect the latest passive LLM suggestions so you can explain or reuse them for the user.",
    schema: z
      .object({
        fieldIds: z.array(z.string()).optional()
      })
      .default({}),
    schemaDescription:
      "Input: { \"fieldIds\"?: string[] } to limit the results. Response contains the latest AI suggestions for those fields.",
    async execute(context, input = {}) {
      const doc = await loadSuggestions(context);
      if (!doc || !doc.candidates) {
        return { suggestions: [] };
      }
      const entries = Object.values(doc.candidates);
      if (Array.isArray(input.fieldIds) && input.fieldIds.length > 0) {
        const filter = new Set(input.fieldIds);
        return {
          suggestions: entries.filter((candidate) => filter.has(candidate.fieldId))
        };
      }
      return { suggestions: entries };
    }
  },
  {
    name: "update_job_field",
    description:
      "Persist a single job field update on behalf of the user. Use sparingly and only after confirming intent.",
    schema: z.object({
      fieldId: z.enum(ALLOWED_INTAKE_KEYS),
      value: z.unknown().optional(),
      mode: z.enum(["set", "clear"]).optional()
    }),
    schemaDescription:
      "Input: { \"fieldId\": one of the editable job fields, \"value\"?: any, \"mode\"?: \"set\" | \"clear\" }. When mode is \"clear\" the field is emptied even if value is omitted.",
    async execute(context, input) {
      if (!editableFields.has(input.fieldId)) {
        throw new Error(`Field ${input.fieldId} is not editable`);
      }

      const now = new Date();
      const job = context.cache.job ?? (context.cache.job = await loadJob(context));
      const nextState =
        input.mode === "clear"
          ? { [input.fieldId]: "" }
          : { [input.fieldId]: normalizeFieldValue(input.fieldId, input.value) };

      const mergedJob = mergeIntakeIntoJob(job, nextState, { now });
      const progress = computeRequiredProgress(mergedJob);
      const finalized = applyRequiredProgress(mergedJob, progress, now);

      context.cache.job = finalized;
      await context.firestore.saveDocument(JOB_COLLECTION, job.id, finalized);

      return {
        status: "updated",
        fieldId: input.fieldId,
        value: finalized[input.fieldId],
        jobSnapshot: buildJobSnapshot(finalized),
        action: {
          type: "field_update",
          fieldId: input.fieldId,
          value: finalized[input.fieldId]
        }
      };
  }
  },
  {
    name: "update_job_fields",
    description:
      "Persist multiple job field updates in one call. Use when the user clearly requests several changes at once.",
    schema: z.object({
      updates: z
        .array(
          z.object({
            fieldId: z.enum(ALLOWED_INTAKE_KEYS),
            value: z.unknown().optional(),
            mode: z.enum(["set", "clear"]).optional()
          })
        )
        .min(1)
    }),
    schemaDescription:
      "Input: { \"updates\": [{ fieldId, value?, mode?: 'set' | 'clear' }] }. Mode 'clear' empties the field.",
    async execute(context, input) {
      const now = new Date();
      const job = context.cache.job ?? (context.cache.job = await loadJob(context));
      const nextState = {};

      for (const update of input.updates) {
        if (!editableFields.has(update.fieldId)) {
          throw new Error(`Field ${update.fieldId} is not editable`);
        }
        if (update.mode === "clear") {
          nextState[update.fieldId] = "";
        } else {
          nextState[update.fieldId] = normalizeFieldValue(
            update.fieldId,
            update.value
          );
        }
      }

      const mergedJob = mergeIntakeIntoJob(job, nextState, { now });
      const progress = computeRequiredProgress(mergedJob);
      const finalized = applyRequiredProgress(mergedJob, progress, now);

      context.cache.job = finalized;
      await context.firestore.saveDocument(JOB_COLLECTION, job.id, finalized);

      return {
        status: "updated",
        updatedFields: Object.keys(nextState),
        jobSnapshot: buildJobSnapshot(finalized),
        action: {
          type: "field_batch_update",
          fields: nextState,
          jobSnapshot: buildJobSnapshot(finalized)
        }
      };
    }
  },
  {
    name: "get_refined_job_snapshot",
    description:
      "Return the refined job snapshot created during the polishing step.",
    schema: z
      .object({
        fields: z.array(z.string()).optional()
      })
      .default({}),
    schemaDescription:
      "Input: { \"fields\"?: string[] of field ids to project }. If omitted, return the entire refined snapshot.",
    async execute(context, input = {}) {
      const doc =
        (await loadRefinementDocument(context)) ?? {
          refinedJob: buildJobSnapshot(
            context.cache.job ?? (context.cache.job = await loadJob(context))
          )
        };
      const snapshot = doc.refinedJob ?? {};
      if (Array.isArray(input.fields) && input.fields.length > 0) {
        const filtered = {};
        input.fields.forEach((field) => {
          if (field in snapshot) {
            filtered[field] = snapshot[field];
          }
        });
        return { jobId: context.jobId, snapshot: filtered };
      }
      return { jobId: context.jobId, snapshot };
    }
  },
  {
    name: "update_refined_job_field",
    description:
      "Update a single field inside the refined job snapshot. Use only when the user explicitly requests a change to the polished draft.",
    schema: z.object({
      fieldId: z.enum(ALLOWED_INTAKE_KEYS),
      value: z.unknown().optional(),
      mode: z.enum(["set", "clear"]).optional()
    }),
    schemaDescription:
      "Input: { \"fieldId\": editable field id, \"value\"?: any, \"mode\"?: \"set\" | \"clear\" }. Use mode:\"clear\" to empty the field.",
    async execute(context, input) {
      const now = new Date();
      const job =
        context.cache.job ?? (context.cache.job = await loadJob(context));
      const document =
        (await loadRefinementDocument(context)) ?? {
          refinedJob: buildJobSnapshot(job),
          summary: null
        };
      const refined = {
        ...(document.refinedJob ?? buildJobSnapshot(job))
      };

      if (input.mode === "clear") {
        setDeep(refined, input.fieldId, "");
      } else {
        const normalizedValue = normalizeFieldValue(input.fieldId, input.value);
        setDeep(refined, input.fieldId, normalizedValue);
      }

      const saved = await saveRefinementDocument({
        firestore: context.firestore,
        jobId: context.jobId,
        document,
        refinedJob: refined,
        summary: document.summary,
        now
      });

      return {
        status: "updated",
        fieldId: input.fieldId,
        value: refined[input.fieldId],
        refinedJob: refined,
        action: {
          type: "refined_field_update",
          fieldId: input.fieldId,
          value: refined[input.fieldId]
        },
        metadata: {
          updatedAt: saved.updatedAt
        }
      };
    }
  },
  {
    name: "update_refined_job_fields",
    description:
      "Update multiple fields inside the refined job snapshot in one call.",
    schema: z.object({
      updates: z
        .array(
          z.object({
            fieldId: z.enum(ALLOWED_INTAKE_KEYS),
            value: z.unknown().optional(),
            mode: z.enum(["set", "clear"]).optional()
          })
        )
        .min(1)
    }),
    schemaDescription:
      "Input: { \"updates\": [{ fieldId, value?, mode?: 'set' | 'clear' }] }. Mode 'clear' empties the field.",
    async execute(context, input) {
      const now = new Date();
      const job =
        context.cache.job ?? (context.cache.job = await loadJob(context));
      const document =
        (await loadRefinementDocument(context)) ?? {
          refinedJob: buildJobSnapshot(job),
          summary: null
        };
      const refined = {
        ...(document.refinedJob ?? buildJobSnapshot(job))
      };

      for (const update of input.updates) {
        if (update.mode === "clear") {
          setDeep(refined, update.fieldId, "");
        } else {
          const normalizedValue = normalizeFieldValue(update.fieldId, update.value);
          setDeep(refined, update.fieldId, normalizedValue);
        }
      }

      const saved = await saveRefinementDocument({
        firestore: context.firestore,
        jobId: context.jobId,
        document,
        refinedJob: refined,
        summary: document.summary,
        now
      });

      return {
        status: "updated",
        updatedFields: input.updates.map((u) => u.fieldId),
        refinedJob: refined,
        action: {
          type: "refined_field_batch_update",
          fields: input.updates.map((u) => ({
            fieldId: u.fieldId,
            mode: u.mode ?? "set"
          })),
          refinedJob: refined
        },
        metadata: {
          updatedAt: saved.updatedAt
        }
      };
    }
  },
  {
    name: "get_channel_recommendations",
    description:
      "Return the latest channel recommendations that were generated for this job.",
    schema: z.object({}).default({}),
    schemaDescription: "No input. Returns { recommendations }.",
    async execute(context) {
      const document = await loadChannelRecommendations(context);
      return {
        jobId: context.jobId,
        recommendations: document?.recommendations ?? [],
        updatedAt: document?.updatedAt ?? null
      };
    }
  },
  {
    name: "set_channel_recommendations",
    description:
      "Overwrite the current channel recommendation list. Use when the user explicitly requests new channels.",
    schema: z.object({
      recommendations: z.array(ChannelRecommendationSchema).min(1),
      provider: z.string().optional(),
      model: z.string().optional()
    }),
    schemaDescription:
      "Input: { \"recommendations\": [{ channel, reason, expectedCPA? }], \"provider\"?: string, \"model\"?: string }.",
    async execute(context, input) {
      const existing = await loadChannelRecommendations(context);
      const saved = await saveChannelRecommendations({
        firestore: context.firestore,
        jobId: context.jobId,
        recommendations: input.recommendations,
        provider: input.provider,
        model: input.model,
        metadata: existing?.metadata,
        document: existing
      });
      return {
        status: "updated",
        recommendations: saved.recommendations,
        action: {
          type: "channel_recommendations_update",
          recommendations: saved.recommendations
        }
      };
    }
  },
  {
    name: "get_asset_details",
    description:
      "Fetch the latest version of a generated asset so you can review or reference it.",
    schema: z.object({
      assetId: z.string()
    }),
    schemaDescription: "Input: { \"assetId\": string }.",
    async execute(context, input) {
      const record = await loadAssetRecord({
        firestore: context.firestore,
        assetId: input.assetId
      });
      return { asset: record };
    }
  },
  {
    name: "update_asset_content",
    description:
      "Update the editable content of a generated asset (title, body, bullets, etc.).",
    schema: z.object({
      assetId: z.string(),
      content: z
        .object({
          title: z.string().optional(),
          subtitle: z.string().optional(),
          body: z.string().optional(),
          bullets: z.array(z.string()).optional(),
          callToAction: z.string().optional(),
          notes: z.string().optional(),
          hashtags: z.array(z.string()).optional(),
          imagePrompt: z.string().optional(),
          script: z
            .array(
              z.object({
                beat: z.string(),
                details: z.string().optional(),
                visual: z.string().optional()
              })
            )
            .optional(),
          raw: z.unknown().optional()
        })
        .partial()
        .refine((val) => Object.keys(val).length > 0, {
          message: "At least one content field must be provided."
        })
    }),
    schemaDescription:
      "Input: { \"assetId\": string, \"content\": { title?, body?, bullets?, ... } }. Only include the fields you want to update.",
    async execute(context, input) {
      const record = await loadAssetRecord({
        firestore: context.firestore,
        assetId: input.assetId
      });
      const mergedContent = {
        ...(record.content ?? {}),
        ...input.content
      };
      const now = new Date();
      const updated = {
        ...record,
        content: mergedContent,
        updatedAt: now
      };
      const saved = await saveAssetRecord({
        firestore: context.firestore,
        assetId: input.assetId,
        record: updated
      });
      return {
        status: "updated",
        asset: saved,
        action: {
          type: "asset_update",
          assetId: input.assetId,
          content: mergedContent
        }
      };
    }
  }
];
