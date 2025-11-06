import { WizardApi } from "../../lib/api-client";

export async function persistJobDraft({
  userId,
  jobId,
  state,
  intent = {},
  stepId,
  wizardMeta = {},
}) {
  return WizardApi.persistJob(state, {
    userId,
    jobId,
    intent,
    currentStepId: stepId,
    wizardMeta,
  });
}

export async function fetchStepSuggestions({
  userId,
  jobId,
  stepId,
  state,
  intentOverrides = {},
  updatedFieldId,
  updatedValue,
  emptyFieldIds = [],
  upcomingFieldIds = [],
  visibleFieldIds = [],
  includeOptional,
  signal,
}) {
  return WizardApi.fetchSuggestions(
    {
      state,
      currentStepId: stepId,
      intent: { includeOptional, ...intentOverrides },
      updatedFieldId,
      updatedFieldValue: updatedValue,
      emptyFieldIds,
      upcomingFieldIds,
      visibleFieldIds,
    },
    {
      userId,
      jobId,
      signal,
    }
  );
}

export async function sendWizardChatMessage({
  userId,
  jobId,
  message,
  currentStepId,
}) {
  return WizardApi.sendChatMessage(
    {
      jobId: jobId ?? undefined,
      userMessage: message,
      intent: { currentStepId },
    },
    { userId }
  );
}

export async function fetchChannelRecommendations({
  userId,
  jobId,
  forceRefresh = false,
}) {
  return WizardApi.fetchChannelRecommendations(
    {
      jobId,
      forceRefresh,
    },
    { userId, jobId }
  );
}

export async function refineJob({ userId, jobId, forceRefresh = false }) {
  return WizardApi.refineJob(
    {
      jobId,
      forceRefresh,
    },
    { userId, jobId }
  );
}

export async function finalizeJob({
  userId,
  jobId,
  finalJob,
  source,
}) {
  return WizardApi.finalizeJob(
    {
      jobId,
      finalJob,
      source,
    },
    { userId, jobId }
  );
}
