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

function authHeaders(userId) {
  if (!userId) {
    return {};
  }
  return {
    "x-user-id": userId
  };
}

export const WizardApi = {
  async fetchSuggestions(payload, options = {}) {
    const normalizedJobId =
      options.jobId === null || options.jobId === undefined ? payload.jobId : options.jobId;
    const response = await fetch(`${API_BASE_URL}/wizard/suggestions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.userId)
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

  async persistJob(state, options = {}) {
    const normalizedJobId =
      options.jobId === null || options.jobId === undefined ? undefined : options.jobId;
    const response = await fetch(`${API_BASE_URL}/wizard/draft`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.userId)
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
        ...authHeaders(options.userId)
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
        ...authHeaders(options.userId)
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
        ...authHeaders(options.userId)
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
        ...authHeaders(options.userId)
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
        ...authHeaders(options.userId)
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
        ...authHeaders(options.userId)
      }
    });

    if (!response.ok) {
      throw new Error("Failed to load activity feed");
    }

    const data = await response.json();
    return dashboardActivityResponseSchema.parse(data).events;
  }
};
