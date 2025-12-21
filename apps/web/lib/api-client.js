import { z } from "zod";
import { LLM_TASK } from "./llm-tasks";

// Import all schemas from the schemas folder
import {
  // Auth
  userResponseSchema,
  authResponseSchema,
  userUpdateResponseSchema,
  changePasswordResponseSchema,
  // Suggestions
  copilotSuggestionResponseSchema,
  // Channels
  channelRecommendationResponseSchema,
  // Assets
  jobAssetResponseSchema,
  // Jobs
  wizardJobResponseSchema,
  wizardJobSummarySchema,
  refinementResponseSchema,
  finalizeResponseSchema,
  persistResponseSchema,
  mergeResponseSchema,
  heroImageSchema,
  // Companies
  companyOverviewResponseSchema,
  companyJobsResponseSchema,
  companyListResponseSchema,
  companyUpdateResponseSchema,
  companyCreateResponseSchema,
  setMainCompanyResponseSchema,
  // Copilot
  copilotConversationResponseSchema,
  // Dashboard
  dashboardSummaryResponseSchema,
  dashboardCampaignResponseSchema,
  dashboardLedgerResponseSchema,
  dashboardActivityResponseSchema,
  // Subscriptions
  subscriptionPlanListResponseSchema,
  subscriptionPurchaseResponseSchema,
  // Video
  videoListItemSchema,
  videoDetailSchema,
  videoJobsResponseSchema,
  // Interview
  goldenInterviewStartResponseSchema,
  goldenInterviewChatResponseSchema,
} from "./schemas/index.js";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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
    const response = await fetch(
      `${API_BASE_URL}/assets${query ? `?${query}` : ""}`,
      {
        method: "GET",
        headers: {
          ...authHeaders(options.authToken),
        },
      }
    );

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
          contentPreview:
            typeof m?.content === "string"
              ? m.content.slice(0, 100)
              : typeof m?.content,
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

  /**
   * Update user profile
   * PATCH /users/me
   * @param {Object} payload - { profile: { name, companyName, phone, timezone, locale } }
   * @param {Object} options - { authToken }
   * @returns {Promise<User>}
   */
  async updateProfile(payload, options = {}) {
    const response = await fetch(`${API_BASE_URL}/users/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await extractErrorMessage(
        response,
        "Failed to update profile"
      );
      throw new Error(message);
    }

    const data = await response.json();
    return userUpdateResponseSchema.parse(data);
  },

  /**
   * Update user preferences and experiments
   * PATCH /users/me
   * @param {Object} payload - { preferences, experiments }
   * @param {Object} options - { authToken }
   * @returns {Promise<User>}
   */
  async updatePreferences(payload, options = {}) {
    const response = await fetch(`${API_BASE_URL}/users/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await extractErrorMessage(
        response,
        "Failed to update preferences"
      );
      throw new Error(message);
    }

    const data = await response.json();
    return userUpdateResponseSchema.parse(data);
  },

  /**
   * Change user password
   * POST /users/me/change-password
   * @param {Object} payload - { currentPassword, newPassword }
   * @param {Object} options - { authToken }
   * @returns {Promise<Object>}
   */
  async changePassword(payload, options = {}) {
    const response = await fetch(`${API_BASE_URL}/users/me/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.authToken),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const message =
        data?.error?.message ?? data?.error ?? "Failed to change password";
      throw new Error(message);
    }

    const data = await response.json();
    return changePasswordResponseSchema.parse(data);
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

export const GoldenInterviewApi = {
  /**
   * Start a new golden interview session
   * POST /golden-interview/start
   * @param {Object} options - { authToken, signal, initialData? }
   * @param {Object} options.initialData - Optional pre-flight context (e.g., { companyId })
   * @returns {Promise<{ sessionId: string, message?: string, ui_tool?: object }>}
   */
  async startSession(options = {}) {
    const { authToken, signal, initialData = {} } = options;

    const response = await fetch(`${API_BASE_URL}/golden-interview/start`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(authToken),
      },
      body: JSON.stringify({ initialData }),
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

  /**
   * Navigate to a specific turn in the interview history
   * POST /golden-interview/session/:sessionId/navigate
   * @param {string} sessionId - Session ID
   * @param {number} targetTurnIndex - The turn index to navigate to
   * @param {Object} options - { authToken, signal }
   * @returns {Promise<object>} Turn data with navigation state
   */
  async navigateToTurn(sessionId, targetTurnIndex, options = {}) {
    const response = await fetch(
      `${API_BASE_URL}/golden-interview/session/${sessionId}/navigate`,
      {
        method: "POST",
        signal: options.signal,
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(options.authToken),
        },
        body: JSON.stringify({ targetTurnIndex }),
      }
    );

    if (!response.ok) {
      const message = await extractErrorMessage(
        response,
        "Failed to navigate"
      );
      throw new Error(message);
    }

    return response.json();
  },

  /**
   * Get turns summary for navigation UI
   * GET /golden-interview/session/:sessionId/turns
   * @param {string} sessionId - Session ID
   * @param {Object} options - { authToken, signal }
   * @returns {Promise<{turns: array, currentIndex: number, maxIndex: number}>}
   */
  async getTurnsSummary(sessionId, options = {}) {
    const response = await fetch(
      `${API_BASE_URL}/golden-interview/session/${sessionId}/turns`,
      {
        signal: options.signal,
        headers: {
          ...authHeaders(options.authToken),
        },
      }
    );

    if (!response.ok) {
      const message = await extractErrorMessage(
        response,
        "Failed to get turns"
      );
      throw new Error(message);
    }

    return response.json();
  },

  /**
   * Get the current golden schema for a session
   * GET /golden-interview/session/:sessionId/schema
   * @param {string} sessionId
   * @param {Object} options - { authToken, signal }
   * @returns {Promise<{ success: boolean, sessionId: string, goldenSchema: Object }>}
   */
  async getSchema(sessionId, options = {}) {
    const response = await fetch(
      `${API_BASE_URL}/golden-interview/session/${sessionId}/schema`,
      {
        signal: options.signal,
        headers: {
          ...authHeaders(options.authToken),
        },
      }
    );

    if (!response.ok) {
      const message = await extractErrorMessage(
        response,
        "Failed to get schema"
      );
      throw new Error(message);
    }

    return response.json();
  },

  /**
   * Get conversation history for a session
   * GET /golden-interview/session/:sessionId/history
   * @param {string} sessionId
   * @param {Object} options - { authToken, signal }
   * @returns {Promise<{ success: boolean, sessionId: string, history: Array }>}
   */
  async getHistory(sessionId, options = {}) {
    const response = await fetch(
      `${API_BASE_URL}/golden-interview/session/${sessionId}/history`,
      {
        signal: options.signal,
        headers: {
          ...authHeaders(options.authToken),
        },
      }
    );

    if (!response.ok) {
      const message = await extractErrorMessage(
        response,
        "Failed to get history"
      );
      throw new Error(message);
    }

    return response.json();
  },

  /**
   * Get session status (for restoring a session after page refresh)
   * GET /golden-interview/session/:sessionId
   * @param {string} sessionId
   * @param {Object} options - { authToken, signal }
   * @returns {Promise<{ success: boolean, session: Object }>}
   */
  async getSessionStatus(sessionId, options = {}) {
    const response = await fetch(
      `${API_BASE_URL}/golden-interview/session/${sessionId}`,
      {
        signal: options.signal,
        headers: {
          ...authHeaders(options.authToken),
        },
      }
    );

    if (!response.ok) {
      const message = await extractErrorMessage(
        response,
        "Failed to get session status"
      );
      throw new Error(message);
    }

    return response.json();
  },
};

// =============================================================================
// AUTH API (Login, Signup, OAuth)
//
// ARCHITECTURE NOTE:
// These endpoints are called by NextAuth internally (from authorize() and signIn callbacks).
// They return user data only - NO tokens. NextAuth issues all JWTs.
// Frontend code should use NextAuth's signIn() function, NOT these methods directly.
// =============================================================================

export const AuthApi = {
  /**
   * Login with email and password (called by NextAuth CredentialsProvider)
   * POST /auth/login
   * @param {Object} payload - { email, password }
   * @returns {Promise<{ user: User, isNew: boolean }>}
   */
  async login(payload) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const message = data?.error?.message ?? data?.error ?? "Login failed";
      throw new Error(message);
    }

    const data = await response.json();
    return authResponseSchema.parse(data);
  },

  /**
   * Register a new user (called by NextAuth CredentialsProvider)
   * POST /auth/signup
   * @param {Object} payload - { email, password, name, companyName }
   * @returns {Promise<{ user: User, isNew: boolean }>}
   */
  async signup(payload) {
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const message = data?.error?.message ?? data?.error ?? "Signup failed";
      throw new Error(message);
    }

    const data = await response.json();
    return authResponseSchema.parse(data);
  },

  /**
   * Sync OAuth user with backend (called by NextAuth signIn callback)
   * POST /auth/oauth/google
   * @param {Object} payload - { email, name, googleId }
   * @returns {Promise<{ user: User, isNew: boolean }>}
   */
  async oauthGoogle(payload) {
    const response = await fetch(`${API_BASE_URL}/auth/oauth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await extractErrorMessage(response, "OAuth sync failed");
      throw new Error(message);
    }

    const data = await response.json();
    return authResponseSchema.parse(data);
  },
};

// =============================================================================
// COMPANY API (Streaming / Real-time)
// =============================================================================

export const CompanyApi = {
  /**
   * Subscribe to company update stream via EventSource
   * GET /companies/stream/{companyId}
   *
   * @param {string} companyId - Company ID
   * @param {Object} handlers - { onCompanyUpdate, onJobsUpdate, onError }
   * @param {Object} options - { authToken }
   * @returns {{ close: () => void }} - Object with close method to terminate the connection
   */
  subscribeToCompanyStream(companyId, handlers = {}, options = {}) {
    const { onCompanyUpdate, onJobsUpdate, onError } = handlers;
    const { authToken } = options;

    const source = new EventSource(
      `${API_BASE_URL}/companies/stream/${companyId}?token=${encodeURIComponent(authToken || "")}`,
      { withCredentials: true }
    );

    const handleCompanyUpdate = (event) => {
      try {
        const payload = JSON.parse(event.data ?? "{}");
        const company = payload.company ?? null;
        if (company && onCompanyUpdate) {
          onCompanyUpdate(company);
        }
      } catch {
        // ignore malformed payloads
      }
    };

    const handleJobsUpdate = (event) => {
      try {
        const payload = JSON.parse(event.data ?? "{}");
        const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
        if (onJobsUpdate) {
          onJobsUpdate(jobs);
        }
      } catch {
        // ignore malformed payloads
      }
    };

    source.addEventListener("company_updated", handleCompanyUpdate);
    source.addEventListener("jobs_updated", handleJobsUpdate);

    source.onerror = (error) => {
      if (onError) {
        onError(error);
      }
    };

    return {
      close: () => {
        source.removeEventListener("company_updated", handleCompanyUpdate);
        source.removeEventListener("jobs_updated", handleJobsUpdate);
        source.close();
      },
    };
  },
};
