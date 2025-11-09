import { llmLogger } from "../logger.js";

export function buildChatPayload(context = {}) {
  const payload = JSON.stringify(
    {
      userMessage: context.userMessage,
      draftState: context.draftState ?? {},
      intent: context.intent ?? {},
    },
    null,
    2
  );

  llmLogger.info(
    { task: "chat", contentLength: payload.length },
    "LLM chat payload prepared"
  );

  return payload;
}
