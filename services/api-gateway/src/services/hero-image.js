import sharp from "sharp";
import { JobHeroImageSchema, JobRefinementSchema, JobFinalSchema } from "@wizard/core";
import { buildJobSnapshot } from "../wizard/job-intake.js";
import { loadCompanyContext } from "./company-context.js";
import { recordLlmUsageFromResult } from "./llm-usage-ledger.js";
import { httpError } from "@wizard/utils";

const HERO_IMAGE_COLLECTION = "jobImages";
const REFINEMENT_COLLECTION = "jobRefinements";
const FINAL_JOB_COLLECTION = "jobFinalJobs";

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
        chromaSubsampling: "4:4:4",
      })
      .toBuffer();
    if (compressed.length <= maxBytes) {
      return {
        base64: compressed.toString("base64"),
        mimeType: "image/jpeg",
      };
    }
    return { base64: null, mimeType: "image/jpeg" };
  } catch (error) {
    return { base64, mimeType: "image/png" };
  }
}

export async function loadHeroImageDocument(firestore, jobId) {
  const existing = await firestore.getDocument(HERO_IMAGE_COLLECTION, jobId);
  if (!existing) return null;
  const parsed = JobHeroImageSchema.safeParse(existing);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

export async function upsertHeroImageDocument({
  firestore,
  jobId,
  ownerUserId,
  companyId = null,
  patch,
  now = new Date(),
}) {
  const existing = await loadHeroImageDocument(firestore, jobId);
  const payload = JobHeroImageSchema.parse({
    id: jobId,
    jobId,
    companyId: companyId ?? existing?.companyId ?? null,
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
    caption: existing?.caption ?? null,
    captionHashtags: existing?.captionHashtags ?? null,
    failure: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...patch,
  });
  await firestore.saveDocument(HERO_IMAGE_COLLECTION, jobId, payload);
  return payload;
}

export async function persistHeroImageFailure({
  firestore,
  jobId,
  ownerUserId,
  companyId = null,
  reason,
  message,
  rawPreview,
  now = new Date(),
}) {
  return upsertHeroImageDocument({
    firestore,
    jobId,
    ownerUserId,
    companyId,
    now,
    patch: {
      status: "FAILED",
      failure: {
        reason,
        message: message ?? null,
        rawPreview: rawPreview ?? null,
        occurredAt: now,
      },
    },
  });
}

export function serializeHeroImage(document) {
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
    metadata: document.imageMetadata ?? null,
    caption: document.caption ?? null,
    captionHashtags: document.captionHashtags ?? null,
  };
}

async function loadRefinementDocument(firestore, jobId) {
  const existing = await firestore.getDocument(REFINEMENT_COLLECTION, jobId);
  if (!existing) return null;
  const parsed = JobRefinementSchema.safeParse(existing);
  if (!parsed.success) return null;
  return parsed.data;
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

export async function generateHeroImage({
  firestore,
  bigQuery,
  llmClient,
  logger,
  jobId,
  forceRefresh = false,
  ownerUserId,
  userId,
}) {
  const job = await firestore.getDocument("jobs", jobId);
  if (!job) {
    throw httpError(404, "Job not found");
  }
  if (job.ownerUserId && job.ownerUserId !== userId) {
    throw httpError(403, "You do not have access to this job");
  }

  const jobCompanyId = job.companyId ?? null;
  const trackLlmUsage = (result, usageContext, options = {}) =>
    recordLlmUsageFromResult({
      firestore,
      bigQuery,
      logger,
      usageContext,
      result,
      usageType: options.usageType,
      usageMetrics: options.usageMetrics,
    });

  const existing = await loadHeroImageDocument(firestore, jobId);
  if (
    existing &&
    !forceRefresh &&
    (existing.status === "READY" ||
      existing.status === "PROMPTING" ||
      existing.status === "GENERATING")
  ) {
    return {
      jobId,
      heroImage: serializeHeroImage(existing),
    };
  }

  const now = new Date();
  const finalJob = await loadFinalJobDocument(firestore, jobId);
  const refinement = (await loadRefinementDocument(firestore, jobId)) ?? null;
  const refinedSnapshot =
    finalJob?.job ?? refinement?.refinedJob ?? buildJobSnapshot(job);

  const ownerId = job.ownerUserId ?? ownerUserId ?? userId;
  const heroCompanyContext = await loadCompanyContext({
    firestore,
    companyId: jobCompanyId,
    taskType: "image_prompt_generation",
    logger,
  });

  let document = await upsertHeroImageDocument({
    firestore,
    jobId,
    ownerUserId: ownerId,
    companyId: jobCompanyId,
    now,
    patch: {
      status: "PROMPTING",
      imageBase64: null,
      imageUrl: null,
      failure: null,
    },
  });

  let promptResult;
  let imageResult;
  let captionResultData = null;

  try {
    promptResult = await llmClient.askHeroImagePrompt({
      refinedJob: refinedSnapshot,
      companyContext: heroCompanyContext,
    });
    await trackLlmUsage(promptResult, {
      userId,
      jobId,
      taskType: "image_prompt_generation",
    });

    if (promptResult.error) {
      await persistHeroImageFailure({
        firestore,
        jobId,
        ownerUserId: ownerId,
        companyId: jobCompanyId,
        reason: promptResult.error.reason ?? "prompt_failed",
        message: promptResult.error.message,
        rawPreview: promptResult.error.rawPreview ?? null,
        now: new Date(),
      });
      throw httpError(
        500,
        promptResult.error.message ?? "Image prompt generation failed"
      );
    }

    document = await upsertHeroImageDocument({
      firestore,
      jobId,
      ownerUserId: ownerId,
      companyId: jobCompanyId,
      patch: {
        status: "GENERATING",
        prompt: promptResult.prompt,
        promptProvider: promptResult.provider ?? null,
        promptModel: promptResult.model ?? null,
        promptMetadata: promptResult.metadata ?? null,
      },
    });

    const [imageOutcome, captionOutcome] = await Promise.allSettled([
      llmClient.runImageGeneration({
        prompt: promptResult.prompt,
        negativePrompt: promptResult.negativePrompt ?? undefined,
        style: promptResult.style ?? undefined,
      }),
      llmClient.askImageCaption({
        jobSnapshot: refinedSnapshot,
        companyContext: heroCompanyContext,
      }),
    ]);

    if (imageOutcome.status === "fulfilled") {
      imageResult = imageOutcome.value;
      await trackLlmUsage(
        imageResult,
        {
          userId,
          jobId,
          taskType: "image_generation",
        },
        {
          usageType: "image",
          usageMetrics: {
            units: 1,
          },
        }
      );
    } else {
      throw imageOutcome.reason;
    }

    if (captionOutcome.status === "fulfilled") {
      const captionResult = captionOutcome.value;
      await trackLlmUsage(captionResult, {
        userId,
        jobId,
        taskType: "image_caption",
      });
      if (!captionResult.error) {
        captionResultData = {
          caption: captionResult.caption ?? null,
          hashtags: Array.isArray(captionResult.hashtags)
            ? captionResult.hashtags
            : null,
        };
      }
    }

    if (imageResult.error) {
      await persistHeroImageFailure({
        firestore,
        jobId,
        ownerUserId: ownerId,
        companyId: jobCompanyId,
        reason: imageResult.error.reason ?? "generation_failed",
        message: imageResult.error.message,
        rawPreview: imageResult.error.rawPreview ?? null,
        now: new Date(),
      });
      throw httpError(
        500,
        imageResult.error.message ?? "Image generation failed"
      );
    }

    const captionText =
      captionResultData?.caption ?? document.caption ?? null;
    const captionHashtags =
      captionResultData?.hashtags ?? document.captionHashtags ?? null;

    const compression = await compressBase64Image(imageResult.imageBase64, {
      maxBytes: 900000,
    });
    const storedBase64 = compression.base64;
    const storedMimeType = compression.mimeType ?? "image/png";
    const storedUrl = storedBase64
      ? imageResult.imageUrl ?? null
      : imageResult.imageUrl ?? null;

    document = await upsertHeroImageDocument({
      firestore,
      jobId,
      ownerUserId: ownerId,
      patch: {
        status: "READY",
        imageBase64: storedBase64,
        imageUrl: storedUrl,
        imageMimeType: storedBase64 ? storedMimeType : null,
        imageProvider: imageResult.provider ?? null,
        imageModel: imageResult.model ?? null,
        imageMetadata: imageResult.metadata ?? null,
        caption: captionText ?? null,
        captionHashtags: captionHashtags ?? null,
      },
    });

    return {
      jobId,
      heroImage: serializeHeroImage(document),
    };
  } catch (error) {
    await persistHeroImageFailure({
      firestore,
      jobId,
      ownerUserId: ownerId ?? userId,
      companyId: jobCompanyId,
      reason: "generation_failed",
      message: error?.message ?? String(error),
      rawPreview: null,
      now: new Date(),
    });
    throw error;
  }
}
