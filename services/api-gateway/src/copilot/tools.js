import { z } from "zod";
import { JobSchema, JobSuggestionSchema } from "@wizard/core";
import {
  ALLOWED_INTAKE_KEYS,
  ARRAY_FIELD_KEYS,
  buildJobSnapshot,
  mergeIntakeIntoJob,
  computeRequiredProgress,
  applyRequiredProgress
} from "../wizard/job-intake.js";

const JOB_COLLECTION = "jobs";
const SUGGESTION_COLLECTION = "jobSuggestions";

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
  }
];
