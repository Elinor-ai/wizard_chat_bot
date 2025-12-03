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
  companyId = null,
}) {
  // eslint-disable-next-line no-console
  console.log("[WizardServices] persistJobDraft:request", {
    jobId,
    hasState: state && Object.keys(state ?? {}).length > 0,
    companyId,
    stepId,
  });
  const result = await WizardApi.persistJob(state, {
    authToken,
    jobId,
    intent,
    currentStepId: stepId,
    wizardMeta,
    companyId,
  });
  // eslint-disable-next-line no-console
  console.log("[WizardServices] persistJobDraft:response", {
    jobId: result?.jobId ?? jobId ?? null,
    intakeLocation: result?.intake?.location ?? null,
    companyId: result?.companyId ?? null,
  });
  return result;
}

const SUGGESTIONS_TIMEOUT_MS = 60000;

function withTimeout(promise, timeoutMs, timeoutMessage = "Request timed out") {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
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
  timeoutMs = SUGGESTIONS_TIMEOUT_MS,
}) {
  const fetchPromise = WizardApi.fetchSuggestions(
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

  return withTimeout(
    fetchPromise,
    timeoutMs,
    "Suggestions request timed out. Please try again."
  );
}

export async function fetchCopilotConversation({ authToken, jobId }) {
  return WizardApi.fetchCopilotConversation(jobId, { authToken });
}

export async function sendCopilotAgentMessage({
  authToken,
  jobId,
  message,
  currentStepId,
  clientMessageId,
  stage = "wizard",
  contextId
}) {
  return WizardApi.sendCopilotMessage(
    {
      jobId,
      userMessage: message,
      currentStepId,
      clientMessageId,
      stage,
      contextId
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

export async function fetchExistingChannelRecommendations({ authToken, jobId }) {
  return WizardApi.fetchExistingChannelRecommendations(jobId, { authToken });
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

export async function fetchHeroImage({ authToken, jobId }) {
  return WizardApi.fetchHeroImage(jobId, { authToken });
}

export async function requestHeroImage({
  authToken,
  jobId,
  forceRefresh = false,
}) {
  return WizardApi.requestHeroImage(
    {
      jobId,
      forceRefresh,
    },
    { authToken }
  );
}

export async function importCompanyJob({
  authToken,
  companyJobId,
  companyId,
}) {
  return WizardApi.importCompanyJob(
    {
      companyJobId,
      companyId,
    },
    { authToken }
  );
}
