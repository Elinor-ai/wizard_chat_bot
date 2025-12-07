import { z } from "zod";
import { CompanySchema, UserSchema } from "@wizard/core";
import { LLM_TASK } from "./llm-tasks";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const valueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.record(z.string(), z.unknown()),
  z.array(z.unknown()),
  z.null(),
]);

const suggestionSchema = z.object({
  fieldId: z.string(),
  value: valueSchema,
  rationale: z.string().optional(),
  confidence: z.number().optional(),
  source: z.string().optional(),
});

const suggestionFailureSchema = z
  .object({
    reason: z.string(),
    rawPreview: z.string().optional().nullable(),
    error: z.string().optional().nullable(),
    occurredAt: z.union([z.string(), z.instanceof(Date)]).optional(),
  })
  .transform((data) => ({
    reason: data.reason,
    rawPreview: data.rawPreview ?? null,
    error: data.error ?? null,
    occurredAt:
      data.occurredAt instanceof Date
        ? data.occurredAt
        : data.occurredAt
          ? new Date(data.occurredAt)
          : null,
  }));

const copilotSuggestionResponseSchema = z
  .object({
    jobId: z.string().optional(),
    suggestions: z.array(suggestionSchema).optional(),
    updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
    refreshed: z.boolean().optional(),
    failure: suggestionFailureSchema.optional().nullable(),
  })
  .transform((data) => ({
    jobId: data.jobId ?? null,
    suggestions: data.suggestions ?? [],
    updatedAt: data.updatedAt ? new Date(data.updatedAt) : null,
    refreshed: Boolean(data.refreshed),
    failure: data.failure ?? null,
  }));

const channelRecommendationSchema = z.object({
  channel: z.string(),
  reason: z.string(),
  expectedCPA: z.number().optional(),
});

const channelRecommendationFailureSchema = z
  .object({
    reason: z.string(),
    message: z.string().optional().nullable(),
    rawPreview: z.string().optional().nullable(),
    occurredAt: z.union([z.string(), z.instanceof(Date)]).optional(),
  })
  .transform((data) => ({
    reason: data.reason,
    message: data.message ?? null,
    rawPreview: data.rawPreview ?? null,
    occurredAt:
      data.occurredAt instanceof Date
        ? data.occurredAt
        : data.occurredAt
          ? new Date(data.occurredAt)
          : null,
  }));

const channelRecommendationResponseSchema = z
  .object({
    jobId: z.string(),
    recommendations: z.array(channelRecommendationSchema).optional(),
    updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
    refreshed: z.boolean().optional(),
    failure: channelRecommendationFailureSchema.optional().nullable(),
  })
  .transform((data) => ({
    jobId: data.jobId,
    recommendations: data.recommendations ?? [],
    updatedAt: data.updatedAt ? new Date(data.updatedAt) : null,
    refreshed: Boolean(data.refreshed),
    failure: data.failure ?? null,
  }));

const jobAssetFailureSchema = z
  .object({
    reason: z.string(),
    message: z.string().optional().nullable(),
    rawPreview: z.string().optional().nullable(),
    occurredAt: z.union([z.string(), z.instanceof(Date)]).optional(),
  })
  .transform((data) => ({
    reason: data.reason,
    message: data.message ?? null,
    rawPreview: data.rawPreview ?? null,
    occurredAt: data.occurredAt
      ? data.occurredAt instanceof Date
        ? data.occurredAt
        : new Date(data.occurredAt)
      : null,
  }));

const jobAssetSchema = z
  .object({
    id: z.string(),
    jobId: z.string(),
    channelId: z.string(),
    formatId: z.string(),
    artifactType: z.string(),
    status: z.string(),
    provider: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    llmRationale: z.string().nullable().optional(),
    content: z.record(z.string(), z.unknown()).optional().nullable(),
    failure: jobAssetFailureSchema.optional().nullable(),
    updatedAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
  })
  .transform((data) => ({
    ...data,
    updatedAt: data.updatedAt
      ? data.updatedAt instanceof Date
        ? data.updatedAt
        : new Date(data.updatedAt)
      : null,
  }));

const jobImportContextSchema = z
  .object({
    source: z.string().optional(),
    externalSource: z.string().optional(),
    externalUrl: z.string().optional(),
    sourceUrl: z.string().optional(),
    companyJobId: z.string().optional(),
    companyIntelSource: z.string().optional(),
    discoveredAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
    originalPostedAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
    importedAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
    overallConfidence: z.number().optional(),
    fieldConfidence: z.record(z.number()).optional(),
    evidenceSources: z.array(z.string()).optional(),
  })
  .partial()
  .nullable()
  .transform((data) => {
    if (!data) {
      return null;
    }
    const toDate = (value) =>
      value ? (value instanceof Date ? value : new Date(value)) : null;
    return {
      ...data,
      discoveredAt: toDate(data.discoveredAt ?? null),
      originalPostedAt: toDate(data.originalPostedAt ?? null),
      importedAt: toDate(data.importedAt ?? null),
    };
  });

const jobAssetRunSchema = z
  .object({
    id: z.string(),
    jobId: z.string(),
    status: z.string(),
    channelIds: z.array(z.string()).optional(),
    formatIds: z.array(z.string()).optional(),
    stats: z
      .object({
        assetsPlanned: z.number().optional().nullable(),
        assetsCompleted: z.number().optional().nullable(),
        promptTokens: z.number().optional().nullable(),
        responseTokens: z.number().optional().nullable(),
      })
      .optional(),
    startedAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
    completedAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
    error: z
      .object({
        reason: z.string(),
        message: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .transform((data) => ({
    ...data,
    channelIds: data.channelIds ?? [],
    formatIds: data.formatIds ?? [],
    startedAt: data.startedAt
      ? data.startedAt instanceof Date
        ? data.startedAt
        : new Date(data.startedAt)
      : null,
    completedAt: data.completedAt
      ? data.completedAt instanceof Date
        ? data.completedAt
        : new Date(data.completedAt)
      : null,
  }));

const jobAssetResponseSchema = z.object({
  jobId: z.string(),
  assets: z.array(jobAssetSchema).default([]),
  run: jobAssetRunSchema.nullable().optional(),
});

const companyOverviewResponseSchema = z.object({
  company: CompanySchema,
  hasDiscoveredJobs: z.boolean().optional().default(false),
});

const discoveredJobListItemSchema = z
  .object({
    id: z.string(),
    roleTitle: z.string().optional(),
    location: z.string().optional(),
    status: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    externalUrl: z.string().nullable().optional(),
    importContext: jobImportContextSchema.optional(),
    createdAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
    updatedAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
  })
  .transform((data) => ({
    id: data.id,
    roleTitle: data.roleTitle ?? "",
    location: data.location ?? "",
    status: data.status ?? null,
    source: data.source ?? null,
    externalUrl: data.externalUrl ?? null,
    importContext: data.importContext ?? null,
    createdAt: data.createdAt
      ? data.createdAt instanceof Date
        ? data.createdAt
        : new Date(data.createdAt)
      : null,
    updatedAt: data.updatedAt
      ? data.updatedAt instanceof Date
        ? data.updatedAt
        : new Date(data.updatedAt)
      : null,
  }));

const companyJobsResponseSchema = z.object({
  companyId: z.string().nullable(),
  jobs: z.array(discoveredJobListItemSchema).default([]),
});

const companyListResponseSchema = z.object({
  companies: z.array(CompanySchema).default([]),
});

const userResponseSchema = UserSchema;

const subscriptionPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  headline: z.string().optional().default(""),
  description: z.string().optional().default(""),
  credits: z.number(),
  bonusCredits: z.number().optional().default(0),
  totalCredits: z.number(),
  priceUsd: z.number(),
  currency: z.string().default("USD"),
  bestFor: z.string().optional().default(""),
  perks: z.array(z.string()).default([]),
  badge: z.string().optional().nullable(),
  effectiveUsdPerCredit: z.number().optional().nullable(),
  markupMultiplier: z.number().optional().nullable(),
});

const subscriptionPlanListResponseSchema = z.object({
  plans: z.array(subscriptionPlanSchema).default([]),
  currency: z.string().default("USD"),
  usdPerCredit: z.number().optional().nullable(),
});

const subscriptionPurchaseResponseSchema = z
  .object({
    purchase: z
      .object({
        id: z.string(),
        planId: z.string(),
        planName: z.string(),
        credits: z.number(),
        bonusCredits: z.number(),
        totalCredits: z.number(),
        priceUsd: z.number(),
        currency: z.string(),
        processedAt: z.union([z.string(), z.date()]).optional().nullable(),
        paymentMethod: z
          .object({
            brand: z.string().optional().nullable(),
            last4: z.string().optional().nullable(),
          })
          .optional(),
      })
      .nullable(),
    credits: z
      .object({
        balance: z.number(),
        reserved: z.number(),
        lifetimeUsed: z.number(),
      })
      .optional(),
    usage: z
      .object({
        remainingCredits: z.number().optional(),
      })
      .passthrough()
      .optional(),
    user: z
      .object({
        id: z.string(),
      })
      .passthrough()
      .optional(),
  })
  .transform((data) => ({
    ...data,
    purchase: data.purchase
      ? {
          ...data.purchase,
          processedAt: data.purchase.processedAt
            ? data.purchase.processedAt instanceof Date
              ? data.purchase.processedAt
              : new Date(data.purchase.processedAt)
            : null,
        }
      : null,
  }));

const companyUpdateResponseSchema = z.object({
  company: CompanySchema,
});

const companyCreateResponseSchema = z.object({
  company: CompanySchema,
});

const setMainCompanyResponseSchema = z.object({
  success: z.boolean().optional(),
  mainCompanyId: z.string(),
});

const jobDetailsSchema = z
  .object({
    roleTitle: z.string().optional().nullable(),
    companyName: z.string().optional().nullable(),
    location: z.string().optional().nullable(),
    zipCode: z.string().optional().nullable(),
    industry: z.string().optional().nullable(),
    seniorityLevel: z.string().optional().nullable(),
    employmentType: z.string().optional().nullable(),
    workModel: z.string().optional().nullable(),
    jobDescription: z.string().optional().nullable(),
    coreDuties: z.array(z.string()).optional().nullable(),
    mustHaves: z.array(z.string()).optional().nullable(),
    benefits: z.array(z.string()).optional().nullable(),
    salary: z.string().optional().nullable(),
    salaryPeriod: z.string().optional().nullable(),
    currency: z.string().optional().nullable(),
  })
  .transform((data) => ({
    roleTitle: data.roleTitle ?? "",
    companyName: data.companyName ?? "",
    location: data.location ?? "",
    zipCode: data.zipCode ?? "",
    industry: data.industry ?? "",
    seniorityLevel: data.seniorityLevel ?? "",
    employmentType: data.employmentType ?? "",
    workModel: data.workModel ?? "",
    jobDescription: data.jobDescription ?? "",
    coreDuties: Array.isArray(data.coreDuties) ? data.coreDuties : [],
    mustHaves: Array.isArray(data.mustHaves) ? data.mustHaves : [],
    benefits: Array.isArray(data.benefits) ? data.benefits : [],
    salary: data.salary ?? "",
    salaryPeriod: data.salaryPeriod ?? "",
    currency: data.currency ?? "",
  }));

const refinementFailureSchema = z
  .object({
    reason: z.string(),
    message: z.string().optional().nullable(),
    rawPreview: z.string().optional().nullable(),
    occurredAt: z.union([z.string(), z.instanceof(Date)]).optional(),
  })
  .transform((data) => ({
    reason: data.reason,
    message: data.message ?? null,
    rawPreview: data.rawPreview ?? null,
    occurredAt:
      data.occurredAt instanceof Date
        ? data.occurredAt
        : data.occurredAt
          ? new Date(data.occurredAt)
          : null,
  }));

const refinementResponseSchema = z
  .object({
    jobId: z.string(),
    refinedJob: jobDetailsSchema,
    originalJob: jobDetailsSchema,
    summary: z.string().optional().nullable(),
    provider: z.string().optional().nullable(),
    model: z.string().optional().nullable(),
    updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
    refreshed: z.boolean().optional(),
    failure: refinementFailureSchema.optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .transform((data) => ({
    jobId: data.jobId,
    refinedJob: data.refinedJob,
    originalJob: data.originalJob,
    summary: data.summary ?? "",
    provider: data.provider ?? null,
    model: data.model ?? null,
    updatedAt: data.updatedAt ? new Date(data.updatedAt) : null,
    refreshed: Boolean(data.refreshed),
    failure: data.failure ?? null,
    metadata: data.metadata ?? null,
  }));

const finalizeResponseSchema = z
  .object({
    jobId: z.string(),
    finalJob: jobDetailsSchema,
    source: z.string().optional().nullable(),
    channelRecommendations: z.array(channelRecommendationSchema).optional(),
    channelUpdatedAt: z.union([z.string(), z.date()]).nullable().optional(),
    channelFailure: channelRecommendationFailureSchema.optional().nullable(),
  })
  .transform((data) => ({
    jobId: data.jobId,
    finalJob: data.finalJob,
    source: data.source ?? null,
    channelRecommendations: data.channelRecommendations ?? [],
    channelUpdatedAt: data.channelUpdatedAt
      ? new Date(data.channelUpdatedAt)
      : null,
    channelFailure: data.channelFailure ?? null,
  }));

const persistResponseSchema = z
  .object({
    jobId: z.string().optional(),
    draftId: z.string().optional(),
    status: z.string(),
    state: z.string().optional(),
    companyId: z.string().nullable().optional(),
    intake: z.record(z.string(), z.unknown()).optional(),
  })
  .transform((data) => {
    const jobId = data.jobId ?? data.draftId;
    if (!jobId) {
      throw new Error("Response missing jobId");
    }
    return {
      jobId,
      status: data.status,
      state: data.state ?? null,
      companyId: data.companyId ?? null,
      intake: data.intake ?? null,
    };
  });

const mergeResponseSchema = z.object({
  status: z.string(),
});

const copilotMessageSchema = z
  .object({
    id: z.string(),
    role: z.string(),
    type: z.string().optional().nullable(),
    content: z.string(),
    createdAt: z.union([z.string(), z.instanceof(Date)]),
    metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .transform((data) => ({
    ...data,
    createdAt:
      data.createdAt instanceof Date
        ? data.createdAt
        : new Date(data.createdAt),
  }));

const copilotActionSchema = z
  .object({
    type: z.string(),
    fieldId: z.string().optional(),
    value: z.unknown().optional(),
  })
  .catchall(z.unknown());

const copilotConversationResponseSchema = z.object({
  jobId: z.string(),
  messages: z.array(copilotMessageSchema).default([]),
  actions: z.array(copilotActionSchema).optional(),
  updatedJobSnapshot: z
    .record(z.string(), z.unknown())
    .optional()
    .nullable(),
  updatedRefinedSnapshot: z
    .record(z.string(), z.unknown())
    .optional()
    .nullable(),
  updatedAssets: z.array(z.unknown()).optional().nullable()
});

const dashboardSummarySchema = z.object({
  jobs: z.object({
    total: z.number(),
    active: z.number(),
    awaitingApproval: z.number(),
    draft: z.number(),
    states: z.record(z.string(), z.number()),
  }),
  assets: z.object({
    total: z.number(),
    approved: z.number(),
    queued: z.number(),
  }),
  campaigns: z.object({
    total: z.number(),
    live: z.number(),
    planned: z.number(),
  }),
  credits: z.object({
    balance: z.number(),
    reserved: z.number(),
    lifetimeUsed: z.number(),
  }),
  usage: z.object({
    tokens: z.number(),
    applies: z.number(),
    interviews: z.number(),
    hires: z.number(),
    remainingCredits: z.number().optional().default(0),
  }),
  updatedAt: z.string(),
});

const dashboardSummaryResponseSchema = z.object({
  summary: dashboardSummarySchema,
});

const dashboardCampaignSchema = z.object({
  campaignId: z.string(),
  jobId: z.string(),
  jobTitle: z.string(),
  logoUrl: z.string().optional().nullable(),
  channel: z.string(),
  status: z.string(),
  budget: z.number(),
  objective: z.string(),
  createdAt: z
    .union([z.string(), z.instanceof(Date)])
    .transform((value) =>
      value instanceof Date ? value.toISOString() : value
    ),
});

const dashboardCampaignResponseSchema = z.object({
  campaigns: z.array(dashboardCampaignSchema),
});

const dashboardLedgerEntrySchema = z.object({
  id: z.string(),
  jobId: z.string(),
  type: z.string(),
  workflow: z.string(),
  amount: z.number(),
  status: z.string(),
  purchaseAmountUsd: z.number().optional().nullable(),
  currency: z.string().optional().nullable(),
  occurredAt: z
    .union([z.string(), z.instanceof(Date)])
    .transform((value) =>
      value instanceof Date ? value.toISOString() : value
    ),
});

const dashboardLedgerResponseSchema = z.object({
  entries: z.array(dashboardLedgerEntrySchema),
});

const dashboardActivityEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  detail: z.string(),
  occurredAt: z
    .union([z.string(), z.instanceof(Date)])
    .transform((value) =>
      value instanceof Date ? value.toISOString() : value
    ),
});

const dashboardActivityResponseSchema = z.object({
  events: z.array(dashboardActivityEventSchema),
});

const wizardJobResponseSchema = z
  .object({
    jobId: z.string(),
    state: z.record(z.string(), z.unknown()).optional(),
    includeOptional: z.boolean().optional(),
    updatedAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
    status: z.string().nullable().optional(),
    companyId: z.string().nullable().optional(),
    importContext: jobImportContextSchema.optional(),
  })
  .transform((data) => ({
    jobId: data.jobId,
    state: data.state ?? {},
    includeOptional: Boolean(data.includeOptional),
    updatedAt: data.updatedAt
      ? data.updatedAt instanceof Date
        ? data.updatedAt
        : new Date(data.updatedAt)
      : null,
    status: data.status ?? null,
    companyId: data.companyId ?? null,
    importContext: data.importContext ?? null,
  }));

const wizardJobSummarySchema = z
  .object({
    id: z.string(),
    roleTitle: z.string().nullable().optional(),
    companyName: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    updatedAt: z.union([z.string(), z.instanceof(Date)]).nullable().optional(),
  })
  .transform((data) => ({
    id: data.id,
    roleTitle: data.roleTitle ?? "Untitled role",
    companyName: data.companyName ?? null,
    status: data.status ?? "draft",
    location: data.location ?? "",
    updatedAt: data.updatedAt
      ? data.updatedAt instanceof Date
        ? data.updatedAt
        : new Date(data.updatedAt)
      : null,
  }));

const heroImageSchema = z
  .object({
    jobId: z.string(),
    status: z.string(),
    prompt: z.string().nullable().optional(),
    promptProvider: z.string().nullable().optional(),
    promptModel: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    imageBase64: z.string().nullable().optional(),
    imageMimeType: z.string().nullable().optional(),
    imageProvider: z.string().nullable().optional(),
    imageModel: z.string().nullable().optional(),
    failure: z
      .object({
        reason: z.string(),
        message: z.string().nullable().optional(),
        rawPreview: z.string().nullable().optional(),
        occurredAt: z
          .union([z.string(), z.instanceof(Date)])
          .nullable()
          .optional(),
      })
      .nullable()
      .optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    updatedAt: z
      .union([z.string(), z.instanceof(Date)])
      .nullable()
      .optional(),
    caption: z.string().nullable().optional(),
    captionHashtags: z.array(z.string()).nullable().optional(),
  })
  .transform((data) => ({
    ...data,
    updatedAt: data.updatedAt
      ? data.updatedAt instanceof Date
        ? data.updatedAt
        : new Date(data.updatedAt)
      : null,
    failure: data.failure
      ? {
          ...data.failure,
          occurredAt: data.failure.occurredAt
            ? data.failure.occurredAt instanceof Date
              ? data.failure.occurredAt
              : new Date(data.failure.occurredAt)
            : null,
        }
      : null,
    caption: data.caption ?? null,
    captionHashtags: data.captionHashtags ?? null,
  }));

function authHeaders(authToken) {
  if (!authToken) {
    return {};
  }
  return {
    Authorization: `Bearer ${authToken}`,
  };
}

async function extractErrorMessage(response, fallbackMessage) {
  try {
    const data = await response.clone().json();
    const message =
      data?.error ||
      data?.message ||
      data?.details ||
      data?.result?.message ||
      null;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  } catch (_err) {
    /* ignore json parse errors */
  }
  try {
    const text = await response.text();
    if (text?.trim()) {
      return text;
    }
  } catch (_err) {
    /* ignore text parse errors */
  }
  return fallbackMessage;
}

export const WizardApi = {
  async fetchJob(jobId, options = {}) {
    const response = await fetch(`${API_BASE_URL}/wizard/${jobId}`, {
      headers: {
        ...authHeaders(options.authToken),
      },
    });

    if (!response.ok) {
      let message = "Failed to load job draft";
      try {
        const errorData = await response.json();
        if (typeof errorData?.error === "string") {
          message = errorData.error;
        }
      } catch (_error) {
        const text = await response.text();
        if (text) {
          message = text;
        }
      }
      throw new Error(message);
    }

    const data = await response.json();
    return wizardJobResponseSchema.parse(data);
  },

  async fetchJobs(options = {}) {
    const response = await fetch(`${API_BASE_URL}/wizard/jobs`, {
      headers: {
        ...authHeaders(options.authToken),
      },
    });

    if (!response.ok) {
      throw new Error("Failed to load jobs");
    }

    const data = await response.json();
    const parsed = z
      .object({ jobs: z.array(wizardJobSummarySchema).default([]) })
      .parse(data);
    return parsed.jobs;
  },

  async importCompanyJob(payload, options = {}) {
    const response = await fetch(`${API_BASE_URL}/wizard/import-company-job`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let message = "Unable to import company job";
      try {
        const body = await response.json();
        if (typeof body?.error === "string") {
          message = body.error;
        }
      } catch (_error) {
        const text = await response.text();
        if (text) {
          message = text;
        }
      }
      throw new Error(message);
    }

    const data = await response.json();
    return wizardJobResponseSchema.parse(data);
  },

  async fetchSuggestions(payload, options = {}) {
    const normalizedJobId =
      options.jobId === null || options.jobId === undefined
        ? payload.jobId
        : options.jobId;
    const response = await fetch(`${API_BASE_URL}/api/llm`, {
      method: "POST",
      signal: options.signal,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify({
        taskType: LLM_TASK.SUGGEST,
        context: {
          ...payload,
          jobId: normalizedJobId,
        },
      }),
    });

    if (!response.ok) {
      let message = "Suggestion fetch failed";
      try {
        const errorData = await response.json();
        if (typeof errorData?.error === "string") {
          message = errorData.error;
        }
      } catch (_error) {
        const text = await response.text();
        if (text) {
          message = text;
        }
      }
      throw new Error(message);
    }

    const data = await response.json();
    const responsePayload = data?.result ?? data ?? {};
    const suggestionCandidates = responsePayload.suggestions ?? [];
    const failure = responsePayload.failure ?? null;

    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[API] fetchSuggestions:raw-response", {
        hasSuggestions: Array.isArray(responsePayload?.suggestions),
        suggestionsCount: responsePayload?.suggestions?.length ?? 0,
        refreshed: responsePayload?.refreshed,
        rawData: responsePayload,
      });
    }

    const normalizedData = {
      ...responsePayload,
      jobId: responsePayload.jobId ?? normalizedJobId ?? null,
      suggestions: suggestionCandidates,
      updatedAt: responsePayload.updatedAt ?? null,
      refreshed: Boolean(responsePayload.refreshed),
      failure,
    };

    try {
      return copilotSuggestionResponseSchema.parse(normalizedData);
    } catch (parseError) {
      // eslint-disable-next-line no-console
      console.error("[API] fetchSuggestions:parse-error", {
        error: parseError,
        rawData: data,
      });
      throw parseError;
    }
  },

  async fetchChannelRecommendations(payload, options = {}) {
    const normalizedJobId =
      options.jobId === null || options.jobId === undefined
        ? payload.jobId
        : options.jobId;
    const response = await fetch(`${API_BASE_URL}/api/llm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify({
        taskType: LLM_TASK.CHANNELS,
        context: {
          ...payload,
          jobId: normalizedJobId,
        },
      }),
    });

    if (!response.ok) {
      let message = "Channel recommendation fetch failed";
      try {
        const errorData = await response.json();
        if (typeof errorData?.error === "string") {
          message = errorData.error;
        }
      } catch (_error) {
        const text = await response.text();
        if (text) {
          message = text;
        }
      }
      throw new Error(message);
    }

    const data = await response.json();
    const payloadData = data?.result ?? data ?? {};
    return channelRecommendationResponseSchema.parse(payloadData);
  },

  async fetchHeroImage(jobId, options = {}) {
    if (!jobId) {
      throw new Error("jobId is required to fetch image");
    }
    const response = await fetch(`${API_BASE_URL}/api/llm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify({
        taskType: LLM_TASK.HERO_IMAGE,
        context: {
          jobId,
          forceRefresh: false,
        },
      }),
    });
    if (!response.ok) {
      throw new Error("Failed to fetch image");
    }
    const data = await response.json();
    const payloadData = data?.result ?? data ?? {};
    return {
      jobId: payloadData.jobId ?? jobId,
      heroImage: payloadData.heroImage
        ? heroImageSchema.parse(payloadData.heroImage)
        : null,
    };
  },

  async requestHeroImage(payload, options = {}) {
    const response = await fetch(`${API_BASE_URL}/api/llm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify({
        taskType: LLM_TASK.HERO_IMAGE,
        context: payload,
      }),
    });
    if (!response.ok) {
      let message = "Image generation failed";
      try {
        const errorData = await response.json();
        if (typeof errorData?.error === "string") {
          message = errorData.error;
        }
      } catch (_error) {
        const text = await response.text();
        if (text) {
          message = text;
        }
      }
      throw new Error(message);
    }
    const data = await response.json();
    const payloadData = data?.result ?? data ?? {};
    return {
      jobId: payloadData.jobId,
      heroImage: payloadData.heroImage
        ? heroImageSchema.parse(payloadData.heroImage)
        : null,
    };
  },

  async fetchJobAssets(jobId, options = {}) {
    if (!jobId) {
      throw new Error("jobId required to fetch assets");
    }
    const response = await fetch(
      `${API_BASE_URL}/wizard/assets?jobId=${encodeURIComponent(jobId)}`,
      {
        method: "GET",
        headers: {
          ...authHeaders(options.authToken),
        },
      }
    );

    if (!response.ok) {
      let message = "Failed to load job assets";
      try {
        const errorData = await response.json();
        if (typeof errorData?.error === "string") {
          message = errorData.error;
        }
      } catch (_error) {
        const text = await response.text();
        if (text) {
          message = text;
        }
      }
      throw new Error(message);
    }

    const data = await response.json();
    const payload = data?.result ?? data;
    return jobAssetResponseSchema.parse(payload);
  },

  async fetchExistingChannelRecommendations(jobId, options = {}) {
    if (!jobId) {
      throw new Error("jobId required to fetch channel recommendations");
    }
    const response = await fetch(
      `${API_BASE_URL}/wizard/channels?jobId=${encodeURIComponent(jobId)}`,
      {
        method: "GET",
        headers: {
          ...authHeaders(options.authToken),
        },
      }
    );

    if (!response.ok) {
      let message = "Failed to load channel recommendations";
      try {
        const errorData = await response.json();
        if (typeof errorData?.error === "string") {
          message = errorData.error;
        }
      } catch (_error) {
        const text = await response.text();
        if (text) {
          message = text;
        }
      }
      throw new Error(message);
    }

    const data = await response.json();
    return {
      jobId: data.jobId,
      recommendations: data.recommendations ?? [],
      updatedAt: data.updatedAt ?? null,
      failure: data.failure ?? null,
    };
  },

  async fetchGlobalAssets(options = {}) {
    const params = new URLSearchParams();
    const jobId = typeof options.jobId === "string" ? options.jobId.trim() : "";
    if (jobId) {
      params.set("jobId", jobId);
    }
    const query = params.toString();
    const response = await fetch(`${API_BASE_URL}/assets${query ? `?${query}` : ""}`, {
      method: "GET",
      headers: {
        ...authHeaders(options.authToken)
      }
    });

    if (!response.ok) {
      throw new Error("Failed to load global assets");
    }

    const data = await response.json();
    return data.assets ?? [];
  },

  async generateJobAssets(payload, options = {}) {
    const response = await fetch(`${API_BASE_URL}/api/llm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify({
        taskType: LLM_TASK.GENERATE_CAMPAIGN_ASSETS,
        context: payload,
      }),
    });

    if (!response.ok) {
      let message = "Failed to generate assets";
      try {
        const errorData = await response.json();
        if (typeof errorData?.error === "string") {
          message = errorData.error;
        }
      } catch (_error) {
        const text = await response.text();
        if (text) {
          message = text;
        }
      }
      throw new Error(message);
    }

    const data = await response.json();
    const resultPayload = data?.result ?? data;
    return jobAssetResponseSchema.parse(resultPayload);
  },

  async refineJob(payload, options = {}) {
    const normalizedJobId =
      options.jobId === null || options.jobId === undefined
        ? payload.jobId
        : options.jobId;
    const response = await fetch(`${API_BASE_URL}/api/llm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify({
        taskType: LLM_TASK.REFINE,
        context: {
          ...payload,
          jobId: normalizedJobId,
        },
      }),
    });

    if (!response.ok) {
      let message = "Job refinement failed";
      try {
        const errorData = await response.json();
        if (typeof errorData?.error === "string") {
          message = errorData.error;
        }
      } catch (_error) {
        const text = await response.text();
        if (text) {
          message = text;
        }
      }
      throw new Error(message);
    }

    const data = await response.json();
    const raw = data?.result ?? data ?? {};
    const mergedPayload = {
      jobId:
        raw.jobId ??
        normalizedJobId ??
        payload.jobId ??
        (typeof options.jobId === "string" ? options.jobId : ""),
      refinedJob: raw.refinedJob ?? {},
      originalJob: raw.originalJob ?? {},
      summary: raw.summary,
      provider: raw.provider,
      model: raw.model,
      updatedAt: raw.updatedAt,
      refreshed: raw.refreshed,
      failure: raw.failure,
      metadata: raw.metadata,
    };
    return refinementResponseSchema.parse(mergedPayload);
  },

  async finalizeJob(payload, options = {}) {
    const normalizedJobId =
      options.jobId === null || options.jobId === undefined
        ? payload.jobId
        : options.jobId;
    const response = await fetch(`${API_BASE_URL}/wizard/refine/finalize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify({
        ...payload,
        jobId: normalizedJobId,
      }),
    });

    if (!response.ok) {
      let message = "Finalizing job failed";
      try {
        const errorData = await response.json();
        if (typeof errorData?.error === "string") {
          message = errorData.error;
        }
      } catch (_error) {
        const text = await response.text();
        if (text) {
          message = text;
        }
      }
      throw new Error(message);
    }

    const data = await response.json();
    const finalizeResult = finalizeResponseSchema.parse(data);

    let channelResult = {
      recommendations: [],
      updatedAt: null,
      failure: null,
    };

    try {
      const channelsResponse = await this.fetchChannelRecommendations(
        { jobId: finalizeResult.jobId, forceRefresh: true },
        options
      );
      channelResult = {
        recommendations: channelsResponse.recommendations ?? [],
        updatedAt: channelsResponse.updatedAt ?? null,
        failure: channelsResponse.failure ?? null,
      };
    } catch (channelError) {
      channelResult = {
        recommendations: [],
        updatedAt: null,
        failure: {
          reason: "channel_fetch_failed",
          message:
            channelError instanceof Error
              ? channelError.message
              : `${channelError}`,
          rawPreview: null,
          occurredAt: null,
        },
      };
    }

    return {
      ...finalizeResult,
      channelRecommendations: channelResult.recommendations,
      channelUpdatedAt: channelResult.updatedAt,
      channelFailure: channelResult.failure,
    };
  },

  async persistJob(state, options = {}) {
    const normalizedJobId =
      options.jobId === null || options.jobId === undefined
        ? undefined
        : options.jobId;
    const response = await fetch(`${API_BASE_URL}/wizard/draft`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify({
        state,
        jobId: normalizedJobId,
        intent: options.intent ?? {},
        currentStepId: options.currentStepId,
        companyId: options.companyId ?? null,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to persist draft");
    }

    const data = await response.json();
    return persistResponseSchema.parse(data);
  },

  async mergeSuggestion(payload, options = {}) {
    const response = await fetch(`${API_BASE_URL}/wizard/suggestions/merge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Failed to merge suggestion");
    }

    const data = await response.json();
    return mergeResponseSchema.parse(data);
  },

  async fetchCopilotConversation(jobId, options = {}) {
    const params = new URLSearchParams({ jobId });
    const response = await fetch(
      `${API_BASE_URL}/wizard/copilot/chat?${params.toString()}`,
      {
        method: "GET",
        headers: {
          ...authHeaders(options.authToken),
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to load copilot conversation");
    }

    const data = await response.json();
    const payload = data?.result ?? data;
    return copilotConversationResponseSchema.parse(payload);
  },

  async sendCopilotMessage(messagePayload, options = {}) {
    const response = await fetch(`${API_BASE_URL}/api/llm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify({
        taskType: LLM_TASK.COPILOT_AGENT,
        context: messagePayload,
      }),
    });

    if (!response.ok) {
      throw new Error("Copilot message failed");
    }

    const data = await response.json();
    const payload = data?.result ?? data;
    // Debug: log raw server response
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[API] sendCopilotMessage:raw-response", {
        jobId: payload?.jobId,
        hasMessages: Array.isArray(payload?.messages),
        messageCount: payload?.messages?.length ?? 0,
        messages: payload?.messages?.map((m) => ({
          id: m?.id,
          role: m?.role,
          hasContent: Boolean(m?.content),
          contentPreview: typeof m?.content === "string" ? m.content.slice(0, 100) : typeof m?.content,
        })),
        rawData: payload,
      });
    }
    try {
      return copilotConversationResponseSchema.parse(payload);
    } catch (parseError) {
      // eslint-disable-next-line no-console
      console.error("[API] sendCopilotMessage:parse-error", {
        error: parseError,
        rawData: payload,
      });
      throw parseError;
    }
  },

  async fetchCompanyOverview(options = {}) {
    const response = await fetch(`${API_BASE_URL}/companies/me`, {
      method: "GET",
      headers: {
        ...authHeaders(options.authToken),
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error("Failed to load company intelligence");
    }

    const data = await response.json();
    return companyOverviewResponseSchema.parse(data);
  },

  async fetchCompanyJobs(options = {}) {
    const response = await fetch(`${API_BASE_URL}/companies/me/jobs`, {
      method: "GET",
      headers: {
        ...authHeaders(options.authToken),
      },
    });

    if (response.status === 404) {
      return {
        companyId: null,
        jobs: [],
      };
    }

    if (!response.ok) {
      throw new Error("Failed to load discovered jobs");
    }

    const data = await response.json();
    return companyJobsResponseSchema.parse(data);
  },

  async fetchCompanyJobsByCompany(companyId, options = {}) {
    if (!companyId) {
      throw new Error("companyId is required");
    }
    const response = await fetch(
      `${API_BASE_URL}/companies/my-companies/${companyId}/jobs`,
      {
        method: "GET",
        headers: {
          ...authHeaders(options.authToken),
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to load discovered jobs for company");
    }

    const data = await response.json();
    return companyJobsResponseSchema.parse(data);
  },

  async fetchCompanyById(companyId, options = {}) {
    if (!companyId) {
      throw new Error("companyId is required");
    }
    const response = await fetch(
      `${API_BASE_URL}/companies/my-companies/${companyId}`,
      {
        method: "GET",
        headers: {
          ...authHeaders(options.authToken),
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to load company");
    }

    const data = await response.json();
    return companyUpdateResponseSchema.parse(data);
  },

  async confirmCompanyName(payload, options = {}) {
    const response = await fetch(`${API_BASE_URL}/companies/me/confirm-name`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let message = "Unable to confirm company name";
      try {
        const body = await response.json();
        if (typeof body?.error === "string") {
          message = body.error;
        }
      } catch (error) {
        const text = await response.text();
        if (text) message = text;
      }
      throw new Error(message);
    }

    const data = await response.json();
    const base = companyOverviewResponseSchema.parse(data);
    return base;
  },

  async confirmCompanyProfile(payload, options = {}) {
    const response = await fetch(
      `${API_BASE_URL}/companies/me/confirm-profile`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(options.authToken),
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      let message = "Unable to confirm company profile";
      try {
        const body = await response.json();
        if (typeof body?.error === "string") {
          message = body.error;
        }
      } catch {
        const text = await response.text();
        if (text) message = text;
      }
      throw new Error(message);
    }

    const data = await response.json();
    const base = companyOverviewResponseSchema.parse(data);
    return base;
  },

  async fetchMyCompanies(options = {}) {
    const response = await fetch(`${API_BASE_URL}/companies/my-companies`, {
      method: "GET",
      headers: {
        ...authHeaders(options.authToken),
      },
    });

    if (!response.ok) {
      throw new Error("Failed to load companies");
    }

    const data = await response.json();
    return companyListResponseSchema.parse(data);
  },

  async updateCompany(companyId, payload, options = {}) {
    const response = await fetch(
      `${API_BASE_URL}/companies/my-companies/${companyId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(options.authToken),
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      let message = "Unable to update company";
      try {
        const body = await response.json();
        if (typeof body?.error === "string") {
          message = body.error;
        }
      } catch {
        const text = await response.text();
        if (text) message = text;
      }
      throw new Error(message);
    }

    const data = await response.json();
    return companyUpdateResponseSchema.parse(data);
  },

  async createCompany(payload, options = {}) {
    const response = await fetch(`${API_BASE_URL}/companies/my-companies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let message = "Unable to create company";
      try {
        const body = await response.json();
        if (typeof body?.error === "string") {
          message = body.error;
        }
      } catch {
        const text = await response.text();
        if (text) message = text;
      }
      throw new Error(message);
    }

    const data = await response.json();
    return companyCreateResponseSchema.parse(data);
  },

  async setMainCompany(companyId, options = {}) {
    const response = await fetch(`${API_BASE_URL}/users/me/main-company`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify({ companyId }),
    });

    if (!response.ok) {
      let message = "Unable to update main company";
      try {
        const body = await response.json();
        if (typeof body?.error === "string") {
          message = body.error;
        }
      } catch {
        const text = await response.text();
        if (text) message = text;
      }
      throw new Error(message);
    }

    const data = await response.json();
    return setMainCompanyResponseSchema.parse(data);
  },
};

export const DashboardApi = {
  async fetchSummary(options = {}) {
    const response = await fetch(`${API_BASE_URL}/dashboard/summary`, {
      method: "GET",
      headers: {
        ...authHeaders(options.authToken),
      },
    });

    if (!response.ok) {
      throw new Error("Failed to load dashboard summary");
    }

    const data = await response.json();
    return dashboardSummaryResponseSchema.parse(data).summary;
  },

  async fetchCampaigns(options = {}) {
    const response = await fetch(`${API_BASE_URL}/dashboard/campaigns`, {
      method: "GET",
      headers: {
        ...authHeaders(options.authToken),
      },
    });

    if (!response.ok) {
      throw new Error("Failed to load campaigns");
    }

    const data = await response.json();
    return dashboardCampaignResponseSchema.parse(data).campaigns;
  },

  async fetchLedger(options = {}) {
    const response = await fetch(`${API_BASE_URL}/dashboard/ledger`, {
      method: "GET",
      headers: {
        ...authHeaders(options.authToken),
      },
    });

    if (!response.ok) {
      throw new Error("Failed to load credit ledger");
    }

    const data = await response.json();
    return dashboardLedgerResponseSchema.parse(data).entries;
  },

  async fetchActivity(options = {}) {
    const response = await fetch(`${API_BASE_URL}/dashboard/activity`, {
      method: "GET",
      headers: {
        ...authHeaders(options.authToken),
      },
    });

    if (!response.ok) {
      throw new Error("Failed to load activity feed");
    }

    const data = await response.json();
    return dashboardActivityResponseSchema.parse(data).events;
  },
};

export const UsersApi = {
  async fetchCurrentUser(options = {}) {
    const response = await fetch(`${API_BASE_URL}/users/me`, {
      method: "GET",
      headers: {
        ...authHeaders(options.authToken),
      },
    });

    if (!response.ok) {
      throw new Error("Failed to load user profile");
    }

    const data = await response.json();
    return userResponseSchema.parse(data);
  },
};

export const SubscriptionApi = {
  async listPlans(options = {}) {
    const response = await fetch(`${API_BASE_URL}/subscriptions/plans`, {
      method: "GET",
      headers: {
        ...authHeaders(options.authToken),
      },
    });

    if (!response.ok) {
      throw new Error("Failed to load subscription plans");
    }

    const data = await response.json();
    return subscriptionPlanListResponseSchema.parse(data);
  },

  async purchasePlan(payload, options = {}) {
    const response = await fetch(`${API_BASE_URL}/subscriptions/purchase`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Failed to process payment");
    }

    const data = await response.json();
    return subscriptionPurchaseResponseSchema.parse(data);
  },
};

const videoThumbnailSchema = z
  .object({
    description: z.string().optional().nullable(),
    overlayText: z.string().optional().nullable(),
  })
  .optional()
  .transform((data) => data ?? null);

const videoJobSnapshotSchema = z.object({
  jobId: z.string(),
  title: z.string(),
  company: z.string().nullable().optional(),
  geo: z.string().nullable().optional(),
  locationPolicy: z.string().nullable().optional(),
  payRange: z.string().nullable().optional(),
  benefits: z.array(z.string()).default([]),
  roleFamily: z.string().nullable().optional(),
});

const storyboardShotSchema = z.object({
  id: z.string(),
  phase: z.string(),
  order: z.number(),
  startSeconds: z.number(),
  durationSeconds: z.number(),
  visual: z.string().optional().nullable(),
  onScreenText: z.string().optional().nullable(),
  voiceOver: z.string().optional().nullable(),
});

const videoCaptionSchema = z.object({
  text: z.string(),
  hashtags: z.array(z.string()).default([]),
});

const videoManifestSchema = z.object({
  manifestId: z.string(),
  version: z.number(),
  placementName: z.string(),
  job: videoJobSnapshotSchema,
  storyboard: z.array(storyboardShotSchema).default([]),
  caption: videoCaptionSchema,
  thumbnail: videoThumbnailSchema,
  compliance: z
    .object({
      flags: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            severity: z.string(),
            details: z.string().nullable().optional(),
          })
        )
        .default([]),
      qaChecklist: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            status: z.string(),
            details: z.string().nullable().optional(),
          })
        )
        .default([]),
    })
    .default({ flags: [], qaChecklist: [] }),
  tracking: z
    .object({
      utmSource: z.string(),
      utmMedium: z.string(),
      utmCampaign: z.string(),
      utmContent: z.string(),
    })
    .optional(),
});

const generationMetricsSchema = z
  .object({
    secondsGenerated: z.number().nullable().optional(),
    extendsRequested: z.number().nullable().optional(),
    extendsCompleted: z.number().nullable().optional(),
    model: z.string().nullable().optional(),
    tier: z.string().nullable().optional(),
    costEstimateUsd: z.number().nullable().optional(),
    synthIdWatermark: z.boolean().nullable().optional(),
  })
  .nullable()
  .optional();

const veoStateSchema = z
  .object({
    operationName: z.string().nullable().optional(),
    status: z.string().default("none"),
    attempts: z.number().nullable().optional(),
    lastFetchAt: z.union([z.string(), z.date()]).nullable().optional(),
    hash: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

const videoListItemSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  jobTitle: z.string(),
  channelId: z.string(),
  channelName: z.string(),
  placementName: z.string(),
  status: z.string(),
  manifestVersion: z.number(),
  durationSeconds: z.number().nullable().optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
  thumbnail: videoThumbnailSchema,
  hasVideo: z.boolean().optional().default(false),
});

const videoDetailSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  jobSnapshot: videoJobSnapshotSchema,
  channelId: z.string(),
  channelName: z.string(),
  placementName: z.string(),
  status: z.string(),
  manifestVersion: z.number(),
  // Manifest may be absent immediately after creation (generated async)
  manifest: videoManifestSchema.optional().nullable(),
  veo: veoStateSchema,
  renderTask: z.record(z.string(), z.unknown()).nullable().optional(),
  publishTask: z.record(z.string(), z.unknown()).nullable().optional(),
  generationMetrics: generationMetricsSchema,
  analytics: z.record(z.string(), z.unknown()).default({}),
  auditLog: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        message: z.string(),
        occurredAt: z.union([z.string(), z.date()]),
      })
    )
    .default([]),
  playback: z
    .object({
      type: z.string(),
      videoUrl: z.string().nullable().optional(),
      posterUrl: z.string().nullable().optional(),
      captionFileUrl: z.string().nullable().optional(),
      storyboard: z.array(storyboardShotSchema).optional(),
      durationSeconds: z.number().optional(),
      caption: videoCaptionSchema.optional(),
      synthesis: z
        .object({
          clipId: z.string().nullable().optional(),
          extends: z
            .array(
              z.object({
                hop: z.number().optional(),
                clipId: z.string().nullable().optional(),
              })
            )
            .optional(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  trackingString: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

const videoJobsResponseSchema = z.object({
  jobs: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        company: z.string().nullable().optional(),
        location: z.string().optional(),
        payRange: z.string().nullable().optional(),
        benefits: z.array(z.string()).default([]),
      })
    )
    .default([]),
});

export const VideoLibraryApi = {
  async fetchItems(filters = {}, options = {}) {
    const params = new URLSearchParams();
    if (filters.channelId) params.set("channelId", filters.channelId);
    if (filters.status) params.set("status", filters.status);
    if (filters.geo) params.set("geo", filters.geo);
    if (filters.roleFamily) params.set("roleFamily", filters.roleFamily);
    const query = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(`${API_BASE_URL}/videos${query}`, {
      headers: {
        ...authHeaders(options.authToken),
      },
    });

    if (!response.ok) {
      throw new Error("Failed to load video library");
    }

    const data = await response.json();
    const parsed = z
      .object({ items: z.array(videoListItemSchema).default([]) })
      .parse(data);
    return parsed.items.map((item) => ({
      ...item,
      updatedAt: item.updatedAt ? new Date(item.updatedAt) : null,
    }));
  },

  async fetchJobs(options = {}) {
    const response = await fetch(`${API_BASE_URL}/videos/jobs`, {
      headers: {
        ...authHeaders(options.authToken),
      },
    });
    if (!response.ok) {
      throw new Error("Failed to load jobs for videos");
    }
    return videoJobsResponseSchema.parse(await response.json()).jobs;
  },

  async createItem(payload, options = {}) {
    console.info("[video] createItem -> payload", payload);
    const response = await fetch(`${API_BASE_URL}/api/llm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify({
        taskType: LLM_TASK.VIDEO_CREATE_MANIFEST,
        context: payload,
      }),
    });
    if (!response.ok) {
      const message = await extractErrorMessage(
        response,
        "Failed to create video asset"
      );
      throw new Error(message);
    }
    const data = await response.json();
    console.info("[video] createItem <- response", data);
    const resultBlock = data?.result;
    // server may return nested: { result: { item: { item: {...}, renderQueued } } }
    const item =
      resultBlock?.item?.item?.item ?? // overly nested just in case
      resultBlock?.item?.item ??
      resultBlock?.item ??
      data.item;
    if (!item) {
      throw new Error("Video creation did not return an item");
    }
    return videoDetailSchema.parse(item);
  },

  async fetchItem(itemId, options = {}) {
    const response = await fetch(`${API_BASE_URL}/videos/${itemId}`, {
      headers: {
        ...authHeaders(options.authToken),
      },
    });
    if (!response.ok) {
      throw new Error("Failed to load video item");
    }
    const data = await response.json();
    const item = data?.result?.item ?? data.item;
    return videoDetailSchema.parse(item);
  },

  async regenerate(itemId, payload, options = {}) {
    console.info("[video] regenerate -> itemId", itemId, "payload", payload);
    const response = await fetch(`${API_BASE_URL}/api/llm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify({
        taskType: LLM_TASK.VIDEO_REGENERATE,
        context: { itemId, ...payload },
      }),
    });
    if (!response.ok) {
      const message = await extractErrorMessage(
        response,
        "Failed to regenerate manifest"
      );
      throw new Error(message);
    }
    const data = await response.json();
    console.info("[video] regenerate <- response", data);
    const item = data?.result?.item ?? data.item;
    if (!item) {
      throw new Error("Video regenerate did not return an item");
    }
    return videoDetailSchema.parse(item);
  },

  async triggerRender(itemId, options = {}) {
    console.info("[video] triggerRender -> itemId", itemId);
    const response = await fetch(`${API_BASE_URL}/api/llm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify({
        taskType: LLM_TASK.VIDEO_RENDER,
        context: { itemId },
      }),
   });
   if (!response.ok) {
      const message = await extractErrorMessage(
        response,
        "Failed to trigger render"
      );
      throw new Error(message);
    }
    const data = await response.json();
    console.info("[video] triggerRender <- response", data);
    const item = data?.result?.item ?? data.item;
    if (!item) {
      throw new Error("Video render did not return an item");
    }
    return videoDetailSchema.parse(item);
  },

  async updateCaption(itemId, payload, options = {}) {
    console.info("[video] updateCaption -> itemId", itemId, "payload", payload);
    const response = await fetch(`${API_BASE_URL}/api/llm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify({
        taskType: LLM_TASK.VIDEO_CAPTION_UPDATE,
        context: { itemId, ...payload },
      }),
   });
   if (!response.ok) {
      const message = await extractErrorMessage(
        response,
        "Failed to update caption"
      );
      throw new Error(message);
    }
    const data = await response.json();
    console.info("[video] updateCaption <- response", data);
    const item = data?.result?.item ?? data.item;
    if (!item) {
      throw new Error("Video caption update did not return an item");
    }
    return videoDetailSchema.parse(item);
  },

  async approve(itemId, options = {}) {
    const response = await fetch(`${API_BASE_URL}/videos/${itemId}/approve`, {
      method: "POST",
      headers: {
        ...authHeaders(options.authToken),
      },
    });
    if (!response.ok) {
      throw new Error("Failed to approve video");
    }
    const data = await response.json();
    return videoDetailSchema.parse(data.item);
  },

  async publish(itemId, options = {}) {
    const response = await fetch(`${API_BASE_URL}/videos/${itemId}/publish`, {
      method: "POST",
      headers: {
        ...authHeaders(options.authToken),
      },
    });
    if (!response.ok) {
      throw new Error("Failed to publish video");
    }
    const data = await response.json();
    return videoDetailSchema.parse(data.item);
  },

  async bulkAction(payload, options = {}) {
    const response = await fetch(`${API_BASE_URL}/videos/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error("Failed to run bulk action");
    }
    const data = await response.json();
    const parsed = z
      .object({ items: z.array(videoListItemSchema).default([]) })
      .parse(data);
    return parsed.items;
  },
};

// =============================================================================
// GOLDEN INTERVIEW API (Standalone - No Wizard Dependencies)
// =============================================================================

const goldenInterviewStartResponseSchema = z.object({
  sessionId: z.string(),
  message: z.string().optional(),
  ui_tool: z
    .object({
      type: z.string(),
      props: z.record(z.string(), z.unknown()).optional(),
    })
    .optional()
    .nullable(),
});

const goldenInterviewChatResponseSchema = z.object({
  message: z.string().optional(),
  ui_tool: z
    .object({
      type: z.string(),
      props: z.record(z.string(), z.unknown()).optional(),
    })
    .optional()
    .nullable(),
});

export const GoldenInterviewApi = {
  /**
   * Start a new golden interview session (fresh start, no context required)
   * POST /golden-interview/start
   * @param {Object} options - { authToken, signal }
   * @returns {Promise<{ sessionId: string, message?: string, ui_tool?: object }>}
   */
  async startSession(options = {}) {
    const response = await fetch(`${API_BASE_URL}/golden-interview/start`, {
      method: "POST",
      signal: options.signal,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const message = await extractErrorMessage(
        response,
        "Failed to start golden interview session"
      );
      throw new Error(message);
    }

    const data = await response.json();
    return goldenInterviewStartResponseSchema.parse(data);
  },

  /**
   * Send a message in an ongoing golden interview session
   * POST /golden-interview/chat
   * @param {Object} payload - { sessionId, message, value? }
   * @param {Object} options - { authToken, signal }
   * @returns {Promise<{ message?: string, ui_tool?: object }>}
   */
  async sendMessage(payload, options = {}) {
    const response = await fetch(`${API_BASE_URL}/golden-interview/chat`, {
      method: "POST",
      signal: options.signal,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await extractErrorMessage(
        response,
        "Failed to send message"
      );
      throw new Error(message);
    }

    const data = await response.json();
    return goldenInterviewChatResponseSchema.parse(data);
  },
};
