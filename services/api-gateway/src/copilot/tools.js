import { z } from "zod";
import {
  JobSchema,
  JobSuggestionSchema,
  JobRefinementSchema,
  JobChannelRecommendationSchema,
  JobAssetRecordSchema,
  AssetFormatEnum,
  ChannelRecommendationSchema,
  ChannelIdEnum,
  CHANNEL_CATALOG
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

const CHANNEL_ID_SET = new Set(ChannelIdEnum.options);
const CHANNEL_NAME_MAP = CHANNEL_CATALOG.reduce((map, channel) => {
  const cleaned = channel.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!map.has(cleaned)) {
    map.set(cleaned, channel.id);
  }
  return map;
}, new Map());
const CHANNEL_ALIAS_MAP = new Map([
  ["TIKTOK", "TIKTOK_LEAD"],
  ["TIKTOK_ADS", "TIKTOK_LEAD"],
  ["TIKTOKLEAD", "TIKTOK_LEAD"],
  ["TIK TOK", "TIKTOK_LEAD"]
]);

function cleanChannelKey(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeChannelId(input) {
  if (!input) {
    return { id: null, suggestion: null };
  }
  const raw = String(input).trim();
  const upper = raw.toUpperCase();
  const normalized = upper.replace(/[\s-]+/g, "_");
  const alias =
    CHANNEL_ALIAS_MAP.get(upper) ??
    CHANNEL_ALIAS_MAP.get(normalized) ??
    CHANNEL_ALIAS_MAP.get(cleanChannelKey(raw));
  if (CHANNEL_ID_SET.has(upper)) {
    return { id: upper, suggestion: null };
  }
  if (CHANNEL_ID_SET.has(normalized)) {
    return { id: normalized, suggestion: null };
  }
  if (alias && CHANNEL_ID_SET.has(alias)) {
    return { id: alias, suggestion: null };
  }
  const cleanedName = cleanChannelKey(raw);
  if (CHANNEL_NAME_MAP.has(cleanedName)) {
    return { id: CHANNEL_NAME_MAP.get(cleanedName), suggestion: null };
  }
  let suggestion = null;
  for (const [nameKey, channelId] of CHANNEL_NAME_MAP.entries()) {
    if (nameKey.includes(cleanedName) || cleanedName.includes(nameKey)) {
      suggestion = channelId;
      break;
    }
  }
  if (!suggestion) {
    for (const id of CHANNEL_ID_SET.values()) {
      const cleanedId = cleanChannelKey(id);
      if (cleanedId.includes(cleanedName) || cleanedName.includes(cleanedId)) {
        suggestion = id;
        break;
      }
    }
  }
  return { id: null, suggestion };
}

const FORMAT_ID_SET = new Set(AssetFormatEnum.options);

function normalizeFormatId(input) {
  if (!input) {
    return { id: null, suggestion: null };
  }
  const raw = String(input).trim();
  const upper = raw.toUpperCase();
  const normalized = upper.replace(/[^A-Z0-9]+/g, "_");
  if (FORMAT_ID_SET.has(upper)) {
    return { id: upper, suggestion: null };
  }
  if (FORMAT_ID_SET.has(normalized)) {
    return { id: normalized, suggestion: null };
  }
  let suggestion = null;
  for (const candidate of FORMAT_ID_SET.values()) {
    const cleanedCandidate = candidate.replace(/[^A-Z0-9]+/g, "");
    const cleanedInput = normalized.replace(/[^A-Z0-9]+/g, "");
    if (cleanedCandidate.includes(cleanedInput) || cleanedInput.includes(cleanedCandidate)) {
      suggestion = candidate;
      break;
    }
  }
  return { id: null, suggestion };
}

function buildAssetId(jobId, channelId, formatId) {
  return `${jobId}:${channelId}:${formatId}`;
}

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

async function loadJobAssets({ firestore, jobId }) {
  const docs = await firestore.queryDocuments(
    JOB_ASSET_COLLECTION,
    "jobId",
    "==",
    jobId
  );
  return docs
    .map((doc) => {
      const parsed = JobAssetRecordSchema.safeParse(doc);
      return parsed.success ? parsed.data : null;
    })
    .filter(Boolean);
}

async function saveAssetRecord({ firestore, assetId, record }) {
  const payload = JobAssetRecordSchema.parse(record);
  await firestore.saveDocument(JOB_ASSET_COLLECTION, assetId, payload);
  return payload;
}

function resolveAssetId(context, input) {
  if (input.assetId && typeof input.assetId === "string" && input.assetId.trim().length > 0) {
    return input.assetId.trim();
  }
  if (input.channelId && input.formatId) {
    const { id: channelId, suggestion: channelSuggestion } = normalizeChannelId(input.channelId);
    if (!channelId) {
      const hint = channelSuggestion ? ` Did you mean "${channelSuggestion}"?` : "";
      throw new Error(`Invalid channelId "${input.channelId}".${hint}`);
    }
    const { id: formatId, suggestion: formatSuggestion } = normalizeFormatId(input.formatId);
    if (!formatId) {
      const hint = formatSuggestion ? ` Did you mean "${formatSuggestion}"?` : "";
      throw new Error(`Invalid formatId "${input.formatId}".${hint}`);
    }
    return buildAssetId(context.jobId, channelId, formatId);
  }
  throw new Error("assetId is required (or provide both channelId and formatId)");
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
      const normalized = input.recommendations.map((entry) => {
        const { id, suggestion } = normalizeChannelId(entry.channel);
        if (!id) {
          const suggestionText = suggestion ? ` Did you mean "${suggestion}"?` : "";
          throw new Error(
            `Invalid channel id "${entry.channel}".${suggestionText} Valid ids: ${ChannelIdEnum.options.join(", ")}`
          );
        }
        return {
          ...entry,
          channel: id
        };
      });
      const saved = await saveChannelRecommendations({
        firestore: context.firestore,
        jobId: context.jobId,
        recommendations: normalized,
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
    name: "list_job_assets",
    description:
      "List available assets for this job with their ids, channels, formats, status, and titles.",
    schema: z
      .object({
        channelId: z.string().optional(),
        formatId: z.string().optional()
      })
      .default({}),
    schemaDescription:
      "Input: { \"channelId\"?: string, \"formatId\"?: string }. Filters by channel/format when provided.",
    async execute(context, input = {}) {
      const assets = await loadJobAssets({ firestore: context.firestore, jobId: context.jobId });
      const normalizedChannel = input.channelId ? normalizeChannelId(input.channelId) : null;
      if (normalizedChannel && !normalizedChannel.id) {
        const hint = normalizedChannel.suggestion ? ` Did you mean "${normalizedChannel.suggestion}"?` : "";
        throw new Error(`Invalid channelId "${input.channelId}".${hint}`);
      }
      const normalizedFormat = input.formatId ? normalizeFormatId(input.formatId) : null;
      if (normalizedFormat && !normalizedFormat.id) {
        const hint = normalizedFormat.suggestion ? ` Did you mean "${normalizedFormat.suggestion}"?` : "";
        throw new Error(`Invalid formatId "${input.formatId}".${hint}`);
      }
      const filtered = assets.filter((asset) => {
        if (normalizedChannel?.id && asset.channelId !== normalizedChannel.id) return false;
        if (normalizedFormat?.id && asset.formatId !== normalizedFormat.id) return false;
        return true;
      });
      return {
        jobId: context.jobId,
        assets: filtered.map((asset) => ({
          id: asset.id,
          channelId: asset.channelId,
          formatId: asset.formatId,
          status: asset.status,
          title: asset.content?.title ?? null,
          updatedAt: asset.updatedAt ?? asset.createdAt ?? null
        }))
      };
    }
  },
  {
    name: "get_asset_details",
    description:
      "Fetch the latest version of a generated asset so you can review or reference it.",
    schema: z
      .object({
        assetId: z.string().optional(),
        channelId: z.string().optional(),
        formatId: z.string().optional()
      })
      .refine(
        (val) =>
          (val.assetId && val.assetId.trim().length > 0) ||
          (val.channelId && val.formatId),
        { message: "Provide assetId or both channelId and formatId." }
      ),
    schemaDescription:
      "Input: { \"assetId\"?: string, \"channelId\"?: string, \"formatId\"?: string }. Provide assetId or both channelId + formatId.",
    async execute(context, input) {
      const assetId = resolveAssetId(context, input);
      const record = await loadAssetRecord({
        firestore: context.firestore,
        assetId
      });
      return { asset: record };
    }
  },
  {
    name: "update_asset_content",
    description:
      "Update the editable content of a generated asset (title, body, bullets, etc.).",
    schema: z
      .object({
        assetId: z.string().optional(),
        channelId: z.string().optional(),
        formatId: z.string().optional(),
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
      })
      .refine(
        (val) =>
          (val.assetId && val.assetId.trim().length > 0) ||
          (val.channelId && val.formatId),
        { message: "Provide assetId or both channelId and formatId." }
      ),
    schemaDescription:
      "Input: { \"assetId\"?: string, \"channelId\"?: string, \"formatId\"?: string, \"content\": { title?, body?, bullets?, ... } }. Provide assetId or channelId+formatId. Only include the fields you want to update.",
    async execute(context, input) {
      const assetId = resolveAssetId(context, input);
      const record = await loadAssetRecord({
        firestore: context.firestore,
        assetId
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
        assetId,
        record: updated
      });
      return {
        status: "updated",
        asset: saved,
        action: {
          type: "asset_update",
          assetId,
          content: mergedContent
        }
      };
    }
  }
];
