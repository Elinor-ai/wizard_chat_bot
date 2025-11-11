import { z } from "zod";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const valueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.record(z.string(), z.unknown()),
  z.array(z.unknown()),
  z.null()
]);

const suggestionSchema = z.object({
  fieldId: z.string(),
  value: valueSchema,
  rationale: z.string().optional(),
  confidence: z.number().optional(),
  source: z.string().optional()
});

const suggestionFailureSchema = z
  .object({
    reason: z.string(),
    rawPreview: z.string().optional().nullable(),
    error: z.string().optional().nullable(),
    occurredAt: z.union([z.string(), z.instanceof(Date)]).optional()
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
        : null
  }));

const copilotSuggestionResponseSchema = z
  .object({
    jobId: z.string().optional(),
    suggestions: z.array(suggestionSchema).optional(),
    updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
    refreshed: z.boolean().optional(),
    failure: suggestionFailureSchema.optional().nullable()
  })
  .transform((data) => ({
    jobId: data.jobId ?? null,
    suggestions: data.suggestions ?? [],
    updatedAt: data.updatedAt ? new Date(data.updatedAt) : null,
    refreshed: Boolean(data.refreshed),
    failure: data.failure ?? null
  }));

const channelRecommendationSchema = z.object({
  channel: z.string(),
  reason: z.string(),
  expectedCPA: z.number().optional()
});

const channelRecommendationFailureSchema = z
  .object({
    reason: z.string(),
    message: z.string().optional().nullable(),
    rawPreview: z.string().optional().nullable(),
    occurredAt: z.union([z.string(), z.instanceof(Date)]).optional()
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
        : null
  }));

const channelRecommendationResponseSchema = z
  .object({
    jobId: z.string(),
    recommendations: z.array(channelRecommendationSchema).optional(),
    updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
    refreshed: z.boolean().optional(),
    failure: channelRecommendationFailureSchema.optional().nullable()
  })
  .transform((data) => ({
    jobId: data.jobId,
    recommendations: data.recommendations ?? [],
    updatedAt: data.updatedAt ? new Date(data.updatedAt) : null,
    refreshed: Boolean(data.refreshed),
    failure: data.failure ?? null
  }));

const jobAssetFailureSchema = z
  .object({
    reason: z.string(),
    message: z.string().optional().nullable(),
    rawPreview: z.string().optional().nullable(),
    occurredAt: z.union([z.string(), z.instanceof(Date)]).optional()
  })
  .transform((data) => ({
    reason: data.reason,
    message: data.message ?? null,
    rawPreview: data.rawPreview ?? null,
    occurredAt: data.occurredAt
      ? data.occurredAt instanceof Date
        ? data.occurredAt
        : new Date(data.occurredAt)
      : null
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
    content: z.record(z.string(), z.unknown()).optional(),
    failure: jobAssetFailureSchema.optional().nullable(),
    updatedAt: z.union([z.string(), z.instanceof(Date)]).nullable().optional()
  })
  .transform((data) => ({
    ...data,
    updatedAt: data.updatedAt
      ? data.updatedAt instanceof Date
        ? data.updatedAt
        : new Date(data.updatedAt)
      : null
  }));

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
        responseTokens: z.number().optional().nullable()
      })
      .optional(),
    startedAt: z.union([z.string(), z.instanceof(Date)]).nullable().optional(),
    completedAt: z.union([z.string(), z.instanceof(Date)]).nullable().optional(),
    error: z
      .object({
        reason: z.string(),
        message: z.string().nullable().optional()
      })
      .nullable()
      .optional()
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
      : null
  }));

const jobAssetResponseSchema = z.object({
  jobId: z.string(),
  assets: z.array(jobAssetSchema).default([]),
  run: jobAssetRunSchema.nullable().optional()
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
    currency: z.string().optional().nullable()
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
    currency: data.currency ?? ""
  }));

const refinementFailureSchema = z
  .object({
    reason: z.string(),
    message: z.string().optional().nullable(),
    rawPreview: z.string().optional().nullable(),
    occurredAt: z.union([z.string(), z.instanceof(Date)]).optional()
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
        : null
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
    failure: refinementFailureSchema.optional().nullable()
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
    failure: data.failure ?? null
  }));

const finalizeResponseSchema = z
  .object({
    jobId: z.string(),
    finalJob: jobDetailsSchema,
    source: z.string().optional().nullable(),
    channelRecommendations: z
      .array(channelRecommendationSchema)
      .optional(),
    channelUpdatedAt: z.union([z.string(), z.date()]).nullable().optional(),
    channelFailure: channelRecommendationFailureSchema.optional().nullable()
  })
  .transform((data) => ({
    jobId: data.jobId,
    finalJob: data.finalJob,
    source: data.source ?? null,
    channelRecommendations: data.channelRecommendations ?? [],
    channelUpdatedAt: data.channelUpdatedAt
      ? new Date(data.channelUpdatedAt)
      : null,
    channelFailure: data.channelFailure ?? null
  }));

const persistResponseSchema = z
  .object({
    jobId: z.string().optional(),
    draftId: z.string().optional(),
    status: z.string(),
    state: z.string().optional()
  })
  .transform((data) => {
    const jobId = data.jobId ?? data.draftId;
    if (!jobId) {
      throw new Error("Response missing jobId");
    }
    return {
      jobId,
      status: data.status,
      state: data.state ?? null
    };
  });

const mergeResponseSchema = z.object({
  status: z.string()
});

const chatResponseSchema = z.object({
  assistantMessage: z.string()
});

const dashboardSummarySchema = z.object({
  jobs: z.object({
    total: z.number(),
    active: z.number(),
    awaitingApproval: z.number(),
    draft: z.number(),
    states: z.record(z.string(), z.number())
  }),
  assets: z.object({
    total: z.number(),
    approved: z.number(),
    queued: z.number()
  }),
  campaigns: z.object({
    total: z.number(),
    live: z.number(),
    planned: z.number()
  }),
  credits: z.object({
    balance: z.number(),
    reserved: z.number(),
    lifetimeUsed: z.number()
  }),
  usage: z.object({
    tokens: z.number(),
    applies: z.number(),
    interviews: z.number(),
    hires: z.number()
  }),
  updatedAt: z.string()
});

const dashboardSummaryResponseSchema = z.object({
  summary: dashboardSummarySchema
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
  createdAt: z.union([z.string(), z.instanceof(Date)]).transform((value) =>
    value instanceof Date ? value.toISOString() : value
  )
});

const dashboardCampaignResponseSchema = z.object({
  campaigns: z.array(dashboardCampaignSchema)
});

const dashboardLedgerEntrySchema = z.object({
  id: z.string(),
  jobId: z.string(),
  type: z.string(),
  workflow: z.string(),
  amount: z.number(),
  status: z.string(),
  occurredAt: z.union([z.string(), z.instanceof(Date)]).transform((value) =>
    value instanceof Date ? value.toISOString() : value
  )
});

const dashboardLedgerResponseSchema = z.object({
  entries: z.array(dashboardLedgerEntrySchema)
});

const dashboardActivityEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  detail: z.string(),
  occurredAt: z.union([z.string(), z.instanceof(Date)]).transform((value) =>
    value instanceof Date ? value.toISOString() : value
  )
});

const dashboardActivityResponseSchema = z.object({
  events: z.array(dashboardActivityEventSchema)
});

const wizardJobResponseSchema = z
  .object({
    jobId: z.string(),
    state: z.record(z.string(), z.unknown()).optional(),
    includeOptional: z.boolean().optional(),
    updatedAt: z.union([z.string(), z.instanceof(Date)]).nullable().optional(),
    status: z.string().nullable().optional()
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
    status: data.status ?? null
  }));

function authHeaders(authToken) {
  if (!authToken) {
    return {};
  }
  return {
    Authorization: `Bearer ${authToken}`
  };
}

export const WizardApi = {
  async fetchJob(jobId, options = {}) {
    const response = await fetch(`${API_BASE_URL}/wizard/${jobId}`, {
      headers: {
        ...authHeaders(options.authToken)
      }
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

  async fetchSuggestions(payload, options = {}) {
    const normalizedJobId =
      options.jobId === null || options.jobId === undefined ? payload.jobId : options.jobId;
    const response = await fetch(`${API_BASE_URL}/wizard/suggestions`, {
      method: "POST",
      signal: options.signal,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken)
      },
      body: JSON.stringify({
        ...payload,
        jobId: normalizedJobId
      })
    });

    if (!response.ok) {
      throw new Error("Suggestion fetch failed");
    }

    const data = await response.json();
    return copilotSuggestionResponseSchema.parse(data);
  },

  async fetchChannelRecommendations(payload, options = {}) {
    const normalizedJobId =
      options.jobId === null || options.jobId === undefined ? payload.jobId : options.jobId;
    const response = await fetch(`${API_BASE_URL}/wizard/channels/recommendations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken)
      },
      body: JSON.stringify({
        ...payload,
        jobId: normalizedJobId
      })
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
    return channelRecommendationResponseSchema.parse(data);
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
          ...authHeaders(options.authToken)
        }
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
    return jobAssetResponseSchema.parse(data);
  },

  async generateJobAssets(payload, options = {}) {
    const response = await fetch(`${API_BASE_URL}/wizard/assets/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken)
      },
      body: JSON.stringify(payload)
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
    return jobAssetResponseSchema.parse(data);
  },

  async refineJob(payload, options = {}) {
    const normalizedJobId =
      options.jobId === null || options.jobId === undefined ? payload.jobId : options.jobId;
    const response = await fetch(`${API_BASE_URL}/wizard/refine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken)
      },
      body: JSON.stringify({
        ...payload,
        jobId: normalizedJobId
      })
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
    return refinementResponseSchema.parse(data);
  },

  async finalizeJob(payload, options = {}) {
    const normalizedJobId =
      options.jobId === null || options.jobId === undefined ? payload.jobId : options.jobId;
    const response = await fetch(`${API_BASE_URL}/wizard/refine/finalize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken)
      },
      body: JSON.stringify({
        ...payload,
        jobId: normalizedJobId
      })
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
    return finalizeResponseSchema.parse(data);
  },

  async persistJob(state, options = {}) {
    const normalizedJobId =
      options.jobId === null || options.jobId === undefined ? undefined : options.jobId;
    const response = await fetch(`${API_BASE_URL}/wizard/draft`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken)
      },
      body: JSON.stringify({
        state,
        jobId: normalizedJobId,
        intent: options.intent ?? {},
        currentStepId: options.currentStepId
      })
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
        ...authHeaders(options.authToken)
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error("Failed to merge suggestion");
    }

    const data = await response.json();
    return mergeResponseSchema.parse(data);
  },

  async sendChatMessage(payload, options = {}) {
    const response = await fetch(`${API_BASE_URL}/chat/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken)
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error("Chat message failed");
    }

    const data = await response.json();
    return chatResponseSchema.parse(data);
  }
};

export const DashboardApi = {
  async fetchSummary(options = {}) {
    const response = await fetch(`${API_BASE_URL}/dashboard/summary`, {
      method: "GET",
      headers: {
        ...authHeaders(options.authToken)
      }
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
        ...authHeaders(options.authToken)
      }
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
        ...authHeaders(options.authToken)
      }
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
        ...authHeaders(options.authToken)
      }
    });

    if (!response.ok) {
      throw new Error("Failed to load activity feed");
    }

    const data = await response.json();
    return dashboardActivityResponseSchema.parse(data).events;
  }
};
