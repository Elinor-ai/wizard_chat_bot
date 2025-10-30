import { createLogger } from "@wizard/utils";

const logger = createLogger("llm-client");

function getProviderConfig() {
  return {
    provider: process.env.LLM_CHAT_PROVIDER ?? "stub",
    apiKey: process.env.LLM_CHAT_API_KEY ?? null
  };
}

async function askChat({ userMessage, draftState, intent }) {
  const provider = getProviderConfig();
  logger.debug(
    { provider: provider.provider, hasApiKey: Boolean(provider.apiKey), intent },
    "Handling chat request"
  );

  const title = draftState?.title ? ` about ${draftState.title}` : "";
  const location = draftState?.location ? ` in ${draftState.location}` : "";

  const canned = [
    "Got it. I'll rewrite your job summary in a more professional tone.",
    "Understood. I'll note that for the next asset generation run.",
    "Perfect. Let me prepare campaign-ready messaging for you."
  ];

  const response =
    canned[userMessage.length % canned.length] ??
    "Understood. I'll incorporate that feedback.";

  return `${response}${title}${location ? ` ${location}` : ""}`;
}

export const llmClient = {
  askChat
};
