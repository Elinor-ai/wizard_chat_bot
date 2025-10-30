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
  id: z.string(),
  fieldId: z.string(),
  proposal: valueSchema,
  confidence: z.number(),
  rationale: z.string()
});

const skipSchema = z.object({
  fieldId: z.string(),
  reason: z.string()
});

const suggestionResponseSchema = z.object({
  suggestions: z.array(suggestionSchema).default([]),
  skip: z.array(skipSchema).default([]),
  followUpToUser: z.array(z.string()).default([])
});

const persistResponseSchema = z.object({
  draftId: z.string(),
  status: z.string()
});

const mergeResponseSchema = z.object({
  status: z.string()
});

const chatResponseSchema = z.object({
  assistantMessage: z.string()
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
    return suggestionResponseSchema.parse(data);
  },

  async persistDraft(state, options = {}) {
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
