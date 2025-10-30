import { z } from "zod";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const suggestionSchema = z.object({
  id: z.string(),
  fieldId: z.string(),
  proposal: z.string(),
  confidence: z.number(),
  rationale: z.string()
});

const suggestionResponseSchema = z.object({
  suggestions: z.array(suggestionSchema)
});

const persistResponseSchema = z.object({
  draftId: z.string(),
  status: z.literal("SAVED")
});

const chatResponseSchema = z.object({
  id: z.string(),
  reply: z.string(),
  costBreakdown: z.object({
    totalCredits: z.string(),
    tokens: z.number().optional(),
    inferenceCostUsd: z.number().optional()
  })
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
    const response = await fetch(`${API_BASE_URL}/wizard/suggestions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.userId)
      },
      body: JSON.stringify({
        ...payload,
        jobId: options.jobId
      })
    });

    if (!response.ok) {
      throw new Error("Suggestion fetch failed");
    }

    const data = await response.json();
    return suggestionResponseSchema.parse(data);
  },

  async persistDraft(state, options = {}) {
    const response = await fetch(`${API_BASE_URL}/wizard/draft`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.userId)
      },
      body: JSON.stringify({ state, jobId: options.jobId })
    });

    if (!response.ok) {
      throw new Error("Failed to persist draft");
    }

    const data = await response.json();
    return persistResponseSchema.parse(data);
  },

  async mergeSuggestion(suggestion, options = {}) {
    const response = await fetch(`${API_BASE_URL}/wizard/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(options.userId)
      },
      body: JSON.stringify({ ...suggestion, jobId: options.jobId })
    });

    if (!response.ok) {
      throw new Error("Failed to merge suggestion");
    }

    return response.json();
  },

  async sendChatMessage(payload, options = {}) {
    const response = await fetch(`${API_BASE_URL}/chat/command`, {
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
