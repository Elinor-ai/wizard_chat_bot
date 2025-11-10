import { WizardApi } from "../../lib/api-client";

export async function fetchJobDraft({ authToken, jobId }) {
  return WizardApi.fetchJob(jobId, { authToken });
}

export async function persistJobDraft({
  authToken,
  jobId,
  state,
  intent = {},
  stepId,
  wizardMeta = {},
}) {
  return WizardApi.persistJob(state, {
    authToken,
    jobId,
    intent,
    currentStepId: stepId,
    wizardMeta,
  });
}

export async function fetchStepSuggestions({
  authToken,
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
      authToken,
      jobId,
      signal,
    }
  );
}

export async function sendWizardChatMessage({
  authToken,
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
    { authToken }
  );
}

export async function fetchChannelRecommendations({
  authToken,
  jobId,
  forceRefresh = false,
}) {
  return WizardApi.fetchChannelRecommendations(
    {
      jobId,
      forceRefresh,
    },
    { authToken, jobId }
  );
}

export async function refineJob({ authToken, jobId, forceRefresh = false }) {
  return WizardApi.refineJob(
    {
      jobId,
      forceRefresh,
    },
    { authToken, jobId }
  );
}

export async function finalizeJob({
  authToken,
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
    { authToken, jobId }
  );
}

export async function fetchJobAssets({ authToken, jobId }) {
  return WizardApi.fetchJobAssets(jobId, { authToken });
}

export async function generateJobAssets({
  authToken,
  jobId,
  channelIds,
  source,
}) {
  return WizardApi.generateJobAssets(
    {
      jobId,
      channelIds,
      source,
    },
    { authToken }
  );
}
